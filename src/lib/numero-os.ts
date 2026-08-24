/**
 * O número da O.S. que veio de um campo de busca — quando é um de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * As buscas do painel casam o que a pessoa digitou com o número da ordem, e
 * faziam isso com um `Number(digitos)` direto. `numero` é `Int` no banco —
 * quatro bytes, teto em 2.147.483.647, dez dígitos. Onze dígitos estouram.
 *
 * E onze dígitos é exatamente o que se digita ali: um CPF, um celular. A
 * própria busca de ordens diz casar com o documento do cliente, ou seja,
 * procurar por CPF é o uso PREVISTO — e era o que quebrava. O Postgres recusa
 * o valor, o Prisma levanta P2020, e o que a pessoa vê é a tela morrer:
 *
 *     Value out of range for the type: value "87428500402418"
 *     is out of range for type integer
 *     → 500, e no navegador o React estoura com o erro #441
 *
 * Achado pelo robô de QA, que digitou um telefone no campo de busca da tela de
 * Ordens.
 *
 * A correção é não perguntar ao banco por um número que não cabe nele. Quem
 * procura por um CPF continua achando pelo documento do cliente; o que sai é
 * só a comparação impossível.
 */

/** Maior valor que cabe num `integer` do Postgres. */
const TETO_INTEIRO = 2_147_483_647

export function numeroDeOs(texto: string): number | null {
  const digitos = texto.replace(/\D/g, '')
  if (!digitos) return null
  const n = Number(digitos)
  if (!Number.isSafeInteger(n) || n < 1 || n > TETO_INTEIRO) return null
  return n
}

/**
 * O mesmo, no formato que o `where` do Prisma espera: uma lista com uma
 * condição, ou lista vazia. Evita repetir o ternário em cada consulta.
 */
export function filtroPorNumero(texto: string): Array<{ numero: number }> {
  const n = numeroDeOs(texto)
  return n === null ? [] : [{ numero: n }]
}
