'use client'

import { useTransition } from 'react'
import { definirTema, type Tema } from '@/server/acoes/tema'
import estilo from './app.module.css'

/**
 * CLARO OU ESCURO, no perfil do aplicativo de campo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Porque quem usa este aplicativo trabalha no sol. O fundo escuro é ótimo para
 * quem está numa sala e péssimo para quem está numa calçada ao meio-dia: a tela
 * escura vira espelho, e o motorista acaba lendo o endereço com a mão fazendo
 * sombra.
 *
 * Não é preferência de gosto, é condição de trabalho — e muda no meio do dia,
 * o que é justamente o motivo de ficar a dois toques e não num cadastro.
 *
 * ---------------------------------------------------------------------------
 * DOIS RÓTULOS, E NÃO UM INTERRUPTOR
 * ---------------------------------------------------------------------------
 * Interruptor obriga a decorar qual lado é qual. Dois rótulos escritos mostram
 * as duas verdades ao mesmo tempo, com a escolhida marcada — e numa tela que se
 * usa de relance, com uma mão, ler é mais barato que lembrar.
 *
 * É a mesma decisão e o mesmo desenho do seletor do painel. Duas telas que
 * fazem a mesma pergunta devem fazê-la do mesmo jeito.
 */
export default function TemaDoCampo({ atual }: { atual: Tema }) {
  const [trocando, iniciar] = useTransition()

  const opcoes: ReadonlyArray<{ valor: Tema; rotulo: string; titulo: string }> = [
    { valor: 'claro', rotulo: 'Clara', titulo: 'Tela clara — melhor no sol' },
    { valor: 'escuro', rotulo: 'Escura', titulo: 'Tela escura — melhor à noite' },
  ]

  return (
    <section className={estilo.temaCampo}>
      <p className={estilo.temaCampoTitulo}>Tela</p>
      <p className={estilo.temaCampoNota}>
        No sol, a tela clara se lê sem fazer sombra com a mão. À noite, a escura cansa menos.
      </p>
      <div className={estilo.temaCampoOpcoes} role="radiogroup" aria-label="Tema da tela">
        {opcoes.map((o) => {
          const marcado = o.valor === atual
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={marcado}
              title={o.titulo}
              className={marcado ? estilo.temaCampoAtiva : estilo.temaCampoOpcao}
              /* Só o marcado fica no caminho do Tab: dentro de um grupo de
                 rádio são as setas que andam entre as opções. É o que a
                 plataforma faz, e imitar isso custa menos que ensinar outra
                 coisa. */
              tabIndex={marcado ? 0 : -1}
              disabled={trocando}
              onClick={() => iniciar(() => void definirTema(o.valor, 'campo'))}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                e.preventDefault()
                const i = opcoes.findIndex((x) => x.valor === atual)
                const passo = e.key === 'ArrowRight' ? 1 : -1
                const proxima = opcoes[(i + passo + opcoes.length) % opcoes.length]!
                iniciar(() => void definirTema(proxima.valor, 'campo'))
              }}
            >
              {o.rotulo}
            </button>
          )
        })}
      </div>
    </section>
  )
}
