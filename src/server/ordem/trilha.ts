import { EtapaOrdem as E } from '@/generated/prisma/enums'
import { ROTULO_ETAPA } from './maquina-estados'

/**
 * A TRILHA: onde o equipamento está, numa linha.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * A ficha já mostrava a linha do tempo — a lista dos eventos, de baixo para
 * cima. Ela responde "o que aconteceu", e responde bem. O que ela NÃO responde
 * é a pergunta que se faz cem vezes por dia no balcão, com o cliente no
 * telefone: **onde é que está o aparelho dele?**
 *
 * Para responder isso, uma lista obriga a ler. Uma linha se olha. É a diferença
 * entre consultar e ver.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O CÁLCULO MORA AQUI, E NÃO NA TELA
 * ---------------------------------------------------------------------------
 * A mesma trilha aparece em três lugares: na ficha da ordem, na lista de ordens
 * (versão curta) e no portal que o CLIENTE abre. Se cada tela decidisse por
 * conta própria em que ponto a peça está, um dia elas discordariam — e a que
 * estaria errada seria justamente a do cliente, que é a única que ele vê.
 *
 * Aqui a conta é feita uma vez, a partir da etapa atual e dos eventos que
 * realmente aconteceram. As telas só desenham.
 */

/** O nó da trilha, do jeito que a tela precisa. */
export type NoDaTrilha = {
  etapa: E
  rotulo: string
  /** 1 a 18 — o número que a pessoa conta no dedo. */
  passo: number
  estado: 'cumprido' | 'agora' | 'adiante'
  /** Quando passou por aqui, se passou. */
  quando: Date | null
  /** Quem fez, se ficou registrado. */
  quem: string | null
}

export type Fase = {
  nome: string
  /** Quem toca esta fase. Aparece como legenda. */
  quem: string
  nos: NoDaTrilha[]
}

export type Trilha = {
  fases: Fase[]
  /** Quantos dos 18 já foram cumpridos. */
  cumpridos: number
  total: number
  /** De 0 a 100, para a barra curta e para a régua preenchida. */
  porcento: number
  /** A etapa em que a peça está agora, com nome de gente. */
  agora: string
  /**
   * Quando a ordem sai do caminho normal, a trilha PARA e diz o motivo. Uma
   * régua que continua andando depois de um cancelamento mente.
   */
  desvio: { rotulo: string; quando: Date | null } | null
}

/**
 * As 18 etapas do caminho normal, agrupadas nas quatro fases do processo.
 *
 * Os ramos alternativos (recusado, devolvido, cancelado) NÃO entram na régua:
 * eles não são posições no caminho, são saídas dele. Aparecem como desvio.
 */
const CAMINHO: ReadonlyArray<{ nome: string; quem: string; etapas: E[] }> = [
  {
    nome: 'Retirada',
    quem: 'central e motorista',
    etapas: [
      E.SOLICITACAO_RECEBIDA,
      E.ORDEM_RETIRADA_GERADA,
      E.RETIRADA_AGENDADA,
      E.EM_ROTA_RETIRADA,
      E.COLETADO,
    ],
  },
  {
    nome: 'Diagnóstico',
    quem: 'técnico e gestão',
    etapas: [E.RECEBIDO_NA_EMPRESA, E.EM_ANALISE, E.ORCAMENTO_INTERNO, E.ORCAMENTO_ENVIADO],
  },
  {
    nome: 'Execução',
    quem: 'cliente e técnico',
    etapas: [E.ORCAMENTO_APROVADO, E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, E.APROVACAO_GESTAO],
  },
  {
    nome: 'Fechamento',
    quem: 'financeiro e motorista',
    etapas: [E.FATURAMENTO, E.FATURADO, E.EM_ROTA_ENTREGA, E.ENTREGUE, E.FINALIZADO],
  },
]

/** As saídas do caminho. Não são posição na régua. */
const DESVIOS: readonly E[] = [E.CANCELADO, E.DEVOLVIDO_SEM_REPARO, E.ORCAMENTO_REPROVADO]

/** A sequência achatada, na ordem — a fonte da numeração de 1 a 18. */
const SEQUENCIA: readonly E[] = CAMINHO.flatMap((f) => f.etapas)

export const TOTAL_DE_PASSOS = SEQUENCIA.length

/**
 * Monta a trilha de uma ordem.
 *
 * `eventos` é a linha do tempo real — é dela que sai QUANDO cada etapa
 * aconteceu e QUEM a fez. Uma etapa marcada como cumprida sem evento por trás
 * seria a régua contando história que o prontuário não confirma.
 */
export function montarTrilha(
  etapaAtual: E,
  eventos: ReadonlyArray<{ para: E; criadoEm: Date; autorNome: string | null }>,
): Trilha {
  // O PRIMEIRO evento de cada etapa. Uma ordem que volta para trás (o orçamento
  // devolvido ao técnico, por exemplo) passa duas vezes pela mesma etapa; o que
  // interessa na régua é quando ela chegou ali pela primeira vez.
  const marcos = new Map<E, { quando: Date; quem: string | null }>()
  for (const ev of [...eventos].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())) {
    if (!marcos.has(ev.para)) marcos.set(ev.para, { quando: ev.criadoEm, quem: ev.autorNome })
  }

  const saiuDoCaminho = DESVIOS.includes(etapaAtual)

  /**
   * Onde a régua para.
   *
   * No caminho normal é a etapa atual. Num desvio, é a última etapa do caminho
   * pela qual a ordem realmente passou — porque foi até ali que o equipamento
   * chegou antes de sair da linha.
   */
  const indiceAtual = saiuDoCaminho
    ? SEQUENCIA.reduce((ultimo, etapa, i) => (marcos.has(etapa) ? i : ultimo), -1)
    : SEQUENCIA.indexOf(etapaAtual)

  const fases: Fase[] = CAMINHO.map((f) => ({
    nome: f.nome,
    quem: f.quem,
    nos: f.etapas.map((etapa) => {
      const i = SEQUENCIA.indexOf(etapa)
      const m = marcos.get(etapa) ?? null
      return {
        etapa,
        rotulo: ROTULO_ETAPA[etapa],
        passo: i + 1,
        estado: i < indiceAtual ? 'cumprido' : i === indiceAtual ? 'agora' : 'adiante',
        quando: m?.quando ?? null,
        quem: m?.quem ?? null,
      }
    }),
  }))

  const cumpridos = indiceAtual < 0 ? 0 : indiceAtual + 1

  return {
    fases,
    cumpridos,
    total: TOTAL_DE_PASSOS,
    // A régua enche até o CENTRO do nó atual, não até o fim dele: o passo em
    // que se está ainda não terminou.
    porcento: TOTAL_DE_PASSOS <= 1 ? 0 : Math.max(0, (indiceAtual / (TOTAL_DE_PASSOS - 1)) * 100),
    agora: ROTULO_ETAPA[etapaAtual],
    desvio: saiuDoCaminho
      ? { rotulo: ROTULO_ETAPA[etapaAtual], quando: marcos.get(etapaAtual)?.quando ?? null }
      : null,
  }
}
