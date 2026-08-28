import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { FUSO } from '@/lib/datas'

/**
 * O CAIXA DA EMPRESA — as duas metades, finalmente na mesma conta.
 *
 * =============================================================================
 * O QUE FALTAVA
 * =============================================================================
 * O Financeiro sabia cobrar serviço: `faturas` nasce de uma ordem, e responde
 * "quanto o cliente me deve". Isso é UM lado. O outro — aluguel, energia,
 * contador, salário, a peça comprada no fornecedor — não existia em lugar
 * nenhum do sistema.
 *
 * Metade da história sobre dinheiro é pior que nenhuma, porque parece completa.
 * Quem abria a tela via "recebi R$ 42 mil este mês" e ia dormir tranquilo sem
 * ter subtraído os R$ 38 mil que saíram.
 *
 * =============================================================================
 * AS DUAS PERGUNTAS QUE ESTE ARQUIVO SEPARA
 * =============================================================================
 * Elas se confundem o tempo todo em conversa e NUNCA podem se confundir numa
 * tela, porque uma é passado e a outra é futuro:
 *
 *   REALIZADO — o que de fato passou pelo caixa. Tem data de pagamento.
 *               É o extrato. Não muda mais.
 *   PREVISTO  — o que está em aberto, com vencimento. É expectativa.
 *               Muda todo dia, e parte dele nunca vai entrar.
 *
 * Somar os dois num número só produz um "faturamento" que não bate com o banco
 * nem com o previsto — e é o número que faz alguém contratar em maio o salário
 * que só teria em julho.
 *
 * =============================================================================
 * O QUE ENTRA VEM DE DUAS FONTES, E ISSO É DE PROPÓSITO
 * =============================================================================
 * O dinheiro que entra tem duas origens no sistema:
 *
 *   `pagamentos`  — a baixa de uma fatura de serviço, que nasceu da esteira.
 *   `lancamentos` — o recebimento avulso, que não passou por ordem nenhuma.
 *
 * As consultas daqui SOMAM as duas. É isso que faz "quanto entrou este mês" ser
 * uma resposta e não um pedaço de resposta. O banco mantém as tabelas separadas
 * porque os ciclos de vida são diferentes; a tela junta, porque quem pergunta
 * quer o total.
 */

const LIMITE = 200

/** A competência de hoje, em Lajeado: 'AAAA-MM'. */
export function mesAtual(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7)
}

/** Aceita o que veio da URL. Lixo vira o mês corrente, nunca erro na tela. */
export function mesValido(bruto: string | undefined): string {
  return bruto && /^\d{4}-(0[1-9]|1[0-2])$/.test(bruto) ? bruto : mesAtual()
}

/**
 * O intervalo `[início, fim)` de um mês de calendário, em instantes absolutos.
 *
 * O `-03:00` fixo é a mesma decisão de `janelaDoDia`: a virada do mês é a de
 * Lajeado, dita em letras, e não a do fuso do processo — que muda de máquina
 * para máquina e faz a conta de agosto engolir a primeira madrugada de setembro.
 */
export function janelaDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const inicio = new Date(`${mes}-01T00:00:00-03:00`)
  const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`
  const fim = new Date(`${proximo}-01T00:00:00-03:00`)
  return { inicio, fim }
}

/**
 * 'Agosto de 2026' — o mês por extenso, para o cabeçalho da tela.
 *
 * A maiúscula é feita AQUI e não com `text-transform: capitalize` no CSS. A
 * regra do CSS maiusculiza toda palavra, e o resultado era "Agosto De 2026" —
 * a preposição em maiúscula, que em português é erro de escrita, não estilo.
 */
export function mesPorExtenso(mes: string): string {
  const { inicio } = janelaDoMes(mes)
  const bruto = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    month: 'long',
    year: 'numeric',
  }).format(inicio)
  return bruto.charAt(0).toUpperCase() + bruto.slice(1)
}

/** O mês vizinho, para as setas de navegação. */
export function mesVizinho(mes: string, passo: -1 | 1): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const bruto = m + passo
  if (bruto === 0) return `${ano - 1}-12`
  if (bruto === 13) return `${ano + 1}-01`
  return `${ano}-${String(bruto).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// O panorama do mês
// ---------------------------------------------------------------------------

export type Panorama = {
  /** Realizado: passou pelo caixa dentro do mês. */
  entrouCentavos: number
  saiuCentavos: number
  sobrouCentavos: number
  /**
   * Previsto: em aberto E JÁ PASSOU DA DATA. É o que exige ação hoje.
   *
   * Uma versão anterior devolvia também o total em aberto do mês (`aReceber` /
   * `aPagar`), e nenhuma tela chegou a usar. Somatório que ninguém lê é peso
   * que a consulta carrega toda vez que a página abre — e, pior, é a próxima
   * pessoa achando que existe um lugar mostrando aquele número. Saiu.
   */
  receberVencidoCentavos: number
  pagarVencidoCentavos: number
  receberVencidas: number
  pagarVencidas: number
  /** Quanto do que entrou veio de serviço, e quanto veio de avulso. */
  entrouDeServico: number
  entrouDeAvulso: number
}

export async function panoramaDoMes(ctx: ContextoAcesso, mes: string): Promise<Panorama> {
  const { inicio, fim } = janelaDoMes(mes)

  return comEscopo(ctx, async (tx) => {
    // Serviço: a baixa de fatura. `estornadoEm` fora, senão um estorno continua
    // contando como receita — e é exatamente o caso em que alguém precisa que a
    // conta esteja certa.
    const [serv] = await tx.$queryRaw<Array<{ total: bigint }>>`
      SELECT coalesce(sum("valorCentavos"), 0) AS total
        FROM pagamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND "estornadoEm" IS NULL
         AND "recebidoEm" >= ${inicio} AND "recebidoEm" < ${fim}
    `

    // Lançamentos: as duas metades numa consulta só, separadas por FILTER.
    const [lanc] = await tx.$queryRaw<
      Array<{
        entrou: bigint
        saiu: bigint
        recvenc: bigint
        pagvenc: bigint
        nrecvenc: bigint
        npagvenc: bigint
      }>
    >`
      SELECT
        -- Realizado do mês: o que foi BAIXADO dentro da janela. Usa o valor
        -- efetivamente pago, e não o previsto: desconto e juros fazem os dois
        -- divergirem, e o extrato segue o que saiu da conta.
        coalesce(sum("valorPagoCentavos") FILTER (
          WHERE tipo = 'RECEBER' AND "pagoEm" >= ${inicio} AND "pagoEm" < ${fim}), 0) AS entrou,
        coalesce(sum("valorPagoCentavos") FILTER (
          WHERE tipo = 'PAGAR'   AND "pagoEm" >= ${inicio} AND "pagoEm" < ${fim}), 0) AS saiu,

        -- Vencido NÃO se limita ao mês da tela: uma conta de março que ninguém
        -- pagou continua sendo problema em agosto. Prender o atraso à janela
        -- esconderia justamente a dívida mais velha, que é a pior.
        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'RECEBER' AND "pagoEm" IS NULL AND vencimento < now()), 0) AS recvenc,
        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'PAGAR'   AND "pagoEm" IS NULL AND vencimento < now()), 0) AS pagvenc,
        count(*) FILTER (
          WHERE tipo = 'RECEBER' AND "pagoEm" IS NULL AND vencimento < now()) AS nrecvenc,
        count(*) FILTER (
          WHERE tipo = 'PAGAR'   AND "pagoEm" IS NULL AND vencimento < now()) AS npagvenc
      FROM lancamentos WHERE "tenantId" = ${ctx.tenantId}
    `

    // A fatura de serviço vencida entra no "a receber vencido" junto com o
    // lançamento avulso vencido: as duas são dívida do mesmo cliente, atrasada
    // do mesmo jeito. Contar só uma delas faria o número do topo contradizer a
    // aba de faturas logo abaixo, na mesma tela.
    const [fat] = await tx.$queryRaw<Array<{ vencido: bigint; nvencidas: bigint }>>`
      SELECT
        coalesce(sum("valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                     - "valorPagoCentavos")
                 FILTER (WHERE vencimento < now()), 0)                 AS vencido,
        count(*) FILTER (WHERE vencimento < now())                     AS nvencidas
      FROM faturas
       WHERE "tenantId" = ${ctx.tenantId}
         AND status IN ('ABERTA', 'PARCIAL')
    `

    const entrouDeServico = Number(serv?.total ?? 0)
    const entrouDeAvulso = Number(lanc?.entrou ?? 0)
    const entrou = entrouDeServico + entrouDeAvulso
    const saiu = Number(lanc?.saiu ?? 0)

    return {
      entrouCentavos: entrou,
      saiuCentavos: saiu,
      sobrouCentavos: entrou - saiu,
      receberVencidoCentavos: Number(lanc?.recvenc ?? 0) + Number(fat?.vencido ?? 0),
      pagarVencidoCentavos: Number(lanc?.pagvenc ?? 0),
      receberVencidas: Number(lanc?.nrecvenc ?? 0) + Number(fat?.nvencidas ?? 0),
      pagarVencidas: Number(lanc?.npagvenc ?? 0),
      entrouDeServico,
      entrouDeAvulso,
    }
  })
}

// ---------------------------------------------------------------------------
// A lista de contas
// ---------------------------------------------------------------------------

export type FiltroContas = {
  tipo: 'PAGAR' | 'RECEBER'
  /** 'AAAA-MM'. */
  mes: string
  /** 'abertas' (padrão) · 'vencidas' · 'pagas' · 'todas' */
  situacao?: string
  busca?: string
  categoria?: string
}

/**
 * As contas de um mês.
 *
 * "Abertas" inclui de propósito o que venceu em meses anteriores e continua em
 * aberto: uma conta atrasada não pertence mais ao mês em que venceu, ela
 * pertence a HOJE. Escondê-la no mês passado é o jeito mais eficiente de nunca
 * mais pagá-la.
 */
export async function listarContas(ctx: ContextoAcesso, f: FiltroContas) {
  const { inicio, fim } = janelaDoMes(f.mes)
  const situacao = f.situacao ?? 'abertas'
  const busca = f.busca?.trim() ?? ''

  const where: Record<string, unknown> = { tipo: f.tipo }

  if (situacao === 'pagas') {
    where.pagoEm = { gte: inicio, lt: fim }
  } else if (situacao === 'vencidas') {
    where.pagoEm = null
    where.vencimento = { lt: new Date() }
  } else if (situacao === 'abertas') {
    where.pagoEm = null
    // Do mês para trás: o que vence depois ainda não é assunto de hoje.
    where.vencimento = { lt: fim }
  } else {
    where.OR = [{ vencimento: { gte: inicio, lt: fim } }, { pagoEm: { gte: inicio, lt: fim } }]
  }

  if (f.categoria) where.categoria = f.categoria

  if (busca) {
    const texto = [
      { descricao: { contains: busca, mode: 'insensitive' } },
      { contraparte: { contains: busca, mode: 'insensitive' } },
      { categoria: { contains: busca, mode: 'insensitive' } },
      { cliente: { is: { nome: { contains: busca, mode: 'insensitive' } } } },
    ]
    // `where.OR` já pode estar ocupado pelo filtro de situação 'todas'. Empilhar
    // os dois em AND mantém os sentidos separados — senão a busca ALARGARIA a
    // janela do mês em vez de estreitar dentro dela.
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: texto }]
      delete where.OR
    } else {
      where.OR = texto
    }
  }

  return comEscopo(ctx, (tx) =>
    tx.lancamento.findMany({
      where,
      orderBy: [{ vencimento: 'asc' }, { criadoEm: 'asc' }],
      take: LIMITE,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        categoria: true,
        contraparte: true,
        clienteId: true,
        cliente: { select: { nome: true } },
        valorCentavos: true,
        valorPagoCentavos: true,
        vencimento: true,
        pagoEm: true,
        forma: true,
        grupo: true,
        parcela: true,
        parcelas: true,
        recorrenciaId: true,
        observacoes: true,
        autorNome: true,
      },
    }),
  )
}

/** As categorias que esta empresa já usou — viram sugestão no formulário. */
export async function categoriasUsadas(ctx: ContextoAcesso, tipo: 'PAGAR' | 'RECEBER') {
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ categoria: string }>>`
      SELECT DISTINCT categoria
        FROM lancamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND tipo = ${tipo}::"TipoLancamento"
         AND categoria IS NOT NULL AND categoria <> ''
       ORDER BY categoria
       LIMIT 60
    `
    return linhas.map((l) => l.categoria)
  })
}

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------

export async function listarRecorrencias(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.recorrencia.findMany({
      orderBy: [{ ativo: 'desc' }, { tipo: 'asc' }, { diaVencimento: 'asc' }],
      take: LIMITE,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        categoria: true,
        contraparte: true,
        clienteId: true,
        cliente: { select: { nome: true } },
        valorCentavos: true,
        diaVencimento: true,
        ativo: true,
        inicio: true,
        fim: true,
        ultimoMesGerado: true,
        observacoes: true,
      },
    }),
  )
}

/**
 * Quantas recorrências ativas ainda não geraram a conta deste mês.
 *
 * É o número que justifica o botão "gerar as contas do mês" existir na tela em
 * vez de rodar escondido: quem aperta precisa saber o que vai acontecer antes
 * de apertar.
 *
 * =============================================================================
 * A PERGUNTA É "JÁ TEM CONTA NESTE MÊS?", E NÃO "JÁ PASSEI POR AQUI?"
 * =============================================================================
 * A primeira versão comparava `ultimoMesGerado < mes`. Parecia idempotência e
 * era uma marca d'água — ela só sabe olhar para frente. Gerado agosto, julho
 * ficava inalcançável PARA SEMPRE, porque '2026-08' não é menor que '2026-07'.
 *
 * O estrago não era só a conta que faltava: a tela dizia "Tudo gerado. As
 * recorrências ativas já lançaram a conta de Julho de 2026" com julho zerado.
 * Uma tela de dinheiro afirmando que lançou o que não lançou é pior que uma
 * que não faz nada.
 *
 * `NOT EXISTS` pergunta o que de fato importa. Apertar duas vezes no mesmo mês
 * continua sem duplicar — e agora quem começa a usar o sistema em agosto
 * consegue voltar e lançar julho.
 */
export async function pendentesDeGeracao(ctx: ContextoAcesso, mes: string): Promise<number> {
  // As duas pontas do mês vêm PRONTAS do JavaScript, sem aritmética de data na
  // consulta. `${inicio} + interval '1 month'` parece inofensivo e não é: o
  // Prisma manda o parâmetro sem tipo, o Postgres resolve a soma como
  // `interval + interval` e a comparação seguinte estoura com "operator does
  // not exist: timestamp without time zone < interval" — erro 500 na tela, não
  // resultado errado. `janelaDoMes` já devolve as duas datas; use-as.
  // Renomeados de propósito: a tabela tem colunas chamadas `inicio` e `fim`, e
  // `${fim}` ao lado de `fim` na mesma consulta é a linha que alguém lê errado
  // daqui a seis meses.
  const { inicio: primeiroDia, fim: primeiroDoProximo } = janelaDoMes(mes)
  return comEscopo(ctx, async (tx) => {
    const [r] = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM recorrencias r
       WHERE r."tenantId" = ${ctx.tenantId}
         AND r.ativo = true
         AND r.inicio < ${primeiroDoProximo}
         AND (r.fim IS NULL OR r.fim >= ${primeiroDia})
         AND NOT EXISTS (
           SELECT 1 FROM lancamentos l
            WHERE l."recorrenciaId" = r.id
              AND l.vencimento >= ${primeiroDia}
              AND l.vencimento <  ${primeiroDoProximo}
         )
    `
    return Number(r?.n ?? 0)
  })
}

// ---------------------------------------------------------------------------
// Os gráficos
// ---------------------------------------------------------------------------

export type MesDoFluxo = { mes: string; entrouCentavos: number; saiuCentavos: number }

/**
 * Os últimos N meses de caixa realizado — a série do gráfico de barras.
 *
 * A soma é feita no Postgres com `date_trunc` no fuso de Lajeado. Fazer isso em
 * JavaScript exigiria trazer todas as linhas de meio ano para a memória do
 * servidor web só para agrupá-las, e o agrupamento erraria a virada do mês na
 * madrugada — o mesmo defeito de fuso que `lib/datas` documenta.
 */
export async function fluxoDosMeses(ctx: ContextoAcesso, quantos = 6): Promise<MesDoFluxo[]> {
  const n = Math.max(1, Math.min(24, Math.trunc(quantos)))

  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ mes: string; entrou: bigint; saiu: bigint }>>`
      WITH meses AS (
        SELECT to_char(g, 'YYYY-MM') AS mes, g AS ini, g + interval '1 month' AS fim
          FROM generate_series(
                 date_trunc('month', (now() AT TIME ZONE ${FUSO})) - make_interval(months => ${n - 1}),
                 date_trunc('month', (now() AT TIME ZONE ${FUSO})),
                 interval '1 month') AS g
      )
      SELECT m.mes,
             coalesce((SELECT sum(p."valorCentavos") FROM pagamentos p
                        WHERE p."tenantId" = ${ctx.tenantId}
                          AND p."estornadoEm" IS NULL
                          AND (p."recebidoEm" AT TIME ZONE ${FUSO}) >= m.ini
                          AND (p."recebidoEm" AT TIME ZONE ${FUSO}) <  m.fim), 0)
           + coalesce((SELECT sum(l."valorPagoCentavos") FROM lancamentos l
                        WHERE l."tenantId" = ${ctx.tenantId} AND l.tipo = 'RECEBER'
                          AND (l."pagoEm" AT TIME ZONE ${FUSO}) >= m.ini
                          AND (l."pagoEm" AT TIME ZONE ${FUSO}) <  m.fim), 0) AS entrou,
             coalesce((SELECT sum(l."valorPagoCentavos") FROM lancamentos l
                        WHERE l."tenantId" = ${ctx.tenantId} AND l.tipo = 'PAGAR'
                          AND (l."pagoEm" AT TIME ZONE ${FUSO}) >= m.ini
                          AND (l."pagoEm" AT TIME ZONE ${FUSO}) <  m.fim), 0) AS saiu
        FROM meses m
       ORDER BY m.mes
    `
    return linhas.map((l) => ({
      mes: l.mes,
      entrouCentavos: Number(l.entrou),
      saiuCentavos: Number(l.saiu),
    }))
  })
}

export type FatiaCategoria = { categoria: string; totalCentavos: number; quantidade: number }

/**
 * Para onde foi (ou de onde veio) o dinheiro do mês, por categoria.
 *
 * Sem categoria a linha vira "Sem categoria" e continua na conta. Descartá-la
 * faria a soma das fatias não bater com o total do topo, e nada corrói mais
 * rápido a confiança num relatório do que duas somas do mesmo mês discordando
 * na mesma tela.
 */
export async function porCategoria(
  ctx: ContextoAcesso,
  tipo: 'PAGAR' | 'RECEBER',
  mes: string,
): Promise<FatiaCategoria[]> {
  const { inicio, fim } = janelaDoMes(mes)
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ categoria: string; total: bigint; n: bigint }>>`
      SELECT coalesce(nullif(categoria, ''), 'Sem categoria') AS categoria,
             sum("valorPagoCentavos") AS total,
             count(*) AS n
        FROM lancamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND tipo = ${tipo}::"TipoLancamento"
         AND "pagoEm" >= ${inicio} AND "pagoEm" < ${fim}
       GROUP BY 1
       HAVING sum("valorPagoCentavos") > 0
       ORDER BY total DESC
       LIMIT 12
    `
    return linhas.map((l) => ({
      categoria: l.categoria,
      totalCentavos: Number(l.total),
      quantidade: Number(l.n),
    }))
  })
}

/** As formas de pagamento do mês, juntando faturas de serviço e avulsos. */
export async function formasDoMes(ctx: ContextoAcesso, mes: string) {
  const { inicio, fim } = janelaDoMes(mes)
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ forma: string; total: bigint; n: bigint }>>`
      SELECT forma, sum(total) AS total, sum(n) AS n FROM (
        SELECT forma::text AS forma, sum("valorCentavos") AS total, count(*) AS n
          FROM pagamentos
         WHERE "tenantId" = ${ctx.tenantId} AND "estornadoEm" IS NULL
           AND "recebidoEm" >= ${inicio} AND "recebidoEm" < ${fim}
         GROUP BY 1
        UNION ALL
        SELECT forma::text AS forma, sum("valorPagoCentavos") AS total, count(*) AS n
          FROM lancamentos
         WHERE "tenantId" = ${ctx.tenantId} AND tipo = 'RECEBER' AND forma IS NOT NULL
           AND "pagoEm" >= ${inicio} AND "pagoEm" < ${fim}
         GROUP BY 1
      ) u
      GROUP BY forma
      ORDER BY total DESC
    `
    return linhas.map((l) => ({
      forma: l.forma,
      totalCentavos: Number(l.total),
      quantidade: Number(l.n),
    }))
  })
}

/**
 * Os maiores devedores — quem está segurando o caixa.
 *
 * Junta as duas dívidas do mesmo cliente: a fatura do conserto e o lançamento
 * avulso. Vê-las separadas em duas telas é o que faz alguém cobrar R$ 400 de
 * quem já deve R$ 6.000.
 */
export async function maioresDevedores(ctx: ContextoAcesso, quantos = 8) {
  const n = Math.max(1, Math.min(50, Math.trunc(quantos)))
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<
      Array<{ id: string; nome: string; total: bigint; vencido: bigint }>
    >`
      SELECT c.id, c.nome,
             sum(d.aberto) AS total,
             sum(d.aberto) FILTER (WHERE d.venc < now()) AS vencido
        FROM (
          SELECT "clienteId" AS cid,
                 ("valorTotalCentavos" + "multaCentavos" + "jurosCentavos" - "valorPagoCentavos")
                   AS aberto,
                 vencimento AS venc
            FROM faturas
           WHERE "tenantId" = ${ctx.tenantId} AND status IN ('ABERTA', 'PARCIAL')
          UNION ALL
          SELECT "clienteId" AS cid, "valorCentavos" AS aberto, vencimento AS venc
            FROM lancamentos
           WHERE "tenantId" = ${ctx.tenantId} AND tipo = 'RECEBER' AND "pagoEm" IS NULL
        ) d
        JOIN clientes c ON c.id = d.cid
       WHERE d.aberto > 0
       GROUP BY c.id, c.nome
       ORDER BY total DESC
       LIMIT ${n}
    `
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      totalCentavos: Number(l.total),
      vencidoCentavos: Number(l.vencido ?? 0),
    }))
  })
}
