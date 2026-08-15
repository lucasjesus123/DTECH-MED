import type { Metadata, Viewport } from 'next'
import { EMPRESA, enderecoEmUmaLinha } from '@/lib/empresa'
import { env } from '@/lib/env'
import { jetbrains, manrope, sora } from '@/lib/fontes'
import './globals.css'

export const metadata: Metadata = {
  /**
   * A base de toda URL absoluta desta página.
   *
   * Sem ela, o Next monta `og:image` como caminho relativo — e o WhatsApp, o
   * Facebook e o LinkedIn, que buscam a imagem de fora, recebem um caminho que
   * não resolve e mostram o link sem imagem nenhuma. É o defeito de
   * compartilhamento mais comum que existe, e o mais silencioso: no navegador
   * a página fica perfeita.
   *
   * Vem de `APP_URL`, então acompanha a troca de domínio sem ninguém precisar
   * lembrar de editar aqui.
   */
  metadataBase: new URL(env.APP_URL),

  /**
   * A URL canônica.
   *
   * O mesmo site responde por `dtechmed.com.br`, `www.dtechmed.com.br`, com e
   * sem barra no fim, e com qualquer `?utm_source=` grudado por campanha. Para
   * o Google, cada uma dessas é uma página diferente competindo com as outras
   * pela mesma busca. A canônica é a frase que resolve: "todas são esta".
   */
  alternates: { canonical: '/' },

  title: {
    // O que o Google mostra como título azul do resultado. A regra é caber em
    // ~60 caracteres e começar pelo que a pessoa digitou — ela procura por
    // "assistência técnica equipamento estético", não pelo nome de uma empresa
    // que ainda não conhece.
    default: 'Assistência técnica de equipamentos médicos e estéticos · DTECH MED',
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
    url: '/',
    title: 'Seu equipamento tem prontuário',
    description:
      'Assistência técnica multimarcas em equipamentos estéticos, médicos, odontológicos e hospitalares.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: `${EMPRESA.nome} · assistência técnica de equipamentos médicos e estéticos`,
      },
    ],
  },

  // O Twitter/X ignora o OpenGraph em parte dos casos e usa este bloco. Sem
  // ele, o card sai só com o texto.
  twitter: {
    card: 'summary_large_image',
    title: 'Seu equipamento tem prontuário',
    description:
      'Assistência técnica multimarcas em equipamentos estéticos, médicos, odontológicos e hospitalares.',
    images: ['/og.png'],
  },
  /**
   * `max-image-preview: large` é o que autoriza o Google a usar a imagem
   * grande no resultado, em vez da miniatura. `max-snippet: -1` tira o limite
   * de caracteres do trecho. Os dois são opt-in: sem declarar, o buscador
   * escolhe o conservador.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  keywords: [
    'assistência técnica de equipamentos estéticos',
    'manutenção de equipamentos médicos',
    'conserto de autoclave',
    'calibração de equipamento estético',
    'laudo técnico de equipamento médico',
    `assistência técnica ${EMPRESA.endereco.cidade}`,
  ],

  category: 'Assistência técnica',
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
