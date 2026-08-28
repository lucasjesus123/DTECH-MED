import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * O FUNIL COMERCIAL — o que ainda não virou serviço.
 *
 * =============================================================================
 * A PERGUNTA
 * =============================================================================
 * "Quanto dinheiro está esperando um sim, e há quanto tempo?"
 *
 * O orçamento sempre existiu, mas só DENTRO da ordem. Para saber quantos
 * estavam parados esperando resposta, alguém abria ordem por ordem. O resultado
 * previsível: orçamento enviado em segunda-feira, esquecido, e o cliente
 * fechando com o concorrente na quinta sem que ninguém aqui soubesse que havia
 * o que cobrar.
 *
 * =============================================================================
 * POR QUE ISTO É COMERCIAL E NÃO É "ORÇAMENTOS"
 * =============================================================================
 * Contato do site e orçamento são o MESMO funil em dois tempos:
 *
 *     alguém pergunta  →  a gente responde com preço  →  vira ordem
 *          (lead)              (orçamento)               (serviço)
 *
 * São duas abas de uma tela, e não dois itens de menu, porque quem abre uma
 * está fazendo a mesma coisa que quem abre a outra: procurando o que ainda
 * pode virar trabalho.
 *
 * =============================================================================
 * O QUE FICA DE FORA, E POR QUÊ
 * =============================================================================
 * RASCUNHO e EM_REVISAO não estão no funil: eles são trabalho interno, e ainda
 * não foram ao cliente. Contá-los como "esperando resposta" inflaria o número
 * com coisas que ninguém está esperando — e um número inflado numa tela
 * comercial é pior que nenhum, porque leva a decidir errado sobre contratar.
 *
 * A versão também: `@@unique([tenantId, numero, versao])` significa que o mesmo
 * orçamento pode ter três versões, e as três são a MESMA proposta. O funil
 * conta a última de cada número; contar as três diria que há três negócios
 * abertos onde há um.
 */

/** Os estados que o funil mostra, na ordem em que a negociação acontece. */
export const FASES = [
  { chave: 'ENVIADO', rotulo: 'Esperando resposta' },
  { chave: 'APROVADO', rotulo: 'Aprovados' },
  { chave: 'REPROVADO', rotulo: 'Recusados' },
  { chave: 'EXPIRADO', rotulo: 'Venceram sem resposta' },
] as const

export type FaseFunil = (typeof FASES)[number]['chave']

export type FiltroFunil = {
  /** Um dos estados de `FASES`, ou vazio para todos. */
  fase?: string
  busca?: string
  /** Quantos dias para trás. Padrão 90. */
  dias?: number
}

/**
 * Os orçamentos do funil — só a ÚLTIMA versão de cada número.
 *
 * O `DISTINCT ON` faz esse trabalho no banco. Em JavaScript exigiria trazer
 * todas as versões e descartar a maioria, e a conta do topo (quanto está
 * esperando um sim) sairia errada no primeiro orçamento revisado.
 */
export async function listarFunil(ctx: ContextoAcesso, f: FiltroFunil) {
  const dias = Math.max(1, Math.min(730, f.dias ?? 90))
  const busca = f.busca?.trim() ?? ''
  const fase = FASES.some((x) => x.chave === f.fase) ? f.fase : null

  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<
      Array<{
        id: string
        numero: number
        versao: number
        status: string
        totalCentavos: number
        criadoEm: Date
        enviadoEm: Date | null
        respondidoEm: Date | null
        validoAte: Date | null
        motivoReprovacao: string | null
        aprovadoPorNome: string | null
        ordemId: string
        ordemNumero: number
        cliente: string
        clienteId: string
        equipamento: string
      }>
    >`
      SELECT * FROM (
        SELECT DISTINCT ON (o.numero)
               o.id, o.numero, o.versao, o.status::text AS status, o."totalCentavos",
               o."criadoEm", o."enviadoEm", o."respondidoEm", o."validoAte",
               o."motivoReprovacao", o."aprovadoPorNome",
               ord.id AS "ordemId", ord.numero AS "ordemNumero",
               c.nome AS cliente, c.id AS "clienteId",
               (e.marca || ' ' || e.modelo) AS equipamento
          FROM orcamentos o
          JOIN ordens ord      ON ord.id = o."ordemId"
          JOIN clientes c      ON c.id = ord."clienteId"
          JOIN equipamentos e  ON e.id = ord."equipamentoId"
         WHERE o."tenantId" = ${ctx.tenantId}
           AND o.status::text IN ('ENVIADO','APROVADO','REPROVADO','EXPIRADO')
           AND o."criadoEm" > now() - make_interval(days => ${dias})
         -- A ÚLTIMA versão de cada número. O DISTINCT ON fica com a primeira
         -- linha de cada grupo, e o ORDER BY abaixo põe a maior versão nessa
         -- posição. Sem isto, um orçamento revisado três vezes apareceria como
         -- três negócios abertos onde há um.
         -- (Sem crase nestes comentários: eles vivem DENTRO de um template
         --  literal, e a crase fecharia a string no meio da consulta.)
         ORDER BY o.numero, o.versao DESC
      ) u
       WHERE (${fase}::text IS NULL OR u.status = ${fase}::text)
         AND (${busca} = '' OR u.cliente ILIKE ${'%' + busca + '%'}
                            OR u.equipamento ILIKE ${'%' + busca + '%'}
                            OR u.numero::text = ${busca})
       ORDER BY
         -- Quem espera resposta vem primeiro, e dentro disso o mais ANTIGO no
         -- topo: o orçamento parado há doze dias é o que corre risco de virar
         -- venda do concorrente, não o de ontem.
         CASE u.status WHEN 'ENVIADO' THEN 0 ELSE 1 END,
         CASE WHEN u.status = 'ENVIADO' THEN u."enviadoEm" END ASC NULLS LAST,
         u."criadoEm" DESC
       LIMIT 200
    `

    const agora = Date.now()
    return linhas.map((l) => ({
      ...l,
      totalCentavos: Number(l.totalCentavos),
      /** Dias parados esperando o cliente. Só faz sentido em ENVIADO. */
      diasEsperando:
        l.status === 'ENVIADO' && l.enviadoEm
          ? Math.floor((agora - l.enviadoEm.getTime()) / 86_400_000)
          : null,
      vencido: Boolean(l.status === 'ENVIADO' && l.validoAte && l.validoAte.getTime() < agora),
    }))
  })
}

export type ResumoFunil = {
  esperandoCentavos: number
  esperandoQuantos: number
  /** Quantos passaram da validade e ninguém percebeu. */
  vencidosQuantos: number
  aprovadoCentavos: number
  aprovadoQuantos: number
  reprovadoCentavos: number
  reprovadoQuantos: number
  /** De cada 100 propostas respondidas, quantas viraram sim. */
  taxaAprovacao: number | null
  /** Dias entre o envio e a resposta, na mediana. */
  diasParaResposta: number | null
}

/**
 * Os números do topo.
 *
 * A TAXA DE APROVAÇÃO só conta o que foi RESPONDIDO — aprovados sobre
 * aprovados mais reprovados. Incluir os que ainda esperam faria a taxa cair
 * toda vez que a empresa mandasse mais orçamentos, que é exatamente o oposto do
 * que ela deveria medir.
 *
 * O TEMPO DE RESPOSTA é a MEDIANA, não a média. Um orçamento respondido depois
 * de oito meses puxa a média para um número que não descreve nenhum caso real;
 * a mediana continua dizendo o que acontece com metade deles.
 */
export async function resumoDoFunil(ctx: ContextoAcesso, dias = 90): Promise<ResumoFunil> {
  const d = Math.max(1, Math.min(730, dias))
  return comEscopo(ctx, async (tx) => {
    const [r] = await tx.$queryRaw<
      Array<{
        espvalor: bigint
        espn: bigint
        vencidos: bigint
        apvalor: bigint
        apn: bigint
        revalor: bigint
        ren: bigint
        mediana: number | null
      }>
    >`
      WITH ultimos AS (
        SELECT DISTINCT ON (numero) status::text AS status, "totalCentavos",
               "enviadoEm", "respondidoEm", "validoAte"
          FROM orcamentos
         WHERE "tenantId" = ${ctx.tenantId}
           AND status::text IN ('ENVIADO','APROVADO','REPROVADO','EXPIRADO')
           AND "criadoEm" > now() - make_interval(days => ${d})
         ORDER BY numero, versao DESC
      )
      SELECT
        coalesce(sum("totalCentavos") FILTER (WHERE status = 'ENVIADO'), 0)  AS espvalor,
        count(*) FILTER (WHERE status = 'ENVIADO')                           AS espn,
        count(*) FILTER (WHERE status = 'ENVIADO' AND "validoAte" < now())   AS vencidos,
        coalesce(sum("totalCentavos") FILTER (WHERE status = 'APROVADO'), 0) AS apvalor,
        count(*) FILTER (WHERE status = 'APROVADO')                          AS apn,
        coalesce(sum("totalCentavos") FILTER (WHERE status = 'REPROVADO'), 0) AS revalor,
        count(*) FILTER (WHERE status = 'REPROVADO')                         AS ren,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM ("respondidoEm" - "enviadoEm")) / 86400
        ) FILTER (WHERE "respondidoEm" IS NOT NULL AND "enviadoEm" IS NOT NULL) AS mediana
      FROM ultimos
    `

    const apn = Number(r?.apn ?? 0)
    const ren = Number(r?.ren ?? 0)
    const respondidos = apn + ren

    return {
      esperandoCentavos: Number(r?.espvalor ?? 0),
      esperandoQuantos: Number(r?.espn ?? 0),
      vencidosQuantos: Number(r?.vencidos ?? 0),
      aprovadoCentavos: Number(r?.apvalor ?? 0),
      aprovadoQuantos: apn,
      reprovadoCentavos: Number(r?.revalor ?? 0),
      reprovadoQuantos: ren,
      // Nulo, e não zero, quando ninguém respondeu ainda: "0%" diria que a
      // empresa não vende nada, quando a verdade é que não há o que medir.
      taxaAprovacao: respondidos > 0 ? Math.round((apn / respondidos) * 100) : null,
      diasParaResposta: r?.mediana != null ? Math.round(Number(r.mediana)) : null,
    }
  })
}

/**
 * Os motivos de recusa mais repetidos.
 *
 * É a informação que muda o negócio, e ela estava enterrada em
 * `motivoReprovacao`, uma coluna que nenhuma tela lia. "Achou caro" dez vezes
 * no mesmo mês é um recado sobre a tabela de preço; "demora" dez vezes é um
 * recado sobre a oficina.
 */
export async function motivosDeRecusa(ctx: ContextoAcesso, dias = 90) {
  const d = Math.max(1, Math.min(730, dias))
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<Array<{ motivo: string; n: bigint; total: bigint }>>`
      SELECT coalesce(nullif(btrim("motivoReprovacao"), ''), 'Sem motivo registrado') AS motivo,
             count(*) AS n,
             sum("totalCentavos") AS total
        FROM orcamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND status::text = 'REPROVADO'
         AND "criadoEm" > now() - make_interval(days => ${d})
       GROUP BY 1
       ORDER BY n DESC, total DESC
       LIMIT 10
    `
    return linhas.map((l) => ({
      motivo: l.motivo,
      quantidade: Number(l.n),
      totalCentavos: Number(l.total),
    }))
  })
}
