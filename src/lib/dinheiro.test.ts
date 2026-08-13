import { describe, expect, it } from 'vitest'
import { aCentavos, aplicarBaixa, calcularTotal, dividirParcelas, formatarBRL, liquido } from './dinheiro'

describe('conversão', () => {
  it('converte reais para centavos inteiros', () => {
    expect(aCentavos(12.34)).toBe(1234)
    expect(aCentavos(0.1)).toBe(10)
    expect(aCentavos(1840)).toBe(184000)
  })

  it('não deixa resíduo de ponto flutuante escapar', () => {
    // 0,1 + 0,2 em float dá 0,30000000000000004. Em centavos, dá 30.
    expect(aCentavos(0.1) + aCentavos(0.2)).toBe(30)
  })

  it('formata em real brasileiro', () => {
    expect(formatarBRL(184000).replace(/ /g, ' ')).toBe('R$ 1.840,00')
  })
})

describe('total do orçamento', () => {
  it('soma peças e serviços, aplica desconto e acréscimo', () => {
    expect(
      calcularTotal({ subtotalPecas: 77000, subtotalServicos: 107000, desconto: 5000 }),
    ).toBe(179000)
  })

  it('nunca devolve total negativo', () => {
    // Desconto maior que o serviço é sempre defeito de digitação. Virar
    // crédito ao cliente seria transformar um erro em prejuízo.
    expect(calcularTotal({ subtotalPecas: 1000, subtotalServicos: 0, desconto: 9999 })).toBe(0)
  })
})

describe('parcelamento centavo-exato', () => {
  it('soma das parcelas bate exatamente com o total', () => {
    for (const total of [100000, 184000, 1, 7, 99999, 33333]) {
      for (const n of [1, 2, 3, 4, 6, 7, 12]) {
        const p = dividirParcelas(total, n)
        expect(p).toHaveLength(n)
        expect(p.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it('o resto vai para a última parcela', () => {
    // 1000,00 em 3x: o ingênuo daria 3 x 333,33 = 999,99 e perderia 1 centavo.
    expect(dividirParcelas(100000, 3)).toEqual([33333, 33333, 33334])
  })

  it('recusa número de parcelas inválido', () => {
    expect(() => dividirParcelas(1000, 0)).toThrow()
    expect(() => dividirParcelas(1000, -1)).toThrow()
  })
})

describe('baixa da fatura', () => {
  it('acumula sobre o valor já pago', () => {
    const r = aplicarBaixa({
      valorTotalCentavos: 184000,
      pagoAtualCentavos: 80000,
      novos: [{ valorCentavos: 40000 }],
    })
    expect(r.pagoCentavos).toBe(120000)
    expect(r.abertoCentavos).toBe(64000)
    expect(r.quitada).toBe(false)
  })

  it('aceita várias formas na mesma baixa', () => {
    // O caso real: parte em dinheiro, parte no pix, parte no cartão.
    const r = aplicarBaixa({
      valorTotalCentavos: 184000,
      pagoAtualCentavos: 0,
      novos: [{ valorCentavos: 80000 }, { valorCentavos: 40000 }, { valorCentavos: 64000 }],
    })
    expect(r.pagoCentavos).toBe(184000)
    expect(r.quitada).toBe(true)
    expect(r.abertoCentavos).toBe(0)
  })

  it('quita com tolerância de um centavo', () => {
    const r = aplicarBaixa({
      valorTotalCentavos: 100000,
      pagoAtualCentavos: 99999,
      novos: [],
    })
    // Sem a tolerância, esta fatura ficaria para sempre com R$ 0,01 em aberto.
    expect(r.quitada).toBe(true)
  })

  it('soma multa e juros ao que o cliente deve', () => {
    const r = aplicarBaixa({
      valorTotalCentavos: 100000,
      pagoAtualCentavos: 0,
      novos: [{ valorCentavos: 100000 }],
      multaCentavos: 2000,
      jurosCentavos: 500,
    })
    // Pagou o principal, mas ainda deve os encargos.
    expect(r.quitada).toBe(false)
    expect(r.abertoCentavos).toBe(2500)
  })

  it('nunca devolve valor em aberto negativo', () => {
    const r = aplicarBaixa({
      valorTotalCentavos: 10000,
      pagoAtualCentavos: 0,
      novos: [{ valorCentavos: 15000 }],
    })
    expect(r.abertoCentavos).toBe(0)
    expect(r.quitada).toBe(true)
  })

  it('lista vazia não quebra nem descarta o que já entrou', () => {
    const r = aplicarBaixa({ valorTotalCentavos: 5000, pagoAtualCentavos: 3000, novos: [] })
    expect(r.pagoCentavos).toBe(3000)
  })
})

describe('recebido líquido', () => {
  it('desconta a taxa da maquininha do que entrou', () => {
    // A taxa é custo nosso, não some do que o cliente pagou — por isso vive
    // em coluna própria e só aparece no líquido.
    expect(liquido(184000, 5520)).toBe(178480)
  })
})
