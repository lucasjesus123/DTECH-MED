import type { Metadata, Viewport } from 'next'
import { EMPRESA, enderecoEmUmaLinha } from '@/lib/empresa'
import { jetbrains, manrope, sora } from '@/lib/fontes'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'DTECH MED · Assistência técnica em equipamentos médicos e estéticos',
    template: '%s · DTECH MED',
  },
  description:
    'Consertamos aparelho de estética, médico, odontológico e hospitalar, de qualquer marca. ' +
    'A gente busca na sua sala, registra cada passo e devolve funcionando, com laudo, garantia e assinatura.',
  applicationName: EMPRESA.nome,
  // O endereço nos metadados ajuda a busca local a associar a empresa à
  // cidade certa — é por "conserto de autoclave em Lajeado" que o cliente
  // procura, não pelo nome de quem ele ainda não conhece.
  other: { 'geo.placename': `${EMPRESA.endereco.cidade}, ${EMPRESA.endereco.uf}`, endereco: enderecoEmUmaLinha() },
  // Sem isso, um link colado no WhatsApp aparece sem título nem descrição —
  // e o WhatsApp é justamente por onde os clientes chegam.
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'DTECH MED',
    title: 'Seu equipamento tem prontuário',
    description:
      'Assistência técnica multimarcas em equipamentos estéticos, médicos, odontológicos e hospitalares.',
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: true },
  // Sem esta declaração, o navegador pede `/favicon.ico` por conta própria e
  // toma 404 em toda visita. É um erro inofensivo e barulhento: enche o log de
  // ruído e faz qualquer 404 de verdade passar despercebido no meio.
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icone-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icone-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A cor da barra do navegador no celular, para o app não parecer colado
  // dentro de uma moldura branca.
  themeColor: '#08040F',
  colorScheme: 'dark',
  // viewportFit permite usar a área do notch nos apps de campo.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      style={
        {
          '--fonte-display': sora.style.fontFamily,
          '--fonte-texto': manrope.style.fontFamily,
          '--fonte-mono': jetbrains.style.fontFamily,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  )
}
