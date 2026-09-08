'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import estilo from './app.module.css'

/**
 * A BARRA DE BAIXO dos aplicativos de campo.
 *
 * Fica embaixo, e não em cima, por um motivo só: quem usa isto está de pé, com
 * uma mão ocupada, e o polegar não alcança o topo de um celular de seis
 * polegadas. O alto da tela é para ler; o baixo é para tocar.
 *
 * São três destinos porque três é o que cabe sem virar menu — e porque são as
 * três perguntas do dia: o que eu faço AGORA, o que vem DEPOIS, e quem eu sou
 * no sistema. Qualquer coisa além disso mora no painel, onde há teclado e
 * paciência.
 *
 * O destino do meio é o mesmo para os dois apps; o primeiro muda, porque a rota
 * do motorista e a bancada do técnico não são a mesma coisa e chamá-las pelo
 * mesmo nome faria o técnico procurar um endereço que não existe.
 */
export function Barra({ inicio }: { inicio: { href: string; rotulo: string } }) {
  const caminho = usePathname()

  const abas = [
    { href: inicio.href, rotulo: inicio.rotulo, icone: <IconeInicio /> },
    { href: '/app/agenda', rotulo: 'Agenda', icone: <IconeAgenda /> },
    { href: '/app/perfil', rotulo: 'Perfil', icone: <IconePerfil /> },
  ]

  return (
    <nav className={estilo.barra} aria-label="Navegação do aplicativo">
      {abas.map((a) => {
        /**
         * "ESTOU AQUI" precisa aguentar a tela de dentro.
         *
         * Igualdade exata apagaria a aba da rota quando o motorista abre uma
         * parada (`/app/motorista/<id>`) — e ele veria a barra inteira apagada,
         * como se tivesse saído do aplicativo. `startsWith` mantém a aba acesa
         * enquanto ele estiver em qualquer tela daquele ramo.
         */
        const aqui = caminho === a.href || caminho.startsWith(`${a.href}/`)
        return (
          <Link
            key={a.href}
            href={a.href}
            className={aqui ? `${estilo.barraAba} ${estilo.barraAtiva}` : estilo.barraAba}
            aria-current={aqui ? 'page' : undefined}
          >
            {a.icone}
            <span>{a.rotulo}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* Os ícones são desenhados aqui, e não vêm de biblioteca: são três, e uma
   dependência inteira para três traços custaria mais banda do que o aplicativo
   inteiro — num 4G ruim, que é onde ele vive. */
const traco = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconeInicio() {
  return (
    <svg {...traco}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

function IconeAgenda() {
  return (
    <svg {...traco}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function IconePerfil() {
  return (
    <svg {...traco}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  )
}
