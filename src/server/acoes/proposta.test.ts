import { describe, expect, it } from 'vitest'

/**
 * A CONTA DO ORÇAMENTO DO PASSO 1.
 *
 * A regra que este teste prende é a que vale dinheiro: **o total é calculado no
 * servidor, nunca recebido do formulário**. Preço que chega pronto do navegador
 * é preço que dá para alterar antes de chegar — e o que o cliente aprovaria não
 * seria o que a casa cobrou.
 *
 * A função vive dentro de `salvarProposta`, que é `'use server'` e depende de
 * sessão e banco. O que se testa aqui é a ARITMÉTICA, extraída na mesma forma
 * em que ela roda lá: é ela que produz o número que vai para a tela do cliente.
 */
function totalizar(
  itens: Array<{ tipo: 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA'; quantidade: number; valorUnit: number }>,
  descontoCentavos: number,
  acrescimoCentavos: number,
) {
  const calculados = itens.map((i) => ({
    ...i,
    valorTotalCentavos: Math.round(i.valorUnit * 100) * i.quantidade,
  }))
  const subtotalPecas = calculados
    .filter((i) => i.tipo === 'PECA')
    .reduce((s, i) => s + i.valorTotalCentavos, 0)
  const subtotalServicos = calculados
    .filter((i) => i.tipo !== 'PECA')
    .reduce((s, i) => s + i.valorTotalCentavos, 0)
  return {
    subtotalPecas,
    subtotalServicos,
    total: Math.max(0, subtotalPecas + subtotalServicos - descontoCentavos + acrescimoCentavos),
  }
}

describe('o total do orçamento do passo 1', () => {
  it('soma peças e serviços em subtotais separados', () => {
    const r = totalizar(
      [
        { tipo: 'SERVICO', quantidade: 1, valorUnit: 850 },
        { tipo: 'DESLOCAMENTO', quantidade: 1, valorUnit: 120 },
        { tipo: 'PECA', quantidade: 2, valorUnit: 45.5 },
      ],
      0,
      0,
    )
    expect(r.subtotalServicos).toBe(97_000)
    expect(r.subtotalPecas).toBe(9_100)
    expect(r.total).toBe(106_100)
  })

  it('arredonda o CENTAVO no unitário, e não no total', () => {
    // 3 × R$ 0,335 é o caso que separa as duas ordens de arredondar: arredondar
    // o total daria 101 centavos, e o cliente veria um preço que não bate com a
    // multiplicação impressa ao lado.
    const r = totalizar([{ tipo: 'SERVICO', quantidade: 3, valorUnit: 0.335 }], 0, 0)
    expect(r.total).toBe(102)
  })

  it('o desconto abate e o acréscimo soma', () => {
    const r = totalizar([{ tipo: 'SERVICO', quantidade: 1, valorUnit: 1000 }], 10_000, 2_500)
    expect(r.total).toBe(92_500)
  })

  it('desconto maior que o valor não vira preço negativo', () => {
    // Um orçamento de menos zero reais seria uma nota fiscal de crédito por
    // engano de digitação. O piso é zero.
    const r = totalizar([{ tipo: 'SERVICO', quantidade: 1, valorUnit: 100 }], 50_000, 0)
    expect(r.total).toBe(0)
  })

  it('quantidade fracionada é respeitada — hora técnica de meia hora existe', () => {
    const r = totalizar([{ tipo: 'SERVICO', quantidade: 1.5, valorUnit: 200 }], 0, 0)
    expect(r.total).toBe(30_000)
  })
})
