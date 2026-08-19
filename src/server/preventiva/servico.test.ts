import { describe, expect, it } from 'vitest'
import { datasDasVisitas, ROTULO_PERIODICIDADE } from './servico'

/**
 * As datas das visitas.
 *
 * Testado com afinco porque é a única parte da preventiva que decide DINHEIRO
 * sozinha: cada data destas vira uma ordem de serviço faturável. Um erro aqui
 * não dá tela vermelha — ele desloca a visita alguns dias, todo trimestre, até
 * o contrato estar semanas fora do combinado e ninguém saber explicar por quê.
 *
 * As datas são montadas com `new Date(ano, mês, dia)` de propósito: é a hora
 * local do processo, que é o que o formulário produz e o que a pessoa quis
 * dizer ao escrever "dia 10".
 */
const dia = (a: number, m: number, d: number) => new Date(a, m - 1, d, 12, 0, 0, 0)
const emDias = (ds: Date[]) =>
  ds.map((d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)

describe('datasDasVisitas', () => {
  it('mensal cai sempre no mesmo dia do mês', () => {
    const d = datasDasVisitas(dia(2026, 1, 10), 'MENSAL', dia(2026, 6, 30))
    expect(emDias(d)).toEqual([
      '10/01/2026', '10/02/2026', '10/03/2026',
      '10/04/2026', '10/05/2026', '10/06/2026',
    ])
  })

  it('trimestral não deriva: 90 dias derivaria, mês não', () => {
    // Somar 90 dias daria 10/01 → 10/04 → 09/07 → 07/10. A conta em mês não.
    const d = datasDasVisitas(dia(2026, 1, 10), 'TRIMESTRAL', dia(2026, 12, 31))
    expect(emDias(d)).toEqual(['10/01/2026', '10/04/2026', '10/07/2026', '10/10/2026'])
  })

  it('semestral e anual', () => {
    expect(emDias(datasDasVisitas(dia(2026, 3, 5), 'SEMESTRAL', dia(2027, 12, 31)))).toEqual([
      '05/03/2026', '05/09/2026', '05/03/2027', '05/09/2027',
    ])
    expect(emDias(datasDasVisitas(dia(2026, 3, 5), 'ANUAL', dia(2029, 12, 31)))).toEqual([
      '05/03/2026', '05/03/2027', '05/03/2028', '05/03/2029',
    ])
  })

  it('a primeira visita é o próprio começo do contrato', () => {
    const d = datasDasVisitas(dia(2026, 8, 19), 'MENSAL', dia(2026, 9, 1))
    expect(d[0]!.getDate()).toBe(19)
    expect(d[0]!.getMonth()).toBe(7)
  })

  it('sem data de fim, o horizonte é de dois anos', () => {
    const d = datasDasVisitas(dia(2026, 1, 15), 'SEMESTRAL', null)
    // 01/2026, 07/2026, 01/2027, 07/2027 e 01/2028 — a de 01/2028 é o limite.
    expect(emDias(d)).toEqual([
      '15/01/2026', '15/07/2026', '15/01/2027', '15/07/2027', '15/01/2028',
    ])
  })

  it('data de fim antes da primeira visita não gera nada', () => {
    expect(datasDasVisitas(dia(2026, 5, 10), 'MENSAL', dia(2026, 4, 30))).toEqual([])
  })

  it('o teto corta a lista mesmo com contrato longuíssimo', () => {
    const d = datasDasVisitas(dia(2026, 1, 1), 'MENSAL', dia(2099, 1, 1), 7)
    expect(d).toHaveLength(7)
  })

  /**
   * O caso do dia 31.
   *
   * `setMonth` transborda: 31 de janeiro mais um mês vira 3 de março, porque
   * fevereiro não tem 31. O teste existe para FIXAR esse comportamento, e não
   * para elogiá-lo — travar no último dia do mês seria pior, porque empurraria
   * todo contrato que começa dia 29, 30 ou 31 para o fim do mês para sempre.
   *
   * Se um dia isso mudar, este teste quebra e alguém decide de novo, de olho
   * aberto, em vez de descobrir pelo cliente.
   */
  it('dia 31 transborda para o mês seguinte, e isso é conhecido', () => {
    const d = datasDasVisitas(dia(2026, 1, 31), 'MENSAL', dia(2026, 4, 30))
    expect(emDias(d)).toEqual(['31/01/2026', '03/03/2026', '31/03/2026'])
  })

  it('atravessa a virada do ano sem pular', () => {
    const d = datasDasVisitas(dia(2026, 11, 20), 'BIMESTRAL', dia(2027, 6, 1))
    expect(emDias(d)).toEqual(['20/11/2026', '20/01/2027', '20/03/2027', '20/05/2027'])
  })

  it('ano bissexto: 29 de fevereiro existe em 2028', () => {
    const d = datasDasVisitas(dia(2028, 2, 29), 'ANUAL', dia(2029, 12, 31))
    // 2029 não é bissexto: 29/02 transborda para 01/03.
    expect(emDias(d)).toEqual(['29/02/2028', '01/03/2029'])
  })
})

describe('ROTULO_PERIODICIDADE', () => {
  it('tem frase para toda periodicidade — e frase, não sigla', () => {
    for (const p of ['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as const) {
      expect(ROTULO_PERIODICIDADE[p]).toBeTruthy()
      expect(ROTULO_PERIODICIDADE[p]).not.toBe(p)
    }
  })
})
