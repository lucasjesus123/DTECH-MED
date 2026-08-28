import { describe, expect, it } from 'vitest'
import { inteiroPorExtenso, reaisPorExtenso } from './extenso'

/**
 * Estes testes existem porque um erro aqui sai IMPRESSO num título de crédito.
 * O extenso é o que prevalece quando ele e o algarismo discordam — então errar
 * aqui é errar o valor da dívida, não a redação.
 */

describe('inteiro por extenso', () => {
  it('as unidades e a faixa irregular até 19', () => {
    expect(inteiroPorExtenso(0)).toBe('zero')
    expect(inteiroPorExtenso(1)).toBe('um')
    expect(inteiroPorExtenso(14)).toBe('catorze')
    expect(inteiroPorExtenso(19)).toBe('dezenove')
  })

  it('põe "e" entre dezena e unidade', () => {
    expect(inteiroPorExtenso(21)).toBe('vinte e um')
    expect(inteiroPorExtenso(99)).toBe('noventa e nove')
    expect(inteiroPorExtenso(30)).toBe('trinta')
  })

  it('distingue CEM de CENTO', () => {
    // 100 exato é "cem"; qualquer coisa depois vira "cento e ...".
    expect(inteiroPorExtenso(100)).toBe('cem')
    expect(inteiroPorExtenso(101)).toBe('cento e um')
    expect(inteiroPorExtenso(120)).toBe('cento e vinte')
    expect(inteiroPorExtenso(199)).toBe('cento e noventa e nove')
  })

  it('MIL não leva "um" na frente', () => {
    // "um mil reais" é o erro clássico de gerador de extenso.
    expect(inteiroPorExtenso(1000)).toBe('mil')
    expect(inteiroPorExtenso(2000)).toBe('dois mil')
  })

  it('põe "e" entre escalas quando o último grupo é pequeno ou redondo', () => {
    expect(inteiroPorExtenso(1200)).toBe('mil e duzentos')
    expect(inteiroPorExtenso(1050)).toBe('mil e cinquenta')
    expect(inteiroPorExtenso(2500)).toBe('dois mil e quinhentos')
  })

  it('NÃO põe "e" quando o último grupo já tem um dentro', () => {
    // "mil e duzentos e um" fica trôpego: o "e" já foi gasto no próprio grupo.
    expect(inteiroPorExtenso(1201)).toBe('mil duzentos e um')
    expect(inteiroPorExtenso(1234)).toBe('mil duzentos e trinta e quatro')
  })

  it('faz o plural da escala', () => {
    expect(inteiroPorExtenso(1_000_000)).toBe('um milhão')
    expect(inteiroPorExtenso(2_000_000)).toBe('dois milhões')
    expect(inteiroPorExtenso(1_000_000_000)).toBe('um bilhão')
  })

  it('pula o grupo zerado do meio', () => {
    expect(inteiroPorExtenso(1_000_500)).toBe('um milhão e quinhentos')
    // 1.000.001 leva "e": o último grupo é menor que cem. A minha primeira
    // expectativa aqui estava errada, e o código certo — 1.000.101 é que sai
    // sem o "e" entre as escalas, porque o grupo já tem um dentro.
    expect(inteiroPorExtenso(1_000_001)).toBe('um milhão e um')
    expect(inteiroPorExtenso(1_000_101)).toBe('um milhão cento e um')
  })

  it('recusa o que não dá para escrever', () => {
    expect(() => inteiroPorExtenso(-1)).toThrow()
    expect(() => inteiroPorExtenso(Number.NaN)).toThrow()
    expect(() => inteiroPorExtenso(1e12)).toThrow()
  })
})

describe('reais por extenso', () => {
  it('escreve o valor cheio', () => {
    expect(reaisPorExtenso(125000)).toBe('mil duzentos e cinquenta reais')
    expect(reaisPorExtenso(179500)).toBe('mil setecentos e noventa e cinco reais')
  })

  it('junta os centavos com "e"', () => {
    expect(reaisPorExtenso(125050)).toBe('mil duzentos e cinquenta reais e cinquenta centavos')
    expect(reaisPorExtenso(101)).toBe('um real e um centavo')
  })

  it('NÃO escreve "e zero centavos"', () => {
    // A frase a mais é a que faz o leitor desconfiar de que foi montada por
    // máquina — e um título precisa parecer escrito por gente.
    expect(reaisPorExtenso(100000)).toBe('mil reais')
    expect(reaisPorExtenso(100)).toBe('um real')
  })

  it('só centavos, sem parte inteira', () => {
    expect(reaisPorExtenso(50)).toBe('cinquenta centavos')
    expect(reaisPorExtenso(1)).toBe('um centavo')
  })

  it('zero', () => {
    expect(reaisPorExtenso(0)).toBe('zero real')
  })

  it('o valor grande de uma nota de verdade', () => {
    expect(reaisPorExtenso(4_285_037)).toBe(
      'quarenta e dois mil oitocentos e cinquenta reais e trinta e sete centavos',
    )
  })

  it('recusa centavo fracionado ou negativo', () => {
    // Centavo com casa decimal é sinal de que alguém passou reais no lugar de
    // centavos — e o título sairia com um centésimo do valor.
    expect(() => reaisPorExtenso(12.5)).toThrow()
    expect(() => reaisPorExtenso(-100)).toThrow()
  })
})
