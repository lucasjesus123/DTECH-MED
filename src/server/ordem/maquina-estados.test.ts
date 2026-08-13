import { describe, expect, it } from 'vitest'
import { EtapaOrdem as E, Papel as P } from '@/generated/prisma/enums'
import {
  ROTULO_ETAPA,
  TERMINAIS,
  TRANSICOES,
  proximosPassos,
  validarTransicao,
} from './maquina-estados'

describe('integridade da tabela de transições', () => {
  it('toda etapa tem rótulo humano', () => {
    for (const etapa of Object.values(E)) {
      expect(ROTULO_ETAPA[etapa], `falta rótulo para ${etapa}`).toBeTruthy()
    }
  })

  it('não existe transição duplicada', () => {
    const vistas = new Set<string>()
    for (const t of TRANSICOES) {
      const chave = `${t.de}->${t.para}`
      expect(vistas.has(chave), `transição duplicada: ${chave}`).toBe(false)
      vistas.add(chave)
    }
  })

  it('toda etapa não terminal tem ao menos uma saída', () => {
    const semSaida = Object.values(E).filter(
      (e) => !TERMINAIS.includes(e) && !TRANSICOES.some((t) => t.de === e),
    )
    // Um beco sem saída trava o equipamento na oficina para sempre.
    expect(semSaida, `etapas sem saída: ${semSaida.join(', ')}`).toEqual([])
  })

  it('a jornada completa é percorrível do início ao fim', () => {
    // Prova que existe caminho de ponta a ponta: sem isso o sistema pode ter
    // uma tabela bonita e ainda assim ser impossível concluir um atendimento.
    const caminho: EtapaEsperada[] = [
      [E.SOLICITACAO_RECEBIDA, E.ORDEM_RETIRADA_GERADA, P.ATENDENTE],
      [E.ORDEM_RETIRADA_GERADA, E.RETIRADA_AGENDADA, P.ATENDENTE],
      [E.RETIRADA_AGENDADA, E.EM_ROTA_RETIRADA, P.MOTORISTA],
      [E.EM_ROTA_RETIRADA, E.COLETADO, P.MOTORISTA],
      [E.COLETADO, E.RECEBIDO_NA_EMPRESA, P.TECNICO],
      [E.RECEBIDO_NA_EMPRESA, E.EM_ANALISE, P.TECNICO],
      [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.TECNICO],
      [E.ORCAMENTO_INTERNO, E.ORCAMENTO_ENVIADO, P.GESTOR],
      [E.ORCAMENTO_APROVADO, E.EM_MANUTENCAO, P.TECNICO],
      [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, P.TECNICO],
      [E.MANUTENCAO_CONCLUIDA, E.APROVACAO_GESTAO, P.TECNICO],
      [E.APROVACAO_GESTAO, E.FATURAMENTO, P.GESTOR],
      [E.FATURAMENTO, E.FATURADO, P.FINANCEIRO],
      [E.FATURADO, E.EM_ROTA_ENTREGA, P.MOTORISTA],
      [E.EM_ROTA_ENTREGA, E.ENTREGUE, P.MOTORISTA],
      [E.ENTREGUE, E.FINALIZADO, P.GESTOR],
    ]
    for (const [de, para, papel] of caminho) {
      const r = validarTransicao({ de, para, papel })
      expect(r.ok, `bloqueado: ${de} -> ${para} como ${papel}`).toBe(true)
    }
  })
})

type EtapaEsperada = [E, E, P]

describe('saltos proibidos', () => {
  it('não dá para faturar sem ter orçado', () => {
    const r = validarTransicao({ de: E.RECEBIDO_NA_EMPRESA, para: E.FATURADO, papel: P.GESTOR })
    expect(r.ok).toBe(false)
  })

  it('não dá para entregar um equipamento que nem foi consertado', () => {
    const r = validarTransicao({ de: E.COLETADO, para: E.ENTREGUE, papel: P.MOTORISTA })
    expect(r.ok).toBe(false)
  })

  it('ordem finalizada não volta a andar', () => {
    const r = validarTransicao({ de: E.FINALIZADO, para: E.EM_MANUTENCAO, papel: P.GESTOR })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/encerrada/i)
  })

  it('recusar não é ficar mudo: a mensagem diz o que dá para fazer', () => {
    const r = validarTransicao({ de: E.EM_ANALISE, para: E.ENTREGUE, papel: P.TECNICO })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo.length).toBeGreaterThan(20)
      // Nada de nome de enum vazando para a tela do operador.
      expect(r.motivo).not.toMatch(/[A-Z]{3,}_[A-Z]/)
    }
  })
})

describe('quem pode o quê', () => {
  it('motorista não fecha orçamento', () => {
    const r = validarTransicao({
      de: E.ORCAMENTO_INTERNO,
      para: E.ORCAMENTO_ENVIADO,
      papel: P.MOTORISTA,
    })
    expect(r.ok).toBe(false)
  })

  it('técnico não dá baixa financeira', () => {
    const r = validarTransicao({ de: E.FATURAMENTO, para: E.FATURADO, papel: P.TECNICO })
    expect(r.ok).toBe(false)
  })

  it('atendente não cancela ordem', () => {
    const r = validarTransicao({ de: E.EM_MANUTENCAO, para: E.CANCELADO, papel: P.ATENDENTE })
    expect(r.ok).toBe(false)
  })

  it('gestor cancela', () => {
    const r = validarTransicao({ de: E.EM_MANUTENCAO, para: E.CANCELADO, papel: P.GESTOR })
    expect(r.ok).toBe(true)
  })
})

describe('a aprovação pertence ao cliente', () => {
  it('nenhum funcionário aprova orçamento no lugar dele', () => {
    // Aprovar em nome do cliente destruiria o valor jurídico da assinatura:
    // o contrato deixaria de provar que ele concordou.
    for (const papel of Object.values(P)) {
      const r = validarTransicao({
        de: E.ORCAMENTO_ENVIADO,
        para: E.ORCAMENTO_APROVADO,
        papel,
      })
      expect(r.ok, `${papel} conseguiu aprovar pelo cliente`).toBe(false)
    }
  })

  it('nem o super admin aprova pelo cliente', () => {
    const r = validarTransicao({
      de: E.ORCAMENTO_ENVIADO,
      para: E.ORCAMENTO_APROVADO,
      papel: P.SUPER_ADMIN,
    })
    expect(r.ok).toBe(false)
  })

  it('pelo portal, com o documento conferido, passa', () => {
    const r = validarTransicao({
      de: E.ORCAMENTO_ENVIADO,
      para: E.ORCAMENTO_APROVADO,
      papel: P.ATENDENTE,
      viaPortalCliente: true,
    })
    expect(r.ok).toBe(true)
  })
})

describe('pré-condições declaradas', () => {
  it('coleta exige assinatura', () => {
    const t = TRANSICOES.find((x) => x.de === E.EM_ROTA_RETIRADA && x.para === E.COLETADO)
    expect(t?.exige).toContain('ASSINATURA_RETIRADA')
  })

  it('entrada na oficina exige as seis fotos', () => {
    const t = TRANSICOES.find((x) => x.de === E.COLETADO && x.para === E.RECEBIDO_NA_EMPRESA)
    expect(t?.exige).toContain('MIN_6_FOTOS')
  })

  it('faturar exige fatura quitada', () => {
    const t = TRANSICOES.find((x) => x.de === E.FATURAMENTO && x.para === E.FATURADO)
    expect(t?.exige).toContain('FATURA_QUITADA')
  })

  it('entregar exige assinatura de recebimento', () => {
    const t = TRANSICOES.find((x) => x.de === E.EM_ROTA_ENTREGA && x.para === E.ENTREGUE)
    expect(t?.exige).toContain('ASSINATURA_ENTREGA')
  })

  it('iniciar manutenção exige orçamento aprovado', () => {
    const t = TRANSICOES.find((x) => x.de === E.ORCAMENTO_APROVADO && x.para === E.EM_MANUTENCAO)
    expect(t?.exige).toContain('ORCAMENTO_APROVADO')
  })
})

describe('próximos passos por papel', () => {
  it('o motorista só vê o que ele mesmo faz', () => {
    const p = proximosPassos(E.EM_ROTA_RETIRADA, P.MOTORISTA)
    expect(p.map((t) => t.para)).toEqual([E.COLETADO])
  })

  it('etapa terminal não oferece botão nenhum', () => {
    expect(proximosPassos(E.FINALIZADO, P.GESTOR)).toEqual([])
    expect(proximosPassos(E.CANCELADO, P.SUPER_ADMIN)).toEqual([])
  })

  it('a aprovação do cliente não vira botão para funcionário', () => {
    const p = proximosPassos(E.ORCAMENTO_ENVIADO, P.GESTOR)
    expect(p.map((t) => t.para)).not.toContain(E.ORCAMENTO_APROVADO)
  })
})
