'use client'

import { useTransition } from 'react'
import { definirTema, type Tema } from '@/server/acoes/tema'
import estilo from './painel.module.css'

/**
 * O seletor de tema, no pé da lateral.
 *
 * ---------------------------------------------------------------------------
 * POR QUE TRÊS BOTÕES E NÃO UM INTERRUPTOR
 * ---------------------------------------------------------------------------
 * Um interruptor de dois estados não tem como representar "siga o aparelho" —
 * ele sempre mostra um dos dois ligado, e a pessoa que escolheu automático fica
 * olhando para um botão que parece dizer o contrário do que ela pediu.
 *
 * Três opções lado a lado mostram as três verdades ao mesmo tempo, e a
 * escolhida é a que está marcada. Não há estado escondido.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `radiogroup` E NÃO TRÊS BOTÕES SOLTOS
 * ---------------------------------------------------------------------------
 * São opções mutuamente exclusivas de uma mesma pergunta, e é isso que um
 * grupo de rádio significa. Para quem usa leitor de tela, a diferença é ouvir
 * "Tema, Escuro, 2 de 3" em vez de três botões sem relação entre si; para quem
 * usa teclado, é atravessar o grupo com as setas em vez de com três Tabs.
 */
export default function SeletorDeTema({ atual }: { atual: Tema }) {
  const [trocando, iniciar] = useTransition()

  const opcoes: ReadonlyArray<{ valor: Tema; rotulo: string; titulo: string }> = [
    { valor: 'claro', rotulo: 'Claro', titulo: 'Sempre claro' },
    { valor: 'escuro', rotulo: 'Escuro', titulo: 'Sempre escuro' },
    { valor: 'sistema', rotulo: 'Auto', titulo: 'Acompanha o aparelho' },
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
