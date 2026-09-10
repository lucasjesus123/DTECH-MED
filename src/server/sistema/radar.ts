import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso, type Transacao } from '@/lib/db'
import { acaoDaVez, estadoDaEtapa, etapasDoPapel, type AcaoDaVez, type EstadoEsteira } from '@/lib/esteira'

/**
 * O RADAR — "o que eu preciso fazer agora".
 *
 * =============================================================================
 * A INVERSÃO QUE ESTE ARQUIVO FAZ
 * =============================================================================
 * Um sistema comum mostra tudo e espera a pessoa decidir. O dono do DTECH
 * descreveu o custo disso com todas as letras: *"ninguém sabe o que fazer ao
 * entrar"*.
 *
 * O Radar inverte a pergunta. Em vez de listar as ordens e deixar a pessoa
 * procurar as dela, ele pergunta ao motor da esteira quais ETAPAS este papel
 * consegue mover, e traz só as ordens paradas nelas. O que sobra na tela é,
 * literalmente, a fila de trabalho daquela pessoa.
 *
 * =============================================================================
 * POR QUE A LISTA DE ETAPAS NÃO ESTÁ ESCRITA AQUI
 * =============================================================================
 * Ela sai de `etapasDoPapel`, que por sua vez pergunta ao `validarTransicao` do
 * motor. Escrever "o técnico cuida de COLETADO, RECEBIDO, EM_ANALISE…" à mão
 * seria uma terceira cópia da regra de permissão — e no dia em que alguém
 * mudasse quem pode fechar um laudo, o painel continuaria prometendo trabalho
 * que a pessoa não pode mais fazer, ou escondendo trabalho que ela pode.
 *
 * =============================================================================
 * O RECORTE POR PAPEL É DE CONSULTA, NÃO DE TELA
 * =============================================================================
 * O filtro entra no `where`. A ordem que não é trabalho desta pessoa não viaja
 * pelo fio até o navegador dela para ser escondida com CSS depois — ela não é
 * lida. É o mesmo cuidado que o Dashboard antigo aprendeu a ter com o dinheiro:
 * *"filtrar depois, na renderização, mandaria o valor pelo fio até o navegador
 * de quem não deve vê-lo, onde qualquer um lê no inspetor"*.
 */

export type LinhaRadar = {
  id: string
  numero: number
  etapa: EtapaOrdem
  estado: EstadoEsteira
  acao: AcaoDaVez | null
  cliente: string
  clienteId: string
  equipamento: string
  tecnico: string | null
  atualizadoEm: Date
  prazoPrometido: Date | null
  /** Há quantos dias esta O.S. não anda. É o número que ordena a fila. */
  diasParado: number
  atrasada: boolean
  urgente: boolean
}

const SELECAO = {
  id: true,
  numero: true,
  etapa: true,
  prioridade: true,
  atualizadoEm: true,
  prazoPrometido: true,
  cliente: { select: { id: true, nome: true } },
  equipamento: { select: { marca: true, modelo: true } },
  tecnico: { select: { nome: true } },
} as const

/**
 * A consulta de fila, uma vez só.
 *
 * As quatro telas de fila — Painel, Bancada, Conferência, Financeiro — fazem a
 * mesma pergunta com recortes diferentes. Escrever a consulta quatro vezes
 * garantiria que uma delas esquecesse a ordenação por tempo parado, ou o chip
 * de prioridade, e ninguém notaria por meses.
 *
 * A ordenação não é cronológica por acaso: quem está parado há mais tempo
 * aparece primeiro, porque a tela ordena pelo que precisa de atenção e não pelo
 * que chegou por último. Numa lista por chegada, o aparelho esquecido há três
 * semanas afunda para o fim justamente por estar esquecido.
 */
async function buscarFila(
  tx: Transacao,
  papel: Papel,
  where: Record<string, unknown>,
  limite: number,
): Promise<LinhaRadar[]> {
  const ordens = await tx.ordem.findMany({
    where,
    orderBy: [{ prioridade: 'desc' }, { atualizadoEm: 'asc' }],
    take: limite,
    select: SELECAO,
  })

  const agora = Date.now()
  return ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    etapa: o.etapa,
    estado: estadoDaEtapa(o.etapa),
    acao: acaoDaVez(o.etapa, papel),
    cliente: o.cliente.nome,
    clienteId: o.cliente.id,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    tecnico: o.tecnico?.nome ?? null,
    atualizadoEm: o.atualizadoEm,
    prazoPrometido: o.prazoPrometido,
    diasParado: Math.floor((agora - o.atualizadoEm.getTime()) / 86_400_000),
    atrasada: o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false,
    urgente: o.prioridade === 'ALTA',
  }))
}

/** Tudo que espera uma ação DESTA pessoa, em qualquer ponto da esteira. */
export async function radarDoPapel(
  ctx: ContextoAcesso,
  papel: Papel,
  limite = 30,
): Promise<LinhaRadar[]> {
  const etapas = etapasDoPapel(papel)
  if (etapas.length === 0) return []
  return comEscopo(ctx, (tx) => buscarFila(tx, papel, { etapa: { in: etapas } }, limite))
}

/**
 * Uma fatia da esteira que este papel move.
 *
 * O cruzamento com `etapasDoPapel` é o que impede a tela de prometer trabalho
 * que a pessoa não pode fazer: pedir a fila da Conferência sendo técnico
 * devolve vazio, não uma lista de botões que o motor recusaria.
 */
export async function filaDeEtapas(
  ctx: ContextoAcesso,
  papel: Papel,
  recorte: EtapaOrdem[],
  limite = 40,
): Promise<LinhaRadar[]> {
  const etapas = etapasDoPapel(papel).filter((e) => recorte.includes(e))
  if (etapas.length === 0) return []
  return comEscopo(ctx, (tx) => buscarFila(tx, papel, { etapa: { in: etapas } }, limite))
}

/**
 * A fila da BANCADA de um técnico — só os aparelhos dele, mais os sem dono.
 *
 * A diferença entre esta e o radar geral é a palavra "dele". Um técnico com
 * quarenta aparelhos na oficina não quer a fila da oficina: quer a fila da
 * bancada dele. O aparelho sem técnico definido aparece para todos de
 * propósito — é justamente ele que corre o risco de ficar sem ninguém.
 */
export async function filaDaBancada(
  ctx: ContextoAcesso,
  papel: Papel,
  usuarioId: string | null,
  limite = 40,
): Promise<LinhaRadar[]> {
  const etapas = etapasDoPapel(papel).filter((e) => ETAPAS_DE_BANCADA.includes(e))
  if (etapas.length === 0) return []

  // A gestão vê a bancada inteira: ela é o único papel que enxerga o todo, e a
  // pergunta dela é "a oficina está andando?", não "o que é meu?".
  const soMinhas = papel === Papel.TECNICO && usuarioId !== null

  return comEscopo(ctx, (tx) =>
    buscarFila(
      tx,
      papel,
      {
        etapa: { in: etapas },
        ...(soMinhas ? { OR: [{ tecnicoId: usuarioId }, { tecnicoId: null }] } : {}),
      },
      limite,
    ),
  )
}

/** As etapas em que o aparelho está fisicamente na oficina. */
export const ETAPAS_DE_BANCADA: EtapaOrdem[] = [
  EtapaOrdem.COLETADO,
  EtapaOrdem.RECEBIDO_NA_EMPRESA,
  EtapaOrdem.EM_ANALISE,
  EtapaOrdem.ORCAMENTO_INTERNO,
  EtapaOrdem.ORCAMENTO_APROVADO,
  EtapaOrdem.EM_MANUTENCAO,
]

/** As etapas que dependem de alguém pegar a estrada. */
export const ETAPAS_DE_ROTA: EtapaOrdem[] = [
  EtapaOrdem.RETIRADA_AGENDADA,
  EtapaOrdem.EM_ROTA_RETIRADA,
  EtapaOrdem.FATURADO,
  EtapaOrdem.EM_ROTA_ENTREGA,
  EtapaOrdem.DEVOLVIDO_SEM_REPARO,
]

/** As etapas que esperam o aval da gestão. */
export const ETAPAS_DE_CONFERENCIA: EtapaOrdem[] = [
  EtapaOrdem.MANUTENCAO_CONCLUIDA,
  EtapaOrdem.APROVACAO_GESTAO,
  // A entrega feita e ainda não baixada é conferência também: ela é a única
  // coisa que separa uma O.S. terminada de uma O.S. encerrada.
  EtapaOrdem.ENTREGUE,
]

/** As etapas que esperam dinheiro entrar. */
export const ETAPAS_DE_COBRANCA: EtapaOrdem[] = [EtapaOrdem.FATURAMENTO]

export type ContagensDoRadar = Record<string, number>

/**
 * OS CONTADORES DO MENU — quantos itens esperam em cada tela.
 *
 * =============================================================================
 * UMA CONSULTA SÓ, E ELA JÁ SAI RECORTADA PELO PAPEL
 * =============================================================================
 * Um `groupBy` por etapa responde a todas as contagens de uma vez. A
 * alternativa — uma contagem por item de menu — seriam sete consultas em TODA
 * navegação, para pintar sete bolinhas.
 *
 * O recorte por papel acontece depois, sobre o mapa que já está na memória, e
 * é o que faz o número ao lado de "Ordens" significar coisas diferentes para
 * pessoas diferentes: para o técnico é o que está na bancada dele; para a
 * gestão é o que espera o aval dela. O mesmo item de menu, a mesma tela, e a
 * pergunta certa para cada um.
 */
export async function contagensDoRadar(
  ctx: ContextoAcesso,
  papel: Papel,
): Promise<ContagensDoRadar> {
  // O dono da plataforma fora de uma empresa não tem esteira para contar.
  if (!ctx.tenantId) return {}

  const linhas = await comEscopo(ctx, (tx) =>
    tx.ordem.groupBy({ by: ['etapa'], _count: { _all: true } }),
  )

  const mapa = new Map<EtapaOrdem, number>()
  for (const l of linhas) mapa.set(l.etapa, l._count._all)

  const somar = (etapas: EtapaOrdem[]) => etapas.reduce((s, e) => s + (mapa.get(e) ?? 0), 0)

  const minhas = etapasDoPapel(papel)
  const cruzar = (recorte: EtapaOrdem[]) => somar(minhas.filter((e) => recorte.includes(e)))

  return {
    // O Painel NÃO ganha contador: ele É o radar. Um selo em cima do próprio
    // radar contaria a mesma coisa que a tela inteira já conta.
    ordens: somar(minhas),
    bancada: cruzar(ETAPAS_DE_BANCADA),
    rotas: cruzar(ETAPAS_DE_ROTA),
    conferencia: cruzar(ETAPAS_DE_CONFERENCIA),
    financeiro: cruzar(ETAPAS_DE_COBRANCA),
  }
}
