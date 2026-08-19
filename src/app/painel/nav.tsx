'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import estilo from './painel.module.css'

/**
 * A navegação da lateral.
 *
 * ---------------------------------------------------------------------------
 * DUAS COISAS QUE FALTAVAM
 * ---------------------------------------------------------------------------
 * 1. **Onde eu estou.** A lateral listava dez telas e nenhuma dizia qual
 *    estava aberta. Em qualquer painel isso desorienta; aqui era pior, porque
 *    várias telas começam parecidas — uma barra de filtro e uma lista.
 *
 * 2. **Ícones de verdade.** Eram glifos Unicode: ◉ ▤ ◷ ☰ ⬒ ▣ ✆ ⬢ ◧. Eles
 *    dependem da fonte instalada, mudam de forma entre Windows, Mac e Android,
 *    e alguns viram quadrado vazio. Um deles era o cifrão. Não formam um
 *    conjunto: têm pesos, tamanhos ópticos e alinhamentos diferentes entre si,
 *    porque nunca foram desenhados juntos.
 *
 *    Estes são desenhados aqui, com o mesmo traço de 1,6px, a mesma caixa de
 *    24 e as pontas arredondadas do mesmo jeito. Parecem uma família porque
 *    são.
 *
 * Cliente por causa do `usePathname`. É o custo de saber onde se está, e ele é
 * pequeno: nenhum dado sensível atravessa, só a lista de rótulos e caminhos que
 * o servidor já decidiu que este papel pode ver.
 */

const T = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Painel do dia: um mostrador com o ponteiro. */
const Mostrador = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M4 15a8 8 0 0 1 16 0" />
    <path d="M12 15l4.5-4.5" />
    <path d="M4 15h2M18 15h2M12 7V5" />
  </svg>
)
/** Ordens: folhas empilhadas. */
const Ordens = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M7 4h7l4 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    <path d="M14 4v4h4M9 13h6M9 16.5h4" />
  </svg>
)
/** Agenda de rota: o caminho com duas paradas. */
const Rota = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="6" cy="7" r="2.2" />
    <circle cx="18" cy="17" r="2.2" />
    <path d="M6 9.2v3.3a3 3 0 0 0 3 3h6" />
  </svg>
)
/** Clientes: duas pessoas. */
const Clientes = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <circle cx="9.5" cy="8.5" r="3" />
    <path d="M4 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2-4.2" />
  </svg>
)
/** Equipamentos: um aparelho com visor. */
const Equipamento = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5" width="17" height="12" rx="1.6" />
    <path d="M7 9h6M7 12h3" />
    <path d="M9 20h6" />
  </svg>
)
/** Estoque: a caixa. */
const Estoque = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M4 8.5 12 4.5l8 4v7l-8 4-8-4Z" />
    <path d="M4 8.5 12 12.5l8-4M12 12.5V19.5" />
  </svg>
)
/** Financeiro: a nota com o valor. */
const Financeiro = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="6" width="17" height="12" rx="1.6" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M6.5 12h.01M17.5 12h.01" />
  </svg>
)
/** WhatsApp: o balão. */
const Balao = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M20 11.5a7.5 7.5 0 0 1-11 6.7L4.5 19.5l1.3-4.3A7.5 7.5 0 1 1 20 11.5Z" />
  </svg>
)
/** Empresas: os prédios. */
const Empresas = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M4 20V7.5l6-3v15.5" />
    <path d="M10 11h6a1 1 0 0 1 1 1v8" />
    <path d="M3 20h18M13.5 14h.01M13.5 17h.01M6.8 10h.01M6.8 13.5h.01" />
  </svg>
)
/** Site: a janela do navegador. */
const Site = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.6" />
    <path d="M3.5 9.5h17M6.5 7.3h.01M9 7.3h.01" />
  </svg>
)

/** Acompanhar: a régua com o ponto de onde está. */
const Trilha = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <path d="M3 12h18" />
    <circle cx="7" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="3" />
    <circle cx="17.5" cy="12" r="1.6" />
  </svg>
)

/** Preventiva: o calendário que volta sozinho. */
const Preventiva = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...T}>
    <rect x="3.5" y="5.5" width="17" height="14" rx="1.8" />
    <path d="M3.5 9.5h17M8 3.8v3.4M16 3.8v3.4" />
    <path d="M9 15.2a3 3 0 1 0 .9-2.1" />
    <path d="M9.4 10.9v2.4h2.4" />
  </svg>
)

const ICONES = {
  mostrador: Mostrador,
  trilha: Trilha,
  preventiva: Preventiva,
  ordens: Ordens,
  rota: Rota,
  clientes: Clientes,
  equipamento: Equipamento,
  estoque: Estoque,
  financeiro: Financeiro,
  balao: Balao,
  empresas: Empresas,
  site: Site,
} as const

export type NomeIcone = keyof typeof ICONES

export type ItemNav = { href: string; rotulo: string; icone: NomeIcone }
export type GrupoNav = { titulo: string; itens: ItemNav[] }

export default function Navegacao({ grupos }: { grupos: GrupoNav[] }) {
  const caminho = usePathname()

  return (
    <nav className={estilo.latNav} aria-label="Seções do sistema">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className={estilo.latGrupo}>{g.titulo}</p>
          {g.itens.map((i) => {
            const Icone = ICONES[i.icone]
            /**
             * `/painel` casa com a rota exata; o resto casa com o ramo.
             *
             * Sem a exceção, "Painel do dia" ficaria marcado em TODA tela do
             * sistema, porque todo caminho começa com `/painel`. Marcar tudo é
             * o mesmo que não marcar nada.
             */
            const ativo =
              i.href === '/painel'
                ? caminho === '/painel'
                : caminho === i.href || caminho.startsWith(`${i.href}/`)

            return (
              <Link
                key={i.href}
                href={i.href}
                className={ativo ? estilo.latItemAtivo : estilo.latItem}
                aria-current={ativo ? 'page' : undefined}
              >
                <span className={estilo.latIcone} aria-hidden="true">
                  <Icone />
                </span>
                {i.rotulo}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
