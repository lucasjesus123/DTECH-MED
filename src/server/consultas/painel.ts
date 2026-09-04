import { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * Consultas do painel.
 *
 * A tese da tela está aqui, não no CSS: o painel não lista "ordens", ele mostra
 * **onde a esteira travou**. Por isso a consulta agrupa por etapa e traz há
 * quanto tempo cada grupo está parado — é o número que faz alguém agir.
 *
 * Tudo em uma ida ao banco por bloco. Contar sete etapas com sete consultas
 * seria sete viagens de rede a cada carregamento de tela.
 */

/** Os degraus mostrados na esteira, na ordem da jornada. */
export const DEGRAUS = [
  { chave: 'retirar', rotulo: 'A retirar', etapas: [EtapaOrdem.ORDEM_RETIRADA_GERADA, EtapaOrdem.RETIRADA_AGENDADA] },
  { chave: 'rota', rotulo: 'Em rota', etapas: [EtapaOrdem.EM_ROTA_RETIRADA] },
  { chave: 'entrada', rotulo: 'Dar entrada', etapas: [EtapaOrdem.COLETADO] },
  { chave: 'analise', rotulo: 'Em análise', etapas: [EtapaOrdem.RECEBIDO_NA_EMPRESA, EtapaOrdem.EM_ANALISE] },
  { chave: 'orcar', rotulo: 'Orçamento parado', etapas: [EtapaOrdem.ORCAMENTO_INTERNO, EtapaOrdem.ORCAMENTO_ENVIADO] },
  { chave: 'manut', rotulo: 'Em manutenção', etapas: [EtapaOrdem.ORCAMENTO_APROVADO, EtapaOrdem.EM_MANUTENCAO] },
  { chave: 'faturar', rotulo: 'A faturar', etapas: [EtapaOrdem.MANUTENCAO_CONCLUIDA, EtapaOrdem.APROVACAO_GESTAO, EtapaOrdem.FATURAMENTO] },
  { chave: 'entregar', rotulo: 'A entregar', etapas: [EtapaOrdem.FATURADO, EtapaOrdem.EM_ROTA_ENTREGA] },
] as const

export type Degrau = {
  chave: string
  rotulo: string
  total: number
  /** Quantas estão paradas há mais de cinco dias — o número que dói. */
  travadas: number
  /** Dias que a mais antiga do grupo está parada. */
  diasDaMaisAntiga: number | null
  /**
   * Média de dias que as O.S. deste degrau estão SEM ANDAR.
   *
   * O nome diz o que a conta mede, e isso importa: não é "tempo médio que uma
   * O.S. leva nesta etapa", que exigiria varrer o histórico de eventos e
   * responderia outra pergunta. Esta olha só o presente — há quanto tempo, em
   * média, o que está parado aqui parou. É a medida de REPRESA, e é ela que
   * elege o gargalo.
   *
   * `null` quando não há nada parado no degrau: média de conjunto vazio não é
   * zero, é ausência de medida, e zero ali diria "tudo fresco" para um degrau
   * que na verdade está vazio.
   */
  mediaDeDiasParado: number | null
  /**
   * O que está represado ali, em centavos.
   *
   * `null` para quem não pode ver dinheiro — e é `null` porque a consulta nem
   * chegou a rodar, não porque a tela escondeu depois.
   */
  valorEmAberto: number | null
  /** O degrau de maior permanência média. No máximo um, e pode não haver. */
  gargalo: boolean
}

/**
 * =============================================================================
 * A ESTEIRA DIZ VOLUME, IDADE E GARGALO — e não só a contagem
 * =============================================================================
 * Contagem sozinha responde "quantos", que é a pergunta fácil. As duas que
 * fazem alguém agir são "há quanto tempo" e "onde está represando", e nenhuma
 * das duas saía daqui: oito números soltos deixavam a pessoa comparar de
 * cabeça, todo dia, para descobrir onde o trabalho está preso.
 *
 * DUAS CONTAS, E A SEGUNDA SÓ QUANDO HÁ DINHEIRO A MOSTRAR. A primeira agrupa
 * por etapa e traz contagem, travadas, a mais antiga e a média de represa. A
 * segunda soma o valor em aberto, e só existe para quem pode ver dinheiro.
 *
 * O DINHEIRO É CORTADO NA CONSULTA, NÃO NA TELA. Filtrar depois mandaria o
 * valor pelo fio até o navegador do motorista, onde qualquer um lê no inspetor.
 * É exatamente o defeito que o cartão "A receber" desta mesma tela já pagou.
 */
export async function esteira(
  ctx: ContextoAcesso,
  opcoes: { comDinheiro: boolean },
): Promise<Degrau[]> {
  return comEscopo(ctx, async (tx) => {
    const linhas = await tx.$queryRaw<
      Array<{
        etapa: EtapaOrdem
        total: bigint
        travadas: bigint
        maisAntiga: Date | null
        mediaDias: number | null
      }>
    >`
      SELECT etapa,
             count(*)                                                   AS total,
             count(*) FILTER (WHERE "atualizadoEm" < now() - interval '5 days') AS travadas,
             min("atualizadoEm")                                        AS "maisAntiga",
             -- ::float8 porque avg() devolve numeric, e numeric chega no
             -- JavaScript como Decimal — um objeto, não um número. Sem o cast,
             -- a comparação que elege o gargalo sairia NaN e o gargalo seria
             -- decidido por sorteio, sempre no primeiro da lista.
             (avg(extract(epoch FROM (now() - "atualizadoEm"))) / 86400)::float8 AS "mediaDias"
        FROM ordens
       WHERE "tenantId" = ${ctx.tenantId}
         AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO','SOLICITACAO_RECEBIDA')
       GROUP BY etapa
    `

    /**
     * O VALOR REPRESADO, pela ÚLTIMA versão do orçamento.
     *
     * `DISTINCT ON` não serve: o recorte é por ordem e a soma é por etapa. O
     * `LATERAL` resolve os dois numa passada — para cada ordem, a versão mais
     * alta do orçamento dela, e só então a soma por etapa.
     *
     * Reprovado, cancelado e expirado ficam de fora: eles são o valor que NÃO
     * está represado. Somá-los inflaria a exposição do degrau com dinheiro que
     * o cliente já recusou.
     *
     * O `c."tenantId" = o."tenantId"` é redundante sob RLS, e fica de
     * propósito: quem ler esta consulta daqui a um ano vê o recorte sem
     * precisar confiar que a política do banco está ligada.
     */
    const valores = opcoes.comDinheiro
      ? await tx.$queryRaw<Array<{ etapa: EtapaOrdem; valor: bigint }>>`
          SELECT o.etapa, coalesce(sum(u."totalCentavos"), 0)::bigint AS valor
            FROM ordens o
            LEFT JOIN LATERAL (
                   SELECT c."totalCentavos"
                     FROM orcamentos c
                    WHERE c."ordemId"  = o.id
                      AND c."tenantId" = o."tenantId"
                      AND c.status NOT IN ('CANCELADO','REPROVADO','EXPIRADO')
                    ORDER BY c.versao DESC
                    LIMIT 1
                 ) u ON true
           WHERE o."tenantId" = ${ctx.tenantId}
             AND o.etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO','SOLICITACAO_RECEBIDA')
           GROUP BY o.etapa
        `
      : []

    const porEtapa = new Map(linhas.map((l) => [l.etapa, l]))
    const valorPorEtapa = new Map(valores.map((v) => [v.etapa, Number(v.valor)]))

    const degraus = DEGRAUS.map((d) => {
      let total = 0
      let travadas = 0
      let maisAntiga: Date | null = null
      let valor = 0
      // A média do degrau é PONDERADA pela contagem de cada etapa que ele
      // reúne. Média de médias mentiria: um degrau com 1 ordem parada há 40
      // dias e 20 paradas há 1 dia sairia com 20,5 dias de represa em vez de
      // 2,9 — e a mentira sempre cai para o lado de inventar um gargalo.
      let somaDeDias = 0
      for (const e of d.etapas) {
        valor += valorPorEtapa.get(e) ?? 0
        const l = porEtapa.get(e)
        if (!l) continue
        const n = Number(l.total)
        total += n
        travadas += Number(l.travadas)
        if (l.mediaDias != null) somaDeDias += l.mediaDias * n
        if (l.maisAntiga && (!maisAntiga || l.maisAntiga < maisAntiga)) maisAntiga = l.maisAntiga
      }
      return {
        chave: d.chave,
        rotulo: d.rotulo,
        total,
        travadas,
        diasDaMaisAntiga: maisAntiga
          ? Math.floor((Date.now() - maisAntiga.getTime()) / 86_400_000)
          : null,
        mediaDeDiasParado: total > 0 ? somaDeDias / total : null,
        valorEmAberto: opcoes.comDinheiro ? valor : null,
        gargalo: false,
      }
    })

    /**
     * A ELEIÇÃO DO GARGALO — no servidor, e com dois freios.
     *
     * PISO DE UM DIA. Sem ele, numa manhã em que tudo acabou de entrar, o
     * degrau com quatro horas de represa viraria "o gargalo" — e apontar
     * gargalo onde não há é pior que não apontar nenhum: gasta a atenção da
     * pessoa numa etapa que está funcionando.
     *
     * EMPATE FICA COM O DEGRAU MAIS A MONTANTE. Quando dois represam igual, o
     * de trás é o que causa: desafogar o da frente só faz o de trás despejar de
     * novo. O `>` — e não `>=` — é o que garante isso, porque `DEGRAUS` já está
     * na ordem da jornada.
     */
    let eleito: (typeof degraus)[number] | null = null
    for (const d of degraus) {
      if (d.total === 0 || d.mediaDeDiasParado == null || d.mediaDeDiasParado < 1) continue
      if (!eleito || d.mediaDeDiasParado > eleito.mediaDeDiasParado!) eleito = d
    }
    if (eleito) eleito.gargalo = true

    return degraus
  })
}

export type OrdemNaFila = {
  id: string
  numero: number
  etapa: EtapaOrdem
  cliente: string
  equipamento: string
  tecnico: string | null
  atualizadoEm: Date
  prazoPrometido: Date | null
  diasParado: number
  atrasada: boolean
}

/** A fila de um degrau, do mais parado para o mais recente. */
export async function filaDoDegrau(
  ctx: ContextoAcesso,
  chave: string,
  limite = 40,
): Promise<OrdemNaFila[]> {
  const degrau = DEGRAUS.find((d) => d.chave === chave) ?? DEGRAUS[5]
  const etapas = [...degrau.etapas]

  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: { etapa: { in: etapas } },
      // Quem está parado há mais tempo aparece primeiro: a tela ordena pelo
      // que precisa de atenção, não pelo que chegou por último.
      orderBy: { atualizadoEm: 'asc' },
      take: limite,
      select: {
        id: true,
        numero: true,
        etapa: true,
        atualizadoEm: true,
        prazoPrometido: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true } },
        tecnico: { select: { nome: true } },
      },
    }),
  )

  const agora = Date.now()
  return ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    etapa: o.etapa,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    tecnico: o.tecnico?.nome ?? null,
    atualizadoEm: o.atualizadoEm,
    prazoPrometido: o.prazoPrometido,
    diasParado: Math.floor((agora - o.atualizadoEm.getTime()) / 86_400_000),
    atrasada: o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false,
  }))
}

export type ResumoDoDia = {
  /**
   * `null` para quem não pode ver dinheiro — e é `null` porque a consulta nem
   * chegou a rodar, não porque a tela escondeu depois.
   */
  aReceber: number | null
  recebidoNoMes: number | null
  ordensAbertas: number
  atrasadas: number
  pecasAbaixoDoMinimo: number
  avisosNaFila: number
  avisosFalhados: number
}

/**
 * Os números do topo.
 *
 * Escolhidos pelo que muda a decisão do dia, não pelo que é fácil de contar.
 * "Atrasadas" está aqui porque é o número que o sistema antigo deixava crescer
 * até 173 sem ninguém ser cobrado.
 *
 * =============================================================================
 * O DINHEIRO SÓ SAI DAQUI PARA QUEM PODE VER DINHEIRO
 * =============================================================================
 * Este cartão mostrava "A receber R$ 23.335,00" para TODO MUNDO que abrisse o
 * Dashboard — inclusive para o motorista, cuja tela inteira já é cortada em
 * todo o resto do sistema. O corte estava no Calendário e no Financeiro, e
 * faltava justamente na primeira tela que qualquer pessoa vê ao entrar.
 *
 * A consulta das faturas nem chega a rodar quando não pode: filtrar depois, na
 * renderização, mandaria o valor pelo fio até o navegador de quem não deve
 * vê-lo, onde qualquer um lê no inspetor.
 */
export async function resumoDoDia(
  ctx: ContextoAcesso,
  opcoes: { comDinheiro: boolean },
): Promise<ResumoDoDia> {
  return comEscopo(ctx, async (tx) => {
    const [fin] = opcoes.comDinheiro
      ? await tx.$queryRaw<Array<{ areceber: bigint; recebido: bigint }>>`
      SELECT
        coalesce(sum("valorTotalCentavos" - "valorPagoCentavos")
                 FILTER (WHERE status IN ('ABERTA','PARCIAL')), 0) AS areceber,
        coalesce(sum("valorPagoCentavos")
                 FILTER (WHERE "quitadaEm" >= date_trunc('month', now())), 0) AS recebido
      FROM faturas WHERE "tenantId" = ${ctx.tenantId}
    `
      : [null]
    const [ord] = await tx.$queryRaw<Array<{ abertas: bigint; atrasadas: bigint }>>`
      SELECT count(*) AS abertas,
             count(*) FILTER (WHERE "prazoPrometido" < now()) AS atrasadas
        FROM ordens
       WHERE "tenantId" = ${ctx.tenantId}
         AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')
    `
    const [pec] = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pecas
       WHERE "tenantId" = ${ctx.tenantId} AND ativo = true AND saldo <= "estoqueMinimo"
    `
    const [fila] = await tx.$queryRaw<Array<{ pendentes: bigint; falhados: bigint }>>`
      SELECT count(*) FILTER (WHERE status = 'PENDENTE')   AS pendentes,
             count(*) FILTER (WHERE status = 'DESCARTADO') AS falhados
        FROM outbox_jobs WHERE "tenantId" = ${ctx.tenantId}
    `

    return {
      aReceber: opcoes.comDinheiro ? Number(fin?.areceber ?? 0) : null,
      recebidoNoMes: opcoes.comDinheiro ? Number(fin?.recebido ?? 0) : null,
      ordensAbertas: Number(ord?.abertas ?? 0),
      atrasadas: Number(ord?.atrasadas ?? 0),
      pecasAbaixoDoMinimo: Number(pec?.n ?? 0),
      avisosNaFila: Number(fila?.pendentes ?? 0),
      avisosFalhados: Number(fila?.falhados ?? 0),
    }
  })
}

export type Ofensor = {
  id: string
  numero: number
  cliente: string
  /** `null` para quem não pode ver dinheiro. */
  valorCentavos: number | null
  /** Dias de atraso, para o chip dizer o tamanho do buraco. */
  dias: number
}

export type AlertaDoDia = {
  /** `null` quando não há nada gritando. Dia calmo é resposta, não ausência. */
  tipo: 'atraso' | 'aviso' | 'estoque' | null
  titulo: string
  consequencia: string
  /** No máximo quatro; `total` diz quantos são de verdade. */
  ofensores: Ofensor[]
  total: number
  href: string
}

/**
 * =============================================================================
 * O PROBLEMA DO DIA, ANTES DE QUALQUER MÉTRICA
 * =============================================================================
 * O Dashboard abria com quatro contagens. Contagem é o que se lê DEPOIS de
 * saber que está tudo bem — ela não responde "o que eu faço agora". Quem abria
 * o sistema de manhã via "12 ordens abertas" e tinha de descobrir sozinho,
 * clicando, que três estouraram o prazo e uma delas é de um hospital.
 *
 * Este bloco responde antes de perguntarem, e responde COM NOME: o número da
 * O.S., o cliente e o valor de cada caso. Chip com nome é acionável; "3
 * atrasadas" é uma estatística sobre a qual não se faz nada.
 *
 * UM PROBLEMA POR VEZ, E O MAIS CARO PRIMEIRO. Mostrar os três juntos devolve
 * a pessoa ao estado anterior — uma parede de coisas erradas, e nenhuma
 * primeira. A ordem é: atraso, aviso que não saiu, estoque no mínimo. A
 * primeira quebra promessa feita a cliente, a segunda deixa o cliente sem
 * notícia, a terceira ainda vai travar uma O.S. amanhã.
 *
 * O DINHEIRO É CORTADO NA CONSULTA. Os chips carregam valor, e quem não pode
 * ver dinheiro roda a consulta SEM a junção que o traz — não a versão com o
 * valor filtrado depois. É a mesma regra do cartão "A receber", que já pagou
 * por não tê-la.
 */
export async function alertaDoDia(
  ctx: ContextoAcesso,
  opcoes: { comDinheiro: boolean },
): Promise<AlertaDoDia> {
  const VAZIO: AlertaDoDia = {
    tipo: null,
    titulo: '',
    consequencia: '',
    ofensores: [],
    total: 0,
    href: '',
  }

  return comEscopo(ctx, async (tx) => {
    // 1. PRAZO VENCIDO — a única das três que quebra uma promessa já feita.
    //
    // Duas consultas quase iguais, e a diferença é a junção do valor. Elas
    // estão escritas por extenso, e não montadas com um fragmento condicional,
    // porque é assim que dá para LER que a versão sem dinheiro não toca em
    // `orcamentos`. Uma consulta montada por pedaços esconde exatamente o que
    // esta regra precisa deixar à vista.
    type LinhaAtraso = {
      id: string
      numero: number
      cliente: string
      dias: number
      valor: bigint | null
    }
    const atrasadas = opcoes.comDinheiro
      ? await tx.$queryRaw<LinhaAtraso[]>`
          SELECT o.id, o.numero, c.nome AS cliente,
                 floor(extract(epoch FROM (now() - o."prazoPrometido")) / 86400)::int AS dias,
                 u."totalCentavos" AS valor
            FROM ordens o
            JOIN clientes c ON c.id = o."clienteId"
            LEFT JOIN LATERAL (
                   SELECT x."totalCentavos"
                     FROM orcamentos x
                    WHERE x."ordemId"  = o.id
                      AND x."tenantId" = o."tenantId"
                      AND x.status NOT IN ('CANCELADO','REPROVADO','EXPIRADO')
                    ORDER BY x.versao DESC
                    LIMIT 1
                 ) u ON true
           WHERE o."tenantId" = ${ctx.tenantId}
             AND o.etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')
             AND o."prazoPrometido" < now()
           ORDER BY o."prazoPrometido" ASC
        `
      : await tx.$queryRaw<LinhaAtraso[]>`
          SELECT o.id, o.numero, c.nome AS cliente,
                 floor(extract(epoch FROM (now() - o."prazoPrometido")) / 86400)::int AS dias,
                 NULL::bigint AS valor
            FROM ordens o
            JOIN clientes c ON c.id = o."clienteId"
           WHERE o."tenantId" = ${ctx.tenantId}
             AND o.etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')
             AND o."prazoPrometido" < now()
           ORDER BY o."prazoPrometido" ASC
        `

    if (atrasadas.length > 0) {
      const exposto = atrasadas.reduce((s, o) => s + Number(o.valor ?? 0), 0)
      return {
        tipo: 'atraso' as const,
        titulo:
          atrasadas.length === 1
            ? 'Uma ordem passou do prazo prometido'
            : `${atrasadas.length} ordens passaram do prazo prometido`,
        consequencia:
          opcoes.comDinheiro && exposto > 0
            ? `${formatarBRL(exposto)} em serviço já vendido, parados com a data vencida.`
            : 'O cliente ouviu uma data que já passou, e ninguém voltou a falar com ele.',
        ofensores: atrasadas.slice(0, 4).map((o) => ({
          id: o.id,
          numero: o.numero,
          cliente: o.cliente,
          valorCentavos: opcoes.comDinheiro ? Number(o.valor ?? 0) : null,
          dias: o.dias,
        })),
        total: atrasadas.length,
        href: '/painel/ordens',
      }
    }

    // 2. AVISO QUE NÃO SAIU — o cliente ficou sem notícia e ninguém soube.
    const descartados = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM outbox_jobs
       WHERE "tenantId" = ${ctx.tenantId} AND status = 'DESCARTADO'
    `
    const quantos = Number(descartados[0]?.n ?? 0)
    if (quantos > 0) {
      return {
        ...VAZIO,
        tipo: 'aviso' as const,
        titulo:
          quantos === 1
            ? 'Um aviso ao cliente não conseguiu sair'
            : `${quantos} avisos ao cliente não conseguiram sair`,
        consequencia:
          'O sistema tentou e desistiu. Quem estava esperando notícia não recebeu nenhuma.',
        total: quantos,
        href: '/painel/whatsapp',
      }
    }

    // 3. ESTOQUE NO MÍNIMO — ainda não travou nada, e vai travar.
    const pecas = await tx.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pecas
       WHERE "tenantId" = ${ctx.tenantId} AND ativo = true AND saldo <= "estoqueMinimo"
    `
    const itens = Number(pecas[0]?.n ?? 0)
    if (itens > 0) {
      return {
        ...VAZIO,
        tipo: 'estoque' as const,
        titulo: itens === 1 ? 'Uma peça está no mínimo' : `${itens} peças estão no mínimo`,
        consequencia:
          'Ainda não travou nenhuma O.S. A próxima que precisar de uma delas para na bancada.',
        total: itens,
        href: '/painel/estoque',
      }
    }

    return VAZIO
  })
}

/** O prontuário completo de uma ordem — a visão 360 do equipamento. */
export async function prontuario(ctx: ContextoAcesso, ordemId: string) {
  return comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: ordemId },
      include: {
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        atendente: { select: { nome: true } },
        eventos: { orderBy: { sequencia: 'desc' } },
        /// O serviço que esta ordem está honrando, quando ele existe no sistema.
        ordemOrigem: { select: { id: true, numero: true, garantiaAte: true } },
        fotos: { orderBy: { criadoEm: 'asc' } },
        assinaturas: true,
        documentos: { orderBy: { geradoEm: 'desc' } },
        orcamentos: {
          orderBy: { versao: 'desc' },
          include: { itens: { orderBy: { ordem: 'asc' } } },
        },
        movimentos: { include: { peca: { select: { sku: true, nome: true } } } },
        /// O que saiu de dentro do aparelho, e para onde foi.
        pecasRetiradas: { orderBy: { criadoEm: 'asc' } },
        fatura: { include: { pagamentos: { orderBy: { recebidoEm: 'asc' } } } },
        agendamentos: { include: { motorista: { select: { nome: true } } } },
        mensagens: { orderBy: { criadoEm: 'desc' }, take: 20 },
      },
    }),
  )
}
