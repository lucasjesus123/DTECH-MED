import { describe, expect, it } from 'vitest'
import { amanha, diaLocal, hoje } from './datas'

/**
 * Estes testes existem por causa de defeitos que apareceram na tela, e cada um
 * fixa um deles. Todos usam instantes CRAVADOS em UTC, nunca `new Date()` sem
 * argumento — um teste de fuso que depende da hora em que roda passa de manhã e
 * falha à noite, que é o oposto de um teste.
 */
describe('diaLocal', () => {
  it('22h de Lajeado ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    // 18/08 01:00 UTC = 17/08 22:00 em Lajeado.
    expect(diaLocal(new Date('2026-08-18T01:00:00Z'))).toBe('2026-08-17')
  })

  it('meia-noite e meia de Lajeado já é o dia novo', () => {
    // 18/08 03:30 UTC = 18/08 00:30 em Lajeado.
    expect(diaLocal(new Date('2026-08-18T03:30:00Z'))).toBe('2026-08-18')
  })

  it('o instante exato da virada em Lajeado', () => {
    expect(diaLocal(new Date('2026-08-18T02:59:59Z'))).toBe('2026-08-17')
    expect(diaLocal(new Date('2026-08-18T03:00:00Z'))).toBe('2026-08-18')
  })

  it('vira o mês pelo fuso certo', () => {
    // 01/09 02:00 UTC = 31/08 23:00 em Lajeado.
    expect(diaLocal(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08-31')
  })

  it('vira o ano pelo fuso certo', () => {
    // 01/01 01:00 UTC = 31/12 22:00 em Lajeado.
    expect(diaLocal(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31')
  })

  it('sai no formato que ordena como texto e que o campo de data aceita', () => {
    expect(diaLocal(new Date('2026-03-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('meio-dia em Lajeado é o mesmo dia, sem margem para dúvida', () => {
    expect(diaLocal(new Date('2026-08-17T15:00:00Z'))).toBe('2026-08-17')
  })
})

describe('hoje e amanhã', () => {
  it('amanhã é o dia seguinte a hoje', () => {
    const a = new Date(`${hoje()}T12:00:00-03:00`)
    const b = new Date(`${amanha()}T12:00:00-03:00`)
    const dias = Math.round((b.getTime() - a.getTime()) / 86_400_000)
    expect(dias).toBe(1)
  })

  it('os dois saem no mesmo formato', () => {
    expect(hoje()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(amanha()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
