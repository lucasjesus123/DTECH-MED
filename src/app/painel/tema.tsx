'use client'

import { useTransition } from 'react'
import { definirTema, type Tema } from '@/server/acoes/tema'
import estilo from './painel.module.css'

/**
 * O seletor de tema, no pé da lateral.
 *
 * ---------------------------------------------------------------------------
 * DUAS OPÇÕES, E AS DUAS À VISTA
 * ---------------------------------------------------------------------------
 * Havia um terceiro botão, "Auto", que seguia o aparelho. Saiu por decisão do
 * dono: no painel a pessoa quer a tela que ela escolheu.
 *
 * Sobraram dois — e continuam sendo dois botões lado a lado, não um
 * interruptor. Interruptor obriga a decorar qual lado é qual; dois rótulos
 * escritos mostram as duas verdades ao mesmo tempo, com a escolhida marcada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `radiogroup` E NÃO DOIS BOTÕES SOLTOS
 * ---------------------------------------------------------------------------
 * São opções mutuamente exclusivas de uma mesma pergunta, e é isso que um
 * grupo de rádio significa. Para quem usa leitor de tela, a diferença é ouvir
 * "Tema, Escuro, 2 de 2" em vez de dois botões sem relação entre si; para quem
 * usa teclado, é atravessar o grupo com as setas em vez de com dois Tabs.
 */
export default function SeletorDeTema({ atual }: { atual: Tema }) {
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
            /* Só o marcado fica no caminho do Tab. Dentro de um grupo de rádio
               as setas é que andam entre as opções — é o que a plataforma faz,
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
