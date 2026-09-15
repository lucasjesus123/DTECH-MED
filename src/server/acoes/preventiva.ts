'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DestinoPeca, EtapaOrdem, Papel, Periodicidade, StatusVisita } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { aCentavos } from '@/lib/dinheiro'
import { novoToken } from '@/lib/cripto'
import { env } from '@/lib/env'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { proximoNumero } from '@/server/financeiro/servico'
import { avancarOrdem, enfileirar } from '@/server/ordem/motor'
import { criarContrato, gerarVisitas, ROTULO_PERIODICIDADE } from '@/server/preventiva/servico'

/**
 * As ações da preventiva e da peça retirada.
 *
 * ---------------------------------------------------------------------------
 * O QUE UNE OS DOIS ASSUNTOS NUM ARQUIVO
 * ---------------------------------------------------------------------------
 * Nada, em termos de domínio. O que os une é o momento: os dois nasceram da
 * mesma pergunta — "o que este sistema não consegue responder que um ERP de
 * verdade responde?". A visita que não aconteceu e a peça que sumiu são as duas
 * coisas que somem sem ninguém perceber, e as duas viram briga depois.
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

const PODE_CONTRATAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]
const PODE_REGISTRAR_PECA: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.TECNICO,
]

// ---------------------------------------------------------------------------
// Contrato de manutenção
// ---------------------------------------------------------------------------

/**
 * A data vem do `<input type="date">` como `AAAA-MM-DD`, e essa string é a
 * armadilha de fuso mais antiga que existe: `new Date('2026-08-19')` é meia-
 * noite em UTC, ou seja, 21h do dia 18 em Lajeado. O contrato começaria um dia
 * antes do que o cliente assinou, e toda visita herdaria o erro.
 *
 * Montar com os três números separados cria a data na hora local do processo, e
 * o meio-dia dá folga de 12h para qualquer conversão no caminho.
 */
function dataLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a!, m! - 1, d!, 12, 0, 0, 0)
}

const schemaContrato = z.object({
  equipamentoId: z.string().min(1, 'Escolha o equipamento.'),
  periodicidade: z.enum(Periodicidade),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data da primeira visita.'),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  valorVisita: z.coerce.number().min(0).default(0),
  observacoes: z.string().trim().optional(),
})

export async function abrirContratoPreventiva(
  _anterior: Resposta,
  form: FormData,
): Promise<Resposta<{ id: string; numero: number; visitas: number }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não abre contrato de preventiva.' }
  }

  const d = schemaContrato.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // O cliente vem do equipamento, e não do formulário: deixar a tela mandar os
  // dois abriria a porta para um contrato ligando o aparelho de uma clínica ao
  // nome de outra.
  const dono = await comEscopo(a.ctx, (tx) =>
    tx.equipamento.findUnique({ where: { id: v.equipamentoId }, select: { clienteId: true } }),
  )
  if (!dono) return { ok: false, motivo: 'Equipamento não encontrado nesta empresa.' }
  /**
   * APARELHO DE CATÁLOGO NÃO ENTRA EM CONTRATO — e o motivo não é técnico.
   *
   * O contrato de preventiva é um acordo COM ALGUÉM: tem valor de visita,
   * periodicidade e um cliente que paga. Um aparelho ainda sem dono não tem a
   * outra ponta do acordo. Deixar passar criaria um contrato pendurado em
   * ninguém, que apareceria na receita mensal e não teria para quem cobrar.
   *
   * A tela já não oferece esses aparelhos na lista; isto aqui é a trava de
   * verdade, porque esconder a opção impede o clique, não o pedido.
   */
  if (!dono.clienteId) {
    return {
      ok: false,
      motivo:
        'Este aparelho ainda não tem dono — ele está só no catálogo. Amarre-o a um cliente (abrindo uma O.S. ou pelo cadastro) antes de fazer o contrato.',
    }
  }

  const inicio = dataLocal(v.inicio)
  const fim = v.fim ? dataLocal(v.fim) : null
  if (fim && fim <= inicio) return { ok: false, motivo: 'A data de fim precisa ser depois do início.' }

  const r = await criarContrato(a.ctx, {
    clienteId: dono.clienteId,
    equipamentoId: v.equipamentoId,
    periodicidade: v.periodicidade,
    inicio,
    fim,
    valorVisitaCentavos: aCentavos(v.valorVisita),
    observacoes: v.observacoes || null,
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: 'preventiva.contrato.aberto',
    entidade: 'contrato_manutencao',
    entidadeId: r.id,
    detalhes: { numero: r.numero, periodicidade: v.periodicidade, visitas: r.visitas },
    ip: await ipAtual(),
  })
  revalidatePath('/painel/preventiva')
  revalidatePath(`/painel/equipamentos/${v.equipamentoId}`)
  return { ok: true, dados: { id: r.id, numero: r.numero, visitas: r.visitas } }
}

// ---------------------------------------------------------------------------
// A VISITA MARCADA — o estado que o enum prometia e ninguém sabia produzir
// ---------------------------------------------------------------------------

/**
 * MARCAR A VISITA COM A CLÍNICA.
 *
 * =============================================================================
 * O QUE FALTAVA, E COMO DAVA PARA SABER
 * =============================================================================
 * `StatusVisita` já trazia `AGENDADA`, com o comentário "Marcada na agenda, com
 * técnico". Nenhum caminho do sistema produzia esse estado — não havia onde
 * guardar a data combinada nem quem vai. Um valor de enum que nada escreve é um
 * recurso que quem lê o código conclui que existe.
 *
 * Na prática: o contrato dizia "a cada 6 meses, dia 16", a tela mostrava "em 1
 * dia", e combinar o horário com a clínica acontecia por WhatsApp, fora do
 * sistema. O calendário mostrava a data do CONTRATO — e as duas são a mesma
 * coisa só até a primeira clínica pedir para passar de quinta para sexta.
 *
 * =============================================================================
 * DUAS DATAS, E NENHUMA APAGA A OUTRA
 * =============================================================================
 *   previstaPara   o que o contrato calculou. NUNCA muda.
 *   agendadaPara   o que foi combinado com quem paga.
 *
 * Sobrescrever a primeira apagaria o atraso da própria história do contrato —
 * e "a visita de março aconteceu em abril" é exatamente o que o cliente e a
 * vigilância perguntam depois.
 *
 * =============================================================================
 * AVISAR O CLIENTE É ESCOLHA DE QUEM MARCA
 * =============================================================================
 * Marcar e avisar são dois atos. Quem já combinou por telefone não quer mandar
 * a mesma coisa de novo; quem marcou sozinho precisa avisar. O aviso sai pela
 * FILA, e não dentro do clique: enviar é rede, e a clínica não pode ficar sem
 * horário marcado porque o WhatsApp da casa caiu naquele minuto.
 */
const schemaAgendar = z.object({
  visitaId: z.string().min(1, 'Visita não informada.'),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o dia da visita.'),
  hora: z
    .string()
    .trim()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'A hora precisa ser como 14:30.')
    .optional()
    .or(z.literal('')),
  responsavelId: z.string().trim().optional(),
  observacao: z.string().trim().max(400).optional(),
  avisar: z.union([z.literal('on'), z.literal('true'), z.literal('')]).optional(),
})

export async function agendarVisitaPreventiva(
  _anterior: Resposta,
  form: FormData,
): Promise<Resposta<{ avisou: boolean }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não marca visita de preventiva.' }
  }

  const d = schemaAgendar.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data
  const avisar = v.avisar === 'on' || v.avisar === 'true'

  const r = await comEscopo(a.ctx, async (tx) => {
    const visita = await tx.visitaPreventiva.findUnique({
      where: { id: v.visitaId },
      select: {
        id: true,
        status: true,
        previstaPara: true,
        contrato: {
          select: {
            numero: true,
            ativo: true,
            cliente: { select: { nome: true, whatsapp: true, telefone: true } },
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
      },
    })
    if (!visita) return { ok: false as const, motivo: 'Visita não encontrada nesta empresa.' }
    // A visita que já virou ordem não se remarca por aqui: ela está na esteira,
    // e quem manda na data de uma ordem é a rota.
    if (visita.status === StatusVisita.REALIZADA) {
      return { ok: false as const, motivo: 'Esta visita já virou ordem de serviço — remarque pela rota.' }
    }
    if (visita.status === StatusVisita.CANCELADA) {
      return { ok: false as const, motivo: 'Esta visita foi cancelada com o contrato.' }
    }
    if (!visita.contrato.ativo) {
      return { ok: false as const, motivo: 'O contrato desta visita está encerrado.' }
    }

    // O responsável tem de ser gente DESTA empresa e que esteja ativa. O
    // `comEscopo` já limita à franquia; o `ativo` evita marcar a visita no nome
    // de quem saiu da casa semana passada.
    let responsavelId: string | null = null
    if (v.responsavelId) {
      const p = await tx.user.findFirst({
        where: { id: v.responsavelId, ativo: true },
        select: { id: true },
      })
      if (!p) return { ok: false as const, motivo: 'A pessoa escolhida não está ativa nesta empresa.' }
      responsavelId = p.id
    }

    await tx.visitaPreventiva.update({
      where: { id: v.visitaId },
      data: {
        agendadaPara: dataLocal(v.dia),
        hora: v.hora || null,
        responsavelId,
        observacao: v.observacao || null,
        status: StatusVisita.AGENDADA,
        // Remarcar zera o aviso: a clínica foi avisada da data ANTERIOR, e
        // deixar o carimbo de pé faria a tela dizer "avisado" sobre um dia que
        // não vale mais.
        avisadoEm: null,
        avisoErro: null,
      },
    })

    if (avisar) {
      await enfileirar(tx, exigirEmpresa(a.ctx), {
        tipo: 'whatsapp.preventiva',
        prioridade: 2,
        // A chave carrega o DIA e a HORA: remarcar tem de avisar de novo, e
        // clicar duas vezes no mesmo agendamento não pode mandar duas.
        dedupeKey: `zap:prev:${v.visitaId}:${v.dia}:${v.hora || 'sem-hora'}`,
        payload: { visitaId: v.visitaId },
      })
    }

    return {
      ok: true as const,
      contrato: visita.contrato.numero,
      cliente: visita.contrato.cliente.nome,
      temZap: Boolean(visita.contrato.cliente.whatsapp ?? visita.contrato.cliente.telefone),
    }
  })

  if (!r.ok) return { ok: false, motivo: r.motivo }

  // O aviso pedido para um cliente sem número não é erro de sistema: é cadastro
  // incompleto, e quem marcou precisa saber AGORA — não descobrir depois que a
  // clínica não apareceu.
  if (avisar && !r.temZap) {
    await auditar(a.ctx, a.sessao, {
      acao: 'preventiva.visita.agendada',
      entidade: 'visita_preventiva',
      entidadeId: v.visitaId,
      detalhes: { dia: v.dia, hora: v.hora || null, avisoPedido: true, semNumero: true },
      ip: await ipAtual(),
    })
    revalidatePath('/painel/preventiva')
    revalidatePath('/painel/calendario')
    return {
      ok: false,
      motivo: `Visita marcada para ${v.dia.split('-').reverse().join('/')}, mas ${r.cliente} não tem WhatsApp no cadastro — ninguém foi avisado.`,
    }
  }

  await auditar(a.ctx, a.sessao, {
    acao: 'preventiva.visita.agendada',
    entidade: 'visita_preventiva',
    entidadeId: v.visitaId,
    detalhes: { dia: v.dia, hora: v.hora || null, responsavel: v.responsavelId || null, avisou: avisar },
    ip: await ipAtual(),
  })
  revalidatePath('/painel/preventiva')
  revalidatePath('/painel/calendario')
  return { ok: true, dados: { avisou: avisar } }
}

/**
 * DESMARCAR — a visita volta a ser só prevista pelo contrato.
 *
 * Não cancela nada: o contrato continua devendo aquela revisão, e ela volta
 * para a lista do que vence. Cancelar visita é coisa de encerrar contrato.
 */
export async function desmarcarVisitaPreventiva(visitaId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não marca visita de preventiva.' }
  }

  const feito = await comEscopo(a.ctx, async (tx) => {
    const v = await tx.visitaPreventiva.findUnique({
      where: { id: visitaId },
      select: { status: true },
    })
    if (!v) return null
    if (v.status !== StatusVisita.AGENDADA) return 'nao-agendada' as const
    await tx.visitaPreventiva.update({
      where: { id: visitaId },
      data: {
        status: StatusVisita.PREVISTA,
        agendadaPara: null,
        hora: null,
        responsavelId: null,
        avisadoEm: null,
        avisoErro: null,
      },
    })
    return true
  })
  if (feito === null) return { ok: false, motivo: 'Visita não encontrada nesta empresa.' }
  if (feito === 'nao-agendada') return { ok: false, motivo: 'Esta visita não está marcada.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'preventiva.visita.desmarcada',
    entidade: 'visita_preventiva',
    entidadeId: visitaId,
    ip: await ipAtual(),
  })
  revalidatePath('/painel/preventiva')
  revalidatePath('/painel/calendario')
  return { ok: true }
}

/**
 * Encerra o contrato.
 *
 * As visitas ainda PREVISTAS somem junto — elas eram promessa de trabalho
 * futuro, e trabalho futuro de um contrato encerrado não existe. As já
 * realizadas ficam: são histórico do aparelho, e é delas que sai o prontuário.
 */
export async function encerrarContratoPreventiva(form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não encerra contrato.' }
  }
  const id = String(form.get('contratoId') ?? '')
  if (!id) return { ok: false, motivo: 'Contrato não informado.' }

  const feito = await comEscopo(a.ctx, async (tx) => {
    const c = await tx.contratoManutencao.findUnique({ where: { id }, select: { ativo: true } })
    if (!c) return null
    await tx.visitaPreventiva.updateMany({
      where: { contratoId: id, status: StatusVisita.PREVISTA },
      data: { status: StatusVisita.CANCELADA },
    })
    await tx.contratoManutencao.update({
      where: { id },
      data: { ativo: false, encerradoEm: new Date() },
    })
    return true
  })
  if (!feito) return { ok: false, motivo: 'Contrato não encontrado nesta empresa.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'preventiva.contrato.encerrado',
    entidade: 'contrato_manutencao',
    entidadeId: id,
    ip: await ipAtual(),
  })
  revalidatePath('/painel/preventiva')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// A visita vira ordem
// ---------------------------------------------------------------------------

/**
 * Transforma a visita prevista numa ordem de serviço de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO EXISTE UMA "ESTEIRA DA PREVENTIVA"
 * ---------------------------------------------------------------------------
 * No ERPNext a visita de manutenção é um documento próprio, com ciclo de vida
 * próprio. Copiar isso aqui significaria reescrever — mal — a exigência de
 * foto, a assinatura na coleta, o laudo, o faturamento e a trava de entrega sem
 * pagamento. Seriam dois sistemas dentro de um, e o segundo sempre atrasado em
 * relação ao primeiro.
 *
 * Aqui a visita é só um COMPROMISSO no calendário. Quando chega a hora ela
 * entra na mesma esteira de 18 etapas de qualquer conserto — e o defeito
 * relatado já nasce escrito, dizendo que é revisão contratada.
 */
export async function gerarOrdemDaVisita(form: FormData): Promise<Resposta<{ id: string; numero: number }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não abre ordem de retirada.' }
  }
  const visitaId = String(form.get('visitaId') ?? '')
  if (!visitaId) return { ok: false, motivo: 'Visita não informada.' }

  const criado = await comEscopo(a.ctx, async (tx) => {
    const v = await tx.visitaPreventiva.findUnique({
      where: { id: visitaId },
      select: {
        id: true,
        status: true,
        ordemId: true,
        previstaPara: true,
        contrato: {
          select: {
            numero: true,
            clienteId: true,
            equipamentoId: true,
            periodicidade: true,
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
      },
    })
    if (!v) return { erro: 'Visita não encontrada nesta empresa.', ordem: null }
    if (v.ordemId) return { erro: 'Esta visita já virou ordem de serviço.', ordem: null }
    if (v.status === StatusVisita.CANCELADA) return { erro: 'Esta visita foi cancelada.', ordem: null }

    const tenantId = exigirEmpresa(a.ctx)
    const dia = v.previstaPara.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const ordem = await tx.ordem.create({
      data: {
        tenantId,
        numero: await proximoNumero(tx, tenantId, 'ordem'),
        clienteId: v.contrato.clienteId,
        equipamentoId: v.contrato.equipamentoId,
        defeitoRelatado:
          `Revisão preventiva contratada — contrato #${String(v.contrato.numero).padStart(4, '0')}, ` +
          `${ROTULO_PERIODICIDADE[v.contrato.periodicidade]}, visita prevista para ${dia}. ` +
          `Sem defeito relatado: é a revisão periódica do ${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}.`,
        tokenPublico: novoToken(),
        atendenteId: a.sessao.userId,
        origem: 'OUTRO',
      },
      select: { id: true, numero: true },
    })

    await tx.visitaPreventiva.update({
      where: { id: visitaId },
      data: { ordemId: ordem.id, status: StatusVisita.AGENDADA },
    })
    return { erro: null, ordem }
  })

  if (criado.erro || !criado.ordem) return { ok: false, motivo: criado.erro ?? 'Visita inválida.' }

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId: criado.ordem.id,
    para: EtapaOrdem.ORDEM_RETIRADA_GERADA,
    observacao: 'Aberta a partir do contrato de preventiva.',
    ip: await ipAtual(),
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: 'preventiva.visita.virou_ordem',
    entidade: 'visita_preventiva',
    entidadeId: visitaId,
    detalhes: { ordemId: criado.ordem.id, numero: criado.ordem.numero },
    ip: await ipAtual(),
  })
  revalidatePath('/painel/preventiva')
  revalidatePath('/painel/ordens')
  return { ok: true, dados: criado.ordem }
}

// ---------------------------------------------------------------------------
// Peça retirada
// ---------------------------------------------------------------------------

const schemaPeca = z.object({
  ordemId: z.string().min(1),
  descricao: z.string().trim().min(3, 'Diga que peça saiu do aparelho.'),
  destino: z.enum(DestinoPeca),
  identificacao: z.string().trim().optional(),
  observacao: z.string().trim().optional(),
})

/**
 * Registra que uma peça saiu do aparelho, e para onde ela foi.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É PROVA, E NÃO CADASTRO
 * ---------------------------------------------------------------------------
 * "Cadê a placa velha?" é uma pergunta que aparece semanas depois, quando não
 * há mais como reconstruir a resposta. Ou o cliente queria a peça de volta e
 * ninguém avisou que foi descartada, ou desconfia que a peça foi trocada por
 * uma usada e não há como mostrar que não. Nos dois casos a discussão é sobre
 * uma coisa física que já não existe.
 *
 * Por isso o registro é apenas INSERÇÃO: uma vez escrito, quem registrou e
 * quando ficam. Uma peça que "voltou atrás" não se apaga — registra-se outra
 * linha dizendo o que aconteceu. Apagar seria justamente destruir a única prova
 * que a discussão tem.
 *
 * Autoclave e equipamento odontológico têm componente contaminado, e aí o
 * destino não é preferência: descarte controlado é obrigação sanitária, e é
 * dessa linha que sai a comprovação.
 */
export async function registrarPecaRetirada(form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_REGISTRAR_PECA.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só a bancada e a gestão registram peça retirada.' }
  }

  const d = schemaPeca.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const feito = await comEscopo(a.ctx, async (tx) => {
    const o = await tx.ordem.findUnique({ where: { id: v.ordemId }, select: { id: true } })
    if (!o) return null
    await tx.pecaRetirada.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        ordemId: v.ordemId,
        descricao: v.descricao,
        destino: v.destino,
        identificacao: v.identificacao || null,
        observacao: v.observacao || null,
        registradoPorId: a.sessao.userId,
        registradoPorNome: a.sessao.nome,
      },
    })
    return true
  })
  if (!feito) return { ok: false, motivo: 'Ordem não encontrada nesta empresa.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.peca_retirada',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    detalhes: { descricao: v.descricao, destino: v.destino },
    ip: await ipAtual(),
  })
  revalidatePath(`/painel/ordens/${v.ordemId}`)
  return { ok: true }
}

/**
 * Recalcula o calendário de um contrato.
 *
 * Serve para quando o contrato ganhou data de fim depois de criado, ou quando
 * o horizonte de dois anos da criação já passou.
 */
export async function recalcularVisitas(form: FormData): Promise<Resposta<{ novas: number }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONTRATAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não mexe no contrato.' }
  }
  const id = String(form.get('contratoId') ?? '')
  if (!id) return { ok: false, motivo: 'Contrato não informado.' }

  const novas = await comEscopo(a.ctx, (tx) => gerarVisitas(tx, exigirEmpresa(a.ctx), id))
  revalidatePath('/painel/preventiva')
  return { ok: true, dados: { novas } }
}
