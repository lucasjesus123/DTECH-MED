import { describe, expect, it } from 'vitest'
import { totalizarItensDaProposta } from '@/lib/dinheiro'

/**
 * A CONTA DO ORÇAMENTO DO PASSO 1.
 *
 * A regra que este teste prende é a que vale dinheiro: **o total é calculado no
 * servidor, nunca recebido do formulário**. Preço que chega pronto do navegador
 * é preço que dá para alterar antes de chegar — e o que o cliente aprovaria não
 * seria o que a casa cobrou.
 *
 * ESTE ARQUIVO JÁ TESTOU UMA CÓPIA DE SI MESMO. A aritmética vivia dentro de
 * `salvarProposta`, que é `'use server'` e depende de sessão e banco, então o
 * teste redefinia a fórmula aqui dentro e conferia a redefinição. Passava
 * sempre, e continuaria passando no dia em que alguém mudasse o cálculo real: o
 * teste do preço era o único teste da pasta `acoes/` e não olhava para ela.
 *
 * Agora a fórmula mora em `dinheiro.ts`, pura e exportada, e o que este arquivo
 * importa é o código que roda em produção. Se o cálculo mudar, aqui quebra.
 */
describe('o total do orçamento do passo 1', () => {
  it('soma peças e serviços em subtotais separados', () => {
    const r = totalizarItensDaProposta(
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
    const r = totalizarItensDaProposta([{ tipo: 'SERVICO', quantidade: 3, valorUnit: 0.335 }], 0, 0)
    expect(r.total).toBe(102)
  })

  it('o desconto abate e o acréscimo soma', () => {
    const r = totalizarItensDaProposta(
      [{ tipo: 'SERVICO', quantidade: 1, valorUnit: 1000 }],
      10_000,
      2_500,
    )
    expect(r.total).toBe(92_500)
  })

  it('desconto maior que o valor não vira preço negativo', () => {
    // Um orçamento de menos zero reais seria uma nota fiscal de crédito por
    // engano de digitação. O piso é zero.
    const r = totalizarItensDaProposta(
      [{ tipo: 'SERVICO', quantidade: 1, valorUnit: 100 }],
      50_000,
      0,
    )
    expect(r.total).toBe(0)
  })

  it('quantidade fracionada é respeitada — hora técnica de meia hora existe', () => {
    const r = totalizarItensDaProposta([{ tipo: 'SERVICO', quantidade: 1.5, valorUnit: 200 }], 0, 0)
    expect(r.total).toBe(30_000)
  })

  /**
   * As duas asserções abaixo não existiam, e são a razão de a extração valer a
   * pena: elas prendem o que a função devolve PARA ALÉM do total — as linhas
   * que vão para o banco, uma por item, com o valor de cada uma. Era essa parte
   * que a cópia não cobria, e é ela que vira `propostaItem` no banco.
   */
  it('devolve uma linha por item, com o total de cada linha', () => {
    const r = totalizarItensDaProposta(
      [
        { tipo: 'PECA', quantidade: 2, valorUnit: 45.5 },
        { tipo: 'SERVICO', quantidade: 1, valorUnit: 850 },
      ],
      0,
      0,
    )
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]!.valorTotalCentavos).toBe(9_100)
    expect(r.linhas[1]!.valorTotalCentavos).toBe(85_000)
  })

  it('preserva os campos do item que o banco precisa guardar', () => {
    // A função é genérica de propósito: `descricao` e `pecaId` não participam
    // da conta, mas precisam sobreviver até o `createMany`.
    const r = totalizarItensDaProposta(
      [{ tipo: 'PECA' as const, quantidade: 1, valorUnit: 10, descricao: 'Fonte 24V', pecaId: 'p1' }],
      0,
      0,
    )
    expect(r.linhas[0]!.descricao).toBe('Fonte 24V')
    expect(r.linhas[0]!.pecaId).toBe('p1')
  })

  it('a soma dos subtotais mais desconto e acréscimo fecha com o total', () => {
    const r = totalizarItensDaProposta(
      [
        { tipo: 'PECA', quantidade: 3, valorUnit: 19.9 },
        { tipo: 'TAXA', quantidade: 1, valorUnit: 35 },
      ],
      1_000,
      500,
    )
    expect(r.total).toBe(r.subtotalPecas + r.subtotalServicos - 1_000 + 500)
  })
})
