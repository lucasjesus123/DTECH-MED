/**
 * Dinheiro.
 *
 * Regra única: valor monetário vive como inteiro de centavos. Ponto flutuante
 * não representa 0,10 exatamente, e somar reais em `float` deixa resíduo que
 * reaparece como "faltou 1 centavo" no fechamento do mês. Um centavo errado
 * destrói a confiança no sistema inteiro, porque a pessoa passa a conferir
 * tudo na mão — e aí o sistema não serviu para nada.
 *
 * Este arquivo é puro de propósito: sem banco, sem rede, sem data. É a parte
 * onde teste é barato e paga o resto.
 */

/** Tolerância de arredondamento na comparação de quitação: 1 centavo. */
const TOLERANCIA = 1

export function aCentavos(reais: number): number {
  if (!Number.isFinite(reais)) throw new Error('Valor não numérico')
  // Arredonda no último passo, e só uma vez.
  return Math.round(reais * 100)
}

export function aReais(centavos: number): number {
  return centavos / 100
}

/**
 * Lê um valor como um brasileiro digita. Devolve `null` se não for número.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO CONSERTA
 * ---------------------------------------------------------------------------
 * `Number('842,37')` é `NaN`. E `842,37` é exatamente o que alguém digita num
 * campo de dinheiro no Brasil — o teclado numérico do celular oferece vírgula,
 * a calculadora mostra vírgula, o boleto vem com vírgula.
 *
 * O lançamento era recusado com "o valor precisa ser maior que zero" numa
 * quantia que a pessoa acabara de escrever. Mensagem verdadeira do ponto de
 * vista do código e completamente inútil de quem estava olhando: ela vê 842,37
 * na tela e o sistema diz que não é maior que zero.
 *
 * ---------------------------------------------------------------------------
 * COMO O PONTO É DESAMBIGUADO
 * ---------------------------------------------------------------------------
 * `1.200` é mil e duzentos para um brasileiro e é um vírgula dois para o
 * `Number`. Adivinhar errado aqui multiplica ou divide a conta por mil.
 *
 * A regra é a que a própria escrita já carrega: **se existe vírgula, ela é o
 * separador decimal e todo ponto é milhar.** Sem vírgula, o ponto é decimal —
 * que é como o próprio sistema devolve valores nos campos preenchidos.
 */
export function lerValorBR(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, '')
  if (!limpo) return null

  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo

  // Recusa "12.34.56", "abc" e "1e9" — notação científica num campo de dinheiro
  // é sempre engano de digitação, nunca intenção.
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

export function formatarBRL(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

/**
 * 'R$ 18,4 mil' — dinheiro curto, para onde a caixa é estreita.
 *
 * Escala de eixo de gráfico, meta de degrau da esteira, selo dentro de cartão:
 * lugares onde `R$ 18.470,00` não cabe, e onde os centavos não mudam decisão
 * nenhuma. O valor cheio continua sendo o do `formatarBRL`, e é ele que aparece
 * onde alguém vai conferir número.
 *
 * ISTO VIVIA DUPLICADO, E AS DUAS CÓPIAS JÁ TINHAM DIVERGIDO — uma devolvia
 * `R$ 12,4 mil` e a outra `12,4 mil`. É exatamente o que o comentário do
 * `calcularTotal`, logo abaixo, avisa que acontece quando uma fórmula mora em
 * dois lugares. Esta é a de `relatorios.tsx`, promovida sem alterar um
 * caractere. A de `operacao.tsx` FICA onde está e não foi unificada: ela
 * formata rótulo de eixo onde a moeda já está dita no título, e omitir o `R$`
 * ali é escolha, não desleixo — juntar as duas mudaria aquele gráfico.
 */
export function formatarBRLCurto(centavos: number): string {
  const reais = centavos / 100
  if (reais === 0) return 'R$ 0'
  if (reais >= 1_000_000)
    return `R$ ${(reais / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (reais >= 1000)
    return `R$ ${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

/**
 * Total do orçamento. Fonte única da fórmula — se ela viver em dois lugares,
 * um dos dois vai divergir numa alteração futura.
 *
 * Clamp em zero: total negativo é sempre defeito, nunca crédito ao cliente.
 */
export function calcularTotal(entrada: {
  subtotalPecas: number
  subtotalServicos: number
  desconto?: number
  acrescimo?: number
}): number {
  const bruto =
    entrada.subtotalPecas +
    entrada.subtotalServicos -
    (entrada.desconto ?? 0) +
    (entrada.acrescimo ?? 0)
  return Math.max(0, bruto)
}

/**
 * Divide um total em N parcelas sem perder nem criar centavo.
 *
 * `total / n` arredondado N vezes some com dinheiro: 1000,00 em 3 vezes daria
 * 3 × 333,33 = 999,99. A convenção aqui é a última parcela absorver o resto,
 * garantindo que a soma bata exatamente com o total.
 */
export function dividirParcelas(totalCentavos: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('Número de parcelas inválido')
  if (!Number.isInteger(totalCentavos)) throw new Error('Total precisa estar em centavos inteiros')

  const base = Math.floor(totalCentavos / n)
  const parcelas = Array<number>(n).fill(base)
  parcelas[n - 1] = totalCentavos - base * (n - 1)
  return parcelas
}

export type Recebimento = { valorCentavos: number }

/**
 * Aplica uma baixa sobre a fatura.
 *
 * `pagoAtual` precisa vir de uma leitura feita DENTRO da transação da baixa,
 * nunca do valor que estava na tela. Dois operadores com a mesma fatura aberta
 * — ou a mesma pessoa em duas abas — fariam o segundo salvamento sobrescrever
 * o primeiro, e um pagamento sumiria do caixa sem deixar rastro.
 */
export function aplicarBaixa(entrada: {
  valorTotalCentavos: number
  /** Lido do banco agora, dentro da transação. */
  pagoAtualCentavos: number
  novos: Recebimento[]
  multaCentavos?: number
  jurosCentavos?: number
}): { pagoCentavos: number; abertoCentavos: number; quitada: boolean } {
  const soma = entrada.novos.reduce((acc, r) => acc + r.valorCentavos, 0)
  const pago = entrada.pagoAtualCentavos + soma

  const devido =
    entrada.valorTotalCentavos + (entrada.multaCentavos ?? 0) + (entrada.jurosCentavos ?? 0)

  const aberto = Math.max(0, devido - pago)
  // A tolerância evita a fatura que fica eternamente com um centavo em aberto
  // por resíduo de arredondamento em algum ponto anterior.
  const quitada = pago + TOLERANCIA >= devido

  return { pagoCentavos: pago, abertoCentavos: aberto, quitada }
}

/** Recebido líquido: o que entrou menos a taxa da maquininha ou do gateway. */
export function liquido(pagoCentavos: number, taxaCentavos: number): number {
  return pagoCentavos - taxaCentavos
}
