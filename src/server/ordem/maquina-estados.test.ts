import { describe, expect, it } from 'vitest'
import { EtapaOrdem as E, Papel as P } from '@/generated/prisma/enums'
import {
  AUTOMATICAS,
  ROTULO_ETAPA,
  TERMINAIS,
  TRANSICOES,
  proximosPassos,
  validarTransicao,
} from './maquina-estados'

describe('as travas que protegem a prova e o estoque', () => {
  const exigencia = (de: E, para: E) =>
    TRANSICOES.find((t) => t.de === de && t.para === para)?.exige ?? []

  it('não conclui manutenção sem dizer o que saiu do estoque', () => {
    // A peça não lançada aqui não é lançada nunca: depois deste ponto a ordem
    // vai para a gestão, para o financeiro e para a rua.
    expect(exigencia(E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA)).toContain('PECAS_DECLARADAS')
  })

  it('não coleta nem entrega sem assinatura', () => {
    expect(exigencia(E.EM_ROTA_RETIRADA, E.COLETADO)).toContain('ASSINATURA_RETIRADA')
    expect(exigencia(E.EM_ROTA_ENTREGA, E.ENTREGUE)).toContain('ASSINATURA_ENTREGA')
  })

  it('não agenda retirada nem entrega sem parada marcada', () => {
    expect(exigencia(E.ORDEM_RETIRADA_GERADA, E.RETIRADA_AGENDADA)).toContain('PARADA_DE_RETIRADA')
    expect(exigencia(E.FATURADO, E.EM_ROTA_ENTREGA)).toContain('PARADA_DE_ENTREGA')
  })
})

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

/**
 * QUEM PODE FECHAR O LAUDO E A MANUTENÇÃO.
 *
 * Estes dois passos eram exclusivos do técnico, e numa oficina de três pessoas
 * o dono faz os dois papéis. O que protege a esteira aqui NÃO é o papel — é a
 * exigência: sem diagnóstico o laudo não fecha, sem declaração de peça a
 * manutenção não conclui, para quem quer que seja. Estes testes prendem as
 * duas metades: a gestão entrou, o motorista continua de fora.
 */
describe('a gestão fecha pelo técnico, o resto da casa não', () => {
  const podem: Array<[E, E, P]> = [
    [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.ADMIN_EMPRESA],
    [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.GESTOR],
    [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, P.ADMIN_EMPRESA],
    [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, P.GESTOR],
  ]
  for (const [de, para, papel] of podem) {
    it(`${papel} fecha ${de} → ${para}`, () => {
      expect(validarTransicao({ de, para, papel }).ok).toBe(true)
    })
  }

  const naoPodem: Array<[E, E, P]> = [
    [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.MOTORISTA],
    [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.ATENDENTE],
    [E.EM_ANALISE, E.ORCAMENTO_INTERNO, P.FINANCEIRO],
    [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, P.MOTORISTA],
    [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, P.ATENDENTE],
  ]
  for (const [de, para, papel] of naoPodem) {
    it(`${papel} NÃO fecha ${de} → ${para}`, () => {
      expect(validarTransicao({ de, para, papel }).ok).toBe(false)
    })
  }
})


/**
 * O PASSO QUE O SISTEMA DÁ SOZINHO.
 *
 * =============================================================================
 * O RISCO QUE ESTES TESTES GUARDAM
 * =============================================================================
 * `viaSistema` existe para uma coisa só: encerrar a O.S. entregue que já está
 * paga, sem obrigar a gestão a clicar no que não tem decisão nenhuma.
 *
 * O jeito de isso dar errado é o sinal virar um passe livre — hoje por
 * conveniência, amanhã por pressa, e um dia alguém contornaria a esteira
 * inteira passando `viaSistema: true`. Os testes abaixo existem para que essa
 * tentativa quebre um teste antes de quebrar a auditoria de alguém.
 */
describe('o que o sistema pode fazer sozinho', () => {
  it('é uma lista curta, e cada par dela existe de verdade na esteira', () => {
    expect(AUTOMATICAS.length).toBeGreaterThan(0)
    for (const a of AUTOMATICAS) {
      const existe = TRANSICOES.some((t) => t.de === a.de && t.para === a.para)
      expect(existe, `${a.de} → ${a.para} não é uma transição da esteira`).toBe(true)
    }
  })

  it('encerra a entrega assinada — o passo que a baixa automática precisa', () => {
    const r = validarTransicao({
      de: E.ENTREGUE,
      para: E.FINALIZADO,
      // O papel do ator automático é indiferente aqui: quem autoriza é a lista.
      papel: P.MOTORISTA,
      viaSistema: true,
    })
    expect(r.ok).toBe(true)
  })

  it('NÃO vira passe livre: fora da lista, o sinal não autoriza nada', () => {
    const forasDaLista: Array<[E, E]> = [
      // Faturar sem o financeiro.
      [E.FATURAMENTO, E.FATURADO],
      // Aprovar o orçamento no lugar do cliente — o pior de todos.
      [E.ORCAMENTO_ENVIADO, E.ORCAMENTO_APROVADO],
      // Liberar o faturamento sem a conferência da gestão.
      [E.APROVACAO_GESTAO, E.FATURAMENTO],
      // Dar entrada na bancada sem as fotos.
      [E.COLETADO, E.RECEBIDO_NA_EMPRESA],
    ]
    for (const [de, para] of forasDaLista) {
      const r = validarTransicao({ de, para, papel: P.MOTORISTA, viaSistema: true })
      expect(r.ok, `${de} → ${para} foi autorizado por viaSistema, e não deveria`).toBe(false)
    }
  })

  it('não inventa transição: um par que não existe continua não existindo', () => {
    const r = validarTransicao({
      de: E.SOLICITACAO_RECEBIDA,
      para: E.FINALIZADO,
      papel: P.ADMIN_EMPRESA,
      viaSistema: true,
    })
    expect(r.ok).toBe(false)
  })

  it('não ressuscita ordem encerrada', () => {
    for (const terminal of TERMINAIS) {
      const r = validarTransicao({
        de: terminal,
        para: E.EM_MANUTENCAO,
        papel: P.ADMIN_EMPRESA,
        viaSistema: true,
      })
      expect(r.ok).toBe(false)
    }
  })
})

/**
 * O TÉCNICO PASSOU A ENVIAR ORÇAMENTO — decisão do dono, com o custo na mesa.
 *
 * O segundo par de olhos antes do envio deixou de existir. O que continua
 * protegendo o passo é a exigência de orçamento montado (nada de valor zerado
 * indo para o cliente) e a trilha, que grava quem enviou.
 *
 * Este teste marca a decisão. Se um dia ela for revertida, é aqui que a
 * reversão aparece — e não numa tela que passou a esconder um botão.
 */
describe('quem manda o orçamento para o cliente', () => {
  const enviam: P[] = [P.TECNICO, P.GESTOR, P.ADMIN_EMPRESA]
  for (const papel of enviam) {
    it(`${papel} envia`, () => {
      expect(
        validarTransicao({ de: E.ORCAMENTO_INTERNO, para: E.ORCAMENTO_ENVIADO, papel }).ok,
      ).toBe(true)
    })
  }

  const naoEnviam: P[] = [P.ATENDENTE, P.FINANCEIRO, P.MOTORISTA]
  for (const papel of naoEnviam) {
    it(`${papel} NÃO envia`, () => {
      expect(
        validarTransicao({ de: E.ORCAMENTO_INTERNO, para: E.ORCAMENTO_ENVIADO, papel }).ok,
      ).toBe(false)
    })
  }
})
