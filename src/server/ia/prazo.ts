import { EtapaOrdem } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import {
  AMOSTRA_MINIMA,
  CONFIANCA_MINIMA,
  confiancaDe,
  type Fonte,
  type Saida,
} from './contrato'

/**
 * =============================================================================
 * PREVISÃO DE ESTOURO DE PRAZO — estatística sobre o próprio histórico
 * =============================================================================
 * Nenhum modelo de linguagem entra aqui, e não é economia: a pergunta "esta
 * O.S. vai furar o prazo?" tem resposta no banco desta empresa, e uma resposta
 * conferível. Um LLM daria a mesma frase com mais confiança e sem base.
 *
 * =============================================================================
 * COMO A PROBABILIDADE É CALCULADA — sem supor distribuição nenhuma
 * =============================================================================
 * Não há curva ajustada, nem média com desvio, nem "assumindo normalidade".
 * A conta é uma FREQUÊNCIA OBSERVADA, e ela cabe numa frase:
 *
 *   De todas as O.S. que já passaram por esta mesma etapa e chegaram ao fim,
 *   quantas levaram, dali até a conclusão, MAIS TEMPO do que esta ainda tem?
 *
 * Formalmente: a O.S. entrou na etapa atual no instante `e`. Historicamente,
 * quem entrou nesta etapa levou `R_i` até concluir. Esta vai concluir por
 * volta de `e + R_i`. Ela fura se `e + R_i > prazo`, ou seja, se
 * `R_i > prazo − e`. E `prazo − e` é exatamente "o que resta do prazo" somado
 * a "o tempo já gasto nesta etapa".
 *
 *   P = #{ i : R_i > restante + gasto } / n
 *
 * É a função de distribuição empírica, e ela tem duas virtudes que importam
 * mais que sofisticação: não inventa cauda onde não há dado, e a explicação
 * para o operador é a própria conta — "de 14, nove levaram mais tempo".
 *
 * =============================================================================
 * O QUE ESTE MODELO NÃO SABE, E ESTÁ ESCRITO PARA NÃO SER ESQUECIDO
 * =============================================================================
 * · Ele condiciona só na ETAPA. Modelo do equipamento e comportamento do
 *   cliente — que a direção lista como entradas — ficam de fora nesta primeira
 *   volta, porque cada corte adicional divide a amostra e a amostra é o que
 *   este sistema tem de menos. Entram quando houver histórico que sustente.
 * · Ele ignora o tempo já gasto ao estimar `R_i` (não condiciona em
 *   sobrevivência). Isso o torna OTIMISTA para O.S. muito antigas: uma parada
 *   há trinta dias é comparada com quem acabou de entrar na etapa. A correção
 *   é um estimador de Kaplan-Meier, e ela custa mais amostra do que existe.
 * · Ele não sabe de feriado, férias nem peça em falta.
 *
 * Nada disso invalida o número — invalida tratá-lo como oráculo. Por isso ele
 * nunca sai sem a confiança do lado, e por isso o modelo RECUSA quando a base
 * é fina demais.
 */

/** Uma observação do histórico: quanto tempo levou daquela etapa até o fim. */
export type Amostra = {
  ordemId: string
  numero: number
  /** Dias entre entrar na etapa e concluir a O.S. */
  dias: number
}

export type LinhaDeRisco = {
  ordemId: string
  numero: number
  cliente: string
  equipamento: string
  etapa: EtapaOrdem
  /** 0 a 1. A frequência observada, não um palpite. */
  risco: number
  confianca: number
  /** Dias que faltam para o prazo. Negativo quer dizer que já passou. */
  diasRestantes: number
  /** Dias que a O.S. já está parada na etapa atual. */
  diasNaEtapa: number
  /** O que puxou o número para cima, em português. */
  motivo: string
  base: string
  fontes: Fonte[]
}

/**
 * A CONTA, isolada de banco e de rede.
 *
 * Ela está separada porque é a parte que precisa ser provada com amostras que
 * eu escolho — e não com as doze ordens que por acaso existem no banco de
 * ensaio. O teste unitário ao lado fixa o comportamento nos casos que importam:
 * amostra pequena, unanimidade, e o meio-termo.
 *
 * @param amostras histórico de quem passou pela mesma etapa e concluiu
 * @param restante dias que faltam até o prazo (pode ser negativo)
 * @param gasto dias já parados na etapa atual
 */
export function estimarRisco(
  amostras: Amostra[],
  restante: number,
  gasto: number,
): { risco: number; acertos: number; n: number; confianca: number } {
  const n = amostras.length
  if (n === 0) return { risco: 0, acertos: 0, n: 0, confianca: 0 }

  // O orçamento de tempo que ainda cabe: o que resta do prazo mais o que já
  // foi gasto nesta etapa, porque as amostras contam DESDE A ENTRADA na etapa.
  const orcamento = restante + gasto
  const acertos = amostras.filter((a) => a.dias > orcamento).length

  return {
    risco: acertos / n,
    acertos,
    n,
    confianca: confiancaDe(acertos, n),
  }
}

/**
 * O MOTIVO, escolhido pelo que de fato empurrou o número.
 *
 * Um percentual sozinho não muda decisão nenhuma: "76%" faz a pessoa perguntar
 * "por quê?", e se a tela não responde, ela ignora o número na terceira vez.
 * As três frases abaixo cobrem as três causas reais, e são excludentes na
 * ordem em que estão.
 */
export function motivoDoRisco(entrada: {
  restante: number
  gasto: number
  medianaDaEtapa: number
  rotuloDaEtapa: string
}): string {
  const { restante, gasto, medianaDaEtapa, rotuloDaEtapa } = entrada

  // 1. O prazo é curto demais para o que esta etapa costuma levar. É a causa
  //    mais acionável: dá para renegociar a data hoje.
  if (restante < medianaDaEtapa) {
    return `restam ${Math.max(restante, 0)}d e "${rotuloDaEtapa}" costuma levar ${Math.round(medianaDaEtapa)}d`
  }
  // 2. Esta em particular já passou do normal da etapa — travou em algo.
  if (gasto > medianaDaEtapa) {
    return `parada há ${gasto}d em "${rotuloDaEtapa}", acima dos ${Math.round(medianaDaEtapa)}d de costume`
  }
  // 3. Nada de anormal isoladamente; é o conjunto que aperta.
  return `${gasto}d nesta etapa e ${restante}d de prazo`
}

/** A mediana, e não a média: um reparo de sessenta dias entorta a média. */
export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2
}

const DIA = 86_400_000

/**
 * A previsão para as O.S. abertas do tenant.
 *
 * DUAS IDAS AO BANCO, e nenhuma por O.S.: uma traz o histórico inteiro de
 * quanto tempo cada etapa levou até a conclusão, outra traz as ordens abertas.
 * O cruzamento é em memória. Consultar por ordem seria N viagens para desenhar
 * uma tabela de dez linhas.
 *
 * ORDENS JÁ VENCIDAS FICAM DE FORA. "Vai estourar o prazo" não é previsão para
 * quem já estourou — é fato, e o banner de alerta do Dashboard já o diz com
 * nome e valor. Misturar as duas coisas gastaria a tinta de inferência num
 * dado registrado, que é exatamente o que a regra do teal proíbe.
 */
export async function riscoDePrazo(
  ctx: ContextoAcesso,
  limite = 6,
): Promise<Saida<LinhaDeRisco[]>> {
  return comEscopo(ctx, async (tx) => {
    /**
     * O HISTÓRICO: para cada O.S. concluída, quanto tempo se passou entre
     * ENTRAR em cada etapa e a conclusão.
     *
     * `DISTINCT ON (ordemId, etapaNova)` fica com a PRIMEIRA entrada em cada
     * etapa. Uma O.S. que voltou para "Em análise" duas vezes entrou nela
     * duas vezes; contar as duas faria a mesma ordem votar em dobro na
     * distribuição, e sempre para o lado de "demora mais".
     */
    const historico = await tx.$queryRaw<
      Array<{ etapa: EtapaOrdem; ordemId: string; numero: number; dias: number }>
    >`
      WITH concluidas AS (
        SELECT o.id, o.numero, o."atualizadoEm" AS fim
          FROM ordens o
         WHERE o."tenantId" = ${ctx.tenantId}
           AND o.etapa = 'FINALIZADO'
      ),
      entradas AS (
        SELECT DISTINCT ON (e."ordemId", e."etapaNova")
               e."ordemId", e."etapaNova" AS etapa, e."criadoEm" AS entrou
          FROM eventos_ordem e
          JOIN concluidas c ON c.id = e."ordemId"
         WHERE e."tenantId" = ${ctx.tenantId}
         ORDER BY e."ordemId", e."etapaNova", e.sequencia ASC
      )
      SELECT en.etapa,
             en."ordemId" AS "ordemId",
             c.numero,
             (extract(epoch FROM (c.fim - en.entrou)) / 86400)::float8 AS dias
        FROM entradas en
        JOIN concluidas c ON c.id = en."ordemId"
       WHERE c.fim > en.entrou
    `

    const porEtapa = new Map<EtapaOrdem, Amostra[]>()
    for (const l of historico) {
      const lista = porEtapa.get(l.etapa) ?? []
      lista.push({ ordemId: l.ordemId, numero: l.numero, dias: l.dias })
      porEtapa.set(l.etapa, lista)
    }

    // Sem história nenhuma o modelo não tem o que dizer, e dizer isso é a
    // resposta certa. O número de O.S. concluídas entra no texto porque é a
    // informação que a pessoa precisa para saber quando isto vai funcionar.
    const concluidas = new Set(historico.map((l) => l.ordemId)).size
    if (concluidas < AMOSTRA_MINIMA) {
      return {
        ok: false as const,
        motivo:
          `Ainda não dá para prever prazo: são ${concluidas} O.S. concluídas no histórico, ` +
          `e o modelo só abre a boca a partir de ${AMOSTRA_MINIMA}.`,
      }
    }

    const abertas = await tx.$queryRaw<
      Array<{
        id: string
        numero: number
        cliente: string
        equipamento: string
        etapa: EtapaOrdem
        prazo: Date | null
        desde: Date
      }>
    >`
      SELECT o.id, o.numero, c.nome AS cliente,
             coalesce(eq.marca || ' ' || eq.modelo, 'equipamento') AS equipamento,
             o.etapa, o."prazoPrometido" AS prazo, o."atualizadoEm" AS desde
        FROM ordens o
        JOIN clientes c ON c.id = o."clienteId"
        LEFT JOIN equipamentos eq ON eq.id = o."equipamentoId"
       WHERE o."tenantId" = ${ctx.tenantId}
         AND o.etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')
         AND o."prazoPrometido" IS NOT NULL
         AND o."prazoPrometido" >= now()
    `

    const agora = Date.now()
    const linhas: LinhaDeRisco[] = []

    for (const o of abertas) {
      const amostras = porEtapa.get(o.etapa) ?? []
      if (amostras.length < AMOSTRA_MINIMA) continue

      const restante = Math.floor((o.prazo!.getTime() - agora) / DIA)
      const gasto = Math.floor((agora - o.desde.getTime()) / DIA)
      const { risco, acertos, n, confianca } = estimarRisco(amostras, restante, gasto)

      // Confiança abaixo do piso é o mesmo que não saber. Some da tabela em
      // vez de aparecer com uma barra curtinha que ninguém sabe interpretar.
      if (confianca < CONFIANCA_MINIMA) continue

      const med = mediana(amostras.map((a) => a.dias))

      linhas.push({
        ordemId: o.id,
        numero: o.numero,
        cliente: o.cliente,
        equipamento: o.equipamento,
        etapa: o.etapa,
        risco,
        confianca,
        diasRestantes: restante,
        diasNaEtapa: gasto,
        motivo: motivoDoRisco({
          restante,
          gasto,
          medianaDaEtapa: med,
          rotuloDaEtapa: ROTULO_CURTO[o.etapa] ?? String(o.etapa),
        }),
        base: `${acertos} de ${n} O.S. que passaram por esta etapa levaram mais tempo do que resta`,
        // As fontes são as O.S. que de fato demoraram — as que sustentam o
        // número. Três, porque o chip é para conferir uma, não para ler todas.
        fontes: amostras
          .filter((a) => a.dias > restante + gasto)
          .sort((a, b) => b.dias - a.dias)
          .slice(0, 3)
          .map((a) => ({
            rotulo: `OS-${String(a.numero).padStart(4, '0')} · ${Math.round(a.dias)}d`,
            href: `/painel/ordens/${a.ordemId}`,
          })),
      })
    }

    if (linhas.length === 0) {
      return {
        ok: false as const,
        motivo:
          'Nenhuma O.S. aberta tem histórico suficiente na etapa em que está para uma previsão com base.',
      }
    }

    linhas.sort((a, b) => b.risco - a.risco || a.diasRestantes - b.diasRestantes)
    const mostradas = linhas.slice(0, limite)

    // A confiança do BLOCO é a menor das linhas mostradas, e não a média.
    // Média deixaria uma linha fraca escondida atrás de cinco fortes, e o
    // cabeçalho anunciaria uma segurança que a pior linha não tem.
    const confiancaDoBloco = Math.min(...mostradas.map((l) => l.confianca))

    return {
      ok: true as const,
      valor: mostradas,
      confianca: confiancaDoBloco,
      base: `${concluidas} O.S. concluídas no histórico desta empresa`,
      fontes: mostradas[0]?.fontes ?? [],
    }
  })
}

/** Rótulos curtos, para caber dentro da frase do motivo. */
const ROTULO_CURTO: Partial<Record<EtapaOrdem, string>> = {
  ORDEM_RETIRADA_GERADA: 'a retirar',
  RETIRADA_AGENDADA: 'retirada agendada',
  EM_ROTA_RETIRADA: 'em rota',
  COLETADO: 'coletado',
  RECEBIDO_NA_EMPRESA: 'recebido',
  EM_ANALISE: 'em análise',
  ORCAMENTO_INTERNO: 'orçamento interno',
  ORCAMENTO_ENVIADO: 'orçamento enviado',
  ORCAMENTO_APROVADO: 'orçamento aprovado',
  EM_MANUTENCAO: 'em manutenção',
  MANUTENCAO_CONCLUIDA: 'manutenção concluída',
  APROVACAO_GESTAO: 'aprovação da gestão',
  FATURAMENTO: 'faturamento',
  FATURADO: 'faturado',
  EM_ROTA_ENTREGA: 'em rota de entrega',
}
