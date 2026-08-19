import { TipoMovimentoEstoque as TM } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso, type Transacao } from '@/lib/db'

/**
 * A ordem está parada esperando peça?
 *
 * ---------------------------------------------------------------------------
 * A PERGUNTA QUE NINGUÉM CONSEGUIA RESPONDER
 * ---------------------------------------------------------------------------
 * "Por que essa O.S. está parada há nove dias?" A resposta quase sempre é uma
 * de três: o técnico não pegou, o cliente não respondeu, ou FALTA PEÇA. As duas
 * primeiras a tela já mostrava. A terceira não existia em lugar nenhum — e é a
 * única que não se resolve cobrando alguém, porque depende de comprar.
 *
 * Pior: o próprio código admitia a lacuna. Quando a aprovação do cliente não
 * conseguia reservar a peça, o comentário dizia "aparece no painel como
 * pendência" — e não aparecia em canto nenhum. Ficava um `console.warn` num log
 * que ninguém lê.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO
 * ---------------------------------------------------------------------------
 * Do Odoo vem a ideia de um estado calculado de disponibilidade
 * (`parts_availability`: disponível / esperada / atrasada). Aqui ele é derivado
 * do que já existe — os itens de peça do orçamento aprovado contra a reserva
 * que foi feita — e não de uma coluna nova. Estado guardado desatualiza; estado
 * calculado, não.
 */

export type Pendencia = {
  /** Falta peça para executar este serviço. */
  falta: boolean
  itens: Array<{
    peca: string
    sku: string
    precisa: number
    reservado: number
    livre: number
  }>
  /** Frase pronta para a tela, ou nulo quando não falta nada. */
  aviso: string | null
}

const SEM_FALTA: Pendencia = { falta: false, itens: [], aviso: null }

/**
 * Compara o que o orçamento aprovado pede com o que foi realmente reservado.
 *
 * A reserva é a prova: se ela existe, a peça está separada. O que este cálculo
 * procura é o item que o cliente aprovou e a prateleira não tinha.
 */
export async function pendenciaDePecas(tx: Transacao, ordemId: string): Promise<Pendencia> {
  const orc = await tx.orcamento.findFirst({
    where: { ordemId, status: 'APROVADO' },
    orderBy: { versao: 'desc' },
    select: {
      itens: {
        where: { tipo: 'PECA', pecaId: { not: null } },
        select: { pecaId: true, quantidade: true, descricao: true },
      },
    },
  })
  if (!orc || orc.itens.length === 0) return SEM_FALTA

  const reservas = await tx.movimentoEstoque.findMany({
    where: { ordemId, tipo: { in: [TM.RESERVA, TM.SAIDA] } },
    select: { pecaId: true, quantidade: true, tipo: true },
  })
  const separado = new Map<string, number>()
  for (const r of reservas) {
    separado.set(r.pecaId, (separado.get(r.pecaId) ?? 0) + Number(r.quantidade))
  }

  const itens: Pendencia['itens'] = []
  for (const i of orc.itens) {
    const precisa = Number(i.quantidade)
    const temSeparado = separado.get(i.pecaId!) ?? 0
    if (temSeparado >= precisa) continue

    const p = await tx.peca.findUnique({
      where: { id: i.pecaId! },
      select: { sku: true, nome: true, saldo: true, saldoReservado: true },
    })
    itens.push({
      peca: p?.nome ?? i.descricao,
      sku: p?.sku ?? '—',
      precisa,
      reservado: temSeparado,
      livre: p ? Number(p.saldo) - Number(p.saldoReservado) : 0,
    })
  }

  if (itens.length === 0) return SEM_FALTA

  const nomes = itens.map((i) => `${i.sku} (faltam ${i.precisa - i.reservado})`).join(', ')
  return {
    falta: true,
    itens,
    aviso:
      itens.length === 1
        ? `Parado esperando peça: ${nomes}. Sem ela o serviço não anda.`
        : `Parado esperando ${itens.length} peças: ${nomes}.`,
  }
}

/** A mesma pergunta, com escopo próprio. */
export function pendenciaDe(ctx: ContextoAcesso, ordemId: string): Promise<Pendencia> {
  return comEscopo(ctx, (tx) => pendenciaDePecas(tx, ordemId))
}

/**
 * Todas as ordens travadas por falta de peça.
 *
 * A lista que a compra usa: o que precisa entrar hoje para destravar serviço já
 * aprovado — e portanto já vendido.
 */
export async function ordensTravadasPorPeca(ctx: ContextoAcesso) {
  return comEscopo(ctx, async (tx) => {
    const candidatas = await tx.ordem.findMany({
      where: {
        etapa: { in: ['ORCAMENTO_APROVADO', 'EM_MANUTENCAO'] },
        orcamentos: { some: { status: 'APROVADO', itens: { some: { tipo: 'PECA' } } } },
      },
      select: {
        id: true,
        numero: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true } },
      },
      take: 50,
    })

    const travadas = []
    for (const o of candidatas) {
      const p = await pendenciaDePecas(tx, o.id)
      if (p.falta) travadas.push({ ...o, pendencia: p })
    }
    return travadas
  })
}
