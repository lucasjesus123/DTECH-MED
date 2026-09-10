import Link from 'next/link'
import type { ReactNode } from 'react'
import type { TomEstado } from '@/lib/esteira'
import { Icone, type NomeIcone } from './icones'
import estilo from './pecas.module.css'

/**
 * AS PEÇAS DE MONTAR.
 *
 * Toda tela do sistema é composição destas. É o que sustenta a quarta regra do
 * redesenho — *"aprendeu uma tela, aprendeu todas"* — e ela só é verdade se
 * ninguém puder inventar um cartão diferente na tela seguinte.
 *
 * Todas são componentes de SERVIDOR. Nenhuma tem estado; nenhuma precisa de
 * JavaScript no navegador. O que precisa — o botão-da-vez, o quadro, a captura
 * — mora em arquivos próprios, marcados com `'use client'`, e a fronteira é
 * essa: interatividade custa JavaScript, e o resto não deve pagar por ela.
 */

// ===========================================================================
// CHIP DE ESTADO
// ===========================================================================

const CLASSE_CHIP: Record<TomEstado, string | undefined> = {
  ok: estilo.chipOk,
  warn: estilo.chipWarn,
  danger: estilo.chipDanger,
  info: estilo.chipInfo,
  pending: estilo.chipPending,
}

export function Chip({ tom, children }: { tom: TomEstado; children: ReactNode }) {
  return <span className={`${estilo.chip} ${CLASSE_CHIP[tom] ?? ''}`}>{children}</span>
}

/**
 * O chip do TEAL, e ele é o único.
 *
 * Reservado a três coisas: score de saúde do cliente, insight/sugestão e selo
 * de automação. Uma cor que aparece em tudo não significa nada; quando o teal
 * acende, a pessoa aprende que ali quem falou foi o sistema.
 */
export function ChipAutomacao({ children }: { children: ReactNode }) {
  return <span className={`${estilo.chip} ${estilo.chipAi}`}>{children}</span>
}

// ===========================================================================
// <StatCardRow> — a fileira de quatro números
// ===========================================================================

export type Stat = {
  rotulo: string
  valor: string | number
  apoio?: string
  tom?: 'neutro' | 'ok' | 'warn' | 'danger' | 'info'
  icone?: NomeIcone
  /** Para onde este número leva. Número que não leva a lugar nenhum faz a
      pessoa procurar onde ele mora. */
  href?: string
}

const CLASSE_STAT = {
  neutro: '',
  ok: estilo.statOk,
  warn: estilo.statWarn,
  danger: estilo.statDanger,
  info: estilo.statInfo,
} as const

export function StatCardRow({ stats }: { stats: Stat[] }) {
  return (
    <div className={estilo.stats}>
      {stats.map((s) => {
        const corpo = (
          <>
            <div className={estilo.statTopo}>
              <span className={estilo.statRotulo}>{s.rotulo}</span>
              {s.icone ? (
                <span className={estilo.statSelo} aria-hidden="true">
                  <Icone nome={s.icone} />
                </span>
              ) : null}
            </div>
            <strong className={estilo.statNumero}>{s.valor}</strong>
            {s.apoio ? <span className={estilo.statApoio}>{s.apoio}</span> : null}
          </>
        )
        const classe = `${estilo.stat} ${CLASSE_STAT[s.tom ?? 'neutro'] ?? ''}`
        return s.href ? (
          <Link key={s.rotulo} href={s.href} className={classe}>
            {corpo}
          </Link>
        ) : (
          <div key={s.rotulo} className={classe}>
            {corpo}
          </div>
        )
      })}
    </div>
  )
}

// ===========================================================================
// <EmptyState> — "Tudo em dia ✓"
// ===========================================================================

const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

const Nada = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12h7" />
  </svg>
)

/**
 * O estado vazio — calmo e positivo, nunca uma tela crua.
 *
 * `bom` é o padrão porque na maioria das vezes o vazio É boa notícia: a fila
 * desta pessoa acabou. O modo neutro existe para o vazio que não é vitória —
 * uma busca sem resultado, uma lista que ainda não começou.
 */
export function EmptyState({
  titulo,
  apoio,
  bom = true,
  acao,
}: {
  titulo: string
  apoio?: string
  bom?: boolean
  acao?: ReactNode
}) {
  return (
    <div className={estilo.vazio}>
      <span
        className={bom ? estilo.vazioIcone : `${estilo.vazioIcone} ${estilo.vazioIconeNeutro}`}
        aria-hidden="true"
      >
        {bom ? <Visto /> : <Nada />}
      </span>
      <strong className={estilo.vazioTitulo}>{titulo}</strong>
      {apoio ? <p className={estilo.vazioApoio}>{apoio}</p> : null}
      {acao}
    </div>
  )
}

// ===========================================================================
// ESTRUTURA DE TELA
// ===========================================================================

/**
 * O cabeçalho da tela: título, uma linha de explicação e A ação.
 *
 * UMA ação, e é regra: *"toda ação principal de uma tela é UM botão colorido,
 * grande, com verbo no imperativo"*. Se uma tela precisa de duas ações
 * principais, ela é duas telas.
 */
export function CabecalhoTela({
  titulo,
  apoio,
  acao,
}: {
  titulo: string
  apoio?: string
  acao?: ReactNode
}) {
  return (
    <header className={estilo.cabecalho}>
      <div className={estilo.cabecalhoTxt}>
        <h1>{titulo}</h1>
        {apoio ? <p>{apoio}</p> : null}
      </div>
      {acao ? <div className={estilo.cabecalhoAcao}>{acao}</div> : null}
    </header>
  )
}

export function Secao({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className={estilo.secao}>
      {titulo ? <h2 className={estilo.secaoTitulo}>{titulo}</h2> : null}
      {children}
    </section>
  )
}

export function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={estilo.bloco}>
      <h3 className={estilo.blocoTitulo}>{titulo}</h3>
      {children}
    </section>
  )
}

/**
 * O ALERTA da gestão.
 *
 * Ele existe porque o silêncio é o defeito mais caro deste sistema: uma O.S.
 * consertada e entregue que nunca virou cobrança não gera erro em lugar
 * nenhum — ela só não aparece no caixa, e alguém descobre no fechamento do mês.
 */
export function Alerta({
  titulo,
  apoio,
  acao,
}: {
  titulo: string
  apoio?: string
  acao?: ReactNode
}) {
  return (
    <div className={estilo.alerta}>
      <div className={estilo.alertaTxt}>
        <strong>{titulo}</strong>
        {apoio ? <span>{apoio}</span> : null}
      </div>
      {acao ? <div className={estilo.alertaAcao}>{acao}</div> : null}
    </div>
  )
}
