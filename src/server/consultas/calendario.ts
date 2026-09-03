import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { janelaDoMes } from '@/server/consultas/caixa'

/**
 * O CALENDÁRIO — tudo que tem data e ainda vai acontecer, numa grade só.
 *
 * =============================================================================
 * A PERGUNTA
 * =============================================================================
 * "O que vem por aí?"
 *
 * Ela não era feita de dentro de nenhuma tela, e por isso não tinha resposta em
 * nenhuma. A rota sabia das paradas, a preventiva das visitas, o Financeiro dos
 * vencimentos, e os contratos do próprio fim. Cinco calendários mentais, e
 * ninguém conseguindo dizer se a quinta-feira que vem está cheia ou vazia.
 *
 * O custo disso é concreto: marca-se entrega para o mesmo dia em que três
 * preventivas vencem, e o motorista descobre na hora.
 *
 * =============================================================================
 * AS CINCO FONTES, E POR QUE ELAS CABEM JUNTAS
 * =============================================================================
 * Elas têm naturezas diferentes — uma parada é trabalho de rua, um vencimento é
 * dinheiro — mas respondem à MESMA pergunta e disputam o MESMO dia. É isso que
 * as põe na mesma grade.
 *
 *   PARADA       retirada e entrega marcadas
 *   PREVENTIVA   visita de contrato prevista
 *   PAGAR        conta a pagar vencendo
 *   RECEBER      conta a receber ou fatura vencendo
 *   CONTRATO     contrato de manutenção terminando
 *
 * =============================================================================
 * UMA CONSULTA POR FONTE, E NÃO UM UNION GIGANTE
 * =============================================================================
 * Um `UNION ALL` de cinco tabelas com formatos diferentes exigiria encaixar
 * todas num conjunto de colunas comum, e cada coluna que só serve a uma fonte
 * viraria `NULL` nas outras quatro. O resultado é uma consulta que ninguém
 * consegue alterar sem quebrar as demais.
 *
 * Cinco consultas simples na MESMA transação custam praticamente o mesmo e cada
 * uma continua legível sozinha. A junção acontece em JavaScript, onde ela é
 * trivial.
 */

export type TipoEvento = 'parada' | 'preventiva' | 'pagar' | 'receber' | 'contrato' | 'compromisso'

export type Evento = {
  id: string
  tipo: TipoEvento
  /** 'AAAA-MM-DD' no fuso de Lajeado — a chave do dia na grade. */
  dia: string
  titulo: string
  detalhe: string | null
  /** Para onde a pessoa vai quando clica. */
  href: string
  /** Dinheiro, quando o evento tem valor. */
  valorCentavos: number | null
  /** Passou da data e ninguém resolveu. */
  atrasado: boolean
}

/**
 * O dia de um instante, no fuso de Lajeado.
 *
 * A conversão acontece aqui e não no banco porque a grade é montada em
 * JavaScript: fazer metade em SQL e metade aqui abriria espaço para as duas
 * discordarem na virada da meia-noite, que é exatamente o defeito que
 * `lib/datas` documenta.
 */
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const diaDe = (d: Date) => FMT.format(d)

/** '14h' ou '14h30' — a janela combinada, curta o bastante para o cartão. */
const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})
const horaDe = (d: Date) => HORA.format(d).replace(':00', 'h').replace(':', 'h')

/**
 * O DINHEIRO NÃO VAI PARA QUEM NÃO PODE VER DINHEIRO.
 *
 * `comEscopo` filtra por EMPRESA, e não por papel — é o RLS do banco fazendo o
 * isolamento entre franquias. Ele não sabe nada sobre quem é motorista.
 *
 * Sem este parâmetro, o calendário entregaria ao motorista toda conta a pagar e
 * a receber da empresa: salários, aluguel, quanto cada cliente deve. O
 * calendário existe para ele ver as PARADAS da semana e se organizar; o resto
 * não é dele.
 *
 * O corte é feito na CONSULTA e não na tela. Filtrar só na renderização mandaria
 * os valores pelo fio até o navegador dele, onde qualquer um lê no inspetor —
 * "não mostrar" e "não enviar" são coisas diferentes.
 */
export async function eventosNoPeriodo(
  ctx: ContextoAcesso,
  inicio: Date,
  fim: Date,
  opcoes: { comDinheiro: boolean },
): Promise<Evento[]> {
  const agora = new Date()
  const { comDinheiro } = opcoes

  return comEscopo(ctx, async (tx) => {
    const [paradas, preventivas, contas, faturas, contratos, compromissos] = await Promise.all([
      // `previstoPara` É O DIA DA PARADA, e é obrigatório. `janelaInicio` é
      // OPCIONAL — ela guarda a faixa de horário combinada com o cliente
      // ("entre 14h e 17h"), e a maior parte das paradas não tem nenhuma.
      //
      // A primeira versão filtrou por `janelaInicio`, e o calendário perdia
      // TODA parada sem horário combinado. No cenário de ensaio isso eram as
      // 32 — a grade aparecia vazia num mês cheio de rota, e nada acusava,
      // porque zero é um resultado perfeitamente válido para uma consulta.
      tx.agendamento.findMany({
        where: {
          previstoPara: { gte: inicio, lt: fim },
          status: { notIn: ['CANCELADO'] },
        },
        orderBy: [{ previstoPara: 'asc' }, { janelaInicio: 'asc' }],
        take: 400,
        select: {
          id: true,
          tipo: true,
          status: true,
          previstoPara: true,
          janelaInicio: true,
          motorista: { select: { nome: true } },
          ordem: {
            select: {
              id: true,
              numero: true,
              cliente: { select: { nome: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          },
        },
      }),

      tx.visitaPreventiva.findMany({
        where: { previstaPara: { gte: inicio, lt: fim }, status: { notIn: ['CANCELADA'] } },
        orderBy: { previstaPara: 'asc' },
        take: 300,
        select: {
          id: true,
          previstaPara: true,
          status: true,
          ordemId: true,
          contrato: {
            select: {
              id: true,
              numero: true,
              cliente: { select: { nome: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          },
        },
      }),

      comDinheiro
        ? tx.lancamento.findMany({
        where: { vencimento: { gte: inicio, lt: fim }, pagoEm: null },
        orderBy: { vencimento: 'asc' },
        take: 400,
        select: {
          id: true,
          tipo: true,
          descricao: true,
          vencimento: true,
          valorCentavos: true,
          contraparte: true,
          cliente: { select: { nome: true } },
        },
      })
        : [],

      comDinheiro
        ? tx.fatura.findMany({
        where: { vencimento: { gte: inicio, lt: fim }, status: { in: ['ABERTA', 'PARCIAL'] } },
        orderBy: { vencimento: 'asc' },
        take: 300,
        select: {
          id: true,
          numero: true,
          vencimento: true,
          valorTotalCentavos: true,
          valorPagoCentavos: true,
          multaCentavos: true,
          jurosCentavos: true,
          cliente: { select: { nome: true } },
          ordem: { select: { id: true } },
        },
      })
        : [],

      tx.contratoManutencao.findMany({
        where: { fim: { gte: inicio, lt: fim }, ativo: true },
        orderBy: { fim: 'asc' },
        take: 100,
        select: {
          id: true,
          numero: true,
          fim: true,
          clienteId: true,
          cliente: { select: { nome: true } },
          equipamento: { select: { marca: true, modelo: true } },
        },
      }),

      // Os COMPROMISSOS do mês. Note a ausência de qualquer coisa sobre papel:
      // eles são da EMPRESA, e todo mundo do painel vê a agenda da equipe. Era
      // uma agenda privada por pessoa que responderia "o que EU tenho hoje" e
      // perderia a pergunta que o Calendário existe para responder.
      tx.compromisso.findMany({
        where: { dia: { gte: inicio, lt: fim } },
        orderBy: [{ dia: 'asc' }, { hora: 'asc' }],
        take: 200,
        select: {
          id: true,
          titulo: true,
          dia: true,
          hora: true,
          observacao: true,
          concluido: true,
          responsavel: { select: { nome: true } },
        },
      }),
    ])

    const eventos: Evento[] = []

    for (const a of paradas) {
      const buscar = a.tipo === 'RETIRADA'
      eventos.push({
        id: `ag-${a.id}`,
        tipo: 'parada',
        dia: diaDe(a.previstoPara),
        titulo: `${buscar ? 'Buscar' : 'Entregar'} · ${a.ordem.cliente.nome}`,
        detalhe: [
          // A janela combinada entra no detalhe quando existe — é o que a
          // pessoa precisa dizer ao cliente que ligar perguntando a hora.
          a.janelaInicio ? horaDe(a.janelaInicio) : null,
          `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`,
          a.motorista?.nome ?? 'sem motorista',
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/painel/ordens/${a.ordem.id}`,
        valorCentavos: null,
        // Parada de ontem que ninguém concluiu é trabalho perdido, não histórico.
        atrasado: a.status !== 'CONCLUIDO' && a.previstoPara < agora,
      })
    }

    for (const v of preventivas) {
      eventos.push({
        id: `pv-${v.id}`,
        tipo: 'preventiva',
        dia: diaDe(v.previstaPara),
        titulo: `Preventiva · ${v.contrato.cliente.nome}`,
        detalhe: `${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}`,
        href: v.ordemId ? `/painel/ordens/${v.ordemId}` : '/painel/preventiva',
        valorCentavos: null,
        atrasado: v.status === 'PREVISTA' && v.previstaPara < agora,
      })
    }

    for (const l of contas) {
      eventos.push({
        id: `lc-${l.id}`,
        tipo: l.tipo === 'PAGAR' ? 'pagar' : 'receber',
        dia: diaDe(l.vencimento),
        titulo: l.descricao,
        detalhe: l.cliente?.nome ?? l.contraparte,
        // O mês vem do PRÓPRIO vencimento, e não do período que a tela está
        // olhando: a grade mostra os dias vizinhos que completam a primeira e a
        // última semana, e um vencimento do dia 31 de agosto visto na grade de
        // setembro levaria ao Financeiro de setembro, onde ele não está.
        href: `/painel/financeiro?aba=${l.tipo === 'PAGAR' ? 'pagar' : 'receber'}&mes=${diaDe(l.vencimento).slice(0, 7)}`,
        valorCentavos: l.valorCentavos,
        atrasado: l.vencimento < agora,
      })
    }

    for (const f of faturas) {
      eventos.push({
        id: `ft-${f.id}`,
        tipo: 'receber',
        dia: diaDe(f.vencimento!),
        titulo: `Fatura #${String(f.numero).padStart(4, '0')} · ${f.cliente.nome}`,
        detalhe: 'cobrança de serviço',
        href: `/painel/ordens/${f.ordem.id}`,
        valorCentavos:
          f.valorTotalCentavos + f.multaCentavos + f.jurosCentavos - f.valorPagoCentavos,
        atrasado: f.vencimento! < agora,
      })
    }

    /**
     * OS COMPROMISSOS — a sexta fonte, e a única que nasce aqui.
     *
     * As outras cinco são consequência: a parada vem de uma ordem, a preventiva
     * de um contrato, o vencimento de um lançamento. Esta é a que a pessoa
     * escreve direto no dia — e sem ela o Calendário só espelhava outras telas.
     *
     * `dia` já é uma coluna `date`: nada de fuso aqui, o dia é o dia.
     */
    for (const k of compromissos) {
      eventos.push({
        id: `cp-${k.id}`,
        tipo: 'compromisso',
        dia: k.dia.toISOString().slice(0, 10),
        titulo: k.hora ? `${k.hora} · ${k.titulo}` : k.titulo,
        detalhe: [k.responsavel?.nome, k.observacao].filter(Boolean).join(' · ') || null,
        href: `/painel/calendario?mes=${k.dia.toISOString().slice(0, 7)}&dia=${k.dia.toISOString().slice(0, 10)}`,
        valorCentavos: null,
        // Compromisso vencido e não concluído é o que ninguém fez — e é isso que
        // a agenda precisa gritar. Concluído nunca é atraso, mesmo se passou.
        atrasado: !k.concluido && k.dia.toISOString().slice(0, 10) < diaDe(agora),
      })
    }

    for (const k of contratos) {
      eventos.push({
        id: `ct-${k.id}`,
        tipo: 'contrato',
        dia: diaDe(k.fim!),
        titulo: `Contrato #${String(k.numero).padStart(4, '0')} termina`,
        detalhe: `${k.cliente.nome} · ${k.equipamento.marca} ${k.equipamento.modelo}`,
        href: `/painel/clientes/${k.clienteId}`,
        valorCentavos: null,
        // Contrato que já terminou e continua ativo é renovação esquecida — o
        // caso em que a empresa segue atendendo de graça sem perceber.
        atrasado: k.fim! < agora,
      })
    }

    return eventos.sort((a, b) => (a.dia === b.dia ? ordem(a.tipo) - ordem(b.tipo) : a.dia < b.dia ? -1 : 1))
  })
}

/**
 * Dentro do mesmo dia: primeiro o que exige sair de casa.
 *
 * Rua e bancada têm hora marcada e pessoa alocada; vencimento é do dia inteiro
 * e se resolve entre uma coisa e outra. Ordenar por dinheiro primeiro faria a
 * parada das 8h aparecer depois da conta de luz.
 */
function ordem(t: TipoEvento): number {
  // O COMPROMISSO vem PRIMEIRO dentro do dia, e não é ordem alfabética.
  //
  // Ele é a única fonte que uma pessoa escreveu à mão para aquele dia — as
  // outras cinco são consequência de outra coisa. Quem anotou "visitar a
  // clínica antes de orçar" no dia 12 escreveu justamente porque não queria
  // esquecer, e enterrá-lo abaixo de quatro vencimentos desfaz o motivo de ele
  // existir.
  return { compromisso: 0, parada: 1, preventiva: 2, contrato: 3, receber: 4, pagar: 5 }[t]
}

/**
 * O MÊS INTEIRO — o atalho de sempre, agora por cima do período.
 *
 * Continua existindo porque "o mês" é a pergunta mais feita, e escrever as duas
 * pontas da janela em toda chamada convidaria alguém a errar uma delas.
 */
export async function eventosDoMes(
  ctx: ContextoAcesso,
  mes: string,
  opcoes: { comDinheiro: boolean },
): Promise<Evento[]> {
  const { inicio, fim } = janelaDoMes(mes)
  return eventosNoPeriodo(ctx, inicio, fim, opcoes)
}

/**
 * QUANTOS EVENTOS EM CADA DIA — só a contagem, para a visão de ANO.
 *
 * =============================================================================
 * POR QUE NÃO REUSAR `eventosNoPeriodo`
 * =============================================================================
 * A visão de ano desenha 365 quadradinhos. Ela não precisa do título, do
 * detalhe, do link nem do valor de nada — precisa saber se o dia tem alguma
 * coisa e quantas. Buscar o ano inteiro em eventos completos seria trazer
 * milhares de linhas com seis junções cada para pintar pontos, e ainda bateria
 * nos tetos por fonte (`take`), que existem para a grade do mês: um ano
 * apareceria truncado sem nada avisar.
 *
 * =============================================================================
 * AQUI O `UNION ALL` É CERTO — E NO OUTRO CASO ERA ERRADO
 * =============================================================================
 * O cabeçalho deste arquivo recusa o UNION para os eventos, e com razão: seis
 * tabelas com formatos diferentes só cabem juntas se cada coluna que serve a
 * uma virar NULL nas outras cinco.
 *
 * A contagem não tem esse problema: as seis fontes viram exatamente as mesmas
 * duas colunas — o dia e o tipo. Onde os formatos JÁ são iguais, uma consulta
 * só é mais simples que seis, e o banco agrega sem trazer linha nenhuma para o
 * JavaScript.
 *
 * A conversão de fuso é feita no SQL (`AT TIME ZONE`) porque é o banco que está
 * agrupando. É a única parte do calendário em que a data vira dia fora do
 * JavaScript, e por isso o fuso está escrito com todas as letras, igual ao que
 * `diaDe` usa aqui em cima.
 */
export async function contagemPorDia(
  ctx: ContextoAcesso,
  inicio: Date,
  fim: Date,
  opcoes: { comDinheiro: boolean },
): Promise<Map<string, number>> {
  const dinheiro = opcoes.comDinheiro

  const linhas = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ dia: string; n: bigint }>>`
      SELECT dia, count(*) AS n FROM (
        SELECT to_char("previstoPara" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia
          FROM agendamentos
         WHERE "previstoPara" >= ${inicio} AND "previstoPara" < ${fim}
           AND status <> 'CANCELADO'

        UNION ALL
        SELECT to_char("previstaPara" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          FROM visitas_preventivas
         WHERE "previstaPara" >= ${inicio} AND "previstaPara" < ${fim}
           AND status <> 'CANCELADA'

        UNION ALL
        SELECT to_char(dia AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          FROM compromissos
         WHERE dia >= ${inicio} AND dia < ${fim}

        UNION ALL
        SELECT to_char(fim AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          FROM contratos_manutencao
         WHERE fim >= ${inicio} AND fim < ${fim} AND ativo = true

        -- O dinheiro entra na contagem só para quem pode ver dinheiro. Sem
        -- isto, o motorista contaria os vencimentos da empresa nos pontos do
        -- ano: não leria os valores, mas leria os DIAS de pagamento — que é
        -- informação que também não é dele.
        UNION ALL
        SELECT to_char(vencimento AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          FROM lancamentos
         WHERE ${dinheiro} AND vencimento >= ${inicio} AND vencimento < ${fim}
           AND "pagoEm" IS NULL

        UNION ALL
        SELECT to_char(vencimento AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
          FROM faturas
         WHERE ${dinheiro} AND vencimento >= ${inicio} AND vencimento < ${fim}
           AND status IN ('ABERTA', 'PARCIAL')
      ) t
      GROUP BY dia
    `,
  )

  return new Map(linhas.map((l) => [l.dia, Number(l.n)]))
}
