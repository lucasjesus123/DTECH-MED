import { EtapaOrdem } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * A FICHA DO CLIENTE — tudo que a empresa sabe sobre ele, numa tela.
 *
 * =============================================================================
 * A PERGUNTA QUE ELA RESPONDE
 * =============================================================================
 * "Quem é este cliente para nós?"
 *
 * Antes ela não tinha resposta em lugar nenhum. O cadastro ficava na lista de
 * clientes, os aparelhos dele na tela de equipamentos, as ordens na de ordens, e
 * a dívida repartida entre as faturas de serviço e os lançamentos avulsos. Para
 * saber se valia a pena atender com urgência, alguém abria quatro telas e somava
 * de cabeça.
 *
 * O sintoma prático: o Financeiro passou a mostrar "quem está segurando o
 * caixa" com um link para a ficha do cliente — e o link não levava a lugar
 * nenhum, porque a ficha não existia.
 *
 * =============================================================================
 * A DÍVIDA SOMA AS DUAS ORIGENS, COMO NO FINANCEIRO
 * =============================================================================
 * Fatura de serviço e lançamento avulso são dívida do mesmo cliente, atrasada do
 * mesmo jeito. Mostrar só uma faz alguém cobrar R$ 400 de quem já deve R$ 6.000
 * — que é exatamente o erro que o painel de devedores existe para evitar.
 *
 * =============================================================================
 * TUDO NUM `comEscopo` SÓ
 * =============================================================================
 * As sete consultas rodam na MESMA transação. Não é economia de código: é a
 * garantia de que a ficha mostra um retrato coerente. Em transações separadas,
 * uma baixa de fatura entre a segunda e a quinta consulta faria a tela dizer
 * "deve R$ 3.000" no topo e listar as faturas já quitadas embaixo.
 */

/**
 * As etapas em que a ordem ACABOU. O nome importa: a primeira versão chamava
 * esta lista de `ABERTAS` e continha as encerradas — um nome que diz o
 * contrário do conteúdo é a semente do próximo defeito, porque a próxima
 * pessoa confia no nome e não abre a lista.
 */
const ENCERRADAS: EtapaOrdem[] = [
  EtapaOrdem.FINALIZADO,
  EtapaOrdem.CANCELADO,
  EtapaOrdem.DEVOLVIDO_SEM_REPARO,
]

export async function fichaDoCliente(ctx: ContextoAcesso, id: string) {
  return comEscopo(ctx, async (tx) => {
    const cliente = await tx.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        nome: true,
        razaoSocial: true,
        documento: true,
        inscricaoEstadual: true,
        email: true,
        telefone: true,
        whatsapp: true,
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        pontoReferencia: true,
        contatoNome: true,
        contatoTelefone: true,
        observacoes: true,
        ativo: true,
        criadoEm: true,

        // O endereço de COLETA e o REPRESENTANTE entram porque a ficha passou a
        // abrigar a EDIÇÃO do cadastro. Um formulário que abre com metade dos
        // campos vazios e salva por cima apagaria o que não veio — que é o modo
        // mais silencioso de perder dado que alguém conferiu.
        coletaMesmoEndereco: true,
        coletaCep: true,
        coletaLogradouro: true,
        coletaNumero: true,
        coletaComplemento: true,
        coletaBairro: true,
        coletaCidade: true,
        coletaUf: true,
        coletaObservacao: true,
        representanteNome: true,
        representanteTelefone: true,
        representanteEmail: true,
        representanteVinculo: true,
      },
    })
    // Nulo quando não existe OU quando é de outra franquia: para quem pergunta,
    // os dois casos são o mesmo, e é assim que a resposta não revela nada.
    if (!cliente) return null

    const [equipamentos, ordens, faturas, contratos, dinheiro, contagens] = await Promise.all([
      tx.equipamento.findMany({
        where: { clienteId: id },
        orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
        take: 100,
        select: {
          id: true,
          marca: true,
          modelo: true,
          numeroSerie: true,
          categoria: true,
          fotoCaminho: true,
          _count: { select: { ordens: true } },
        },
      }),

      tx.ordem.findMany({
        where: { clienteId: id },
        orderBy: { abertaEm: 'desc' },
        take: 20,
        select: {
          id: true,
          numero: true,
          etapa: true,
          abertaEm: true,
          prazoPrometido: true,
          equipamento: { select: { marca: true, modelo: true } },
        },
      }),

      tx.fatura.findMany({
        where: { clienteId: id, status: { in: ['ABERTA', 'PARCIAL'] } },
        orderBy: { vencimento: 'asc' },
        take: 30,
        select: {
          id: true,
          numero: true,
          status: true,
          vencimento: true,
          valorTotalCentavos: true,
          valorPagoCentavos: true,
          multaCentavos: true,
          jurosCentavos: true,
          ordem: { select: { id: true, numero: true } },
        },
      }),

      tx.contratoManutencao.findMany({
        where: { clienteId: id },
        orderBy: { inicio: 'desc' },
        take: 10,
        select: {
          id: true,
          numero: true,
          periodicidade: true,
          inicio: true,
          fim: true,
          ativo: true,
          valorVisitaCentavos: true,
          equipamento: { select: { marca: true, modelo: true } },
        },
      }),

      // O dinheiro, em números redondos. Feito em SQL e não em JavaScript
      // porque somar aqui exigiria trazer todas as faturas e todos os
      // lançamentos do cliente só para reduzi-los a quatro totais.
      tx.$queryRaw<
        Array<{ deve: bigint; vencido: bigint; pagouTotal: bigint; avulsoAberto: bigint }>
      >`
        SELECT
          coalesce((SELECT sum("valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                                - "valorPagoCentavos")
                      FROM faturas
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND status IN ('ABERTA','PARCIAL')), 0)
        + coalesce((SELECT sum("valorCentavos") FROM lancamentos
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND tipo = 'RECEBER' AND "pagoEm" IS NULL), 0)        AS deve,

          coalesce((SELECT sum("valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                                - "valorPagoCentavos")
                      FROM faturas
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND status IN ('ABERTA','PARCIAL') AND vencimento < now()), 0)
        + coalesce((SELECT sum("valorCentavos") FROM lancamentos
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND tipo = 'RECEBER' AND "pagoEm" IS NULL
                       AND vencimento < now()), 0)                           AS "vencido",

          -- Quanto este cliente já trouxe, desde sempre. É o número que muda a
          -- conversa: um atraso de mil reais de quem já pagou cem mil não é o
          -- mesmo atraso de quem nunca pagou nada.
          coalesce((SELECT sum(p."valorCentavos") FROM pagamentos p
                      JOIN faturas f ON f.id = p."faturaId"
                     WHERE p."tenantId" = ${ctx.tenantId} AND f."clienteId" = ${id}
                       AND p."estornadoEm" IS NULL), 0)
        + coalesce((SELECT sum("valorPagoCentavos") FROM lancamentos
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND tipo = 'RECEBER' AND "pagoEm" IS NOT NULL), 0)    AS "pagouTotal",

          coalesce((SELECT sum("valorCentavos") FROM lancamentos
                     WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
                       AND tipo = 'RECEBER' AND "pagoEm" IS NULL), 0)        AS "avulsoAberto"
      `,

      tx.$queryRaw<Array<{ total: bigint; abertas: bigint }>>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO'))
                 AS abertas
          FROM ordens WHERE "tenantId" = ${ctx.tenantId} AND "clienteId" = ${id}
      `,
    ])

    const d = dinheiro[0]
    const c = contagens[0]

    return {
      cliente,
      equipamentos: equipamentos.map((e) => ({
        id: e.id,
        marca: e.marca,
        modelo: e.modelo,
        numeroSerie: e.numeroSerie,
        categoria: e.categoria,
        temFoto: Boolean(e.fotoCaminho),
        passagens: e._count.ordens,
      })),
      ordens: ordens.map((o) => ({
        id: o.id,
        numero: o.numero,
        etapa: o.etapa,
        aberta: !ENCERRADAS.includes(o.etapa),
        abertaEm: o.abertaEm,
        prazoPrometido: o.prazoPrometido,
        equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
      })),
      faturas: faturas.map((f) => ({
        id: f.id,
        numero: f.numero,
        status: f.status,
        vencimento: f.vencimento,
        vencida: Boolean(f.vencimento && f.vencimento < new Date()),
        abertoCentavos:
          f.valorTotalCentavos + f.multaCentavos + f.jurosCentavos - f.valorPagoCentavos,
        ordemId: f.ordem.id,
        ordemNumero: f.ordem.numero,
      })),
      contratos,
      deveCentavos: Number(d?.deve ?? 0),
      vencidoCentavos: Number(d?.vencido ?? 0),
      pagouTotalCentavos: Number(d?.pagouTotal ?? 0),
      avulsoAbertoCentavos: Number(d?.avulsoAberto ?? 0),
      ordensTotal: Number(c?.total ?? 0),
      ordensAbertas: Number(c?.abertas ?? 0),
    }
  })
}
