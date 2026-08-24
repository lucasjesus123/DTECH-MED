import { describe, expect, it } from 'vitest'
import { filtroPorNumero, numeroDeOs } from './numero-os'

/**
 * O caso que originou este arquivo: o robô de QA digitou um telefone no campo
 * de busca da tela de Ordens e a tela morreu com 500. `numero` é `Int` no
 * Postgres, e onze dígitos não cabem em quatro bytes.
 */
describe('o número de O.S. tirado do campo de busca', () => {
  it('aceita um número de ordem normal', () => {
    expect(numeroDeOs('12')).toBe(12)
    expect(numeroDeOs('1047')).toBe(1047)
  })

  it('aceita o número escrito como o cliente fala', () => {
    expect(numeroDeOs('OS 1047')).toBe(1047)
    expect(numeroDeOs('#1047')).toBe(1047)
  })

  it('RECUSA o que não cabe no inteiro do banco', () => {
    // O valor exato que apareceu no log do servidor no dia em que quebrou.
    expect(numeroDeOs('87428500402418')).toBeNull()
    // O teto, e o primeiro valor acima dele.
    expect(numeroDeOs('2147483647')).toBe(2_147_483_647)
    expect(numeroDeOs('2147483648')).toBeNull()
  })

  it('RECUSA um CPF e um celular — que é o que se digita ali de verdade', () => {
    expect(numeroDeOs('123.456.789-09')).toBeNull()
    expect(numeroDeOs('(51) 98044-9274')).toBeNull()
  })

  it('devolve nulo quando não há dígito nenhum', () => {
    expect(numeroDeOs('')).toBeNull()
    expect(numeroDeOs('Mariana')).toBeNull()
    expect(numeroDeOs('   ')).toBeNull()
  })

  it('recusa zero — não existe ordem número zero', () => {
    expect(numeroDeOs('0')).toBeNull()
    expect(numeroDeOs('000')).toBeNull()
  })

  it('o filtro do Prisma sai vazio em vez de pedir o impossível ao banco', () => {
    expect(filtroPorNumero('87428500402418')).toEqual([])
    expect(filtroPorNumero('Mariana')).toEqual([])
    expect(filtroPorNumero('1047')).toEqual([{ numero: 1047 }])
  })
})
