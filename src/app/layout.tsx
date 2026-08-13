import type { Metadata, Viewport } from 'next'
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
  applicationName: 'DTECH MED',
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
