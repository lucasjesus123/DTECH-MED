'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel, StatusProposta } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { novoToken } from '@/lib/cripto'
import { env } from '@/lib/env'
import { aCentavos, lerValorBR } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { enfileirar } from '@/server/ordem/motor'
import { proximoNumero } from '@/server/financeiro/servico'

/**
 * O ORÇAMENTO DO PASSO 1 — a proposta que existe antes da ordem.
 *
 * =============================================================================
 * O QUE FALTAVA
 * =============================================================================
 * O passo a passo do dono começa em ORÇAMENTO e só no 2 abre a O.S. O sistema
 * pulava o 1: guardava um `valorPrevioCentavos` solto na ordem — "o combinado
 * na abertura" — e chamava isso de orçamento. Não era. Não tinha itens, não
 * saía para o cliente, não tinha validade, e ninguém aprovava nada. Era uma
 * anotação.
 *
 * Agora é uma peça de verdade: itens, desconto, validade, link próprio, e a
 * assinatura do cliente do outro lado. Aprovada, vira a O.S. do passo 2 com um
 * clique, levando o valor junto.
 *
 * =============================================================================
 * O QUE ELA NÃO FAZ, DE PROPÓSITO
 * =============================================================================
 * Não mexe em estoque. Uma proposta é uma OFERTA — reservar peça para quem
 * ainda não decidiu é tirar da prateleira o que o cliente da porta ao lado vai
 * levar hoje. A reserva continua acontecendo onde sempre aconteceu: na
 * aprovação do orçamento pós-laudo, quando o aparelho já está aqui.
 */

type Resposta<T = undefined> =
  | { ok: true; dados?: T }
  | { ok: false; motivo: string }

/**
 * Quem monta e manda proposta. É a mesma lista de quem abre O.S. — o comercial
 * e a gestão. O técnico não entra: ele orça o que já está na bancada, e isso é
 * o outro orçamento.
 */
const PODE_ORCAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.ATENDENTE,
]

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

const schemaItem = z.object({
  tipo: z.enum(['PECA', 'SERVICO', 'DESLOCAMENTO', 'TAXA']),
  descricao: z.string().trim().min(2),
  pecaId: z.string().nullish(),
  quantidade: z.number().positive().max(9999),
  valorUnit: z.number().min(0).max(9_999_999),
})

const schemaSalvar = z.object({
  /** Vazio = está nascendo agora. */
  propostaId: z.string().nullish(),
  clienteId: z.string().min(1, 'Escolha o cliente.'),
  leadId: z.string().nullish(),
  equipamentoDescricao: z
    .string()
    .trim()
    .min(3, 'Diga qual é o aparelho — marca e modelo bastam.'),
  necessidade: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
  condicoesPagamento: z.string().trim().nullish(),
  garantiaDias: z.coerce.number().int().min(0).max(3650).default(90),
  prazoExecucaoDias: z.coerce.number().int().min(0).max(3650).default(7),
  validoAte: z.string().trim().nullish(),
  desconto: z.string().trim().nullish(),
  acrescimo: z.string().trim().nullish(),
  itensJson: z.string(),
})

export async function salvarProposta(
  _anterior: Resposta<{ id: string }>,
  form: FormData,
): Promise<Resposta<{ id: string }>> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ORCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não monta orçamento.' }
  }

  const d = schemaSalvar.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  let itens: z.infer<typeof schemaItem>[]
  try {
    itens = z.array(schemaItem).parse(JSON.parse(v.itensJson))
  } catch {
    return { ok: false, motivo: 'Confira os itens do orçamento.' }
  }
  if (itens.length === 0) {
    return { ok: false, motivo: 'Um orçamento sem item nenhum não diz preço de nada.' }
  }

  // `lerValorBR` aceita "1.234,56" e "1234.56" — a pessoa digita como pensa.
  const desconto = aCentavos(lerValorBR(v.desconto ?? '') ?? 0)
  const acrescimo = aCentavos(lerValorBR(v.acrescimo ?? '') ?? 0)

  // O total é calculado AQUI, e nunca vem do formulário. Preço que chega
  // pronto do navegador é preço que dá para alterar antes de chegar.
  const calculados = itens.map((i) => ({
    ...i,
    valorTotalCentavos: Math.round(i.valorUnit * 100) * i.quantidade,
  }))
  const subtotalPecas = calculados
    .filter((i) => i.tipo === 'PECA')
    .reduce((s, i) => s + i.valorTotalCentavos, 0)
  const subtotalServicos = calculados
    .filter((i) => i.tipo !== 'PECA')
    .reduce((s, i) => s + i.valorTotalCentavos, 0)
  const total = Math.max(0, subtotalPecas + subtotalServicos - desconto + acrescimo)

  /**
   * A VALIDADE PADRÃO É QUINZE DIAS, e não "sem validade".
   *
   * Proposta sem prazo é preço eterno: o cliente aprova em setembro o valor que
   * a peça tinha em março, e a diferença sai do bolso da casa. Quinze dias é o
   * que a maioria das assistências pratica e o que cabe numa decisão de
   * clínica; quem quiser outro prazo escreve.
   */
  const validade = v.validoAte
    ? new Date(`${v.validoAte}T23:59:59-03:00`)
    : new Date(Date.now() + 15 * 86_400_000)
  if (Number.isNaN(validade.getTime())) return { ok: false, motivo: 'Data de validade inválida.' }

  const r = await comEscopo(a.ctx, async (tx) => {
    const tenantId = exigirEmpresa(a.ctx)

    const cliente = await tx.cliente.findUnique({
      where: { id: v.clienteId },
      select: { id: true },
    })
    if (!cliente) return { ok: false as const, motivo: 'Cliente não encontrado.' }

    let propostaId = v.propostaId ?? null

    if (propostaId) {
      const atual = await tx.proposta.findUnique({
        where: { id: propostaId },
        select: { status: true },
      })
      if (!atual) return { ok: false as const, motivo: 'Orçamento não encontrado.' }
      /**
       * DEPOIS DE ENVIADA, O PREÇO NÃO MUDA POR BAIXO.
       *
       * O cliente está com um link aberto que mostra um total. Reeditar os
       * itens faria a tela dele mudar sozinha entre o "vou pensar" e o "pode
       * fazer" — e o que ele aprovaria não seria o que ele leu. Para mudar o
       * preço, cancela e monta outra: fica registrado que houve duas.
       */
      if (atual.status !== StatusProposta.RASCUNHO) {
        return {
          ok: false as const,
          motivo:
            'Este orçamento já saiu para o cliente. Para mudar o preço, cancele e monte um novo — assim fica registrado que houve dois.',
        }
      }
      await tx.propostaItem.deleteMany({ where: { propostaId } })
      await tx.proposta.update({
        where: { id: propostaId },
        data: {
          clienteId: v.clienteId,
          equipamentoDescricao: v.equipamentoDescricao,
          necessidade: v.necessidade || null,
          observacoes: v.observacoes || null,
          condicoesPagamento: v.condicoesPagamento || null,
          garantiaDias: v.garantiaDias,
          prazoExecucaoDias: v.prazoExecucaoDias,
          validoAte: validade,
          subtotalPecas,
          subtotalServicos,
          descontoCentavos: desconto,
          acrescimoCentavos: acrescimo,
          totalCentavos: total,
        },
      })
    } else {
      const numero = await proximoNumero(tx, tenantId, 'proposta')
      const nova = await tx.proposta.create({
        data: {
          tenantId,
          numero,
          clienteId: v.clienteId,
          leadId: v.leadId || null,
          equipamentoDescricao: v.equipamentoDescricao,
          necessidade: v.necessidade || null,
          observacoes: v.observacoes || null,
          condicoesPagamento: v.condicoesPagamento || null,
          garantiaDias: v.garantiaDias,
          prazoExecucaoDias: v.prazoExecucaoDias,
          validoAte: validade,
          subtotalPecas,
          subtotalServicos,
          descontoCentavos: desconto,
          acrescimoCentavos: acrescimo,
          totalCentavos: total,
          tokenPublico: novoToken(24),
          autorId: a.sessao.userId,
          autorNome: a.sessao.nome,
        },
        select: { id: true },
      })
      propostaId = nova.id
    }

    await tx.propostaItem.createMany({
      data: calculados.map((i, n) => ({
        tenantId,
        propostaId: propostaId!,
        tipo: i.tipo,
        descricao: i.descricao,
        pecaId: i.pecaId || null,
        quantidade: i.quantidade,
        valorUnitCentavos: Math.round(i.valorUnit * 100),
        valorTotalCentavos: i.valorTotalCentavos,
        ordem: n,
      })),
    })

    return { ok: true as const, id: propostaId! }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: v.propostaId ? 'proposta.editada' : 'proposta.criada',
    entidade: 'proposta',
    entidadeId: r.id,
    detalhes: { total, itens: itens.length },
  })
  revalidatePath('/painel/contatos')
  return { ok: true, dados: { id: r.id } }
}

/**
 * Manda ao cliente: grava a saída e enfileira o WhatsApp com o link.
 *
 * O envio passa pela FILA e não pelo clique. Se a uazapi estiver fora do ar, a
 * proposta ainda foi enviada do ponto de vista da casa — o texto sai sozinho
 * quando a conexão voltar. Mandar direto significaria a pessoa esperando a rede
 * de terceiro para a tela dela responder, e a proposta não sair quando falhasse.
 */
export async function enviarProposta(propostaId: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ORCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não envia orçamento.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const p = await tx.proposta.findUnique({
      where: { id: propostaId },
      select: {
        id: true,
        numero: true,
        status: true,
        totalCentavos: true,
        cliente: { select: { whatsapp: true, telefone: true } },
        _count: { select: { itens: true } },
      },
    })
    if (!p) return { ok: false as const, motivo: 'Orçamento não encontrado.' }
    if (p.status !== StatusProposta.RASCUNHO) {
      return { ok: false as const, motivo: 'Este orçamento já saiu.' }
    }
    if (p._count.itens === 0) {
      return { ok: false as const, motivo: 'Não dá para mandar um orçamento sem item nenhum.' }
    }
    if (!p.cliente.whatsapp && !p.cliente.telefone) {
      return {
        ok: false as const,
        motivo: 'O cliente não tem WhatsApp nem telefone no cadastro — o link não teria para onde ir.',
      }
    }

    await tx.proposta.update({
      where: { id: propostaId },
      data: { status: StatusProposta.ENVIADA, enviadaEm: new Date() },
    })

    await enfileirar(tx, exigirEmpresa(a.ctx), {
      tipo: 'proposta.whatsapp',
      prioridade: 1,
      // Uma proposta, um envio. Retry de rede não manda dois orçamentos.
      dedupeKey: `proposta:enviada:${propostaId}`,
      payload: { propostaId, template: 'proposta.enviada' },
    })

    return { ok: true as const, numero: p.numero }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'proposta.enviada',
    entidade: 'proposta',
    entidadeId: propostaId,
    detalhes: { numero: r.numero },
  })
  revalidatePath('/painel/contatos')
  return { ok: true }
}

export async function cancelarProposta(propostaId: string, motivo: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ORCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não cancela orçamento.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const p = await tx.proposta.findUnique({
      where: { id: propostaId },
      select: { status: true, ordemGeradaId: true },
    })
    if (!p) return { ok: false as const, motivo: 'Orçamento não encontrado.' }
    // Cancelar o que já virou ordem esconderia a origem de um serviço em
    // andamento — e é justamente a proposta que prova o preço combinado.
    if (p.ordemGeradaId) {
      return { ok: false as const, motivo: 'Este orçamento já virou O.S. — cancele a ordem.' }
    }
    if (p.status === StatusProposta.CANCELADA) return { ok: true as const }

    await tx.proposta.update({
      where: { id: propostaId },
      data: { status: StatusProposta.CANCELADA, motivoRecusa: motivo.trim() || null },
    })
    return { ok: true as const }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'proposta.cancelada',
    entidade: 'proposta',
    entidadeId: propostaId,
    detalhes: { motivo },
  })
  revalidatePath('/painel/contatos')
  return { ok: true }
}

/**
 * A PONTE ENTRE O PASSO 1 E O PASSO 2.
 *
 * Aprovada a proposta, abrir a O.S. deixa de ser um formulário em branco: o
 * cliente já está escolhido, o aparelho já foi descrito, o valor já foi
 * combinado E ASSINADO. Redigitar tudo isso seria pedir de novo o que o cliente
 * acabou de aprovar — e é onde nasce a divergência entre o que foi orçado e o
 * que foi aberto.
 *
 * Devolve o que a tela de abrir O.S. precisa para vir preenchida. Ela NÃO cria
 * a ordem: quem cria continua sendo `abrirOrdem`, com as suas validações, o seu
 * evento na trilha e o seu PDF. Duplicar a criação aqui daria duas portas para
 * o mesmo ato, e uma delas ficaria para trás na primeira regra nova.
 */
export async function propostaParaAbrirOS(propostaId: string): Promise<
  Resposta<{
    clienteId: string
    equipamentoDescricao: string
    necessidade: string
    totalCentavos: number
    condicao: string
  }>
> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const p = await comEscopo(a.ctx, (tx) =>
    tx.proposta.findUnique({
      where: { id: propostaId },
      select: {
        status: true,
        clienteId: true,
        equipamentoDescricao: true,
        necessidade: true,
        totalCentavos: true,
        condicoesPagamento: true,
        garantiaDias: true,
        ordemGeradaId: true,
      },
    }),
  )
  if (!p) return { ok: false, motivo: 'Orçamento não encontrado.' }
  if (p.ordemGeradaId) return { ok: false, motivo: 'Este orçamento já virou uma O.S.' }
  if (p.status !== StatusProposta.APROVADA) {
    return {
      ok: false,
      motivo: 'Só orçamento aprovado pelo cliente vira O.S. — mande o link e espere a resposta.',
    }
  }

  return {
    ok: true,
    dados: {
      clienteId: p.clienteId,
      equipamentoDescricao: p.equipamentoDescricao,
      necessidade: p.necessidade ?? '',
      totalCentavos: p.totalCentavos,
      condicao:
        p.condicoesPagamento ??
        `Orçamento aprovado pelo cliente · garantia de ${p.garantiaDias} dias`,
    },
  }
}

/** Amarra a ordem recém-criada à proposta que a originou. */
export async function ligarPropostaNaOrdem(
  propostaId: string,
  ordemId: string,
): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const r = await comEscopo(a.ctx, async (tx) => {
    const p = await tx.proposta.findUnique({
      where: { id: propostaId },
      select: { ordemGeradaId: true, status: true },
    })
    if (!p) return { ok: false as const, motivo: 'Orçamento não encontrado.' }
    if (p.ordemGeradaId) return { ok: false as const, motivo: 'Este orçamento já virou uma O.S.' }
    if (p.status !== StatusProposta.APROVADA) {
      return { ok: false as const, motivo: 'Só orçamento aprovado vira O.S.' }
    }
    await tx.proposta.update({ where: { id: propostaId }, data: { ordemGeradaId: ordemId } })
    return { ok: true as const }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'proposta.virou_os',
    entidade: 'proposta',
    entidadeId: propostaId,
    detalhes: { ordemId },
  })
  revalidatePath('/painel/contatos')
  revalidatePath('/painel/ordens')
  return { ok: true }
}

/** O endereço público desta proposta — o que vai no WhatsApp do cliente. */
export async function linkDaProposta(propostaId: string): Promise<string | null> {
  const a = await ator()
  if (!a) return null
  const p = await comEscopo(a.ctx, (tx) =>
    tx.proposta.findUnique({ where: { id: propostaId }, select: { tokenPublico: true } }),
  )
  return p ? `${env.APP_URL}/orcamento/${p.tokenPublico}` : null
}
