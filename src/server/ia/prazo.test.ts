import { describe, expect, it } from 'vitest'
import { AMOSTRA_MINIMA, CONFIANCA_MINIMA, confiancaDe, wilson } from './contrato'
import { estimarRisco, mediana, motivoDoRisco, type Amostra } from './prazo'

/**
 * =============================================================================
 * A MATEMÁTICA DA PREVISÃO, PROVADA COM AMOSTRAS QUE EU ESCOLHO
 * =============================================================================
 * Estes testes existem porque o banco de ensaio tem uma dúzia de ordens, e uma
 * dúzia de ordens não prova nada sobre um estimador. Aqui as amostras são
 * fabricadas de propósito para bater nos cantos: unanimidade, amostra mínima,
 * empate, e o caso em que o modelo TEM de se calar.
 *
 * O que se está protegendo não é o número — é a HONESTIDADE do número. Um
 * estimador que sempre responde é um estimador que mente quando não sabe, e a
 * falha desse tipo é silenciosa: a tela mostra "76%" e ninguém desconfia.
 */

const amostras = (dias: number[]): Amostra[] =>
  dias.map((d, i) => ({ ordemId: `o${i}`, numero: 100 + i, dias: d }))

describe('wilson', () => {
  it('nunca sai de [0, 1], nem no extremo em que a conta de escola sai', () => {
    // p = 1 com n pequeno: a aproximação normal daria largura ZERO e
    // anunciaria certeza absoluta a partir de cinco observações.
    const w = wilson(5, 5)
    expect(w.baixo).toBeGreaterThan(0)
    expect(w.alto).toBeLessThanOrEqual(1)
    expect(w.baixo).toBeLessThan(1)
  })

  it('não anuncia certeza com unanimidade em amostra pequena', () => {
    const largura = (a: number, n: number) => {
      const w = wilson(a, n)
      return w.alto - w.baixo
    }
    // Cinco de cinco ainda deixa muita dúvida; cem de cem, quase nenhuma.
    expect(largura(5, 5)).toBeGreaterThan(0.3)
    expect(largura(100, 100)).toBeLessThan(0.05)
  })

  it('encolhe conforme a amostra cresce, mantendo a proporção', () => {
    const larg = (n: number) => {
      const w = wilson(Math.round(n * 0.7), n)
      return w.alto - w.baixo
    }
    expect(larg(10)).toBeGreaterThan(larg(50))
    expect(larg(50)).toBeGreaterThan(larg(200))
  })

  it('devolve o intervalo inteiro quando não há amostra nenhuma', () => {
    expect(wilson(0, 0)).toEqual({ baixo: 0, alto: 1 })
  })
})

describe('confiancaDe', () => {
  it('é zero sem amostra — ausência de dado não é dado', () => {
    expect(confiancaDe(0, 0)).toBe(0)
  })

  it('fica abaixo do piso com a amostra mínima dividida ao meio', () => {
    // Oito observações empatadas em 4×4: há história, e ela não concorda com
    // nada. É o caso que o corte por tamanho de amostra sozinho deixaria passar.
    expect(confiancaDe(4, 8)).toBeLessThan(CONFIANCA_MINIMA)
  })

  it('sobe quando a amostra é grande E concorda', () => {
    expect(confiancaDe(45, 50)).toBeGreaterThan(CONFIANCA_MINIMA)
    expect(confiancaDe(45, 50)).toBeGreaterThan(confiancaDe(9, 10))
  })

  /**
   * OS DOIS LADOS DO CORTE, fixados de propósito.
   *
   * O piso foi calibrado com estes números na mão, e são eles que dizem se um
   * valor novo de `CONFIANCA_MINIMA` continua fazendo o que se espera. Quem
   * mexer na constante vai reprovar aqui — que é o ponto: o piso não é ajuste
   * de gosto, é o que o sistema aceita afirmar.
   */
  it('recusa o que está do lado de baixo do corte', () => {
    expect(confiancaDe(3, 3)).toBeLessThan(CONFIANCA_MINIMA)   // 0,526
    expect(confiancaDe(4, 8)).toBeLessThan(CONFIANCA_MINIMA)   // 0,497
    expect(confiancaDe(6, 8)).toBeLessThan(CONFIANCA_MINIMA)   // 0,547
    expect(confiancaDe(7, 10)).toBeLessThan(CONFIANCA_MINIMA)  // 0,569
  })

  it('aceita o que está do lado de cima', () => {
    expect(confiancaDe(9, 10)).toBeGreaterThan(CONFIANCA_MINIMA)   // 0,675
    expect(confiancaDe(8, 8)).toBeGreaterThan(CONFIANCA_MINIMA)    // 0,747
    expect(confiancaDe(40, 40)).toBeGreaterThan(CONFIANCA_MINIMA)  // 0,937
  })
})

describe('estimarRisco', () => {
  it('é a frequência observada, e nada além disso', () => {
    // Dez amostras; seis passaram de 20 dias.
    const r = estimarRisco(amostras([5, 8, 12, 18, 21, 25, 30, 33, 40, 55]), 20, 0)
    expect(r.n).toBe(10)
    expect(r.acertos).toBe(6)
    expect(r.risco).toBeCloseTo(0.6, 5)
  })

  it('soma o tempo JÁ GASTO na etapa ao orçamento — é daí que a conta parte', () => {
    const a = amostras([10, 20, 30, 40])
    // Restam 15 dias e a O.S. está há 10 na etapa: o orçamento contado desde
    // a ENTRADA na etapa é 25. Só 30 e 40 passam disso.
    expect(estimarRisco(a, 15, 10).acertos).toBe(2)
    // Sem contar o gasto, a conta olharia só os 15 e acusaria três — pintando
    // de risco alto uma ordem que está no prazo.
    expect(estimarRisco(a, 15, 0).acertos).toBe(3)
  })

  it('dá risco 1 quando o prazo já não cabe em nenhuma amostra', () => {
    expect(estimarRisco(amostras([10, 12, 14]), 1, 0).risco).toBe(1)
  })

  it('dá risco 0 quando sobra prazo para todas', () => {
    expect(estimarRisco(amostras([10, 12, 14]), 90, 0).risco).toBe(0)
  })

  it('devolve confiança zero sem amostra, em vez de dividir por zero', () => {
    const r = estimarRisco([], 10, 0)
    expect(r.n).toBe(0)
    expect(r.risco).toBe(0)
    expect(r.confianca).toBe(0)
  })

  it('RECUSA na prática: risco 1 com três amostras não passa no piso', () => {
    // Este é o teste que guarda a regra inteira. Três observações unânimes
    // produzem "100% de chance de estourar" — um número que parece idêntico ao
    // que trezentas produziriam. A confiança é o que separa os dois, e ela
    // fica abaixo do corte.
    const r = estimarRisco(amostras([30, 40, 50]), 1, 0)
    expect(r.risco).toBe(1)
    expect(r.confianca).toBeLessThan(CONFIANCA_MINIMA)
    expect(r.n).toBeLessThan(AMOSTRA_MINIMA)
  })

  it('a mesma unanimidade com amostra farta passa a valer', () => {
    const r = estimarRisco(amostras(Array.from({ length: 40 }, (_, i) => 30 + i)), 1, 0)
    expect(r.risco).toBe(1)
    expect(r.confianca).toBeGreaterThan(CONFIANCA_MINIMA)
  })
})

describe('mediana', () => {
  it('não se deixa entortar por um reparo de sessenta dias', () => {
    const v = [2, 3, 4, 5, 60]
    const media = v.reduce((s, n) => s + n, 0) / v.length
    expect(mediana(v)).toBe(4)
    expect(media).toBeGreaterThan(14) // a média diria "quinze dias"
  })

  it('faz a média dos dois do meio quando a contagem é par', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
  })

  it('não quebra com lista vazia', () => {
    expect(mediana([])).toBe(0)
  })

  it('não depende da ordem de entrada', () => {
    expect(mediana([9, 1, 5])).toBe(mediana([1, 5, 9]))
  })
})

describe('motivoDoRisco', () => {
  it('aponta o prazo curto quando o que resta não cobre o costume da etapa', () => {
    const m = motivoDoRisco({
      restante: 2,
      gasto: 1,
      medianaDaEtapa: 9,
      rotuloDaEtapa: 'em manutenção',
    })
    expect(m).toContain('restam 2d')
    expect(m).toContain('9d')
  })

  it('aponta a O.S. travada quando ela já passou do normal da etapa', () => {
    const m = motivoDoRisco({
      restante: 30,
      gasto: 21,
      medianaDaEtapa: 7,
      rotuloDaEtapa: 'em análise',
    })
    expect(m).toContain('parada há 21d')
    expect(m).toContain('7d')
  })

  it('cai na terceira frase quando nada está anormal isoladamente', () => {
    const m = motivoDoRisco({
      restante: 30,
      gasto: 2,
      medianaDaEtapa: 7,
      rotuloDaEtapa: 'em rota',
    })
    expect(m).toBe('2d nesta etapa e 30d de prazo')
  })

  it('não escreve dias negativos quando o prazo já está no limite', () => {
    const m = motivoDoRisco({
      restante: -3,
      gasto: 1,
      medianaDaEtapa: 5,
      rotuloDaEtapa: 'faturamento',
    })
    expect(m).toContain('restam 0d')
    expect(m).not.toContain('-3')
  })
})
