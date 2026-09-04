import { EtapaOrdem } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * Consultas do painel.
 *
 * A tese da tela está aqui, não no CSS: o painel não lista "ordens", ele mostra
 * **onde a esteira travou**. Por isso a consulta agrupa por etapa e traz há
 * quanto tempo cada grupo está parado — é o número que faz alguém agir.
 *
 * Tudo em uma ida ao banco por bloco. Contar sete etapas com sete consultas
 * seria sete viagens de rede a cada carregamento de tela.
 */

/** Os degraus mostrados na esteira, na ordem da jornada. */
export const DEGRAUS = [
  { chave: 'retirar', rotulo: 'A retirar', etapas: [EtapaOrdem.ORDEM_RETIRADA_GERADA, EtapaOrdem.RETIRADA_AGENDADA] },
  { chave: 'rota', rotulo: 'Em rota', etapas: [EtapaOrdem.EM_ROTA_RETIRADA] },
  { chave: 'entrada', rotulo: 'Dar entrada', etapas: [EtapaOrdem.COLETADO] },
  { chave: 'analise', rotulo: 'Em análise', etapas: [EtapaOrdem.RECEBIDO_NA_EMPRESA, EtapaOrdem.EM_ANALISE] },
  { chave: 'orcar', rotulo: 'Orçamento parado', etapas: [EtapaOrdem.ORCAMENTO_INTERNO, EtapaOrdem.ORCAMENTO_ENVIADO] },
  { chave: 'manut', rotulo: 'Em manutenção', etapas: [EtapaOrdem.ORCAMENTO_APROVADO, EtapaOrdem.EM_MANUTENCAO] },
  { chave: 'faturar', rotulo: 'A faturar', etapas: [EtapaOrdem.MANUTENCAO_CONCLUIDA, EtapaOrdem.APROVACAO_GESTAO, EtapaOrdem.FATURAMENTO] },
  { chave: 'entregar', rotulo: 'A entregar', etapas: [EtapaOrdem.FATURADO, EtapaOrdem.EM_ROTA_ENTREGA] },
] as const

export type Degrau = {
  chave: string
  rotulo: string
  total: number
  /** Quantas estão paradas há mais de cinco dias — o número que dói. */
  travadas: number
  /** Dias que a mais antiga do grupo está parada. */
  diasDaMaisAntiga: number | null
}

export async function esteira(ctx: ContextoAcesso): Promise<Degrau[]> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ etapa: EtapaOrdem; total: bigint; travadas: bigint; maisAntiga: Date | null }>>`
      SELECT etapa,
             count(*)                                                   AS total,
             count(*) FILTER (WHERE "atualizadoEm" < now() - interval '5 days') AS travadas,
             min("atualizadoEm")                                        AS "maisAntiga"
        FROM ordens
       WHERE "tenantId" = ${ctx.tenantId}
         AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO','SOLICITACAO_RECEBIDA')
       GROUP BY etapa
    `,
  )

  const porEtapa = new Map(linhas.map((l) => [l.etapa, l]))

  return DEGRAUS.map((d) => {
    let total = 0
    let travadas = 0
    let maisAntiga: Date | null = null
    for (const e of d.etapas) {
      const l = porEtapa.get(e)
      if (!l) continue
      total += Number(l.total)
      travadas += Number(l.travadas)
      if (l.maisAntiga && (!maisAntiga || l.maisAntiga < maisAntiga)) maisAntiga = l.maisAntiga
    }
    return {
      chave: d.chave,
      rotulo: d.rotulo,
      total,
      travadas,
      diasDaMaisAntiga: maisAntiga
        ? Math.floor((Date.now() - maisAntiga.getTime()) / 86_400_000)
        : null,
    }
  })
}

export type OrdemNaFila = {
  id: string
  numero: number
  etapa: EtapaOrdem
  cliente: string
  equipamento: string
  tecnico: string | null
  atualizadoEm: Date
  prazoPrometido: Date | null
  diasParado: number
  atrasada: boolean
}

/** A fila de um degrau, do mais parado para o mais recente. */
export async function filaDoDegrau(
  ctx: ContextoAcesso,
  chave: string,
  limite = 40,
): Promise<OrdemNaFila[]> {
  const degrau = DEGRAUS.find((d) => d.chave === chave) ?? DEGRAUS[5]
  const etapas = [...degrau.etapas]

  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: { etapa: { in: etapas } },
      // Quem está parado há mais tempo aparece primeiro: a tela ordena pelo
      // que precisa de atenção, não pelo que chegou por último.
      orderBy: { atualizadoEm: 'asc' },
      take: limite,
      select: {
        id: true,
        numero: true,
        etapa: true,
        atualizadoEm: true,
        prazoPrometido: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true } },
        tecnico: { select: { nome: true } },
      },
    }),
  )

  const agora = Date.now()
  return ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    etapa: o.etapa,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    tecnico: o.tecnico?.nome ?? null,
    atualizadoEm: o.atualizadoEm,
    prazoPrometido: o.prazoPrometido,
    diasParado: Math.floor((agora - o.atualizadoEm.getTime()) / 86_400_000),
    atrasada: o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false,
  }))
}

export type ResumoDoDia = {
  /**
   * `null` para quem não pode ver dinheiro — e é `null` porque a consulta nem
   * chegou a rodar, não porque a tela escondeu depois.
   */
  aReceber: number | null
  recebidoNoMes: number | null
  ordensAbertas: number
  atrasadas: number
  pecasAbaixoDoMinimo: number
  avisosNaFila: number
  avisosFalhados: number
}

/**
 * Os números do topo.
 *
 * Escolhidos pelo que muda a decisão do dia, não pelo que é fácil de contar.
 * "Atrasadas" está aqui porque é o número que o sistema antigo deixava crescer
 * até 173 sem ninguém ser cobrado.
 *
 * =============================================================================
 * O DINHEIRO SÓ SAI DAQUI PARA QUEM PODE VER DINHEIRO
 * =============================================================================
 * Este cartão mostrava "A receber R$ 23.335,00" para TODO MUNDO que abrisse o
 * Dashboard — inclusive para o motorista, cuja tela inteira já é cortada em
 * todo o resto do sistema. O corte estava no Calendário e no Financeiro, e
 * faltava justamente na primeira tela que qualquer pessoa vê ao entrar.
 *
 * A consulta das faturas nem chega a rodar quando não pode: filtrar depois, na
 * renderização, mandaria o valor pelo fio até o navegador de quem não deve
 * vê-lo, onde qualquer um lê no inspetor.
 */
export async function resumoDoDia(
  ctx: ContextoAcesso,
  opcoes: { comDinheiro: boolean },
): Promise<ResumoDoDia> {
  return comEscopo(ctx, async (tx) => {
    const [fin] = opcoes.comDinheiro
      ? await tx.$queryRaw<Array<{ areceber: bigint; recebido: bigint }>>`
      SELECT
        coalesce(sum("valorTotalCentavos" - "valorPagoCentavos")
                 FILTER (WHERE status IN ('ABERTA','PARCIAL')), 0) AS areceber,
        coalesce(sum("valorPagoCentavos")
                 FILTER (WHERE "quitadaEm" >= date_trunc('month', now())), 0) AS recebido
      FROM faturas WHERE "tenantId" = ${ctx.tenantId}
    `
      : [null]
    const [ord] = await tx.$queryRaw<Array<{ abertas: bigint; atrasadas: bigint }>>`
      SELECT count(*) AS abertas,
             count(*) FILTER (WHERE "prazoPrometido" < now()) AS atrasadas
        FROM ordens
       WHERE "tenantId" = ${ctx.tenantId}
         AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')
    `
    const [pec] = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pecas
       WHERE "tenantId" = ${ctx.tenantId} AND ativo = true AND saldo <= "estoqueMinimo"
    `
    const [fila] = await tx.$queryRaw<Array<{ pendentes: bigint; falhados: bigint }>>`
      SELECT count(*) FILTER (WHERE status = 'PENDENTE')   AS pendentes,
             count(*) FILTER (WHERE status = 'DESCARTADO') AS falhados
        FROM outbox_jobs WHERE "tenantId" = ${ctx.tenantId}
    `

    return {
      aReceber: opcoes.comDinheiro ? Number(fin?.areceber ?? 0) : null,
      recebidoNoMes: opcoes.comDinheiro ? Number(fin?.recebido ?? 0) : null,
      ordensAbertas: Number(ord?.abertas ?? 0),
      atrasadas: Number(ord?.atrasadas ?? 0),
      pecasAbaixoDoMinimo: Number(pec?.n ?? 0),
      avisosNaFila: Number(fila?.pendentes ?? 0),
      avisosFalhados: Number(fila?.falhados ?? 0),
    }
  })
}

/** O prontuário completo de uma ordem — a visão 360 do equipamento. */
export async function prontuario(ctx: ContextoAcesso, ordemId: string) {
  return comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: ordemId },
      include: {
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        atendente: { select: { nome: true } },
        eventos: { orderBy: { sequencia: 'desc' } },
        /// O serviço que esta ordem está honrando, quando ele existe no sistema.
        ordemOrigem: { select: { id: true, numero: true, garantiaAte: true } },
        fotos: { orderBy: { criadoEm: 'asc' } },
        assinaturas: true,
        documentos: { orderBy: { geradoEm: 'desc' } },
        orcamentos: {
          orderBy: { versao: 'desc' },
          include: { itens: { orderBy: { ordem: 'asc' } } },
        },
        movimentos: { include: { peca: { select: { sku: true, nome: true } } } },
        /// O que saiu de dentro do aparelho, e para onde foi.
        pecasRetiradas: { orderBy: { criadoEm: 'asc' } },
        fatura: { include: { pagamentos: { orderBy: { recebidoEm: 'asc' } } } },
        agendamentos: { include: { motorista: { select: { nome: true } } } },
        mensagens: { orderBy: { criadoEm: 'desc' }, take: 20 },
      },
    }),
  )
}
