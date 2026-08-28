import { describe, expect, it } from 'vitest'
import { formatarDocumento, formatarTelefone } from './documentos'

describe('documento', () => {
  it('formata CPF de 11 dígitos', () => {
    expect(formatarDocumento('12345678909')).toBe('123.456.789-09')
  })

  it('formata CNPJ de 14 dígitos', () => {
    expect(formatarDocumento('11444777000161')).toBe('11.444.777/0001-61')
  })

  it('aceita o que já vem com máscara', () => {
    expect(formatarDocumento('11.444.777/0001-61')).toBe('11.444.777/0001-61')
  })

  it('DEVOLVE COMO VEIO o que tem tamanho inesperado', () => {
    // Formatar à força produziria uma máscara que parece certa e não é — e aí
    // ninguém descobre que o cadastro está errado, porque a tela disfarçou.
    expect(formatarDocumento('123')).toBe('123')
    expect(formatarDocumento('123456789012')).toBe('123456789012')
    expect(formatarDocumento('')).toBe('')
  })
})

describe('telefone', () => {
  it('formata celular de 11 dígitos', () => {
    expect(formatarTelefone('51980449274')).toBe('(51) 98044-9274')
  })

  it('formata fixo de 10 dígitos', () => {
    expect(formatarTelefone('5137123456')).toBe('(51) 3712-3456')
  })

  it('tira o 55 que vem colado do WhatsApp', () => {
    // Ninguém no Brasil lê o código do país num telefone da própria cidade.
    expect(formatarTelefone('5551980449274')).toBe('(51) 98044-9274')
    expect(formatarTelefone('555137123456')).toBe('(51) 3712-3456')
  })

  it('NÃO tira o 55 quando ele é o DDD de verdade', () => {
    // 55 é o DDD de Santa Maria, no mesmo estado da empresa. Tirar sempre os
    // dois primeiros dígitos transformaria um número local válido em lixo.
    // A guarda é o tamanho: só some quando sobram 10 ou 11 dígitos depois.
    expect(formatarTelefone('55999887766')).toBe('(55) 99988-7766')
    expect(formatarTelefone('5532123456')).toBe('(55) 3212-3456')
  })

  it('aceita o que já vem com máscara e devolve limpo', () => {
    expect(formatarTelefone('(51) 98044-9274')).toBe('(51) 98044-9274')
  })

  it('devolve como veio o que não tem tamanho de telefone', () => {
    expect(formatarTelefone('123')).toBe('123')
    expect(formatarTelefone('')).toBe('')
  })
})
