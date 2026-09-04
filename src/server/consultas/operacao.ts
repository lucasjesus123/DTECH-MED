import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * A OPERAÇÃO EM NÚMEROS — o que a esteira não mostra.
 *
 * =============================================================================
 * A ESTEIRA RESPONDE "AGORA". ISTO RESPONDE "COMO ESTÁ INDO"
 * =============================================================================
 * O Dashboard mostra onde cada ordem está parada neste minuto, e é isso que
 * decide o dia. Ele não responde as perguntas de quem precisa decidir o MÊS:
 *
 *   · está entrando mais trabalho do que sai?
 *   · quanto tempo leva, do balcão até a entrega?
 *   · onde a fila engorda?
 *   · o que mais quebra, e de quem?
 *   · o dinheiro está acompanhando o serviço?
 *
 * Nenhuma delas tinha tela. A resposta vivia na cabeça de quem estava lá — e
 * cabeça não compara junho com março.
 *
 * =============================================================================
 * TUDO AGREGADO NO BANCO
 * =============================================================================
 * São contagens sobre o histórico inteiro. Trazer as linhas para somar em
 * JavaScript funciona com trinta ordens e para de funcionar com trinta mil — e
 * o dia em que parar vai ser o dia em que a casa finalmente estiver usando o
 * sistema de verdade.
 *
 * O fuso está escrito com todas as letras em cada `to_char`: agrupar por mês no
 * fuso do processo faz a ordem entregue às 22h de 31 de agosto cair em setembro
 * — e o número do mês passa a discordar da lista que a pessoa vê na tela.
 *
 * Todo valor entra como PARÂMETRO. Nada é concatenado.
 */

const FUSO = 'America/Sao_Paulo'

/** Os últimos N meses, do mais antigo ao mais novo, como 'AAAA-MM'. */
function ultimosMeses(n: number): string[] {
  const hoje = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' })
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (n - 1 - i), 15))
    return fmt.format(d).slice(0, 7)
  })
}

/** O instante em que começa o primeiro dos N meses, no fuso de Lajeado. */
function inicioDaJanela(meses: number): Date {
  return new Date(`${ultimosMeses(meses)[0]}-01T00:00:00-03:00`)
}

// ---------------------------------------------------------------------------
// 1. ENTROU × SAIU, mês a mês
// ---------------------------------------------------------------------------

export type MesDeMovimento = {
  mes: string
  abertas: number
  entregues: number
}

/**
 * A pergunta que sustenta tudo: **está entrando mais do que sai?**
 *
 * Uma oficina que abre doze e entrega oito por mês acumula quatro — e em seis
 * meses tem vinte e quatro aparelhos na prateleira que ninguém consegue
 * explicar. O número aparece devagar e não dói em nenhum mês isolado; só a
 * série lado a lado torna a conta visível.
 *
 * ENTREGUE, e não finalizada: a entrega é quando o aparelho sai daqui, que é o
 * que libera espaço e encerra a promessa feita ao cliente. A finalização é o
 * fecho administrativo e vem depois — às vezes semanas depois, quando alguém
 * confere o pagamento.
 */
export async function movimentoMensal(ctx: ContextoAcesso, meses = 12): Promise<MesDeMovimento[]> {
  const desde = inicioDaJanela(meses)

  const [aberturas, entregas] = await comEscopo(ctx, (tx) =>
    Promise.all([
      tx.$queryRaw<Array<{ mes: string; n: bigint }>>`
        SELECT to_char("abertaEm" AT TIME ZONE ${FUSO}, 'YYYY-MM') AS mes, count(*) AS n
          FROM ordens WHERE "abertaEm" >= ${desde} GROUP BY 1
      `,
      tx.$queryRaw<Array<{ mes: string; n: bigint }>>`
        SELECT to_char("entregueEm" AT TIME ZONE ${FUSO}, 'YYYY-MM') AS mes, count(*) AS n
          FROM ordens WHERE "entregueEm" >= ${desde} GROUP BY 1
      `,
    ]),
  )

  const a = new Map(aberturas.map((l) => [l.mes, Number(l.n)]))
  const e = new Map(entregas.map((l) => [l.mes, Number(l.n)]))
  return ultimosMeses(meses).map((mes) => ({
    mes,
    abertas: a.get(mes) ?? 0,
    entregues: e.get(mes) ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// 2. QUANTO TEMPO LEVA
// ---------------------------------------------------------------------------

export type MesDePrazo = {
  mes: string
  /** Dias entre abrir e entregar. MEDIANA — ver abaixo. */
  dias: number | null
  entregues: number
}

/**
 * MEDIANA, E NÃO MÉDIA — e a diferença aqui é grande.
 *
 * Um aparelho que ficou parado 210 dias esperando peça importada não descreve o
 * serviço da casa; ele descreve um caso. Na média, esse único caso levanta o
 * mês inteiro e faz o número mentir na direção mais desanimadora possível.
 *
 * A mediana responde a pergunta que de fato se faz — "quanto tempo leva um
 * serviço normal aqui?" —, e é a mesma escolha que o funil comercial já fez
 * para o tempo de resposta do cliente.
 */
export async function prazoMensal(ctx: ContextoAcesso, meses = 12): Promise<MesDePrazo[]> {
  const desde = inicioDaJanela(meses)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ mes: string; dias: number | null; n: bigint }>>`
      SELECT to_char("entregueEm" AT TIME ZONE ${FUSO}, 'YYYY-MM') AS mes,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM ("entregueEm" - "abertaEm")) / 86400
             ) AS dias,
             count(*) AS n
        FROM ordens
       WHERE "entregueEm" >= ${desde} AND "entregueEm" IS NOT NULL
       GROUP BY 1
    `,
  )

  const m = new Map(linhas.map((l) => [l.mes, l]))
  return ultimosMeses(meses).map((mes) => {
    const l = m.get(mes)
    return {
      mes,
      dias: l?.dias == null ? null : Math.round(Number(l.dias) * 10) / 10,
      entregues: l ? Number(l.n) : 0,
    }
  })
}

// ---------------------------------------------------------------------------
// 3. ONDE O TRABALHO ESTÁ PARADO, AGORA
// ---------------------------------------------------------------------------

export type FilaDaEtapa = {
  etapa: string
  rotulo: string
  n: number
  /** Há quantos dias está parada a MAIS ANTIGA desta etapa. */
  maisAntiga: number
}

/**
 * A esteira do Dashboard já mostra os degraus. Isto mostra a PROPORÇÃO — e a
 * proporção é outra informação.
 *
 * "Sete em análise" não diz nada sozinho. "Sete em análise, de dezenove
 * abertas" diz que mais de um terço da casa está esperando um diagnóstico, e é
 * isso que decide se o gargalo é a bancada ou a rua.
 *
 * O número de dias da mais antiga vem junto porque uma fila de sete com a mais
 * velha de dois dias é fluxo normal; a mesma fila com uma de quarenta dias tem
 * um aparelho esquecido dentro dela.
 */
export async function ondeEstaParado(ctx: ContextoAcesso): Promise<FilaDaEtapa[]> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ etapa: string; n: bigint; dias: number | null }>>`
      SELECT etapa,
             count(*) AS n,
             MAX(EXTRACT(EPOCH FROM (now() - "atualizadoEm")) / 86400) AS dias
        FROM ordens
       WHERE etapa NOT IN ('FINALIZADO', 'CANCELADO')
       GROUP BY etapa
       ORDER BY n DESC
    `,
  )

  return linhas.map((l) => ({
    etapa: l.etapa,
    rotulo: ROTULO_ETAPA[l.etapa as keyof typeof ROTULO_ETAPA] ?? l.etapa,
    n: Number(l.n),
    maisAntiga: Math.floor(Number(l.dias ?? 0)),
  }))
}

// ---------------------------------------------------------------------------
// 4. O QUE MAIS QUEBRA
// ---------------------------------------------------------------------------

export type LinhaDeAparelho = {
  marca: string
  modelo: string
  n: number
  /** Quantos aparelhos DIFERENTES desse modelo já passaram por aqui. */
  aparelhos: number
}

/**
 * O que a casa mais conserta, por marca e modelo.
 *
 * Serve para duas decisões concretas: que peça vale a pena ter em prateleira, e
 * em que equipamento vale treinar o técnico novo. Hoje as duas são tomadas de
 * memória.
 *
 * A contagem de APARELHOS distintos ao lado das ordens separa duas situações
 * que se parecem no total: dez ordens de dez máquinas diferentes é um modelo
 * popular; dez ordens de duas máquinas é um modelo que volta — e a segunda é a
 * que merece conversa com o cliente sobre trocar.
 */
export async function oQueMaisQuebra(ctx: ContextoAcesso, dias = 365): Promise<LinhaDeAparelho[]> {
  const desde = new Date(Date.now() - dias * 86_400_000)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ marca: string; modelo: string; n: bigint; aparelhos: bigint }>>`
      SELECT e.marca, e.modelo, count(*) AS n, count(DISTINCT e.id) AS aparelhos
        FROM ordens o
        JOIN equipamentos e ON e.id = o."equipamentoId"
       WHERE o."abertaEm" >= ${desde}
       GROUP BY e.marca, e.modelo
       ORDER BY n DESC, e.marca ASC
       LIMIT 8
    `,
  )

  return linhas.map((l) => ({
    marca: l.marca,
    modelo: l.modelo,
    n: Number(l.n),
    aparelhos: Number(l.aparelhos),
  }))
}

// ---------------------------------------------------------------------------
// 5. QUEM TRAZ O TRABALHO
// ---------------------------------------------------------------------------

export type LinhaDeCliente = {
  id: string
  nome: string
  ordens: number
  /** Só para quem pode ver dinheiro. Zero para os demais. */
  faturadoCentavos: number
}

/**
 * A carteira ordenada pelo que ela move.
 *
 * Uma assistência costuma descobrir tarde que metade do faturamento vem de três
 * clientes — e é uma informação que muda o atendimento, o prazo e a conversa
 * sobre contrato de preventiva.
 *
 * O DINHEIRO SÓ VAI PARA QUEM PODE VER DINHEIRO. O corte é feito na consulta e
 * não na tela: filtrar só na renderização mandaria os valores pelo fio até o
 * navegador de quem não deve vê-los, onde qualquer um lê no inspetor. É a mesma
 * regra do Calendário.
 */
export async function quemTrazTrabalho(
  ctx: ContextoAcesso,
  opcoes: { comDinheiro: boolean; dias?: number },
): Promise<LinhaDeCliente[]> {
  const desde = new Date(Date.now() - (opcoes.dias ?? 365) * 86_400_000)
  const dinheiro = opcoes.comDinheiro

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ id: string; nome: string; ordens: bigint; faturado: string }>>`
      SELECT c.id,
             c.nome,
             count(DISTINCT o.id) AS ordens,
             CASE WHEN ${dinheiro}
                  THEN COALESCE(SUM(f."valorTotalCentavos"), 0)
                  ELSE 0 END AS faturado
        FROM ordens o
        JOIN clientes c ON c.id = o."clienteId"
        LEFT JOIN faturas f ON f."ordemId" = o.id
       WHERE o."abertaEm" >= ${desde}
       GROUP BY c.id, c.nome
       ORDER BY ordens DESC, c.nome ASC
       LIMIT 8
    `,
  )

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    ordens: Number(l.ordens),
    faturadoCentavos: Math.round(Number(l.faturado)),
  }))
}

// ---------------------------------------------------------------------------
// 6. O DINHEIRO, MÊS A MÊS
// ---------------------------------------------------------------------------

export type MesDeDinheiro = {
  mes: string
  faturadoCentavos: number
  recebidoCentavos: number
}

/**
 * Faturado × recebido, lado a lado.
 *
 * São coisas diferentes e a diferença entre elas é o buraco do caixa: faturar
 * trinta mil e receber dezoito significa doze mil na rua. O gráfico do
 * Financeiro mostra o que entrou e o que saiu do CAIXA; este mostra o que foi
 * VENDIDO contra o que foi pago — a outra metade da mesma história.
 *
 * O pagamento estornado não conta: ele existe na tabela para o histórico ficar
 * honesto, e somá-lo faria o mês parecer melhor do que foi.
 */
export async function dinheiroMensal(ctx: ContextoAcesso, meses = 12): Promise<MesDeDinheiro[]> {
  const desde = inicioDaJanela(meses)

  const [faturado, recebido] = await comEscopo(ctx, (tx) =>
    Promise.all([
      tx.$queryRaw<Array<{ mes: string; v: string }>>`
        SELECT to_char("emitidaEm" AT TIME ZONE ${FUSO}, 'YYYY-MM') AS mes,
               COALESCE(SUM("valorTotalCentavos"), 0) AS v
          FROM faturas WHERE "emitidaEm" >= ${desde} GROUP BY 1
      `,
      tx.$queryRaw<Array<{ mes: string; v: string }>>`
        SELECT to_char("recebidoEm" AT TIME ZONE ${FUSO}, 'YYYY-MM') AS mes,
               COALESCE(SUM("valorCentavos"), 0) AS v
          FROM pagamentos
         WHERE "recebidoEm" >= ${desde} AND "estornadoEm" IS NULL
         GROUP BY 1
      `,
    ]),
  )

  const f = new Map(faturado.map((l) => [l.mes, Math.round(Number(l.v))]))
  const r = new Map(recebido.map((l) => [l.mes, Math.round(Number(l.v))]))
  return ultimosMeses(meses).map((mes) => ({
    mes,
    faturadoCentavos: f.get(mes) ?? 0,
    recebidoCentavos: r.get(mes) ?? 0,
  }))
}
