import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { lerSessao } from '@/server/auth/sessao'
import estilo from './app.module.css'

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
  return <div className={estilo.aparelho}>{children}</div>
}
