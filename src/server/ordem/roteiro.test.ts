import { describe, expect, it } from 'vitest'
import { EtapaOrdem as E } from '@/generated/prisma/enums'
import { ROTEIRO, TOTAL_DE_PASSOS, montarRoteiro, passoDaEtapa } from './roteiro'
import { TRANSICOES } from './maquina-estados'

/**
 * O roteiro é a tradução das 18 etapas para os 11 passos que a janela mostra.
 * O que estes testes protegem é a única coisa que pode quebrar em silêncio:
 * uma etapa nova entrar na máquina de estados e ficar sem passo — a ordem
 * chegaria nela e a régua não teria onde acender.
 */

const evento = (para: E, dia: number, quem = 'Lucas') => ({
  para,
  criadoEm: new Date(2026, 8, dia),
  autorNome: quem,
})

describe('o roteiro cobre a máquina de estados', () => {
  it('tem onze passos', () => {
    expect(TOTAL_DE_PASSOS).toBe(11)
    expect(ROTEIRO.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('não repete etapa em dois passos', () => {
    const todas = ROTEIRO.flatMap((p) => p.etapas)
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('dá passo a toda etapa que a máquina alcança, menos os desvios', () => {
    const desvios: E[] = [E.CANCELADO, E.DEVOLVIDO_SEM_REPARO, E.ORCAMENTO_REPROVADO]
    const alcancaveis = new Set<E>([E.SOLICITACAO_RECEBIDA])
    for (const t of TRANSICOES) {
      alcancaveis.add(t.de)
      alcancaveis.add(t.para)
    }
    for (const etapa of alcancaveis) {
      if (desvios.includes(etapa)) continue
      expect(passoDaEtapa(etapa), `a etapa ${etapa} ficou sem passo no roteiro`).toBeGreaterThan(0)
    }
  })
})

describe('onde a ordem está', () => {
  it('recém-aberta, está no passo 3 — falta dizer quem vai buscar', () => {
    const r = montarRoteiro(E.ORDEM_RETIRADA_GERADA, [evento(E.ORDEM_RETIRADA_GERADA, 1)])
    expect(r.atual).toBe(3)
    expect(r.passos[0]!.estado).toBe('cumprido') // o orçamento combinado
    expect(r.passos[1]!.estado).toBe('cumprido') // a abertura
    expect(r.passos[2]!.estado).toBe('agora')
    expect(r.passos[3]!.estado).toBe('adiante')
  })

  it('mostra a etapa exata dentro do passo que agrupa cinco', () => {
    const r = montarRoteiro(E.ORCAMENTO_ENVIADO, [
      evento(E.RECEBIDO_NA_EMPRESA, 2),
      evento(E.EM_ANALISE, 3),
      evento(E.ORCAMENTO_INTERNO, 4),
      evento(E.ORCAMENTO_ENVIADO, 5),
    ])
    expect(r.atual).toBe(7)
    const passo = r.passos[6]!
    expect(passo.estado).toBe('agora')
    expect(passo.detalhe).toBe('Orçamento enviado')
    // A data é a da ENTRADA no passo, não a da etapa atual.
    expect(passo.quando).toEqual(new Date(2026, 8, 2))
  })

  it('a ordem que voltou atrás guarda a primeira passagem', () => {
    const r = montarRoteiro(E.EM_ANALISE, [
      evento(E.RECEBIDO_NA_EMPRESA, 2),
      evento(E.EM_ANALISE, 3),
      evento(E.ORCAMENTO_INTERNO, 4),
      evento(E.EM_ANALISE, 6, 'Gestora'),
    ])
    expect(r.passos[6]!.quando).toEqual(new Date(2026, 8, 2))
  })

  it('finalizada, enche a régua', () => {
    const r = montarRoteiro(E.FINALIZADO, [evento(E.FINALIZADO, 20)])
    expect(r.atual).toBe(11)
    expect(r.porcento).toBe(100)
    expect(r.passos.every((p) => p.estado === 'cumprido' || p.estado === 'agora')).toBe(true)
  })
})

describe('quando a ordem sai do caminho', () => {
  it('cancelada, a régua para no último passo real e diz o motivo', () => {
    const r = montarRoteiro(E.CANCELADO, [
      evento(E.ORDEM_RETIRADA_GERADA, 1),
      evento(E.RETIRADA_AGENDADA, 2),
      evento(E.CANCELADO, 3),
    ])
    expect(r.atual).toBe(0)
    expect(r.desvio?.rotulo).toBe('Cancelado')
    // Chegou até "dia e motorista": nenhum passo além dele fica aceso.
    expect(r.passos[3]!.estado).toBe('agora')
    expect(r.passos[4]!.estado).toBe('adiante')
  })
})

describe('quando é o cliente que envia', () => {
  it('quatro passos mudam de redação, e a posição não muda', () => {
    const eventos = [evento(E.ORDEM_RETIRADA_GERADA, 1), evento(E.RETIRADA_AGENDADA, 2)]
    const nossa = montarRoteiro(E.RETIRADA_AGENDADA, eventos)
    const dele = montarRoteiro(E.RETIRADA_AGENDADA, eventos, { viaCorreio: true })

    expect(nossa.atual).toBe(dele.atual)
    expect(nossa.passos[3]!.nome).toBe('Dia e motorista')
    expect(dele.passos[3]!.nome).toBe('Aguardando chegar')
    expect(dele.passos[4]!.nome).toBe('A caminho')
    expect(dele.passos[5]!.nome).toBe('Despachado')
    // O que não é da rua continua igual nos dois.
    expect(dele.passos[7]!.nome).toBe(nossa.passos[7]!.nome)
  })
})
