import { describe, expect, it } from 'vitest'
import { StatusOrcamento as S } from '@/generated/prisma/enums'
import {
  corpoDaOrdemDeServico,
  orcamentoQueVale,
  type OrdemParaDocumento,
} from './ordem-de-servico'

/**
 * O teste que importa aqui é o do vazamento.
 *
 * Os outros — bloco que aparece, bloco que some — o usuário reclama no mesmo
 * dia, olhando o papel. Já o `parecerTecnico` escapando na O.S. ninguém
 * percebe: o PDF sai bonito, o cliente recebe, e só muito depois alguém lê "o
 * aparelho está no fim da vida, não vale consertar" num documento que a
 * assistência assinou. Por isso ele é cobrado por fora, varrendo tudo que sai.
 */

const orcamento = (p: Partial<OrdemParaDocumento['orcamentos'][0]> = {}) => ({
  status: S.APROVADO,
  versao: 1,
  garantiaDias: 90,
  prazoExecucaoDias: 5,
  totalCentavos: 179500,
  itens: [
    { descricao: 'Fonte chaveada 24V', quantidade: 1, valorUnitCentavos: 68000, valorTotalCentavos: 68000 },
    { descricao: 'Mão de obra', quantidade: 1, valorUnitCentavos: 111500, valorTotalCentavos: 111500 },
  ],
  ...p,
})

const ordem = (p: Partial<OrdemParaDocumento> = {}): OrdemParaDocumento => ({
  diagnostico: 'Fonte de alimentação sem saída nos 24V. Capacitor C14 estufado.',
  servicoExecutado: null,
  testesFinais: null,
  garantiaAte: null,
  tecnico: { nome: 'Rafael Souza' },
  orcamentos: [orcamento()],
  ...p,
})

/** Tudo que a O.S. imprimiria, virado num texto só. */
const tudoQueSai = (o: OrdemParaDocumento) =>
  corpoDaOrdemDeServico(o)
    .map((s) =>
      s.tipo === 'bloco'
        ? [s.titulo, ...s.linhas.flat()].join(' ')
        : [...s.itens.map((i) => i.descricao), s.rodape].join(' '),
    )
    .join(' | ')

describe('o parecer interno NUNCA sai na O.S.', () => {
  const SEGREDO = 'Não vale consertar, cliente é encrenqueiro, aparelho no fim da vida'

  it('o texto do parecer não aparece em lugar nenhum do corpo', () => {
    /**
     * `OrdemParaDocumento` nem tem o campo — o recorte é a primeira barreira.
     * Este teste passa por cima do tipo de propósito: se um dia alguém
     * acrescentar `parecerTecnico` ao recorte "porque é prático ter", é aqui
     * que a conta chega.
     */
    const comParecer = { ...ordem(), parecerTecnico: SEGREDO } as OrdemParaDocumento
    expect(tudoQueSai(comParecer)).not.toContain('encrenqueiro')
    expect(tudoQueSai(comParecer)).not.toContain(SEGREDO)
  })

  it('o diagnóstico, esse, sai — é o que sustenta o preço e o cliente lê', () => {
    expect(tudoQueSai(ordem())).toContain('Capacitor C14 estufado')
  })
})

describe('o bloco de execução só existe depois de existir execução', () => {
  it('ordem ainda em manutenção não ganha um bloco de travessões', () => {
    const s = corpoDaOrdemDeServico(ordem())
    expect(s.find((x) => x.tipo === 'bloco' && x.titulo === 'O QUE FOI FEITO')).toBeUndefined()
  })

  it('com serviço executado, o bloco aparece', () => {
    const s = corpoDaOrdemDeServico(ordem({ servicoExecutado: 'Trocada a fonte inteira.' }))
    const bloco = s.find((x) => x.tipo === 'bloco' && x.titulo === 'O QUE FOI FEITO')
    expect(bloco).toBeDefined()
    expect(tudoQueSai(ordem({ servicoExecutado: 'Trocada a fonte inteira.' }))).toContain('fonte inteira')
  })

  it('texto só de espaços conta como vazio', () => {
    const s = corpoDaOrdemDeServico(ordem({ servicoExecutado: '   ', testesFinais: '\n' }))
    expect(s.find((x) => x.tipo === 'bloco' && x.titulo === 'O QUE FOI FEITO')).toBeUndefined()
  })

  it('o que foi ENCONTRADO sai mesmo vazio — a ausência também é um fato', () => {
    const s = corpoDaOrdemDeServico(ordem({ diagnostico: null, tecnico: null }))
    const bloco = s.find((x) => x.tipo === 'bloco' && x.titulo === 'O QUE FOI ENCONTRADO')
    expect(bloco).toBeDefined()
  })
})

describe('os valores são os do orçamento APROVADO', () => {
  it('um rascunho mais novo não toma o lugar do que o cliente assinou', () => {
    /**
     * O caso real: o técnico abre a versão 2 para reorçar uma peça extra, e ela
     * fica em rascunho. Pegar "a mais recente" poria na O.S. um valor que
     * ninguém combinou — e o cliente leria como cobrança.
     */
    const escolhido = orcamentoQueVale([
      orcamento({ versao: 2, status: S.RASCUNHO, totalCentavos: 999900 }),
      orcamento({ versao: 1, status: S.APROVADO, totalCentavos: 179500 }),
    ])
    expect(escolhido?.totalCentavos).toBe(179500)
  })

  it('sem nenhum aprovado, cai para a versão mais recente em vez de sair sem valor', () => {
    const escolhido = orcamentoQueVale([
      orcamento({ versao: 1, status: S.ENVIADO, totalCentavos: 100 }),
      orcamento({ versao: 3, status: S.ENVIADO, totalCentavos: 300 }),
    ])
    expect(escolhido?.versao).toBe(3)
  })

  it('sem orçamento nenhum, não inventa bloco de valores', () => {
    const s = corpoDaOrdemDeServico(ordem({ orcamentos: [] }))
    expect(s.find((x) => x.tipo === 'itens')).toBeUndefined()
  })

  it('orçamento sem itens não vira uma tabela vazia', () => {
    const s = corpoDaOrdemDeServico(ordem({ orcamentos: [orcamento({ itens: [] })] }))
    expect(s.find((x) => x.tipo === 'itens')).toBeUndefined()
  })
})

describe('a garantia é a linha que volta seis meses depois', () => {
  it('traz o prazo e a data de vencimento quando a ordem já foi entregue', () => {
    const s = corpoDaOrdemDeServico(ordem({ garantiaAte: new Date(2027, 0, 15) }))
    const g = s.find((x) => x.tipo === 'bloco' && x.titulo === 'GARANTIA')
    expect(g).toBeDefined()
    expect(tudoQueSai(ordem({ garantiaAte: new Date(2027, 0, 15) }))).toContain('15/01/2027')
  })

  it('antes da entrega diz de quando o prazo corre, em vez de uma data falsa', () => {
    expect(tudoQueSai(ordem())).toContain('a contar da entrega')
  })

  it('diz o que a garantia NÃO cobre — é onde mora a discussão', () => {
    expect(tudoQueSai(ordem())).toContain('oscilação da rede elétrica')
  })
})
