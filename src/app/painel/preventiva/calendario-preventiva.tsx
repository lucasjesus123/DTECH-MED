'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import estilo from '../painel.module.css'

export type VisitaNoCalendario = {
  id: string
  /** 'AAAA-MM-DD' no fuso de Lajeado — o dia que VALE (combinado, ou previsto). */
  dia: string
  /** 'AAAA-MM-DD' — o que o contrato calculou. Igual a `dia` quando não remarcou. */
  previstaPara: string
  hora: string | null
  status: 'PREVISTA' | 'AGENDADA' | 'REALIZADA'
  cliente: string
  equipamento: string
  responsavel: string | null
  /** O id de quem vai — o formulário precisa dele para reabrir na pessoa certa. */
  responsavelId: string | null
  contrato: number
  ordemId: string | null
}

/**
 * O CALENDARINHO DA PREVENTIVA.
 *
 * =============================================================================
 * POR QUE UMA GRADE, E NÃO MAIS UMA LISTA
 * =============================================================================
 * A tela já tinha a lista do que vence. Lista responde "o que vem primeiro" e
 * não responde a pergunta que se faz antes de marcar qualquer coisa: **onde
 * cabe?**. Para saber que a terça está livre e a quinta tem três visitas, uma
 * lista obriga a contar linha por linha; a grade responde de relance.
 *
 * É a mesma informação que o Calendário grande mostra — e é de propósito. O que
 * muda é a distância: lá ela chega misturada com rota, contrato e compromisso,
 * porque a pergunta de lá é "o que a casa tem esta semana". Aqui só há
 * preventiva, porque quem abre esta tela está decidindo revisão.
 *
 * =============================================================================
 * O QUE ELE É, E O QUE ELE NÃO É
 * =============================================================================
 * Ele NÃO é um segundo calendário: todo dia leva para o dia correspondente do
 * Calendário da casa, e é lá que se marca qualquer outra coisa. Aqui o clique
 * faz uma coisa só — escolher a visita para marcar, que é o trabalho desta
 * tela.
 *
 * =============================================================================
 * A GRADE É MONTADA NO NAVEGADOR, E ISSO É DE PROPÓSITO
 * =============================================================================
 * Andar de mês não pode custar uma ida ao servidor: quem está procurando onde
 * encaixar uma visita passa por quatro meses em dez segundos, e uma tela que
 * pisca a cada seta faz a pessoa desistir e marcar no papel.
 *
 * O servidor manda uma janela larga de visitas — meses para trás e para a
 * frente —, e o mês desenhado é um recorte dela. Sair da janela mostra a grade
 * vazia com um aviso honesto, em vez de mentir dizendo que não há visita.
 */
export default function CalendarioPreventiva({
  visitas,
  hoje,
  mesInicial,
  janela,
  aoEscolher,
  visitaEmFoco,
}: {
  visitas: VisitaNoCalendario[]
  /** 'AAAA-MM-DD' — hoje no fuso de Lajeado, calculado no servidor. */
  hoje: string
  /** 'AAAA-MM' do mês que abre. */
  mesInicial: string
  /** Os limites do que o servidor mandou: ['AAAA-MM', 'AAAA-MM']. */
  janela: [string, string]
  /** Clicar numa visita devolve o id para a tela abrir o formulário. */
  aoEscolher: (id: string) => void
  visitaEmFoco: string | null
}) {
  const [mes, setMes] = useState(mesInicial)

  const porDia = useMemo(() => {
    const m = new Map<string, VisitaNoCalendario[]>()
    for (const v of visitas) {
      const lista = m.get(v.dia)
      if (lista) lista.push(v)
      else m.set(v.dia, [v])
    }
    return m
  }, [visitas])

  const semanas = useMemo(() => gradeDoMes(mes), [mes])
  const foraDaJanela = mes < janela[0] || mes > janela[1]

  const doMes = visitas.filter((v) => v.dia.slice(0, 7) === mes)
  const marcadas = doMes.filter((v) => v.status === 'AGENDADA').length
  const porMarcar = doMes.filter((v) => v.status === 'PREVISTA').length

  return (
    <section className={estilo.calPrev}>
      <header className={estilo.calPrevCab}>
        <div className={estilo.calPrevNav}>
          <button
            type="button"
            className={estilo.calPrevSeta}
            onClick={() => setMes(mesVizinho(mes, -1))}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <strong className={estilo.calPrevMes}>{nomeDoMes(mes)}</strong>
          <button
            type="button"
            className={estilo.calPrevSeta}
            onClick={() => setMes(mesVizinho(mes, 1))}
            aria-label="Próximo mês"
          >
            ›
          </button>
          {mes !== hoje.slice(0, 7) ? (
            <button type="button" className={estilo.calPrevHoje} onClick={() => setMes(hoje.slice(0, 7))}>
              hoje
            </button>
          ) : null}
        </div>

        {/* O resumo do mês em duas palavras. É a leitura que a grade sozinha
            não dá: ela mostra ONDE, e isto mostra QUANTO falta decidir. */}
        <p className={estilo.calPrevResumo}>
          {doMes.length === 0 ? (
            'Nenhuma revisão neste mês.'
          ) : (
            <>
              <span className={estilo.calPrevPontoMarcada} aria-hidden="true" />
              {marcadas} marcada{marcadas === 1 ? '' : 's'}
              {porMarcar > 0 ? (
                <>
                  {' · '}
                  <span className={estilo.calPrevPontoPrevista} aria-hidden="true" />
                  {porMarcar} a marcar
                </>
              ) : null}
            </>
          )}
        </p>
      </header>

      {foraDaJanela ? (
        <p className={estilo.calPrevVazio}>
          Este mês está fora da janela carregada. Veja no{' '}
          <Link href={`/painel/calendario?ver=mes&dia=${mes}-01`}>Calendário</Link>, que busca
          qualquer período.
        </p>
      ) : (
        <table className={estilo.calPrevGrade}>
          <thead>
            <tr>
              {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana) => (
              <tr key={semana[0]!.dia}>
                {semana.map(({ dia, doMes: dentro }) => {
                  const lista = porDia.get(dia) ?? []
                  const ehHoje = dia === hoje
                  return (
                    <td
                      key={dia}
                      className={[
                        estilo.calPrevDia,
                        dentro ? '' : estilo.calPrevFora,
                        ehHoje ? estilo.calPrevHojeCelula : '',
                        lista.length > 0 ? estilo.calPrevComVisita : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className={estilo.calPrevNumero}>
                        {Number(dia.slice(8, 10))}
                        {/* O dia com visita leva ao Calendário da casa, onde
                            ela aparece junto de rota e compromisso. Não há
                            dois calendários: há um, e este é a janela dele. */}
                        {lista.length > 0 ? (
                          <Link
                            href={`/painel/calendario?ver=dia&dia=${dia}`}
                            className={estilo.calPrevVerNoDia}
                            aria-label={`Ver o dia ${dia.split('-').reverse().join('/')} no calendário da casa`}
                          >
                            ↗
                          </Link>
                        ) : null}
                      </span>

                      {lista.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={[
                            estilo.calPrevSelo,
                            v.status === 'AGENDADA' ? estilo.calPrevSeloMarcada : '',
                            v.status === 'REALIZADA' ? estilo.calPrevSeloFeita : '',
                            v.status === 'PREVISTA' && v.dia < hoje ? estilo.calPrevSeloAtrasada : '',
                            visitaEmFoco === v.id ? estilo.calPrevSeloAberto : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => aoEscolher(v.id)}
                          title={`${v.cliente} · ${v.equipamento}${v.hora ? ` · ${v.hora}` : ''}${
                            v.responsavel ? ` · ${v.responsavel}` : ''
                          }`}
                        >
                          {v.hora ? <span className={estilo.calPrevHora}>{v.hora}</span> : null}
                          <span className={estilo.calPrevCliente}>{v.cliente}</span>
                        </button>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={estilo.calPrevLegenda}>
        <span className={estilo.calPrevPontoMarcada} aria-hidden="true" /> marcada com o cliente
        <span className={estilo.calPrevPontoPrevista} aria-hidden="true" /> só prevista pelo contrato
        <span className={estilo.calPrevPontoAtraso} aria-hidden="true" /> venceu e ninguém marcou
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   As contas do calendário.

   Elas vivem aqui, e não em `server/consultas/periodo`, porque este componente
   roda NO NAVEGADOR: importar aquele módulo arrastaria para o pacote do
   navegador tudo o que ele carrega junto. São quinze linhas de aritmética de
   data, e a regra delas é uma só — tudo em UTC, do começo ao fim.

   Por que UTC numa tela que mostra hora de Lajeado: a grade só manipula DIAS
   ('AAAA-MM-DD'), e somar dias em horário local tropeça no horário de verão —
   um dia de 23 horas faz `setDate(+1)` cair no mesmo dia. Em UTC todo dia tem
   24 horas. O fuso já foi aplicado no servidor, quando cada visita virou a
   string do dia dela.
   --------------------------------------------------------------------------- */

function diaVizinho(dia: string, passo: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  const base = new Date(Date.UTC(a, m - 1, d))
  base.setUTCDate(base.getUTCDate() + passo)
  return base.toISOString().slice(0, 10)
}

function mesVizinho(mes: string, passo: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const base = new Date(Date.UTC(a, m - 1 + passo, 1))
  return base.toISOString().slice(0, 7)
}

function gradeDoMes(mes: string): Array<Array<{ dia: string; doMes: boolean }>> {
  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const ultimo = `${mes}-${String(ultimoDia).padStart(2, '0')}`

  const primeiro = `${mes}-01`
  const [a1, m1, d1] = primeiro.split('-').map(Number) as [number, number, number]
  let cursor = diaVizinho(primeiro, -new Date(Date.UTC(a1, m1 - 1, d1)).getUTCDay())

  const semanas: Array<Array<{ dia: string; doMes: boolean }>> = []
  // Seis semanas cobrem qualquer mês do calendário gregoriano. A trava existe
  // para que um erro de aritmética vire uma grade curta, e não um laço infinito
  // dentro da renderização.
  while ((cursor <= ultimo || semanas.length === 0) && semanas.length < 6) {
    semanas.push(
      Array.from({ length: 7 }, (_, i) => {
        const d = diaVizinho(cursor, i)
        return { dia: d, doMes: d.slice(0, 7) === mes }
      }),
    )
    cursor = diaVizinho(cursor, 7)
  }
  return semanas
}

const FMT_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function nomeDoMes(mes: string): string {
  const t = FMT_MES.format(new Date(`${mes}-01T12:00:00Z`))
  return t.charAt(0).toUpperCase() + t.slice(1)
}
