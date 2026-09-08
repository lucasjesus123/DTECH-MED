import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { lerSessao } from '@/server/auth/sessao'
import estilo from './app.module.css'
import { Credito } from '../credito'
import { RegistrarSW } from './registrar-sw'
import { Barra } from './barra'

export const metadata: Metadata = {
  title: 'DTECH MED · Campo',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DTECH MED' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Não trava o zoom: quem tem dificuldade de enxergar precisa poder ampliar,
  // e "evitar o zoom acidental" nunca justificou tirar isso de alguém.
  maximumScale: 5,
  themeColor: '#08040F',
  // Usa a área do notch — a barra inferior fica no alcance do polegar.
  viewportFit: 'cover',
}

/**
 * Moldura dos apps de campo.
 *
 * O contexto manda no desenho: pessoa na rua, uma mão só, sol na tela, 4G
 * ruim. Coluna única, alvo grande, uma decisão por tela e navegação embaixo.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar?destino=/app')

  /**
   * O PRIMEIRO DESTINO DA BARRA MUDA COM O PAPEL, e o nome dele também.
   *
   * A rota do motorista e a bancada do técnico não são a mesma coisa. Chamar as
   * duas de "Início" pouparia esta linha e faria o técnico procurar um endereço
   * que não existe na tela dele.
   *
   * Quem administra cai na rota em modo gestão — é a tela que mostra a operação
   * do dia inteira, que é o que ele vem ver aqui.
   */
  const inicio =
    sessao.papel === Papel.TECNICO
      ? { href: '/app/tecnico', rotulo: 'Bancada' }
      : { href: '/app/motorista', rotulo: 'Rota' }

  return (
    <div className={estilo.aparelho}>
      <RegistrarSW />
      {children}
      {/* Discreto e no fim da rolagem: quem está na rua com uma mão só não
          pode ter o polegar disputando espaço com um crédito. */}
      <footer className={estilo.rodape}>
        <Credito />
      </footer>
      <Barra inicio={inicio} />
    </div>
  )
}
