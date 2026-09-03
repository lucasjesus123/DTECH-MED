/**
 * O PERÍODO QUE A TELA ESTÁ OLHANDO.
 *
 * =============================================================================
 * POR QUE ISTO É UM MÓDULO, E NÃO CONTA SOLTA DENTRO DA TELA
 * =============================================================================
 * O calendário passou a ter cinco visões — dia, semana, mês, ano e lista — e
 * cada uma precisa das MESMAS quatro respostas: onde começa, onde termina, como
 * se chama, e quais são os vizinhos para as setas.
 *
 * Espalhar essa aritmética pela tela significaria escrevê-la cinco vezes, e a
 * quinta versão erraria a virada de ano ou a semana que atravessa dezembro —
 * são os dois lugares onde conta de data sempre quebra, e são os dois que
 * ninguém testa à mão.
 *
 * =============================================================================
 * AS DATAS SÃO DE LAJEADO, DITAS EM LETRAS
 * =============================================================================
 * Todo instante nasce de um texto com `-03:00` colado, e não do relógio do
 * processo. É a mesma decisão de `janelaDoMes` em `caixa.ts`: o fuso do
 * servidor muda de máquina para máquina, e a conta de "primeiro de agosto"
 * feita no fuso errado engole a primeira madrugada de setembro.
 *
 * A navegação entre dias, por outro lado, é feita em UTC (`Date.UTC` + somar
 * dias). Somar 24 horas a um instante local erra no dia em que o horário de
 * verão volta — e o Brasil já teve, e pode ter de novo. Em UTC, um dia sempre
 * tem 24 horas, e a conversão para o dia de Lajeado acontece só na exibição.
 */

export type Visao = 'dia' | 'semana' | 'mes' | 'ano' | 'lista'

export const VISOES: Array<[Visao, string]> = [
  ['dia', 'Dia'],
  ['semana', 'Semana'],
  ['mes', 'Mês'],
  ['ano', 'Ano'],
  ['lista', 'Lista'],
]

const FUSO = 'America/Sao_Paulo'

/** O dia de hoje em Lajeado, como 'AAAA-MM-DD'. */
export function hojeEmLajeado(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Aceita o que veio da URL. Lixo vira hoje, nunca erro na tela. */
export function diaValido(bruto: string | undefined): string {
  return bruto && /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : hojeEmLajeado()
}

export function visaoValida(bruto: string | undefined): Visao {
  return VISOES.some(([v]) => v === bruto) ? (bruto as Visao) : 'mes'
}

/** Um dia somado ou subtraído, sem tropeçar em horário de verão. Ver o topo. */
export function diaVizinho(dia: string, passo: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  const base = new Date(Date.UTC(a, m - 1, d))
  base.setUTCDate(base.getUTCDate() + passo)
  return base.toISOString().slice(0, 10)
}

/** O domingo da semana de um dia — o começo da linha na grade. */
export function domingoDaSemana(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  const base = new Date(Date.UTC(a, m - 1, d))
  return diaVizinho(dia, -base.getUTCDay())
}

/** Os sete dias da semana de um dia. */
export function semanaDe(dia: string): string[] {
  const domingo = domingoDaSemana(dia)
  return Array.from({ length: 7 }, (_, i) => diaVizinho(domingo, i))
}

/** O instante do começo de um dia em Lajeado. */
function instanteDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`)
}

export type Periodo = {
  visao: Visao
  /** Instantes absolutos: `[inicio, fim)`. */
  inicio: Date
  fim: Date
  /** O que vai no cabeçalho — "Quinta, 3 de setembro", "Setembro de 2026", "2026". */
  titulo: string
  /** Para as setas: o mesmo endereço, um período para trás e um para frente. */
  anteriorDia: string
  proximoDia: string
  /** O mês e o dia que a URL deve carregar para representar este período. */
  mes: string
  dia: string
}

const NOME_DO_DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})

const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: 'short',
})

const MES_ANO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, month: 'long', year: 'numeric' })

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Resolve o período inteiro a partir da visão e do dia em foco.
 *
 * O DIA EM FOCO manda em tudo, inclusive nas visões de mês e de ano: assim as
 * cinco visões falam a mesma língua e trocar de visão nunca perde o lugar. Quem
 * estava olhando 15 de setembro na visão de dia e clica em "Ano" cai em 2026 —
 * e não em janeiro do ano corrente, que é o que aconteceria se cada visão
 * guardasse a própria âncora.
 */
export function resolverPeriodo(visao: Visao, dia: string): Periodo {
  const [ano, mes] = dia.split('-') as [string, string]
  const mesTexto = `${ano}-${mes}`

  switch (visao) {
    case 'dia': {
      const inicio = instanteDoDia(dia)
      return {
        visao,
        inicio,
        fim: instanteDoDia(diaVizinho(dia, 1)),
        titulo: maiuscula(NOME_DO_DIA.format(inicio)),
        anteriorDia: diaVizinho(dia, -1),
        proximoDia: diaVizinho(dia, 1),
        mes: mesTexto,
        dia,
      }
    }

    case 'semana': {
      const domingo = domingoDaSemana(dia)
      const sabado = diaVizinho(domingo, 6)
      return {
        visao,
        inicio: instanteDoDia(domingo),
        fim: instanteDoDia(diaVizinho(sabado, 1)),
        // "31 de ago a 6 de set" — as duas pontas, porque uma semana que
        // atravessa o mês é justamente a que confunde.
        titulo: `${DIA_CURTO.format(instanteDoDia(domingo))} a ${DIA_CURTO.format(instanteDoDia(sabado))}`,
        anteriorDia: diaVizinho(domingo, -7),
        proximoDia: diaVizinho(domingo, 7),
        mes: mesTexto,
        dia,
      }
    }

    case 'ano': {
      return {
        visao,
        inicio: new Date(`${ano}-01-01T00:00:00-03:00`),
        fim: new Date(`${Number(ano) + 1}-01-01T00:00:00-03:00`),
        titulo: ano,
        anteriorDia: `${Number(ano) - 1}-${mes}-01`,
        proximoDia: `${Number(ano) + 1}-${mes}-01`,
        mes: mesTexto,
        dia,
      }
    }

    // Mês e lista olham a mesma janela; o que muda é o desenho.
    default: {
      const inicio = new Date(`${mesTexto}-01T00:00:00-03:00`)
      const m = Number(mes)
      const proximoMes = m === 12 ? `${Number(ano) + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`
      const anteriorMes = m === 1 ? `${Number(ano) - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
      return {
        visao,
        inicio,
        fim: new Date(`${proximoMes}-01T00:00:00-03:00`),
        titulo: maiuscula(MES_ANO.format(inicio)),
        anteriorDia: `${anteriorMes}-01`,
        proximoDia: `${proximoMes}-01`,
        mes: mesTexto,
        dia,
      }
    }
  }
}

/**
 * As seis semanas da grade de um mês — o mesmo desenho de sempre.
 *
 * Vive aqui e não na consulta porque é geometria de tela, não pergunta ao
 * banco: a grade existe igual num mês sem nenhum evento.
 */
export function gradeDoMes(mes: string): Array<Array<{ dia: string; doMes: boolean }>> {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const primeiro = `${mes}-01`
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const ultimo = `${mes}-${String(ultimoDia).padStart(2, '0')}`

  const semanas: Array<Array<{ dia: string; doMes: boolean }>> = []
  let cursor = domingoDaSemana(primeiro)

  while (cursor <= ultimo || semanas.length === 0) {
    const semana = Array.from({ length: 7 }, (_, i) => {
      const d = diaVizinho(cursor, i)
      return { dia: d, doMes: d.slice(0, 7) === mes }
    })
    semanas.push(semana)
    cursor = diaVizinho(cursor, 7)
    // Trava: seis semanas cobrem qualquer mês do calendário gregoriano. Sem
    // ela, um erro de aritmética viraria laço infinito na renderização.
    if (semanas.length >= 6) break
  }
  return semanas
}

/** Os doze meses de um ano, cada um com a própria grade. Para a visão de ano. */
export function gradeDoAno(ano: string): Array<{ mes: string; nome: string; semanas: ReturnType<typeof gradeDoMes> }> {
  const soMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, month: 'long' })
  return Array.from({ length: 12 }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, '0')}`
    return {
      mes,
      nome: maiuscula(soMes.format(new Date(`${mes}-01T12:00:00-03:00`))),
      semanas: gradeDoMes(mes),
    }
  })
}
