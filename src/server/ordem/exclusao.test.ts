import { describe, expect, it } from 'vitest'
import { EtapaOrdem as E } from '@/generated/prisma/enums'
import { JA_ANDOU, podeExcluir, type PesoDaOrdem } from './exclusao'

/**
 * O que pode quebrar em silêncio aqui não é a função recusar demais — isso o
 * usuário reclama no mesmo dia. É ela DEIXAR PASSAR: um `pode: true` a mais e a
 * cascata do banco leva embora a assinatura de um cliente sem que ninguém veja
 * acontecer. Por isso todo teste abaixo tranca um caminho, e o caso liberado é
 * um só, escrito por inteiro.
 */

/** Uma ordem recém-aberta, sem nada pendurado nela. O único caso apagável. */
const limpa: PesoDaOrdem = {
  etapa: E.SOLICITACAO_RECEBIDA,
  jaColetada: false,
  assinaturas: 0,
  fotos: 0,
  pecasRetiradas: 0,
  movimentosEstoque: 0,
  temFatura: false,
  orcamentoAprovado: false,
  retornosDeGarantia: 0,
  documentos: 0,
}

const com = (p: Partial<PesoDaOrdem>): PesoDaOrdem => ({ ...limpa, ...p })

describe('a ordem que ainda não virou prova pode ser apagada', () => {
  it('a recém-aberta passa', () => {
    const v = podeExcluir(limpa)
    expect(v.pode).toBe(true)
  })

  it('os três primeiros passos, antes do aparelho sair do cliente, passam', () => {
    for (const etapa of [E.SOLICITACAO_RECEBIDA, E.ORDEM_RETIRADA_GERADA, E.RETIRADA_AGENDADA, E.EM_ROTA_RETIRADA]) {
      expect(podeExcluir(com({ etapa })).pode, `${etapa} deveria passar`).toBe(true)
    }
  })

  it('diz em voz alta o que vai ser destruído, e que não tem volta', () => {
    const v = podeExcluir(limpa)
    if (!v.pode) throw new Error('deveria passar')
    expect(v.avisos.length).toBeGreaterThan(0)
    expect(v.avisos.at(-1)).toBe('Não tem volta.')
  })
})

describe('cada prova tranca a exclusão, e oferece o cancelamento no lugar', () => {
  const casos: Array<[string, Partial<PesoDaOrdem>]> = [
    ['assinatura do cliente', { assinaturas: 1 }],
    ['fatura emitida', { temFatura: true }],
    ['orçamento aprovado pelo link', { orcamentoAprovado: true }],
    ['foto do aparelho', { fotos: 1 }],
    ['peça do cliente guardada', { pecasRetiradas: 1 }],
    ['baixa de estoque lançada', { movimentosEstoque: 1 }],
    ['aparelho já coletado', { jaColetada: true }],
  ]

  for (const [nome, peso] of casos) {
    it(`recusa com ${nome}`, () => {
      const v = podeExcluir(com(peso))
      expect(v.pode).toBe(false)
      if (v.pode) return
      expect(v.motivo.length).toBeGreaterThan(20)
      expect(v.alternativa).toContain('Cancele a ordem')
    })
  }
})

describe('a etapa atual sozinha não é o bastante', () => {
  it('toda etapa de COLETADO em diante é recusada', () => {
    for (const etapa of JA_ANDOU) {
      expect(podeExcluir(com({ etapa })).pode, `${etapa} deveria ser recusada`).toBe(false)
    }
  })

  it('a ordem cancelada DEPOIS de ter andado continua trancada', () => {
    /**
     * CANCELADO não está em JA_ANDOU — é um desvio, não um ponto da esteira. Se
     * a trava olhasse só para a etapa atual, bastaria cancelar uma ordem
     * inteira para ela virar apagável, e a cascata levaria a trilha junto. O
     * que fecha isso é a memória: por onde ela JÁ passou.
     */
    expect(podeExcluir(com({ etapa: E.CANCELADO, jaColetada: true })).pode).toBe(false)
  })

  it('a cancelada antes de qualquer coisa — o engano do dia — ainda pode sair', () => {
    expect(podeExcluir(com({ etapa: E.CANCELADO, jaColetada: false })).pode).toBe(true)
  })
})

describe('o que não tranca, avisa', () => {
  it('os PDFs gerados são avisados, não impedem', () => {
    const v = podeExcluir(com({ documentos: 2 }))
    expect(v.pode).toBe(true)
    if (!v.pode) return
    expect(v.avisos.join(' ')).toContain('PDFs')
  })

  it('a ordem que serve de origem de garantia avisa que o fio se perde', () => {
    const v = podeExcluir(com({ retornosDeGarantia: 1 }))
    expect(v.pode).toBe(true)
    if (!v.pode) return
    expect(v.avisos.join(' ')).toContain('garantia')
  })
})

describe('a recusa mais grave é a que aparece primeiro', () => {
  it('com assinatura e mais tudo, o motivo falado é a assinatura', () => {
    const v = podeExcluir(
      com({ assinaturas: 2, temFatura: true, fotos: 9, jaColetada: true, etapa: E.ENTREGUE }),
    )
    expect(v.pode).toBe(false)
    if (v.pode) return
    expect(v.motivo).toContain('2 assinaturas')
  })
})
