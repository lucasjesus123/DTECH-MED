import type { EtapaOrdem } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { ROTULO_ETAPA, TERMINAIS } from '@/server/ordem/maquina-estados'

/**
 * O QUADRO DA O.S. — o processo da casa, desenhado por cima da esteira.
 *
 * =============================================================================
 * O QUE É EDITÁVEL, E O QUE NUNCA SERÁ
 * =============================================================================
 * As 18 etapas não viram cadastro. Cada evento da linha do tempo carrega o
 * resumo criptográfico do anterior, e a ficha confere a corrente inteira ao
 * abrir — é isso que faz o prontuário ter valor de prova. A máquina de estados
 * também sabe quais transições são legais, quem pode fazer cada uma e o que
 * cada uma exige.
 *
 * O que a empresa edita é a LEITURA: quais colunas existem, com que nome, e
 * quais etapas cada uma agrupa. Mover o cartão continua sendo transição de
 * verdade, pela mesma `avancar` da ficha.
 *
 * =============================================================================
 * A COLUNA "FORA DO QUADRO" É A REDE DE SEGURANÇA
 * =============================================================================
 * Nenhuma O.S. pode sumir. Etapa que não esteja em coluna nenhuma deixaria
 * ordens invisíveis — e essa é a pior falha possível aqui, porque não parece
 * falha: o quadro fica bonito e o aparelho de alguém está parado sem ninguém
 * ver.
 *
 * Nenhum `CHECK` alcança isso: é regra de conjunto, entre linhas. Então quem
 * garante é esta consulta — toda etapa órfã cai numa coluna desenhada na hora,
 * no fim, com o aviso do que fazer. Recusar a configuração seria pior: deixaria
 * a pessoa presa numa tela sem entender o que falta.
 */

export type CartaoDoQuadro = {
  id: string
  numero: number
  etapa: EtapaOrdem
  etapaRotulo: string
  cliente: string
  equipamento: string
  tecnico: string | null
  prioridade: string
  /** Prometido ao cliente; nulo quando ninguém prometeu. */
  prazo: string | null
  /** Passou do prazo e a ordem não terminou. */
  atrasada: boolean
  /** Há quantos dias parada NESTA etapa. É o número que denuncia o esquecido. */
  diasNaEtapa: number
}

export type ColunaDoQuadro = {
  id: string
  nome: string
  cor: string | null
  etapas: EtapaOrdem[]
  cartoes: CartaoDoQuadro[]
  /** Verdadeiro só na coluna de resgate desenhada por esta consulta. */
  orfa: boolean
}

/**
 * AS COLUNAS QUE A EMPRESA AINDA NÃO CONFIGUROU.
 *
 * Um quadro que nasce vazio obriga a pessoa a montar o processo inteiro antes
 * de ver serventia nenhuma — e ninguém monta oito colunas para descobrir se
 * gostou. Estas quatro são as fases que o próprio diagrama do sistema já
 * desenha (retirada, diagnóstico, execução, fechamento), então o quadro abre
 * fazendo sentido no primeiro dia e a empresa reescreve quando quiser.
 *
 * Os terminais ficam juntos numa quinta: entregue, finalizado, devolvido sem
 * reparo e cancelado não são trabalho, são desfecho.
 */
export const COLUNAS_PADRAO: Array<{ nome: string; cor: string | null; etapas: EtapaOrdem[] }> = [
  {
    nome: 'Retirada',
    cor: 'acao',
    etapas: [
      'SOLICITACAO_RECEBIDA',
      'ORDEM_RETIRADA_GERADA',
      'RETIRADA_AGENDADA',
      'EM_ROTA_RETIRADA',
      'COLETADO',
    ] as EtapaOrdem[],
  },
  {
    nome: 'Diagnóstico',
    cor: 'violeta',
    etapas: [
      'RECEBIDO_NA_EMPRESA',
      'EM_ANALISE',
      'ORCAMENTO_INTERNO',
      'ORCAMENTO_ENVIADO',
    ] as EtapaOrdem[],
  },
  {
    nome: 'Execução',
    cor: 'espera',
    etapas: [
      'ORCAMENTO_APROVADO',
      'EM_MANUTENCAO',
      'MANUTENCAO_CONCLUIDA',
      'APROVACAO_GESTAO',
    ] as EtapaOrdem[],
  },
  {
    nome: 'Fechamento',
    cor: 'sinal',
    etapas: ['FATURAMENTO', 'FATURADO', 'EM_ROTA_ENTREGA'] as EtapaOrdem[],
  },
  {
    nome: 'Encerradas',
    cor: null,
    etapas: [
      'ENTREGUE',
      'FINALIZADO',
      'DEVOLVIDO_SEM_REPARO',
      'ORCAMENTO_REPROVADO',
      'CANCELADO',
    ] as EtapaOrdem[],
  },
]

/** Todas as etapas, na ordem do enum — a lista que o editor de colunas oferece. */
export const TODAS_AS_ETAPAS = Object.keys(ROTULO_ETAPA) as EtapaOrdem[]

export async function colunasDaEmpresa(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.colunaQuadro.findMany({
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, ordem: true, cor: true, etapas: true },
    }),
  )
}

/**
 * O quadro montado: as colunas da empresa com as ordens dentro.
 *
 * =============================================================================
 * AS ENCERRADAS ENTRAM COM LIMITE, E AS ABERTAS NÃO
 * =============================================================================
 * Uma assistência com dois anos de uso tem centenas de ordens finalizadas, e
 * elas não são trabalho — são arquivo. Trazer todas encheria a coluna de
 * desfecho com dez telas de rolagem e deixaria o quadro lento por causa da
 * única coluna em que ninguém precisa mexer.
 *
 * As abertas vêm inteiras, porque cada uma é um aparelho de alguém parado em
 * algum lugar, e "cortei as vinte mais antigas" é exatamente perder as que mais
 * importam.
 */
export async function montarQuadro(ctx: ContextoAcesso): Promise<ColunaDoQuadro[]> {
  const [colunas, ordens] = await Promise.all([
    colunasDaEmpresa(ctx),
    comEscopo(ctx, (tx) =>
      tx.ordem.findMany({
        orderBy: [{ prioridade: 'desc' }, { atualizadoEm: 'asc' }],
        take: 500,
        select: {
          id: true,
          numero: true,
          etapa: true,
          prioridade: true,
          prazoPrometido: true,
          atualizadoEm: true,
          cliente: { select: { nome: true } },
          equipamento: { select: { marca: true, modelo: true } },
          tecnico: { select: { nome: true } },
        },
      }),
    ),
  ])

  const agora = new Date()
  const cartoes: CartaoDoQuadro[] = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    etapa: o.etapa,
    etapaRotulo: ROTULO_ETAPA[o.etapa] ?? o.etapa,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
    tecnico: o.tecnico?.nome ?? null,
    prioridade: o.prioridade,
    prazo: o.prazoPrometido ? o.prazoPrometido.toISOString() : null,
    atrasada:
      Boolean(o.prazoPrometido) &&
      o.prazoPrometido! < agora &&
      !TERMINAIS.includes(o.etapa),
    // `atualizadoEm` muda a cada transição, então ele É o tempo nesta etapa.
    // Não é exato ao segundo — uma edição de responsável também o move — e não
    // precisa ser: o que a coluna precisa dizer é "esta está parada há 12
    // dias", e para isso a ordem de grandeza basta.
    diasNaEtapa: Math.max(
      0,
      Math.floor((agora.getTime() - o.atualizadoEm.getTime()) / 86400000),
    ),
  }))

  const usadas = new Set<string>()
  const montadas: ColunaDoQuadro[] = colunas.map((c) => {
    // Valor desconhecido no array é ignorado: o campo é `text[]` justamente
    // para uma etapa removida do enum não travar a leitura do quadro.
    const etapas = c.etapas.filter((e): e is EtapaOrdem => e in ROTULO_ETAPA)
    for (const e of etapas) usadas.add(e)
    return {
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      etapas,
      cartoes: cartoes.filter((k) => etapas.includes(k.etapa)),
      orfa: false,
    }
  })

  /**
   * A REDE DE SEGURANÇA.
   *
   * Só aparece quando alguma etapa ficou de fora, e só com ordem dentro. Uma
   * coluna "Fora do quadro" vazia seria um alarme permanente pedindo
   * configuração de etapas que ninguém usa — e alarme permanente se aprende a
   * ignorar, que é justamente o que não pode acontecer com esta.
   */
  const orfas = TODAS_AS_ETAPAS.filter((e) => !usadas.has(e))
  const cartoesOrfaos = cartoes.filter((k) => orfas.includes(k.etapa))
  if (cartoesOrfaos.length > 0) {
    montadas.push({
      id: '__orfas__',
      nome: 'Fora do quadro',
      cor: 'alerta',
      etapas: orfas,
      cartoes: cartoesOrfaos,
      orfa: true,
    })
  }

  return montadas
}
