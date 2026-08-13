import { describe, expect, it } from 'vitest'
import { hashEvento } from './cripto'

/**
 * A cadeia de hash é o que dá valor de prova à linha do tempo. Estes testes
 * travam as duas propriedades que ela precisa ter:
 *
 *   • MESMO conteúdo, mesmo hash — independente de como o banco guardou.
 *   • QUALQUER mudança no conteúdo, hash diferente.
 *
 * O primeiro parece óbvio e não é: o Postgres reordena as chaves de um `jsonb`
 * ao gravar, e sem canonicalização a verificação acusava adulteração em todo
 * evento com mais de uma chave no payload.
 */

const base = {
  ordemId: 'ord_1',
  sequencia: 9,
  etapaNova: 'ORCAMENTO_APROVADO',
  tipo: 'orcamento.aprovado',
  autorId: null,
  criadoEm: new Date('2026-08-13T03:09:16.286Z'),
  hashAnterior: 'abc123',
}

describe('hash do evento', () => {
  it('não muda quando o banco reordena as chaves do payload', () => {
    // Foi gravado assim…
    const gravado = hashEvento({
      ...base,
      payload: { orcamentoId: 'orc_1', totalCentavos: 179500, observacao: null },
    })
    // …e o Postgres devolve assim, ordenado por tamanho e depois por byte.
    const lido = hashEvento({
      ...base,
      payload: { observacao: null, orcamentoId: 'orc_1', totalCentavos: 179500 },
    })
    expect(lido).toBe(gravado)
  })

  it('ordena também dentro de objeto aninhado', () => {
    const a = hashEvento({ ...base, payload: { geo: { lat: -29.4, lng: -51.9, precisao: 12 } } })
    const b = hashEvento({ ...base, payload: { geo: { precisao: 12, lng: -51.9, lat: -29.4 } } })
    expect(a).toBe(b)
  })

  it('preserva a ordem de array — ali a posição É o conteúdo', () => {
    const a = hashEvento({ ...base, payload: { fotos: ['a', 'b'] } })
    const b = hashEvento({ ...base, payload: { fotos: ['b', 'a'] } })
    expect(a).not.toBe(b)
  })

  it('muda quando o valor muda', () => {
    const a = hashEvento({ ...base, payload: { totalCentavos: 179500 } })
    const b = hashEvento({ ...base, payload: { totalCentavos: 179501 } })
    expect(a).not.toBe(b)
  })

  it('muda quando o autor muda', () => {
    const a = hashEvento({ ...base, payload: null, autorId: 'u1' })
    const b = hashEvento({ ...base, payload: null, autorId: 'u2' })
    expect(a).not.toBe(b)
  })

  it('muda quando o elo anterior muda — é o que faz virar corrente', () => {
    const a = hashEvento({ ...base, payload: null, hashAnterior: 'x' })
    const b = hashEvento({ ...base, payload: null, hashAnterior: 'y' })
    expect(a).not.toBe(b)
  })

  it('muda quando o horário muda, até no milissegundo', () => {
    const a = hashEvento({ ...base, payload: null })
    const b = hashEvento({ ...base, payload: null, criadoEm: new Date('2026-08-13T03:09:16.287Z') })
    expect(a).not.toBe(b)
  })

  it('trata payload nulo e ausente do mesmo jeito', () => {
    const a = hashEvento({ ...base, payload: null })
    const b = hashEvento({ ...base, payload: undefined })
    expect(a).toBe(b)
  })

  it('devolve sempre 64 caracteres hexadecimais', () => {
    const h = hashEvento({ ...base, payload: { a: 1 } })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})
