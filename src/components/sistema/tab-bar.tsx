'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icone, type NomeIcone } from './icones'
import estilo from './pecas.module.css'

/**
 * `<MobileTabBar>` — os cinco ícones do app de campo.
 *
 * =============================================================================
 * CINCO, E NENHUM MENU LATERAL
 * =============================================================================
 * Quem está de pé na porta de uma clínica, com o aparelho numa mão e o celular
 * na outra, não abre gaveta. A barra fica embaixo, fixa, sempre à vista, e o
 * polegar alcança os cinco sem trocar a mão de posição.
 *
 * Cinco é o teto e é literal. O sexto item empurra a barra para tamanhos de
 * alvo que erram — e errar aqui significa abrir a tela errada com o cliente
 * esperando.
 *
 * O alvo é de 56px, acima do piso de 44 das diretrizes de toque: no campo a
 * mão está ocupada, às vezes com luva, e quase sempre em movimento.
 */

export type Aba = { href: string; rotulo: string; icone: NomeIcone }

export default function MobileTabBar({ abas }: { abas: Aba[] }) {
  const caminho = usePathname()

  return (
    <nav className={estilo.tabbar} aria-label="Navegação do aplicativo">
      {abas.map((a) => {
        // `/campo` casa exato; o resto casa com o ramo. Sem a exceção, a aba
        // "Tarefas" ficaria marcada em todas as telas do aplicativo.
        const ativo =
          a.href === '/campo' ? caminho === '/campo' : caminho.startsWith(a.href)
        return (
          <Link
            key={a.href}
            href={a.href}
            className={ativo ? estilo.abaAtiva : estilo.aba}
            aria-current={ativo ? 'page' : undefined}
          >
            <Icone nome={a.icone} />
            {a.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
