import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { EtapaOrdem } from '@/generated/prisma/enums'

/**
 * OS MOLDES DE DOCUMENTO, PARA A TELA.
 *
 * =============================================================================
 * OS TRÊS TIPOS, E POR QUE SÃO SÓ TRÊS
 * =============================================================================
 * O sistema emite dez tipos de documento, mas oito deles NASCEM DA ESTEIRA: o
 * comprovante de retirada sai quando o motorista colhe a assinatura, o recibo
 * sai quando a fatura é quitada. Ninguém escreve o texto deles — eles
 * acompanham um fato, e o formato faz parte do fato.
 *
 * Estes três são os que se ESCREVEM:
 *
 *   CONTRATO_PRESTACAO   o instrumento que o setor de compras exige
 *   NOTA_PROMISSORIA     o título de quem leva o aparelho e paga depois
 *   ORDEM_SERVICO        o papel que acompanha o aparelho, no formato da casa
 *
 * Oferecer os outros na tela seria oferecer para modelar uma coisa que o
 * sistema decide sozinho — e o molde escrito à mão ficaria lá, sem nunca ser
 * usado, parecendo defeito.
 */

export const TIPOS_MODELAVEIS = ['CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA', 'ORDEM_SERVICO'] as const
export type TipoModelavel = (typeof TIPOS_MODELAVEIS)[number]

export const ROTULO_TIPO: Record<TipoModelavel, string> = {
  CONTRATO_PRESTACAO: 'Contratos',
  NOTA_PROMISSORIA: 'Notas promissórias',
  ORDEM_SERVICO: 'Ordem de serviço',
}

/** O singular, para quando a tela fala de UM. */
export const ROTULO_TIPO_UM: Record<TipoModelavel, string> = {
  CONTRATO_PRESTACAO: 'Contrato',
  NOTA_PROMISSORIA: 'Nota promissória',
  ORDEM_SERVICO: 'Ordem de serviço',
}

export function ehTipoModelavel(t: string): t is TipoModelavel {
  return (TIPOS_MODELAVEIS as readonly string[]).includes(t)
}

/**
 * CINCO MODELOS ATIVOS POR TIPO, E O NÚMERO APARECE NA TELA.
 *
 * =============================================================================
 * POR QUE UM TETO
 * =============================================================================
 * Não é limitação técnica — é o que mantém a lista escolhível. Um tipo com
 * dezoito moldes é um tipo em que ninguém sabe qual está valendo: na hora de
 * emitir, a pessoa escolhe pelo nome que parece certo, e o contrato que sai é o
 * que alguém escreveu para um caso que já não existe.
 *
 * Cinco cobre com folga o que uma assistência de fato tem — particular,
 * convênio, hospital, órgão público, e um de reserva.
 *
 * O contador fica visível ("3/5") porque um teto que só aparece quando é
 * atingido vira erro surpresa no meio do trabalho.
 *
 * APOSENTADO NÃO CONTA. Ele não aparece para escolher e existe só para
 * responder "com que texto isto foi assinado?" — ocupar vaga com ele obrigaria
 * a EXCLUIR histórico para poder escrever um molde novo.
 */
export const LIMITE_POR_TIPO = 5

/**
 * As etapas que podem disparar um modelo.
 *
 * Todas menos CANCELADO: mandar ao cliente o papel do serviço no instante em
 * que o serviço foi cancelado é a comunicação mais confusa que o sistema
 * conseguiria produzir.
 */
export const ETAPAS_DE_DISPARO = Object.values(EtapaOrdem).filter((e) => e !== EtapaOrdem.CANCELADO)

export type ModeloNaLista = {
  id: string
  nome: string
  tipo: string
  descricao: string | null
  padrao: boolean
  ativo: boolean
  autorNome: string | null
  atualizadoEm: Date
  /** A etapa que faz este modelo sair sozinho, ou `null` se ele só sai a pedido. */
  dispararNaEtapa: string | null
  /** Só para o cartão dizer o tamanho sem carregar o texto inteiro na lista. */
  tamanho: number
}

/**
 * Os moldes de um tipo.
 *
 * O PADRÃO VEM PRIMEIRO, e não é gosto: ele é o que a emissão usa quando
 * ninguém escolhe, então é o que a pessoa precisa achar de relance para
 * conferir se está certo. Depois dele, os mais mexidos recentemente — quem está
 * ajustando um molde volta nele várias vezes seguidas.
 */
export async function listarModelos(ctx: ContextoAcesso, tipo: TipoModelavel): Promise<ModeloNaLista[]> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.findMany({
      where: { tipo },
      orderBy: [{ padrao: 'desc' }, { atualizadoEm: 'desc' }],
      select: {
        id: true,
        nome: true,
        tipo: true,
        descricao: true,
        padrao: true,
        ativo: true,
        autorNome: true,
        atualizadoEm: true,
        dispararNaEtapa: true,
        corpo: true,
      },
    }),
  )
  return linhas.map(({ corpo, ...resto }) => ({ ...resto, tamanho: corpo.length }))
}

/**
 * Quantos moldes ATIVOS cada tipo tem — o número que a aba mostra, e o mesmo
 * que o teto de cinco conta.
 *
 * Antes contava tudo, aposentado incluído, e a aba dizia "Contratos (7)" quando
 * havia dois em uso. Com o teto visível ao lado, contar o aposentado seria pior
 * ainda: a tela diria 5/5 com duas vagas livres.
 */
export async function contarPorTipo(ctx: ContextoAcesso): Promise<Record<string, number>> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.groupBy({ by: ['tipo'], where: { ativo: true }, _count: { _all: true } }),
  )
  const mapa: Record<string, number> = {}
  for (const l of linhas) mapa[l.tipo] = l._count._all
  return mapa
}

/** Um molde inteiro, para o editor abrir. */
export async function modeloPorId(ctx: ContextoAcesso, id: string) {
  return comEscopo(ctx, (tx) => tx.modeloDocumento.findUnique({ where: { id } }))
}

/**
 * O molde que a emissão usa para um tipo.
 *
 * Só considera os ATIVOS: um molde aposentado continua no banco porque
 * documento já emitido aponta para ele — mas ele não pode voltar a ser usado
 * por ser o último padrão que sobrou.
 *
 * Devolver `null` é resposta legítima e o caminho normal no primeiro dia: sem
 * molde cadastrado, a emissão cai no texto embutido de sempre. É isso que faz
 * esta mudança não quebrar nada de quem já usa o sistema.
 */
export async function modeloPadrao(ctx: ContextoAcesso, tipo: TipoModelavel) {
  return comEscopo(ctx, (tx) =>
    tx.modeloDocumento.findFirst({ where: { tipo, padrao: true, ativo: true } }),
  )
}
