import { comEscopo, type ContextoAcesso } from '@/lib/db'
import type { StatusProposta } from '@/generated/prisma/enums'

/**
 * OS ORÇAMENTOS DO PASSO 1 — a lista de quem ainda pode virar serviço.
 *
 * =============================================================================
 * ELA NÃO É O FUNIL DE ORÇAMENTOS QUE JÁ EXISTIA
 * =============================================================================
 * Aquele mostra o preço de aparelhos que JÁ ESTÃO na oficina, montado depois do
 * laudo. Este mostra a proposta que saiu antes de qualquer aparelho chegar — o
 * passo 1 do processo. As duas se chamam "orçamento" na boca de quem trabalha,
 * e a diferença entre elas é o momento: uma decide se o cliente traz o
 * aparelho, a outra decide se ele autoriza o conserto do aparelho que já
 * trouxe.
 */
export type PropostaNaLista = {
  id: string
  numero: number
  status: StatusProposta
  cliente: string
  clienteId: string
  equipamento: string
  totalCentavos: number
  /** 'AAAA-MM-DD' — para o `<input type="date">` da edição. */
  validoAteCampo: string
  validoAte: string | null
  /** Passou da validade e continua esperando resposta. */
  vencida: boolean
  criadoEm: string
  enviadaEm: string | null
  respondidaEm: string | null
  aprovadaPorNome: string | null
  motivoRecusa: string | null
  autorNome: string | null
  /** A O.S. que ela virou, quando virou. */
  ordemGeradaId: string | null
  ordemGeradaNumero: number | null
  itens: Array<{
    id: string
    tipo: string
    descricao: string
    pecaId: string | null
    quantidade: number
    valorUnitCentavos: number
    valorTotalCentavos: number
  }>
  necessidade: string
  observacoes: string
  condicoesPagamento: string
  garantiaDias: number
  prazoExecucaoDias: number
  descontoCentavos: number
  acrescimoCentavos: number
  /** O endereço público, para copiar e mandar à mão se precisar. */
  link: string
}

export type ResumoPropostas = {
  emRascunho: number
  aguardando: number
  aprovadas: number
  /** Soma do que está esperando resposta — o dinheiro em jogo agora. */
  aguardandoCentavos: number
  /** Aprovadas que ainda não viraram O.S. — trabalho vendido e não aberto. */
  aprovadasSemOs: number
}

export async function listarPropostas(
  ctx: ContextoAcesso,
  filtro: { status?: string; busca?: string },
  appUrl: string,
): Promise<{ itens: PropostaNaLista[]; resumo: ResumoPropostas }> {
  const b = filtro.busca?.trim() ?? ''
  const status = STATUS_VALIDOS.includes(filtro.status as StatusProposta)
    ? (filtro.status as StatusProposta)
    : null

  const linhas = await comEscopo(ctx, (tx) =>
    tx.proposta.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(b
          ? {
              OR: [
                { equipamentoDescricao: { contains: b, mode: 'insensitive' } },
                { cliente: { nome: { contains: b, mode: 'insensitive' } } },
                // Número puro: quem procura "12" quer a proposta #0012.
                ...(/^\d+$/.test(b) ? [{ numero: Number(b) }] : []),
              ],
            }
          : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
      include: {
        cliente: { select: { id: true, nome: true } },
        ordemGerada: { select: { numero: true } },
        itens: { orderBy: { ordem: 'asc' } },
      },
    }),
  )

  const agora = Date.now()
  const itens: PropostaNaLista[] = linhas.map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status,
    cliente: p.cliente.nome,
    clienteId: p.cliente.id,
    equipamento: p.equipamentoDescricao,
    totalCentavos: p.totalCentavos,
    validoAteCampo: p.validoAte ? diaLocal(p.validoAte) : '',
    validoAte: p.validoAte ? DATA.format(p.validoAte) : null,
    vencida: p.status === 'ENVIADA' && !!p.validoAte && p.validoAte.getTime() < agora,
    criadoEm: DATA.format(p.criadoEm),
    enviadaEm: p.enviadaEm ? DATA.format(p.enviadaEm) : null,
    respondidaEm: p.respondidaEm ? DATA.format(p.respondidaEm) : null,
    aprovadaPorNome: p.aprovadaPorNome,
    motivoRecusa: p.motivoRecusa,
    autorNome: p.autorNome,
    ordemGeradaId: p.ordemGeradaId,
    ordemGeradaNumero: p.ordemGerada?.numero ?? null,
    itens: p.itens.map((i) => ({
      id: i.id,
      tipo: i.tipo,
      descricao: i.descricao,
      pecaId: i.pecaId,
      // `Decimal` do Prisma não atravessa a fronteira servidor→cliente.
      quantidade: Number(i.quantidade),
      valorUnitCentavos: i.valorUnitCentavos,
      valorTotalCentavos: i.valorTotalCentavos,
    })),
    necessidade: p.necessidade ?? '',
    observacoes: p.observacoes ?? '',
    condicoesPagamento: p.condicoesPagamento ?? '',
    garantiaDias: p.garantiaDias,
    prazoExecucaoDias: p.prazoExecucaoDias,
    descontoCentavos: p.descontoCentavos,
    acrescimoCentavos: p.acrescimoCentavos,
    link: `${appUrl}/orcamento/${p.tokenPublico}`,
  }))

  /**
   * O RESUMO É CONTADO SOBRE A LISTA JÁ FILTRADA?  NÃO.
   *
   * Ele conta a carteira inteira, de propósito: os números do topo respondem
   * "como está o comercial", e essa pergunta não muda porque alguém digitou um
   * nome na busca. Um resumo que acompanha o filtro faria "R$ 0,00 aguardando"
   * aparecer só porque a busca não achou ninguém.
   */
  const todas = await comEscopo(ctx, (tx) =>
    tx.proposta.findMany({
      select: { status: true, totalCentavos: true, ordemGeradaId: true },
    }),
  )

  return {
    itens,
    resumo: {
      emRascunho: todas.filter((p) => p.status === 'RASCUNHO').length,
      aguardando: todas.filter((p) => p.status === 'ENVIADA').length,
      aprovadas: todas.filter((p) => p.status === 'APROVADA').length,
      aguardandoCentavos: todas
        .filter((p) => p.status === 'ENVIADA')
        .reduce((s, p) => s + p.totalCentavos, 0),
      aprovadasSemOs: todas.filter((p) => p.status === 'APROVADA' && !p.ordemGeradaId).length,
    },
  }
}

const STATUS_VALIDOS: StatusProposta[] = [
  'RASCUNHO',
  'ENVIADA',
  'APROVADA',
  'RECUSADA',
  'EXPIRADA',
  'CANCELADA',
]

const DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const diaLocal = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
