'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { hashDocumento, novoToken } from '@/lib/cripto'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { env } from '@/lib/env'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { proximoNumero } from '@/server/financeiro/servico'
import { avancarOrdem } from '@/server/ordem/motor'
import { guardarAssinatura, guardarFoto } from '@/server/arquivos/storage'
import { coberturaDoEquipamento } from '@/server/ordem/garantia'

/**
 * Ações do painel e dos apps de campo.
 *
 * Toda função aqui começa do mesmo jeito: lê a sessão do servidor e monta o
 * contexto de empresa a partir dela. O `tenantId` NUNCA chega pelo formulário.
 * Se chegasse, bastaria trocar um campo no corpo do request para operar sobre
 * a franquia do vizinho — e nenhuma validação de negócio pegaria isso, porque
 * o pedido seria formalmente válido.
 */

type Resposta<T = unknown> = { ok: true; dados?: T } | { ok: false; motivo: string }

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel } }
}

async function ipAtual() {
  return ipDaRequisicao(await headers(), env.TRUST_PROXY)
}

// ---------------------------------------------------------------------------
// Abertura da ordem
// ---------------------------------------------------------------------------

const soDigitos = (v: string) => v.replace(/\D/g, '')

const schemaNovaOrdem = z.object({
  clienteNome: z.string().trim().min(3, 'Informe o nome do cliente.'),
  clienteDocumento: z
    .string()
    .transform(soDigitos)
    .refine((v) => v.length === 11 || v.length === 14, 'CPF ou CNPJ inválido.'),
  clienteWhatsapp: z.string().trim().min(8, 'Informe o WhatsApp para os avisos.'),
  contatoNome: z.string().trim().optional(),
  endereco: z.string().trim().min(5, 'Informe o endereço da retirada.'),
  cidade: z.string().trim().optional(),
  /**
   * O aparelho PUXADO DO CATÁLOGO, quando a pessoa escolheu um.
   *
   * Vazio é o caso normal de quem digita um aparelho novo — e continua sendo o
   * caminho de sempre. Preenchido, ele MANDA sobre marca e modelo: quem
   * escolheu um aparelho do catálogo quer aquele, não o texto que ficou na
   * tela. Ver `abrirOrdem`.
   */
  equipamentoId: z.string().trim().nullish(),
  marca: z.string().trim().min(2, 'Informe a marca.'),
  modelo: z.string().trim().min(1, 'Informe o modelo.'),
  numeroSerie: z.string().trim().optional(),
  acessorios: z.string().trim().optional(),
  defeito: z.string().trim().min(10, 'Descreva o que está acontecendo com o aparelho.'),
  prioridade: z.enum(['NORMAL', 'ALTA']).default('NORMAL'),
  /** Quando a ordem nasce de um contato do site, fecha o ciclo daquele lead. */
  leadId: z.string().nullish(),
})

/**
 * Abre uma ordem, criando cliente e equipamento se ainda não existirem.
 *
 * Cliente e equipamento entram na MESMA transação da ordem. Se a criação da
 * ordem falhar, não sobra um cliente órfão que ninguém sabe de onde veio.
 */
export async function abrirOrdem(_anterior: Resposta, form: FormData): Promise<Resposta<{ id: string }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  const podeAbrir: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]
  if (!podeAbrir.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não abre ordem de retirada.' }
  }

  const d = schemaNovaOrdem.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const feito = await comEscopo(a.ctx, async (tx) => {
    const cliente = await tx.cliente.upsert({
      where: { tenantId_documento: { tenantId: exigirEmpresa(a.ctx), documento: v.clienteDocumento } },
      create: {
        tenantId: exigirEmpresa(a.ctx),
        tipo: v.clienteDocumento.length === 11 ? 'PF' : 'PJ',
        nome: v.clienteNome,
        documento: v.clienteDocumento,
        documentoHash: hashDocumento(v.clienteDocumento),
        whatsapp: soDigitos(v.clienteWhatsapp),
        telefone: soDigitos(v.clienteWhatsapp),
        contatoNome: v.contatoNome || null,
        logradouro: v.endereco,
        cidade: v.cidade || null,
      },
      // Cadastro já existente não é sobrescrito às cegas: só completamos o que
      // está vazio, para não apagar dado que alguém conferiu antes.
      update: {
        contatoNome: v.contatoNome || undefined,
        whatsapp: soDigitos(v.clienteWhatsapp),
      },
    })

    /**
     * =========================================================================
     * DE ONDE VEM O APARELHO — três caminhos, nesta ordem
     * =========================================================================
     * 1. PUXADO DO CATÁLOGO (`equipamentoId`). É o caminho novo: a pessoa
     *    procurou pelo nome ou pela série e escolheu o aparelho que já está
     *    cadastrado, com foto e acessórios. Cadastrar de novo o que já existe
     *    era o que fazia o mesmo laser aparecer quatro vezes na lista, cada uma
     *    com um pedaço do histórico.
     *
     * 2. RECONHECIDO PELA SÉRIE, dentro do cliente — como sempre foi. Vale para
     *    quem digita a série de cabeça sem procurar no catálogo.
     *
     * 3. NOVO. Nasce aqui, junto com a ordem, e entra no catálogo já amarrado
     *    ao cliente.
     *
     * -------------------------------------------------------------------------
     * PUXAR DO CATÁLOGO É O QUE AMARRA O APARELHO AO CLIENTE
     * -------------------------------------------------------------------------
     * Um aparelho de catálogo nasce sem dono de propósito (ver a migração
     * `equipamento_sem_dono`). É AQUI que o dono é decidido, porque é aqui que
     * alguém está com a máquina e o cliente na frente.
     *
     * E se o aparelho já for de OUTRO cliente, a abertura é recusada. Trocar o
     * dono em silêncio arrastaria junto todo o histórico de ordens daquela
     * máquina para o nome errado — e o prontuário do equipamento é justamente o
     * que dá sentido à quarta visita.
     */
    let equipamento: { id: string } | null = null

    if (v.equipamentoId) {
      // `findUnique` dentro do escopo: id de outra empresa não é achado, e a
      // resposta é a mesma de um id inventado.
      const doCatalogo = await tx.equipamento.findUnique({
        where: { id: v.equipamentoId },
        select: { id: true, clienteId: true, acessorios: true },
      })
      if (!doCatalogo) {
        return { ok: false as const, motivo: 'Equipamento não encontrado nesta empresa.' }
      }
      if (doCatalogo.clienteId && doCatalogo.clienteId !== cliente.id) {
        return {
          ok: false as const,
          motivo:
            'Este aparelho está cadastrado no nome de outro cliente. Confira o cliente da O.S. ou cadastre o aparelho separadamente.',
        }
      }

      // Sem dono, ganha um. Os acessórios do catálogo só são preenchidos quando
      // estão VAZIOS: o que veio junto nesta retirada é informação boa, mas não
      // pode apagar em silêncio a lista que alguém conferiu no cadastro.
      const preenche =
        doCatalogo.clienteId === null || (!doCatalogo.acessorios && Boolean(v.acessorios))
      equipamento = preenche
        ? await tx.equipamento.update({
            where: { id: doCatalogo.id },
            data: {
              clienteId: cliente.id,
              ...(doCatalogo.acessorios ? {} : { acessorios: v.acessorios || null }),
            },
            select: { id: true },
          })
        : { id: doCatalogo.id }
    }

    equipamento ??=
      (v.numeroSerie
        ? await tx.equipamento.findFirst({
            where: { clienteId: cliente.id, numeroSerie: v.numeroSerie },
            select: { id: true },
          })
        : null) ??
      (await tx.equipamento.create({
        data: {
          tenantId: exigirEmpresa(a.ctx),
          clienteId: cliente.id,
          marca: v.marca,
          modelo: v.modelo,
          numeroSerie: v.numeroSerie || null,
          acessorios: v.acessorios || null,
        },
        select: { id: true },
      }))

    /**
     * O aparelho voltou dentro do prazo do serviço anterior?
     *
     * A conferência acontece na ABERTURA e é automática, porque depender de
     * alguém lembrar é o mesmo que não ter: quem atende no balcão não sabe de
     * cor que a O.S. #0014 foi entregue há 62 dias com 90 de garantia. Marcada
     * aqui, a ordem já nasce sabendo — e o financeiro é avisado antes de
     * emitir a fatura.
     */
    const cobertura = await coberturaDoEquipamento(tx, equipamento.id)

    const ordem = await tx.ordem.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        numero: await proximoNumero(tx, exigirEmpresa(a.ctx), 'ordem'),
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        emGarantia: cobertura.cobre,
        ordemOrigemId: cobertura.ordem?.id ?? null,
        defeitoRelatado: v.defeito,
        prioridade: v.prioridade,
        // O link do portal é a credencial do cliente: 256 bits de randomBytes,
        // não o cuid do Prisma, cujo começo é derivado do relógio.
        tokenPublico: novoToken(),
        atendenteId: a.sessao.userId,
        origem: 'TELEFONE',
      },
      select: { id: true },
    })

    // O lead fecha o ciclo site → sistema na MESMA transação. Marcá-lo depois
    // deixaria uma janela em que a ordem existe e o contato continua na fila,
    // esperando alguém que já atendeu.
    if (v.leadId) {
      await tx.lead.updateMany({
        where: { id: v.leadId, status: 'novo' },
        data: { status: 'convertido', ordemGeradaId: ordem.id },
      })
    }

    return { ok: true as const, id: ordem.id }
  })
  // Recusa dentro da transação: nada foi gravado — nem cliente, nem aparelho.
  if (!feito.ok) return { ok: false, motivo: feito.motivo }
  const ordemId = feito.id

  // A ordem nasce como solicitação e imediatamente vira ordem de retirada:
  // é o motor que grava o primeiro evento e gera o PDF.
  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId,
    para: EtapaOrdem.ORDEM_RETIRADA_GERADA,
    ip: await ipAtual(),
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.aberta',
    entidade: 'ordem',
    entidadeId: ordemId,
    detalhes: v.leadId ? { origem: 'site', leadId: v.leadId } : undefined,
  })
  revalidatePath('/painel')
  return { ok: true, dados: { id: ordemId } }
}

// ---------------------------------------------------------------------------
// Avanço de etapa
// ---------------------------------------------------------------------------

export async function avancar(entrada: {
  ordemId: string
  para: EtapaOrdem
  observacao?: string
}): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId: entrada.ordemId,
    para: entrada.para,
    observacao: entrada.observacao,
    ip: await ipAtual(),
  })

  await auditar(a.ctx, a.sessao, {
    acao: `ordem.transicao.${entrada.para}`,
    entidade: 'ordem',
    entidadeId: entrada.ordemId,
    negado: !r.ok,
    detalhes: r.ok ? undefined : { motivo: r.motivo },
  })

  if (!r.ok) return { ok: false, motivo: r.motivo }
  revalidatePath(`/painel/ordens/${entrada.ordemId}`)
  revalidatePath('/painel')
  return { ok: true }
}

/**
 * Cancela a ordem.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO É UM BOTÃO DE ETAPA COMO OS OUTROS
 * ---------------------------------------------------------------------------
 * O cancelamento parte de quase qualquer lugar da esteira, e por isso fica
 * fora da tabela de transições — listá-lo vinte vezes convidaria alguém a
 * esquecer uma. A consequência é que ele também não aparece em
 * `proximosPassos`, que é de onde saem os botões da ficha.
 *
 * Sem uma porta própria, o motor sabia cancelar e ninguém conseguia pedir: a
 * etapa CANCELADO existia no banco, a validação recusava quem não é gestão, a
 * régua do acompanhamento já tratava o cancelamento como saída — e não havia
 * como chegar lá por tela nenhuma. Foi o que a conferência do diagrama contra o
 * sistema encontrou.
 *
 * O motivo é obrigatório. Uma ordem que some sem explicação é a pergunta que
 * volta em três meses, quando o cliente liga perguntando do aparelho dele.
 */
export async function cancelarOrdem(ordemId: string, motivo: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const razao = motivo.trim()
  if (razao.length < 5) {
    return { ok: false, motivo: 'Escreva o motivo do cancelamento — ele fica gravado na ordem.' }
  }

  // Quem pode cancelar é decidido pela máquina de estados, não aqui: a regra
  // mora num lugar só, e é a mesma que o teste cobra.
  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId,
    para: EtapaOrdem.CANCELADO,
    observacao: razao,
    ip: await ipAtual(),
  })

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.cancelada',
    entidade: 'ordem',
    entidadeId: ordemId,
    negado: !r.ok,
    detalhes: r.ok ? { motivo: razao } : { recusa: r.motivo },
  })

  if (!r.ok) return { ok: false, motivo: r.motivo }
  revalidatePath(`/painel/ordens/${ordemId}`)
  revalidatePath('/painel')
  revalidatePath('/painel/acompanhar')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Fotos do técnico
// ---------------------------------------------------------------------------

export async function anexarFotos(form: FormData): Promise<Resposta<{ total: number }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const ordemId = String(form.get('ordemId') ?? '')
  const categoria = String(form.get('categoria') ?? 'RECEBIMENTO')
  const arquivos = form.getAll('fotos').filter((f): f is File => f instanceof File)
  if (!ordemId || arquivos.length === 0) return { ok: false, motivo: 'Nenhuma foto foi enviada.' }

  // Confere que a ordem é desta empresa ANTES de gravar qualquer byte: o RLS
  // devolve nulo para ordem de outra franquia, e aí nada chega ao disco.
  const existe = await comEscopo(a.ctx, (tx) => tx.ordem.findUnique({ where: { id: ordemId }, select: { id: true } }))
  if (!existe) return { ok: false, motivo: 'Ordem não encontrada.' }

  for (const arquivo of arquivos.slice(0, 12)) {
    const r = await guardarFoto({ tenantId: exigirEmpresa(a.ctx), escopo: ordemId, arquivo })
    if (!r.ok) return { ok: false, motivo: r.motivo }

    await comEscopo(a.ctx, async (tx) => {
      await tx.foto.create({
        data: {
          tenantId: exigirEmpresa(a.ctx),
          ordemId,
          categoria: categoria as never,
          caminho: r.caminho,
          caminhoThumb: r.caminhoThumb,
          hashArquivo: r.hash,
          larguraPx: r.largura,
          alturaPx: r.altura,
          tamanhoBytes: r.bytes,
          autorId: a.sessao.userId,
          autorNome: a.sessao.nome,
        },
      })
    })

  }

  const total = await comEscopo(a.ctx, (tx) =>
    tx.foto.count({ where: { ordemId, categoria: categoria as never } }),
  )

  revalidatePath(`/painel/ordens/${ordemId}`)
  return { ok: true, dados: { total } }
}

// ---------------------------------------------------------------------------
// Assinatura no visor
// ---------------------------------------------------------------------------

const schemaAssinatura = z.object({
  ordemId: z.string().min(1),
  tipo: z.enum(['RETIRADA', 'ENTREGA']),
  assinanteNome: z.string().trim().min(3, 'Informe o nome de quem assinou.'),
  /**
   * O documento de quem assinou. Opcional na retirada, ESPERADO na entrega:
   * é ele que identifica sem ambiguidade quem ficou com o equipamento — nome
   * repete, documento não. Guardado como veio, só com os dígitos.
   */
  assinanteDocumento: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 11 || v.length === 14, 'CPF ou CNPJ incompleto.')
    .optional(),
  dataUrl: z.string().min(100, 'A assinatura ficou em branco.'),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  precisaoM: z.coerce.number().optional(),
})

/**
 * Registra a assinatura e avança a etapa, na sequência.
 *
 * O nome de quem recebeu vale mais que o traço: é ele que identifica a pessoa.
 * Um rabisco sem nome não prova nada meses depois, quando a discussão aparece.
 *
 * A coordenada é opcional de propósito. GPS falha em subsolo, em prédio e em
 * celular velho — exigir localização deixaria o motorista preso na porta do
 * cliente. Registramos quando existe e anotamos a ausência quando não.
 */
export async function assinarNoVisor(form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  const podeAssinar: Papel[] = [Papel.MOTORISTA, Papel.SUPER_ADMIN]
  if (!podeAssinar.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só o motorista coleta assinatura em campo.' }
  }

  const d = schemaAssinatura.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const ordem = await comEscopo(a.ctx, (tx) =>
    tx.ordem.findUnique({ where: { id: v.ordemId }, select: { id: true, etapa: true } }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

  const ip0 = await ipAtual()

  /**
   * Fecha o trecho da viagem antes de assinar, quando ele ficou em aberto.
   *
   * O motorista chega na porta do cliente e aperta "coletar assinatura". Se ele
   * não tiver marcado "saí para esta parada" — e na rua isso acontece o tempo
   * todo —, a ordem ainda está em "retirada agendada", de onde o único caminho
   * para COLETADO na tabela de transições é o do CORREIO, que é da central.
   * O resultado era uma recusa absurda na tela: "seu perfil não tem permissão
   * para: equipamento despachado pelo correio", com o cliente esperando.
   *
   * A viagem aconteceu de fato — ele está lá. Registrá-la aqui destrava a
   * coleta e ainda dispara o aviso de "motorista a caminho" que o cliente
   * deveria ter recebido.
   */
  const emRota =
    v.tipo === 'RETIRADA' ? EtapaOrdem.EM_ROTA_RETIRADA : EtapaOrdem.EM_ROTA_ENTREGA
  const faltouSair =
    v.tipo === 'RETIRADA'
      ? ordem.etapa === EtapaOrdem.RETIRADA_AGENDADA
      : ordem.etapa === EtapaOrdem.FATURADO || ordem.etapa === EtapaOrdem.DEVOLVIDO_SEM_REPARO

  if (faltouSair) {
    const saida = await avancarOrdem(a.ctx, a.ator, { ordemId: v.ordemId, para: emRota, ip: ip0 })
    // Falhou aqui? Devolvemos ANTES de gravar a assinatura. O papel da
    // aplicação não pode apagar assinatura (é trilha de prova), então uma
    // assinatura gravada para uma transição que não vai acontecer ficaria órfã
    // no banco para sempre.
    if (!saida.ok) return { ok: false, motivo: saida.motivo }
  }

  const img = await guardarAssinatura({
    tenantId: exigirEmpresa(a.ctx),
    ordemId: v.ordemId,
    dataUrl: v.dataUrl,
  })
  if (!img.ok) return { ok: false, motivo: img.motivo }

  const h = await headers()
  await comEscopo(a.ctx, async (tx) => {
    await tx.assinatura.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        ordemId: v.ordemId,
        tipo: v.tipo,
        assinanteNome: v.assinanteNome,
        assinanteDocumento: v.assinanteDocumento || null,
        caminhoImagem: img.caminho,
        hashImagem: img.hash,
        latitude: v.latitude ?? null,
        longitude: v.longitude ?? null,
        precisaoM: v.precisaoM ?? null,
        ip: ipDaRequisicao(h, env.TRUST_PROXY),
        userAgent: h.get('user-agent')?.slice(0, 400) ?? null,
      },
    })
  })

  const destino = v.tipo === 'RETIRADA' ? EtapaOrdem.COLETADO : EtapaOrdem.ENTREGUE
  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId: v.ordemId,
    para: destino,
    payload: {
      assinante: v.assinanteNome,
      // Sem coordenada não é falha: é informação de que o GPS não respondeu.
      geo: v.latitude != null ? { lat: v.latitude, lng: v.longitude, precisao: v.precisaoM } : null,
    },
    ip: ipDaRequisicao(h, env.TRUST_PROXY),
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: `assinatura.${v.tipo.toLowerCase()}`,
    entidade: 'ordem',
    entidadeId: v.ordemId,
  })
  revalidatePath('/app/motorista')
  return { ok: true }
}

/**
 * "Saí para esta parada."
 *
 * É o passo que avisa o cliente que o motorista está a caminho — o item 4 da
 * linha do tempo. Sem um botão para ele, o aviso simplesmente nunca saía, e a
 * clínica só descobria que alguém ia buscar o aparelho quando a campainha
 * tocava.
 */
export async function sairParaParada(ordemId: string, tipo: 'RETIRADA' | 'ENTREGA'): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  const podeRodar: Papel[] = [Papel.MOTORISTA, Papel.SUPER_ADMIN]
  if (!podeRodar.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só o motorista marca a saída para a rota.' }
  }

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId,
    para: tipo === 'RETIRADA' ? EtapaOrdem.EM_ROTA_RETIRADA : EtapaOrdem.EM_ROTA_ENTREGA,
    ip: await ipAtual(),
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, { acao: 'rota.saida', entidade: 'ordem', entidadeId: ordemId })
  revalidatePath('/app/motorista')
  return { ok: true }
}
