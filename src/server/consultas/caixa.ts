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
        // A tela precisa dos dois para decidir o que mostrar na linha: a
        // etiqueta "Conferir" quando ainda não passou pela aprovação, e o aviso
        // da janela de edição, que diz quem liberou antes de a alteração
        // derrubar a liberação.
        aprovadoEm: true,
        aprovadoPorNome: true,
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

/**
 * A FILA DE APROVAÇÃO — o que espera o segundo par de olhos.
 *
 * =============================================================================
 * SEM RECORTE DE MÊS, E ISSO É DE PROPÓSITO
 * =============================================================================
 * Todas as outras consultas desta tela são do mês, porque a pergunta delas é
 * "como está agosto". Esta pergunta é outra: "o que está parado esperando
 * alguém". Uma conta lançada em julho e nunca aprovada continua parada em
 * agosto — e some da tela se a consulta filtrar por mês.
 *
 * O tipo de erro que isso evitaria descobrir: uma conta a pagar que ninguém
 * aprovou, vencendo, invisível porque o mês na barra já virou.
 */
export async function esperandoAprovacao(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.lancamento.findMany({
      where: { aprovadoEm: null },
      orderBy: [{ vencimento: 'asc' }],
      select: {
        id: true, tipo: true, descricao: true, categoria: true, contraparte: true,
        valorCentavos: true, vencimento: true, autorNome: true, criadoEm: true,
        cliente: { select: { nome: true } },
      },
    }),
  )
}

/** Quantas esperam — o número no rótulo da aba. */
export async function quantasEsperandoAprovacao(ctx: ContextoAcesso): Promise<number> {
  return comEscopo(ctx, (tx) => tx.lancamento.count({ where: { aprovadoEm: null } }))
}

/**
 * A FILA DA BAIXA — aprovado, ainda não pago.
 *
 * Também sem recorte de mês, e pelo mesmo motivo: conta vencida em julho que
 * ninguém pagou continua sendo trabalho de hoje. Ela vem primeiro na ordem,
 * porque atrasada é a que custa juro.
 */
export async function prontasParaBaixa(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.lancamento.findMany({
      where: { pagoEm: null, aprovadoEm: { not: null } },
      orderBy: [{ vencimento: 'asc' }],
      // Os MESMOS campos que a aba de contas traz, porque a fila da baixa usa o
      // MESMO formulário. Trazer menos obrigaria a inventar um formulário
      // parecido aqui — e duas telas que dão baixa de jeitos ligeiramente
      // diferentes é o começo de um problema chato, num lugar onde o erro é
      // dinheiro.
      select: {
        id: true, tipo: true, descricao: true, categoria: true, contraparte: true,
        valorCentavos: true, valorPagoCentavos: true, vencimento: true, pagoEm: true,
        forma: true, grupo: true, parcela: true, parcelas: true, recorrenciaId: true,
        observacoes: true, aprovadoPorNome: true, aprovadoEm: true, clienteId: true,
        cliente: { select: { nome: true } },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Os quatro números que fecham a conta
// ---------------------------------------------------------------------------

export type ResumoDoMes = {
  /** Pago + pendente + atrasado. Os três, sempre — a igualdade é garantida. */
  totalCentavos: number
  pagoCentavos: number
  pendenteCentavos: number
  /** TODO o vencido em aberto, de qualquer mês. Ver o comentário abaixo. */
  atrasadoCentavos: number
  /**
   * O que de fato entrou/saiu nessas contas pagas — pode diferir de
   * `pagoCentavos` por desconto, juro ou pagamento a menor.
   */
  liquidadoCentavos: number
  quantas: number
  quantasPagas: number
  quantasPendentes: number
  quantasAtrasadas: number
  /** Quanto do atrasado veio de meses ANTERIORES — para a nota do cartão. */
  arrastadoCentavos: number
  quantasArrastadas: number
}

/**
 * OS QUATRO CARTÕES — e por que eles TÊM de fechar.
 *
 * =============================================================================
 * TOTAL = PAGO + PENDENTE + ATRASADO
 * =============================================================================
 * Essa igualdade não é enfeite: é o que faz os quatro números serem uma leitura
 * e não quatro fatos soltos. Quem bate o olho consegue conferir a conta de
 * cabeça, e no dia em que ela não fechar a pessoa vai perceber — que é
 * exatamente o comportamento que se quer de uma tela de dinheiro.
 *
 * Por isso os quatro usam `valorCentavos`, o PREVISTO, inclusive nas pagas. Se
 * "pago" usasse `valorPagoCentavos`, um desconto de R$ 30 faria a soma das três
 * partes dar menos que o total, e a tela passaria a ter um buraco que ninguém
 * consegue explicar sem abrir o banco. O que efetivamente passou pelo caixa vem
 * em `liquidadoCentavos`, e a tela mostra a diferença quando ela existe — que é
 * informação, e não um furo.
 *
 * =============================================================================
 * ISTO É COMPETÊNCIA, NÃO CAIXA — E A TELA PRECISA DIZER ISSO
 * =============================================================================
 * O recorte é o VENCIMENTO. Uma conta de agosto paga em setembro conta no mês
 * de AGOSTO aqui, e no caixa de SETEMBRO lá em cima ("saiu no mês"). Os dois
 * números estão certos e respondem perguntas diferentes: este diz o que o mês
 * DEVIA, aquele diz o que a conta bancária viu.
 *
 * Confundir os dois é o erro clássico de tela de financeiro, então a tela
 * escreve a distinção em vez de deixar quem lê descobrir sozinho.
 *
 * =============================================================================
 * ATRASADO NÃO RESPEITA O MÊS — E A PRIMEIRA VERSÃO DISTO ESTAVA ERRADA
 * =============================================================================
 * Eu prendi o atrasado à janela do mês, para os quatro números fecharem. A tela
 * denunciou na primeira olhada: o cartão dizia **R$ 0,00 de atrasado** e a
 * lista, dois centímetros abaixo, mostrava duas contas marcadas ATRASADO. Uma
 * conta que venceu em julho e ninguém pagou está atrasada HOJE, não em julho —
 * é o que `panoramaDoMes` já dizia por escrito e o que o filtro "Em aberto" da
 * lista já fazia. O cartão era a única peça da tela discordando das outras.
 *
 * Agora `atrasado` é TODO o vencido em aberto, de qualquer mês, e o total passa
 * a ser definido como a soma dos três. É por isso que a igualdade continua
 * valendo sem mentir: ela não é imposta ao mundo, ela DESCREVE o que está na
 * mão de quem olha — o que este mês já resolveu, o que ele ainda vai encarar, e
 * o que ficou para trás e continua cobrando.
 *
 * `arrastadoCentavos` diz quanto desse atraso não nasceu neste mês. Vai na nota
 * do cartão, porque dívida velha e dívida do mês pedem cobranças diferentes.
 */
export async function resumoDoMes(
  ctx: ContextoAcesso,
  mes: string,
  tipo: 'PAGAR' | 'RECEBER',
): Promise<ResumoDoMes> {
  const { inicio, fim } = janelaDoMes(mes)

  return comEscopo(ctx, async (tx) => {
    // Uma consulta só, com os três recortes em FILTER. Note que PAGO e PENDENTE
    // olham a janela do mês, e ATRASADO ignora a janela de propósito: são
    // condições diferentes sobre a mesma tabela, e separá-las em três idas ao
    // banco só multiplicaria o custo do mesmo trabalho.
    const [r] = await tx.$queryRaw<
      Array<{
        pago: bigint
        liquidado: bigint
        pendente: bigint
        atrasado: bigint
        arrastado: bigint
        npagas: bigint
        npendentes: bigint
        natrasadas: bigint
        narrastadas: bigint
      }>
    >`
      SELECT
        coalesce(sum("valorCentavos") FILTER (
          WHERE "pagoEm" IS NOT NULL
            AND vencimento >= ${inicio} AND vencimento < ${fim}), 0)          AS pago,
        coalesce(sum("valorPagoCentavos") FILTER (
          WHERE "pagoEm" IS NOT NULL
            AND vencimento >= ${inicio} AND vencimento < ${fim}), 0)          AS liquidado,
        coalesce(sum("valorCentavos") FILTER (
          WHERE "pagoEm" IS NULL AND vencimento >= now()
            AND vencimento >= ${inicio} AND vencimento < ${fim}), 0)          AS pendente,

        -- Sem recorte de mês: uma conta de julho que ninguém pagou está
        -- atrasada HOJE. Prendê-la ao mês em que venceu esconderia a dívida
        -- mais velha, que é sempre a pior — e faria o cartão contradizer a
        -- lista logo abaixo, na mesma tela.
        coalesce(sum("valorCentavos") FILTER (
          WHERE "pagoEm" IS NULL AND vencimento < now()), 0)                  AS atrasado,
        coalesce(sum("valorCentavos") FILTER (
          WHERE "pagoEm" IS NULL AND vencimento < ${inicio}), 0)              AS arrastado,

        count(*) FILTER (
          WHERE "pagoEm" IS NOT NULL
            AND vencimento >= ${inicio} AND vencimento < ${fim})              AS npagas,
        count(*) FILTER (
          WHERE "pagoEm" IS NULL AND vencimento >= now()
            AND vencimento >= ${inicio} AND vencimento < ${fim})              AS npendentes,
        count(*) FILTER (WHERE "pagoEm" IS NULL AND vencimento < now())       AS natrasadas,
        count(*) FILTER (WHERE "pagoEm" IS NULL AND vencimento < ${inicio})   AS narrastadas
      FROM lancamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND tipo = ${tipo}::"TipoLancamento"
    `

    const pago = Number(r?.pago ?? 0)
    const pendente = Number(r?.pendente ?? 0)
    const atrasado = Number(r?.atrasado ?? 0)

    return {
      // O total é DEFINIDO como a soma. Ele não é lido do banco por outra
      // conta que pudesse divergir dos três — é a mesma aritmética que a
      // pessoa faz de cabeça olhando os cartões, e por isso não tem como não
      // fechar.
      totalCentavos: pago + pendente + atrasado,
      pagoCentavos: pago,
      pendenteCentavos: pendente,
      atrasadoCentavos: atrasado,
      liquidadoCentavos: Number(r?.liquidado ?? 0),
      quantas:
        Number(r?.npagas ?? 0) + Number(r?.npendentes ?? 0) + Number(r?.natrasadas ?? 0),
      quantasPagas: Number(r?.npagas ?? 0),
      quantasPendentes: Number(r?.npendentes ?? 0),
      quantasAtrasadas: Number(r?.natrasadas ?? 0),
      arrastadoCentavos: Number(r?.arrastado ?? 0),
      quantasArrastadas: Number(r?.narrastadas ?? 0),
    }
  })
}

// ---------------------------------------------------------------------------
// A leitura do mês — o que a tela sabe e não estava dizendo
// ---------------------------------------------------------------------------

export type LeituraDoMes = {
  /** Se TUDO que vence no mês for pago: quanto o mês fecha. */
  projetadoCentavos: number
  receberDoMesCentavos: number
  pagarDoMesCentavos: number
  /** O que vence de hoje até daqui a sete dias, ainda em aberto. */
  receber7Centavos: number
  pagar7Centavos: number
  receber7Quantas: number
  pagar7Quantas: number
  /** O caixa REALIZADO do mês anterior, para a comparação. */
  entrouAnteriorCentavos: number
  saiuAnteriorCentavos: number
}

/**
 * O QUE A TELA SABIA E NÃO DIZIA.
 *
 * =============================================================================
 * "COMO O MÊS FECHA" É UMA PERGUNTA DIFERENTE DE "COMO O MÊS ESTÁ"
 * =============================================================================
 * O painel de cima responde o realizado: entrou, saiu, sobrou. É o extrato, e
 * no dia 3 ele diz quase nada — dois dias de movimento não contam um mês.
 *
 * A pergunta que se faz no dia 3 é outra: *se tudo que vence este mês for pago,
 * eu fecho no azul?* Ela se responde com o previsto, e o sistema tinha todos os
 * números para respondê-la sem nunca ter feito a conta. Fazer essa conta na
 * cabeça, olhando duas abas, é exatamente o tipo de trabalho que a tela existe
 * para poupar — e é onde o erro humano custa caro.
 *
 * O projetado é COMPETÊNCIA pura: receber do mês menos pagar do mês. Não mistura
 * com o realizado, porque somar os dois contaria duas vezes tudo que já foi pago
 * dentro do próprio mês.
 *
 * =============================================================================
 * OS PRÓXIMOS SETE DIAS ATRAVESSAM A VIRADA DO MÊS
 * =============================================================================
 * De propósito. No dia 28, o que aperta o caixa é o aluguel do dia 5 — e ele
 * não está no mês da tela. Uma janela que parasse no dia 31 esconderia
 * justamente a semana que importa, todo fim de mês.
 */
export async function leituraDoMes(ctx: ContextoAcesso, mes: string): Promise<LeituraDoMes> {
  const { inicio, fim } = janelaDoMes(mes)
  const anterior = janelaDoMes(mesVizinho(mes, -1))
  const agora = new Date()
  const daquiA7 = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

  return comEscopo(ctx, async (tx) => {
    const [r] = await tx.$queryRaw<
      Array<{
        recmes: bigint
        pagmes: bigint
        rec7: bigint
        pag7: bigint
        nrec7: bigint
        npag7: bigint
        entant: bigint
        saiant: bigint
      }>
    >`
      SELECT
        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'RECEBER' AND vencimento >= ${inicio} AND vencimento < ${fim}), 0) AS recmes,
        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'PAGAR'   AND vencimento >= ${inicio} AND vencimento < ${fim}), 0) AS pagmes,

        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'RECEBER' AND "pagoEm" IS NULL
            AND vencimento >= ${agora} AND vencimento < ${daquiA7}), 0)                   AS rec7,
        coalesce(sum("valorCentavos") FILTER (
          WHERE tipo = 'PAGAR'   AND "pagoEm" IS NULL
            AND vencimento >= ${agora} AND vencimento < ${daquiA7}), 0)                   AS pag7,
        count(*) FILTER (
          WHERE tipo = 'RECEBER' AND "pagoEm" IS NULL
            AND vencimento >= ${agora} AND vencimento < ${daquiA7})                       AS nrec7,
        count(*) FILTER (
          WHERE tipo = 'PAGAR'   AND "pagoEm" IS NULL
            AND vencimento >= ${agora} AND vencimento < ${daquiA7})                       AS npag7,

        coalesce(sum("valorPagoCentavos") FILTER (
          WHERE tipo = 'RECEBER'
            AND "pagoEm" >= ${anterior.inicio} AND "pagoEm" < ${anterior.fim}), 0)        AS entant,
        coalesce(sum("valorPagoCentavos") FILTER (
          WHERE tipo = 'PAGAR'
            AND "pagoEm" >= ${anterior.inicio} AND "pagoEm" < ${anterior.fim}), 0)        AS saiant
      FROM lancamentos WHERE "tenantId" = ${ctx.tenantId}
    `

    // A fatura de serviço também é dinheiro que entrou no mês anterior. Deixá-la
    // de fora faria a comparação dizer "setembro melhor que agosto" só porque
    // agosto foi contado pela metade.
    const [servAnterior] = await tx.$queryRaw<Array<{ total: bigint }>>`
      SELECT coalesce(sum("valorCentavos"), 0) AS total
        FROM pagamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND "estornadoEm" IS NULL
         AND "recebidoEm" >= ${anterior.inicio} AND "recebidoEm" < ${anterior.fim}
    `

    const receber = Number(r?.recmes ?? 0)
    const pagar = Number(r?.pagmes ?? 0)
    return {
      projetadoCentavos: receber - pagar,
      receberDoMesCentavos: receber,
      pagarDoMesCentavos: pagar,
      receber7Centavos: Number(r?.rec7 ?? 0),
      pagar7Centavos: Number(r?.pag7 ?? 0),
      receber7Quantas: Number(r?.nrec7 ?? 0),
      pagar7Quantas: Number(r?.npag7 ?? 0),
      entrouAnteriorCentavos: Number(r?.entant ?? 0) + Number(servAnterior?.total ?? 0),
      saiuAnteriorCentavos: Number(r?.saiant ?? 0),
    }
  })
}

export type FaixaDeIdade = { faixa: string; totalCentavos: number; quantidade: number }

/**
 * A IDADE DA DÍVIDA — há quanto tempo cada real está em aberto.
 *
 * "R$ 18 mil a receber" e "R$ 18 mil a receber, sendo R$ 11 mil parados há mais
 * de noventa dias" são duas empresas diferentes. O segundo número muda o que se
 * faz na segunda-feira: dívida de noventa dias não se cobra por WhatsApp, e a
 * de sete dias não se manda para protesto.
 *
 * Junta as duas dívidas do mesmo tipo — fatura de serviço e lançamento avulso —
 * porque para quem cobra elas são a mesma coisa: dinheiro do cliente que não
 * chegou. Ver `maioresDevedores`, que faz a mesma junção por outro eixo.
 */
export async function idadeDaDivida(ctx: ContextoAcesso): Promise<FaixaDeIdade[]> {
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ faixa: string; ordem: number; total: bigint; n: bigint }>>`
      SELECT faixa, ordem, sum(aberto) AS total, count(*) AS n FROM (
        SELECT
          CASE
            WHEN venc >= now()                             THEN 'A vencer'
            WHEN venc >= now() - interval '30 days'        THEN 'Até 30 dias'
            WHEN venc >= now() - interval '60 days'        THEN 'De 31 a 60 dias'
            WHEN venc >= now() - interval '90 days'        THEN 'De 61 a 90 dias'
            ELSE                                                'Mais de 90 dias'
          END AS faixa,
          CASE
            WHEN venc >= now()                             THEN 0
            WHEN venc >= now() - interval '30 days'        THEN 1
            WHEN venc >= now() - interval '60 days'        THEN 2
            WHEN venc >= now() - interval '90 days'        THEN 3
            ELSE                                                4
          END AS ordem,
          aberto
        FROM (
          SELECT ("valorTotalCentavos" + "multaCentavos" + "jurosCentavos" - "valorPagoCentavos")
                   AS aberto,
                 vencimento AS venc
            FROM faturas
           WHERE "tenantId" = ${ctx.tenantId} AND status IN ('ABERTA', 'PARCIAL')
             AND vencimento IS NOT NULL
          UNION ALL
          SELECT "valorCentavos" AS aberto, vencimento AS venc
            FROM lancamentos
           WHERE "tenantId" = ${ctx.tenantId} AND tipo = 'RECEBER' AND "pagoEm" IS NULL
        ) d
        WHERE d.aberto > 0
      ) f
      GROUP BY faixa, ordem
      ORDER BY ordem
    `
    return linhas.map((l) => ({
      faixa: l.faixa,
      totalCentavos: Number(l.total),
      quantidade: Number(l.n),
    }))
  })
}

// ---------------------------------------------------------------------------
// O histórico do dinheiro
// ---------------------------------------------------------------------------

/**
 * A TRILHA, RECORTADA NO DINHEIRO.
 *
 * A Trilha inteira existe em `/painel/quem-fez-o-que` e mostra tudo — entrada
 * em empresa, troca de senha, etapa de ordem. Quem está no Financeiro tentando
 * descobrir quem baixou uma conta de oito mil não quer navegar por aquilo: quer
 * as linhas de dinheiro, aqui, sem trocar de tela.
 *
 * O filtro é por PREFIXO da ação (`caixa.` e `financeiro.`), e não por uma
 * lista de ações escritas à mão. Ação nova de dinheiro aparece aqui no dia em
 * que é escrita — o contrário disso é um histórico com buracos, e buraco em
 * histórico de dinheiro é o mesmo que não ter histórico.
 */
export async function historicoDoCaixa(ctx: ContextoAcesso, quantas = 80) {
  const n = Math.max(1, Math.min(200, Math.trunc(quantas)))
  return comEscopo(ctx, (tx) =>
    tx.auditLog.findMany({
      where: { OR: [{ acao: { startsWith: 'caixa.' } }, { acao: { startsWith: 'financeiro.' } }] },
      orderBy: { criadoEm: 'desc' },
      take: n,
      select: {
        id: true,
        acao: true,
        entidade: true,
        entidadeId: true,
        detalhes: true,
        userNome: true,
        userPapel: true,
        negado: true,
        criadoEm: true,
      },
    }),
  )
}
