'use client'

import { useTransition } from 'react'
import { definirTema, type Tema } from '@/server/acoes/tema'
import estilo from './shell.module.css'

/**
 * CLARO OU ESCURO — dois botões, não um interruptor.
 *
 * Interruptor obriga a decorar qual lado é qual; dois rótulos escritos mostram
 * as duas verdades ao mesmo tempo, com a escolhida marcada.
 *
 * `radiogroup` porque são opções mutuamente exclusivas da mesma pergunta: quem
 * usa leitor de tela ouve "Tema, Escuro, 2 de 2" em vez de dois botões sem
 * relação, e quem usa teclado atravessa com as setas em vez de dois Tabs.
 *
 * A escolha é gravada em cookie pelo servidor, e é por isso que ela sobrevive a
 * uma navegação sem clarão: o HTML já sai com o tema certo. As telas de
 * ADMINISTRAÇÃO ignoram esta escolha de propósito — são sempre escuras, e o
 * porquê está em tokens.css.
 */
export default function SeletorTema({ atual }: { atual: Tema }) {
  const [trocando, iniciar] = useTransition()

  const opcoes: ReadonlyArray<{ valor: Tema; rotulo: string; titulo: string }> = [
    { valor: 'claro', rotulo: 'Claro', titulo: 'Tela clara' },
    { valor: 'escuro', rotulo: 'Escuro', titulo: 'Tela escura' },
  ]

  return (
    <div className={estilo.tema} role="radiogroup" aria-label="Tema da tela">
      {opcoes.map((o) => {
        const marcado = o.valor === atual
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={marcado}
            title={o.titulo}
            className={marcado ? estilo.temaOpcaoAtiva : estilo.temaOpcao}
            /* Só o marcado fica no caminho do Tab: dentro de um grupo de rádio
               são as setas que andam entre as opções. É o que a plataforma faz,
               e imitar isso custa menos que ensinar outra coisa. */
            tabIndex={marcado ? 0 : -1}
            disabled={trocando}
            onClick={() => iniciar(() => void definirTema(o.valor))}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const i = opcoes.findIndex((x) => x.valor === atual)
              const passo = e.key === 'ArrowRight' ? 1 : -1
              const proxima = opcoes[(i + passo + opcoes.length) % opcoes.length]!
              iniciar(() => void definirTema(proxima.valor))
            }}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}
