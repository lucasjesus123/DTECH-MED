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

export type TipoEvento = 'parada' | 'preventiva' | 'pagar' | 'receber' | 'contrato'

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
export async function eventosDoMes(
  ctx: ContextoAcesso,
  mes: string,
  opcoes: { comDinheiro: boolean },
): Promise<Evento[]> {
  const { inicio, fim } = janelaDoMes(mes)
  const agora = new Date()
  const { comDinheiro } = opcoes

  return comEscopo(ctx, async (tx) => {
    const [paradas, preventivas, contas, faturas, contratos] = await Promise.all([
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
        href: `/painel/financeiro?aba=${l.tipo === 'PAGAR' ? 'pagar' : 'receber'}&mes=${mes}`,
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
  return { parada: 0, preventiva: 1, contrato: 2, receber: 3, pagar: 4 }[t]
}

/**
 * A grade do mês: as semanas, com os dias que o calendário mostra.
 *
 * Inclui os dias vizinhos que completam a primeira e a última semana — sem
 * eles a grade fica com buracos nas pontas e o olho perde a coluna do dia da
 * semana, que é justamente como se lê um calendário.
 */
export function gradeDoMes(mes: string): Array<Array<{ dia: string; doMes: boolean }>> {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const primeiro = new Date(Date.UTC(ano, m - 1, 1))
  const ultimo = new Date(Date.UTC(ano, m, 0))

  // Recua até o domingo anterior (ou o próprio, se o mês começa num domingo).
  const comeco = new Date(primeiro)
  comeco.setUTCDate(1 - primeiro.getUTCDay())

  const semanas: Array<Array<{ dia: string; doMes: boolean }>> = []
  const cursor = new Date(comeco)
  while (cursor <= ultimo || cursor.getUTCDay() !== 0) {
    const semana: Array<{ dia: string; doMes: boolean }> = []
    for (let i = 0; i < 7; i++) {
      const iso = cursor.toISOString().slice(0, 10)
      semana.push({ dia: iso, doMes: cursor.getUTCMonth() === m - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    semanas.push(semana)
    // Trava de segurança: seis semanas cobrem qualquer mês do calendário
    // gregoriano. Sem ela, um erro de aritmética viraria laço infinito na
    // renderização de uma página.
    if (semanas.length >= 6) break
  }
  return semanas
}
