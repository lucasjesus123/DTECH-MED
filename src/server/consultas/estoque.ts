import { comEscopo } from '@/lib/db'
import type { ContextoAcesso } from '@/lib/db'

/**
 * A INTELIGÊNCIA DO ESTOQUE — as perguntas que a tela não respondia.
 *
 * =============================================================================
 * O QUE A TELA ANTIGA MOSTRAVA, E POR QUE NÃO BASTAVA
 * =============================================================================
 * Quatro números: itens cadastrados, abaixo do mínimo, reservado, e valor em
 * prateleira. Todos verdadeiros e nenhum acionável. "12 itens abaixo do mínimo"
 * não diz o que comprar primeiro, quanto tempo ainda dá, nem quanto dinheiro
 * está parado numa peça que ninguém usa desde março.
 *
 * As três consultas abaixo respondem, nesta ordem, as três perguntas que um
 * estoque de assistência técnica realmente faz:
 *
 *   1. `giroDoEstoque`  — o que sai, com que velocidade, e para quantos dias
 *                         ainda dá o que está na prateleira.
 *   2. `dinheiroParado`  — o que NÃO sai. É o custo invisível: peça comprada
 *                         que virou prateleira.
 *   3. `ferramentasEmCampo` — com quem está cada ferramenta, e há quantos dias.
 *
 * =============================================================================
 * POR QUE O GIRO É CALCULADO NO BANCO, EM SQL
 * =============================================================================
 * Ele soma consumo por item ao longo de meses. Trazer o livro-razão inteiro
 * para o Node e somar em memória funciona com quatrocentos movimentos e para de
 * funcionar com quarenta mil — e o dia em que parar vai ser o dia em que a casa
 * finalmente estiver usando o sistema de verdade.
 *
 * Todo valor entra como PARÂMETRO. Nada é concatenado.
 */

/** Quantos dias a janela de giro olha para trás. Três meses de consumo. */
const JANELA_DIAS = 90

export type LinhaDeGiro = {
  id: string
  nome: string
  sku: string
  unidade: string
  saldo: number
  minimo: number
  /** Quanto saiu na janela (consumo em O.S. + perdas). */
  consumo: number
  /** Consumo médio por dia. Zero quando nada saiu. */
  porDia: number
  /**
   * Para quantos dias ainda dá o que está em prateleira.
   *
   * `null` quando o item não teve saída nenhuma na janela: dividir por zero
   * daria "infinito dias", que a tela leria como "está sobrando" — e um item
   * parado não está sobrando, está encalhado. São coisas diferentes e a
   * segunda consulta cuida dela.
   */
  cobertura: number | null
  custoMedioCentavos: number
}

export async function giroDoEstoque(ctx: ContextoAcesso): Promise<LinhaDeGiro[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400_000)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<
      Array<{
        id: string
        nome: string
        sku: string
        unidade: string
        saldo: string
        minimo: string
        consumo: string
        custo: number
      }>
    >`
      SELECT p.id,
             p.nome,
             p.sku,
             p.unidade,
             p.saldo                          AS saldo,
             p."estoqueMinimo"                AS minimo,
             p."custoMedioCentavos"           AS custo,
             -- SAIDA é consumo em O.S.; PERDA é quebra e extravio. As duas
             -- tiram a peça da prateleira, e as duas contam para saber quanto
             -- tempo o que sobrou ainda aguenta. Empréstimo NÃO conta: a
             -- ferramenta volta.
             COALESCE(SUM(m.quantidade) FILTER (
               WHERE m.tipo IN ('SAIDA', 'PERDA') AND m."criadoEm" >= ${desde}
             ), 0)                            AS consumo
        FROM pecas p
        LEFT JOIN movimentos_estoque m ON m."pecaId" = p.id
       WHERE p.ativo = true AND p.tipo <> 'FERRAMENTA'
       GROUP BY p.id
       ORDER BY consumo DESC, p.nome ASC
       LIMIT 200
    `,
  )

  return linhas.map((l) => {
    const consumo = Number(l.consumo)
    const saldo = Number(l.saldo)
    const porDia = consumo / JANELA_DIAS
    return {
      id: l.id,
      nome: l.nome,
      sku: l.sku,
      unidade: l.unidade,
      saldo,
      minimo: Number(l.minimo),
      consumo,
      porDia,
      cobertura: porDia > 0 ? Math.floor(saldo / porDia) : null,
      custoMedioCentavos: l.custo,
    }
  })
}

export type ItemParado = {
  id: string
  nome: string
  sku: string
  saldo: number
  unidade: string
  custoMedioCentavos: number
  /** Quanto dinheiro está parado nesta linha. */
  paradoCentavos: number
  /** Última saída. `null` quando nunca saiu desde que entrou. */
  ultimaSaida: Date | null
}

/**
 * O DINHEIRO PARADO — o custo que nenhuma tela mostrava.
 *
 * Peça comprada que não sai não é estoque, é prejuízo em prateleira. Ela some
 * de qualquer indicador: não está abaixo do mínimo (o saldo está cheio), não
 * aparece no giro (não gira), e engorda o "valor em prateleira" fazendo o
 * número parecer bom.
 *
 * Ordenada por DINHEIRO, e não por tempo: seis meses parado num anel de vedação
 * de oito reais não é problema; seis meses parados numa placa de mil e duzentos
 * são. Quem olha esta lista quer saber onde está o dinheiro.
 */
export async function dinheiroParado(ctx: ContextoAcesso, mesesSemSair = 3): Promise<ItemParado[]> {
  const limite = new Date()
  limite.setMonth(limite.getMonth() - mesesSemSair)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<
      Array<{
        id: string
        nome: string
        sku: string
        unidade: string
        saldo: string
        custo: number
        ultima: Date | null
      }>
    >`
      SELECT p.id, p.nome, p.sku, p.unidade, p.saldo, p."custoMedioCentavos" AS custo,
             MAX(m."criadoEm") FILTER (WHERE m.tipo IN ('SAIDA', 'PERDA')) AS ultima
        FROM pecas p
        LEFT JOIN movimentos_estoque m ON m."pecaId" = p.id
       WHERE p.ativo = true AND p.saldo > 0 AND p.tipo <> 'FERRAMENTA'
       GROUP BY p.id
      HAVING MAX(m."criadoEm") FILTER (WHERE m.tipo IN ('SAIDA', 'PERDA')) IS NULL
          OR MAX(m."criadoEm") FILTER (WHERE m.tipo IN ('SAIDA', 'PERDA')) < ${limite}
       ORDER BY p.saldo * p."custoMedioCentavos" DESC
       LIMIT 20
    `,
  )

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    sku: l.sku,
    unidade: l.unidade,
    saldo: Number(l.saldo),
    custoMedioCentavos: l.custo,
    paradoCentavos: Math.round(Number(l.saldo) * l.custo),
    ultimaSaida: l.ultima,
  }))
}

export type FerramentaEmCampo = {
  id: string
  pecaId: string
  nome: string
  sku: string
  patrimonio: string | null
  quantidade: number
  responsavelNome: string
  responsavelId: string | null
  ordemId: string | null
  ordemNumero: number | null
  retiradoEm: Date
  previstoPara: Date | null
  /** Há quantos dias está fora. É o número que denuncia a esquecida. */
  diasFora: number
  /** Passou da data prometida de volta. */
  atrasada: boolean
}

/**
 * COM QUEM ESTÁ CADA FERRAMENTA — a pergunta inteira, numa consulta.
 *
 * `devolvidoEm IS NULL` é o filtro todo: uma linha aberta é uma ferramenta na
 * mão de alguém. Reconstruir isso a partir do livro-razão exigiria parear cada
 * saída com a devolução correspondente, e o pareamento não existe — duas
 * unidades do mesmo multímetro podem estar com duas pessoas.
 *
 * A ordem é pela MAIS ANTIGA primeiro. A ferramenta que some é a que está fora
 * há quatro meses e ninguém lembra; ela nunca está no fim de uma lista ordenada
 * por data decrescente, está no começo de uma crescente.
 */
export async function ferramentasEmCampo(ctx: ContextoAcesso): Promise<FerramentaEmCampo[]> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.emprestimoFerramenta.findMany({
      where: { devolvidoEm: null },
      orderBy: { retiradoEm: 'asc' },
      take: 200,
      select: {
        id: true,
        pecaId: true,
        quantidade: true,
        responsavelId: true,
        responsavelNome: true,
        ordemId: true,
        retiradoEm: true,
        previstoPara: true,
        peca: { select: { nome: true, sku: true, patrimonio: true } },
        ordem: { select: { numero: true } },
      },
    }),
  )

  const agora = Date.now()
  return linhas.map((l) => ({
    id: l.id,
    pecaId: l.pecaId,
    nome: l.peca.nome,
    sku: l.peca.sku,
    patrimonio: l.peca.patrimonio,
    quantidade: Number(l.quantidade),
    responsavelNome: l.responsavelNome,
    responsavelId: l.responsavelId,
    ordemId: l.ordemId,
    ordemNumero: l.ordem?.numero ?? null,
    retiradoEm: l.retiradoEm,
    previstoPara: l.previstoPara,
    diasFora: Math.floor((agora - l.retiradoEm.getTime()) / 86400_000),
    atrasada: Boolean(l.previstoPara && l.previstoPara.getTime() < agora),
  }))
}

/**
 * A FICHA DO ITEM — o prontuário que o estoque não tinha.
 *
 * A listagem responde "quanto tem". Ela não responde "por que este saldo é
 * este", que é a pergunta de quem está conferindo uma divergência de
 * inventário. O livro-razão do item, com autor e motivo em cada linha,
 * responde — e é o mesmo princípio da linha do tempo da O.S.: o saldo é a soma
 * dos movimentos, nunca um número digitado.
 */
export async function fichaDoItem(ctx: ContextoAcesso, id: string) {
  return comEscopo(ctx, async (tx) => {
    const peca = await tx.peca.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        nome: true,
        descricao: true,
        tipo: true,
        patrimonio: true,
        categoria: true,
        marca: true,
        aplicacao: true,
        unidade: true,
        custoMedioCentavos: true,
        precoVendaCentavos: true,
        saldo: true,
        saldoReservado: true,
        saldoEmprestado: true,
        estoqueMinimo: true,
        localizacao: true,
        fornecedor: true,
        ativo: true,
        fotoCaminho: true,
        criadoEm: true,
      },
    })
    if (!peca) return null

    const [movimentos, emprestimos] = await Promise.all([
      tx.movimentoEstoque.findMany({
        where: { pecaId: id },
        orderBy: { criadoEm: 'desc' },
        take: 60,
        select: {
          id: true,
          tipo: true,
          quantidade: true,
          saldoAnterior: true,
          saldoPosterior: true,
          custoUnitCentavos: true,
          motivo: true,
          documentoFiscal: true,
          autorNome: true,
          criadoEm: true,
          ordem: { select: { id: true, numero: true } },
        },
      }),
      tx.emprestimoFerramenta.findMany({
        where: { pecaId: id },
        orderBy: { retiradoEm: 'desc' },
        take: 30,
        select: {
          id: true,
          quantidade: true,
          responsavelNome: true,
          retiradoEm: true,
          previstoPara: true,
          devolvidoEm: true,
          condicaoVolta: true,
          ordem: { select: { id: true, numero: true } },
        },
      }),
    ])

    const saldo = Number(peca.saldo)
    const reservado = Number(peca.saldoReservado)
    const emprestado = Number(peca.saldoEmprestado)

    return {
      ...peca,
      saldo,
      reservado,
      emprestado,
      livre: saldo - reservado - emprestado,
      minimo: Number(peca.estoqueMinimo),
      temFoto: Boolean(peca.fotoCaminho),
      movimentos: movimentos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        quantidade: Number(m.quantidade),
        saldoAnterior: Number(m.saldoAnterior),
        saldoPosterior: Number(m.saldoPosterior),
        custoUnitCentavos: m.custoUnitCentavos,
        motivo: m.motivo,
        documentoFiscal: m.documentoFiscal,
        autorNome: m.autorNome,
        criadoEm: m.criadoEm,
        ordemId: m.ordem?.id ?? null,
        ordemNumero: m.ordem?.numero ?? null,
      })),
      emprestimos: emprestimos.map((e) => ({
        id: e.id,
        quantidade: Number(e.quantidade),
        responsavelNome: e.responsavelNome,
        retiradoEm: e.retiradoEm,
        previstoPara: e.previstoPara,
        devolvidoEm: e.devolvidoEm,
        condicaoVolta: e.condicaoVolta,
        ordemId: e.ordem?.id ?? null,
        ordemNumero: e.ordem?.numero ?? null,
      })),
    }
  })
}

export type ResumoDoEstoque = {
  pecas: number
  insumos: number
  ferramentas: number
  criticos: number
  reservado: number
  emCampo: number
  atrasadas: number
  valorCentavos: number
  paradoCentavos: number
}

/**
 * Os números do topo — agora separados por TIPO, porque somá-los mente.
 *
 * "42 itens cadastrados" juntava trinta peças, oito insumos e quatro
 * ferramentas num número que não serve para decidir nada. Peça em falta trava
 * uma O.S.; ferramenta em falta trava o técnico; insumo em falta é uma ida ao
 * mercado. São três problemas distintos e cada um tem dono diferente.
 */
export async function resumoDoEstoque(ctx: ContextoAcesso): Promise<ResumoDoEstoque> {
  const [numeros] = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<
      Array<{
        pecas: bigint
        insumos: bigint
        ferramentas: bigint
        criticos: bigint
        reservado: string
        valor: string
      }>
    >`
      SELECT count(*) FILTER (WHERE tipo = 'PECA')                       AS pecas,
             count(*) FILTER (WHERE tipo = 'INSUMO')                     AS insumos,
             count(*) FILTER (WHERE tipo = 'FERRAMENTA')                 AS ferramentas,
             count(*) FILTER (WHERE saldo <= "estoqueMinimo")            AS criticos,
             COALESCE(SUM("saldoReservado"), 0)                          AS reservado,
             COALESCE(SUM(saldo * "custoMedioCentavos"), 0)              AS valor
        FROM pecas
       WHERE ativo = true
    `,
  )

  const emprestimos = await comEscopo(ctx, (tx) =>
    tx.emprestimoFerramenta.findMany({
      where: { devolvidoEm: null },
      select: { quantidade: true, previstoPara: true },
    }),
  )

  const agora = Date.now()
  const parados = await dinheiroParado(ctx)

  return {
    pecas: Number(numeros?.pecas ?? 0),
    insumos: Number(numeros?.insumos ?? 0),
    ferramentas: Number(numeros?.ferramentas ?? 0),
    criticos: Number(numeros?.criticos ?? 0),
    reservado: Number(numeros?.reservado ?? 0),
    emCampo: emprestimos.reduce((s, e) => s + Number(e.quantidade), 0),
    atrasadas: emprestimos.filter((e) => e.previstoPara && e.previstoPara.getTime() < agora).length,
    valorCentavos: Math.round(Number(numeros?.valor ?? 0)),
    paradoCentavos: parados.reduce((s, p) => s + p.paradoCentavos, 0),
  }
}
