/**
 * O VALOR POR EXTENSO.
 *
 * =============================================================================
 * POR QUE UMA NOTA PROMISSÓRIA PRECISA DISSO
 * =============================================================================
 * Não é enfeite jurídico: é a defesa contra a adulteração. Um "1.500,00" vira
 * "11.500,00" com um traço de caneta; "mil e quinhentos reais" não vira nada.
 * Quando os dois discordam, o extenso prevalece — é a regra que existe
 * justamente porque o algarismo é o que se altera.
 *
 * Por isso ele é gerado, e nunca digitado. Campo de texto livre para o extenso
 * seria o mesmo que pedir para alguém errar exatamente onde não pode.
 *
 * =============================================================================
 * AS ARMADILHAS DO PORTUGUÊS QUE ESTE ARQUIVO RESOLVE
 * =============================================================================
 * Elas parecem detalhe e são o que separa um documento sério de um constrangedor:
 *
 *   "e" ENTRE CENTENA E RESTO   cento e vinte, e não "cento vinte"
 *   CENTO vs CEM                cem é exato; 101 é "cento e um"
 *   MIL SEM "UM"                mil reais, e não "um mil reais"
 *   PLURAL DA ESCALA            dois milhões, um milhão
 *   O "E" ENTRE AS ESCALAS      mil e duzentos; mas "mil duzentos e um"
 *                               quando o grupo tem mais de uma parte
 *   ZERO CENTAVOS               não se escreve "e zero centavos"
 *
 * =============================================================================
 * PURO DE PROPÓSITO
 * =============================================================================
 * Sem banco, sem data, sem React. É a parte onde teste é barato — e um erro
 * aqui sai impresso num título de crédito.
 */

const UNIDADES = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
]
const DEZENAS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta',
  'oitenta', 'noventa',
]
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
]

/** As escalas, no singular e no plural. */
const ESCALAS: Array<[string, string]> = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
]

/** Um grupo de até três dígitos: 0 a 999. */
function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem' // 100 exato é "cem"; 101 é "cento e um"
  if (n < 20) return UNIDADES[n]!

  const partes: string[] = []
  const c = Math.floor(n / 100)
  const resto = n % 100

  if (c > 0) partes.push(CENTENAS[c]!)

  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]!)
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!)
    }
  }
  return partes.join(' e ')
}

/** Um número inteiro por extenso. */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error('Número inválido para extenso.')
  const inteiro = Math.trunc(n)
  if (inteiro === 0) return 'zero'
  if (inteiro >= 1e12) throw new Error('Número grande demais para escrever por extenso.')

  // Quebra em grupos de três, do menor para o maior.
  const grupos: number[] = []
  let resto = inteiro
  while (resto > 0) {
    grupos.push(resto % 1000)
    resto = Math.floor(resto / 1000)
  }

  const ditos: string[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!
    if (g === 0) continue
    const [sing, plur] = ESCALAS[i]!
    // "mil" nunca leva "um" na frente: mil reais, e não "um mil reais".
    const texto = i === 1 && g === 1 ? 'mil' : `${ate999(g)}${sing ? ` ${g === 1 ? sing : plur}` : ''}`
    ditos.push(texto)
  }

  /**
   * O "e" entre as escalas.
   *
   * Vale quando o ÚLTIMO grupo é pequeno (menor que 100) ou redondo (centena
   * exata): "mil e duzentos", "dois milhões e quinhentos". Não vale quando ele
   * tem mais de uma parte: "mil duzentos e um" — porque o "e" já foi gasto
   * dentro do próprio grupo, e dois "e" seguidos ficam trôpegos.
   */
  const ultimo = grupos[0]!
  if (ditos.length > 1 && ultimo > 0 && (ultimo < 100 || ultimo % 100 === 0)) {
    const fim = ditos.pop()!
    return `${ditos.join(', ')} e ${fim}`
  }
  return ditos.join(' ')
}

/**
 * Um valor em centavos, escrito como vai para o título.
 *
 * `125000` → "mil duzentos e cinquenta reais"
 * `125050` → "mil duzentos e cinquenta reais e cinquenta centavos"
 *
 * Zero centavo não vira "e zero centavos": documento não fala assim, e a
 * frase a mais é a que faz o leitor desconfiar de que foi montada por máquina.
 */
export function reaisPorExtenso(centavos: number): string {
  if (!Number.isInteger(centavos) || centavos < 0) {
    throw new Error('Valor em centavos inválido para extenso.')
  }
  const reais = Math.floor(centavos / 100)
  const cents = centavos % 100

  const parteReais = reais === 0 ? '' : `${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`
  const parteCents =
    cents === 0 ? '' : `${inteiroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`

  if (!parteReais && !parteCents) return 'zero real'
  if (!parteReais) return parteCents
  if (!parteCents) return parteReais
  return `${parteReais} e ${parteCents}`
}
