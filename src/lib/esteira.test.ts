import { describe, expect, it } from 'vitest'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { TRANSICOES, validarTransicao } from '@/server/ordem/maquina-estados'
import {
  COLUNAS_ESTEIRA,
  ESTEIRA,
  acaoDaVez,
  estadoDaEtapa,
  etapasDoPapel,
} from './esteira'

/**
 * A ESTEIRA ENXUTA É REGRA, E POR ISSO TEM TESTE.
 *
 * =============================================================================
 * O QUE ESTES TESTES PROTEGEM
 * =============================================================================
 * O redesenho promete duas coisas ao mesmo tempo, e elas puxam em direções
 * opostas:
 *
 *   · MENOS CLIQUES — 18 etapas viraram 13 degraus, e alguns botões disparam
 *     mais de um salto.
 *   · MESMA AUDITORIA — cada salto continua sendo um evento com autor e
 *     horário próprios, e nenhuma permissão foi afrouxada para caber no
 *     desenho.
 *
 * A maneira de quebrar a segunda sem ninguém notar é uma fusão que "pula" um
 * passo, ou um botão que aparece para quem o motor vai recusar. Os testes
 * abaixo perguntam isso ao próprio motor, e não a uma lista escrita à mão.
 */

const TODAS_AS_ETAPAS = Object.values(EtapaOrdem)
const TODOS_OS_PAPEIS = Object.values(Papel)

describe('o mapa das etapas', () => {
  it('cobre TODAS as etapas do banco — nenhuma O.S. pode ficar sem casa', () => {
    const semCasa = TODAS_AS_ETAPAS.filter(
      (e) => estadoDaEtapa(e).chave === 'DESCONHECIDO',
    )
    // Se este teste quebrar, alguém acrescentou uma etapa ao enum e esqueceu de
    // dizer em que degrau da esteira ela aparece. A tela não quebraria: ela
    // mostraria o nome cru do enum para o operador, ou sumiria com a O.S. do
    // quadro. As duas coisas são piores que um teste vermelho.
    expect(semCasa).toEqual([])
  })

  it('tem exatamente os 13 degraus do caminho feliz, numerados de 1 a 13', () => {
    expect(COLUNAS_ESTEIRA).toHaveLength(13)
    expect(COLUNAS_ESTEIRA.map((c) => c.passo)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ])
  })

  it('não perde nenhuma etapa: a soma dos degraus e desvios é o enum inteiro', () => {
    const cobertas = new Set(ESTEIRA.flatMap((e) => e.etapas))
    expect(cobertas.size).toBe(TODAS_AS_ETAPAS.length)
  })

  it('não repete etapa em dois degraus — senão o Kanban mostraria a mesma O.S. duas vezes', () => {
    const vistas = new Set<EtapaOrdem>()
    for (const estado of ESTEIRA) {
      for (const etapa of estado.etapas) {
        expect(vistas.has(etapa)).toBe(false)
        vistas.add(etapa)
      }
    }
  })

  it('mantém os desvios fora da contagem de degraus', () => {
    for (const desvio of ESTEIRA.filter((e) => e.desvio)) {
      expect(desvio.passo).toBeNull()
    }
  })
})

describe('o botão-da-vez', () => {
  it('nunca oferece um salto que o motor vai recusar', () => {
    // Esta é a garantia central. Se ela cair, existe um botão grande e colorido
    // na tela de alguém que devolve "seu perfil não tem permissão" ao ser
    // clicado — que é exatamente o defeito que o redesenho veio tirar.
    for (const papel of TODOS_OS_PAPEIS) {
      for (const etapa of TODAS_AS_ETAPAS) {
        const acao = acaoDaVez(etapa, papel)
        if (!acao) continue

        let de = etapa
        for (const para of acao.passos) {
          const v = validarTransicao({ de, para, papel })
          expect(
            v.ok,
            `${papel} em ${etapa}: o botão "${acao.rotulo}" promete ${de} → ${para}, e o motor recusa`,
          ).toBe(true)
          de = para
        }
      }
    }
  })

  it('encadeia os saltos: cada passo parte de onde o anterior chegou', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      for (const etapa of TODAS_AS_ETAPAS) {
        const acao = acaoDaVez(etapa, papel)
        if (!acao || acao.passos.length < 2) continue

        let de = etapa
        for (const para of acao.passos) {
          const existe = TRANSICOES.some((t) => t.de === de && t.para === para)
          expect(existe, `não existe transição ${de} → ${para}`).toBe(true)
          de = para
        }
      }
    }
  })

  it('marca como fundida exatamente a ação que dispara mais de um salto', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      for (const etapa of TODAS_AS_ETAPAS) {
        const acao = acaoDaVez(etapa, papel)
        if (!acao) continue
        expect(acao.fundida).toBe(acao.passos.length > 1)
      }
    }
  })
})

describe('a fusão é elástica — ela anda até onde o papel alcança', () => {
  it('para o TÉCNICO, "emitir laudo" para no laudo: enviar orçamento é da gestão', () => {
    const acao = acaoDaVez(EtapaOrdem.EM_ANALISE, Papel.TECNICO)
    expect(acao).not.toBeNull()
    expect(acao!.passos).toEqual([EtapaOrdem.ORCAMENTO_INTERNO])
    expect(acao!.fundida).toBe(false)
    // O rótulo precisa contar a verdade do que o clique vai fazer. Prometer
    // "laudo + orçamento" e entregar só o laudo é pior que dois botões.
    expect(acao!.rotulo).toBe('Emitir laudo')
  })

  it('para a GESTÃO, o mesmo botão vale por dois saltos', () => {
    for (const papel of [Papel.GESTOR, Papel.ADMIN_EMPRESA]) {
      const acao = acaoDaVez(EtapaOrdem.EM_ANALISE, papel)
      expect(acao).not.toBeNull()
      expect(acao!.passos).toEqual([
        EtapaOrdem.ORCAMENTO_INTERNO,
        EtapaOrdem.ORCAMENTO_ENVIADO,
      ])
      expect(acao!.fundida).toBe(true)
      expect(acao!.rotulo).toBe('Emitir laudo + orçamento')
    }
  })

  it('"aprovar conferência" funde conferir e liberar, e é só da gestão', () => {
    const daGestao = acaoDaVez(EtapaOrdem.MANUTENCAO_CONCLUIDA, Papel.GESTOR)
    expect(daGestao!.passos).toEqual([EtapaOrdem.APROVACAO_GESTAO, EtapaOrdem.FATURAMENTO])
    expect(daGestao!.fundida).toBe(true)

    // O técnico consegue empurrar para a conferência, e não liberar o
    // faturamento — o segundo salto é da gestão, e o rótulo muda junto.
    const doTecnico = acaoDaVez(EtapaOrdem.MANUTENCAO_CONCLUIDA, Papel.TECNICO)
    expect(doTecnico!.passos).toEqual([EtapaOrdem.APROVACAO_GESTAO])
    expect(doTecnico!.rotulo).toBe('Enviar para conferência')
  })

  it('o financeiro não recebe o botão da bancada, e o técnico não recebe o do caixa', () => {
    expect(acaoDaVez(EtapaOrdem.COLETADO, Papel.FINANCEIRO)).toBeNull()
    expect(acaoDaVez(EtapaOrdem.FATURAMENTO, Papel.TECNICO)).toBeNull()
  })

  it('não oferece ação nenhuma nas etapas terminais', () => {
    expect(acaoDaVez(EtapaOrdem.FINALIZADO, Papel.ADMIN_EMPRESA)).toBeNull()
    expect(acaoDaVez(EtapaOrdem.CANCELADO, Papel.ADMIN_EMPRESA)).toBeNull()
  })

  it('a aprovação do cliente NÃO vira botão de ninguém aqui dentro', () => {
    // Aprovar em nome do cliente destruiria o valor jurídico da assinatura. O
    // caminho dela é o portal público, e nenhum papel interno pode encurtá-lo.
    for (const papel of TODOS_OS_PAPEIS) {
      const acao = acaoDaVez(EtapaOrdem.ORCAMENTO_ENVIADO, papel)
      expect(acao, `${papel} não pode ter botão em ORCAMENTO_ENVIADO`).toBeNull()
    }
  })
})

describe('a fila de cada papel', () => {
  it('dá trabalho a todo papel que opera a esteira', () => {
    for (const papel of [
      Papel.ADMIN_EMPRESA,
      Papel.GESTOR,
      Papel.FINANCEIRO,
      Papel.ATENDENTE,
      Papel.TECNICO,
      Papel.MOTORISTA,
    ]) {
      expect(etapasDoPapel(papel).length, `${papel} ficou sem nenhuma etapa`).toBeGreaterThan(0)
    }
  })

  it('o motorista só recebe etapas de rua', () => {
    const dele = etapasDoPapel(Papel.MOTORISTA)
    expect(dele).toContain(EtapaOrdem.RETIRADA_AGENDADA)
    expect(dele).toContain(EtapaOrdem.EM_ROTA_ENTREGA)
    // Nada de bancada nem de caixa na fila de quem está dirigindo.
    expect(dele).not.toContain(EtapaOrdem.EM_ANALISE)
    expect(dele).not.toContain(EtapaOrdem.FATURAMENTO)
  })

  it('o financeiro só recebe a etapa de cobrança', () => {
    expect(etapasDoPapel(Papel.FINANCEIRO)).toEqual([EtapaOrdem.FATURAMENTO])
  })
})
