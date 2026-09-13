import { describe, expect, it } from 'vitest'
import { EtapaOrdem as E } from '@/generated/prisma/enums'
import { etapasDaFase, faseDaEtapa, montarRoteiro, ROTEIRO, TOTAL_DE_PASSOS } from './roteiro'
import { SEQUENCIA_DA_TRILHA } from './trilha'
import { FASES, TOTAL_DE_FASES, faseDoPasso, faseViva } from './fases'

/**
 * As fases são o andar de cima do roteiro, e o que pode quebrar em silêncio
 * aqui é sempre a mesma coisa: um passo ficar sem fase. A ordem chegaria nele e
 * os três botões ficariam todos apagados, sem nenhum dizer onde ela está.
 */

const evento = (para: E, dia: number, quem = 'Lucas') => ({
  para,
  criadoEm: new Date(2026, 8, dia),
  autorNome: quem,
})

describe('as três fases cobrem o roteiro inteiro', () => {
  it('são três', () => {
    expect(TOTAL_DE_FASES).toBe(3)
    expect(FASES.map((f) => f.n)).toEqual([1, 2, 3])
  })

  it('todo passo dos onze tem uma fase, e só uma', () => {
    const todos = FASES.flatMap((f) => f.passos)
    expect(todos.length).toBe(TOTAL_DE_PASSOS)
    expect(new Set(todos).size).toBe(TOTAL_DE_PASSOS)
    for (const p of ROTEIRO) {
      expect(faseDoPasso(p.n), `o passo ${p.n} ficou sem fase`).toBeGreaterThan(0)
    }
  })

  it('as etapas do banco se repartem entre as fases sem sobra e sem repetição', () => {
    const doRoteiro = ROTEIRO.flatMap((p) => p.etapas)
    const dasFases = [1, 2, 3].flatMap((n) => etapasDaFase(n))
    expect(new Set(dasFases).size).toBe(dasFases.length)
    expect(dasFases.sort()).toEqual(doRoteiro.sort())
  })
})

describe('a trilha do cliente usa as mesmas três fases', () => {
  it('a sequência das 18 etapas do portal é a mesma da esteira do painel', () => {
    /**
     * O portal do cliente e o painel da central desenham réguas diferentes —
     * uma de 18 etapas, outra de 11 passos — mas elas precisam ser a MESMA
     * esteira, na mesma ordem. Quando divergiam, o cliente lia "Diagnóstico"
     * numa ordem que a central chamava de outra coisa, e quem estava errado
     * era sempre o lado que o cliente vê.
     */
    expect(SEQUENCIA_DA_TRILHA).toEqual(ROTEIRO.flatMap((p) => p.etapas))
  })

  it('a etapa de uma ordem diz a fase sem precisar dos eventos', () => {
    expect(faseDaEtapa(E.EM_ROTA_RETIRADA)?.n).toBe(1)
    expect(faseDaEtapa(E.EM_MANUTENCAO)?.n).toBe(2)
    expect(faseDaEtapa(E.EM_ROTA_ENTREGA)?.n).toBe(3)
    // Os desvios não estão em fase nenhuma: estão fora da linha.
    expect(faseDaEtapa(E.CANCELADO)).toBeNull()
    expect(faseDaEtapa(E.ORCAMENTO_REPROVADO)).toBeNull()
  })
})

describe('de que cor está cada fase', () => {
  it('ordem recém-aberta: a primeira acontecendo, as outras esperando', () => {
    const f = montarRoteiro(E.ORDEM_RETIRADA_GERADA, [evento(E.ORDEM_RETIRADA_GERADA, 1)]).fases
    expect(f.map((x) => x.estado)).toEqual(['agora', 'adiante', 'adiante'])
    expect(f[0]!.selo).toBe('●')
    expect(f[1]!.selo).toBe('○')
    expect(faseViva(f)).toBe(1)
  })

  it('aparelho na bancada: a primeira fecha em verde e a segunda acende', () => {
    const f = montarRoteiro(E.EM_ANALISE, [
      evento(E.ORDEM_RETIRADA_GERADA, 1),
      evento(E.RETIRADA_AGENDADA, 2),
      evento(E.EM_ROTA_RETIRADA, 3),
      evento(E.COLETADO, 3),
      evento(E.RECEBIDO_NA_EMPRESA, 4),
      evento(E.EM_ANALISE, 4),
    ]).fases
    expect(f.map((x) => x.estado)).toEqual(['concluida', 'agora', 'adiante'])
    expect(f[0]!.feitos).toBe(f[0]!.total)
    expect(f[0]!.porcento).toBe(100)
    expect(f[0]!.selo).toBe('✓')
    // A data da fase é a da primeira etapa real dela, não a do passo 1 — que
    // não tem etapa e por isso nunca tem data.
    expect(f[0]!.quando).toEqual(new Date(2026, 8, 1))
    expect(faseViva(f)).toBe(2)
  })

  it('a fase viva diz em uma frase o que falta', () => {
    const f = montarRoteiro(E.EM_MANUTENCAO, [evento(E.EM_MANUTENCAO, 5)]).fases
    expect(f[1]!.estado).toBe('agora')
    expect(f[1]!.falta).toContain('conserto')
    // Só a fase viva tem essa frase: nas outras não há "agora" para descrever.
    expect(f[0]!.falta).toBeNull()
    expect(f[2]!.falta).toBeNull()
  })

  it('ordem finalizada: as três em verde, e nenhuma "acontecendo agora"', () => {
    const f = montarRoteiro(E.FINALIZADO, [
      evento(E.ORDEM_RETIRADA_GERADA, 1),
      evento(E.ENTREGUE, 20),
      evento(E.FINALIZADO, 21),
    ]).fases
    expect(f.map((x) => x.estado)).toEqual(['concluida', 'concluida', 'concluida'])
    expect(f.every((x) => x.porcento === 100)).toBe(true)
    expect(f.some((x) => x.situacao === 'Acontecendo agora')).toBe(false)
  })

  it('ordem cancelada: a fase onde ela parou não fica laranja de "acontecendo"', () => {
    const f = montarRoteiro(E.CANCELADO, [
      evento(E.ORDEM_RETIRADA_GERADA, 1),
      evento(E.RETIRADA_AGENDADA, 2),
      evento(E.CANCELADO, 3),
    ]).fases
    expect(f[0]!.estado).toBe('parada')
    expect(f[0]!.selo).toBe('!')
    expect(f[1]!.estado).toBe('adiante')
    expect(faseViva(f)).toBe(1)
  })

  it('orçamento recusado: para na fase 2, e a 3 nunca acende', () => {
    const f = montarRoteiro(E.ORCAMENTO_REPROVADO, [
      evento(E.COLETADO, 3),
      evento(E.RECEBIDO_NA_EMPRESA, 4),
      evento(E.ORCAMENTO_ENVIADO, 5),
      evento(E.ORCAMENTO_REPROVADO, 6),
    ]).fases
    expect(f[0]!.estado).toBe('concluida')
    expect(f[1]!.estado).toBe('parada')
    expect(f[2]!.estado).toBe('adiante')
  })
})

describe('quando é o cliente que despacha o aparelho', () => {
  it('a fase 1 muda de nome e as outras duas ficam iguais', () => {
    const eventos = [evento(E.ORDEM_RETIRADA_GERADA, 1)]
    const nossa = montarRoteiro(E.ORDEM_RETIRADA_GERADA, eventos).fases
    const dele = montarRoteiro(E.ORDEM_RETIRADA_GERADA, eventos, { viaCorreio: true }).fases

    expect(nossa[0]!.nome).toBe('Buscar o aparelho')
    expect(dele[0]!.nome).toBe('O aparelho chegar')
    expect(dele[0]!.quem).not.toContain('motorista')
    expect(dele[1]!.nome).toBe(nossa[1]!.nome)
    expect(dele[2]!.nome).toBe(nossa[2]!.nome)
  })
})
