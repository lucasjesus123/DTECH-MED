import { describe, expect, it } from 'vitest'
import { planoDaFalha } from './plano'
import { EsperandoWhatsapp } from '@/server/whatsapp/espera'

/**
 * O QUE ESTES TESTES PROTEGEM.
 *
 * Um aviso que o cliente nunca recebe não dá erro em tela nenhuma: ele
 * simplesmente não chega, e a empresa só descobre pelo telefone tocando. Foi
 * assim que a fila passou meses prometendo "as mensagens saem quando o WhatsApp
 * conectar" enquanto as descartava em trinta e um minutos.
 *
 * A regra que estes testes travam é uma só: **esperar não é tentar de novo.**
 */

const agora = new Date('2026-09-12T12:00:00Z')
const nascidoHa = (horas: number) => new Date(agora.getTime() - horas * 3_600_000)

const job = (p: { tentativas: number; horasDeVida?: number; max?: number }) => ({
  tentativas: p.tentativas,
  maxTentativas: p.max ?? 6,
  criadoEm: nascidoHa(p.horasDeVida ?? 0),
})

describe('falha passageira: repetir é o que resolve', () => {
  it('volta para a fila com espera dobrada, e gasta a tentativa', () => {
    const p = planoDaFalha(job({ tentativas: 1 }), new Error('rede caiu'), agora)
    expect(p.destino).toBe('nova-tentativa')
    expect(p.emMs).toBe(30_000)
    expect(p.tentativas).toBe(1)

    expect(planoDaFalha(job({ tentativas: 3 }), new Error('rede caiu'), agora).emMs).toBe(120_000)
  })

  it('a espera tem teto de 30 minutos', () => {
    const p = planoDaFalha(job({ tentativas: 20, max: 99 }), new Error('x'), agora)
    expect(p.emMs).toBe(30 * 60_000)
  })

  it('estourando as tentativas, é descartada com o motivo', () => {
    const p = planoDaFalha(job({ tentativas: 6 }), new Error('provedor recusou'), agora)
    expect(p.destino).toBe('descarte')
    expect(p.motivo).toContain('provedor recusou')
  })
})

describe('esperar o WhatsApp: repetir NÃO resolve', () => {
  const esperando = new EsperandoWhatsapp('O WhatsApp desta empresa ainda não foi conectado.')

  it('espera cinco minutos e DEVOLVE a tentativa que a tomada somou', () => {
    const p = planoDaFalha(job({ tentativas: 1 }), esperando, agora)
    expect(p.destino).toBe('espera')
    expect(p.emMs).toBe(5 * 60_000)
    // É este número que impede o aviso de morrer: sem ele, seis voltas e acabou.
    expect(p.tentativas).toBe(0)
  })

  it('esperando cem vezes, nunca estoura as tentativas', () => {
    // O caso real: o celular da empresa passou o fim de semana desligado.
    let tentativas = 0
    for (let volta = 0; volta < 100; volta++) {
      // A tomada soma 1 antes de processar; o plano é quem decide o resto.
      tentativas += 1
      const p = planoDaFalha(job({ tentativas, horasDeVida: 2 }), esperando, agora)
      expect(p.destino).toBe('espera')
      tentativas = p.tentativas
    }
    expect(tentativas).toBe(0)
  })

  it('passadas doze horas, o aviso vence em vez de sair atrasado', () => {
    const p = planoDaFalha(job({ tentativas: 1, horasDeVida: 13 }), esperando, agora)
    expect(p.destino).toBe('descarte')
    // O motivo é para uma pessoa ler na tela, não para o log da VPS.
    expect(p.motivo).toContain('13h')
    expect(p.motivo).toContain('ninguém recebeu')
    expect(p.motivo).toContain('Reenvie')
  })

  it('na véspera do prazo ainda espera; passado dele, não', () => {
    expect(planoDaFalha(job({ tentativas: 1, horasDeVida: 11 }), esperando, agora).destino).toBe(
      'espera',
    )
    expect(planoDaFalha(job({ tentativas: 1, horasDeVida: 12.5 }), esperando, agora).destino).toBe(
      'descarte',
    )
  })
})
