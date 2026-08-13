import localFont from 'next/font/local'

/**
 * Tipografia servida pelo próprio domínio.
 *
 * Sem Google Fonts nem CDN: cada requisição a host externo é um ponto de
 * falha, um vazamento de referrer e uma exceção que a CSP teria de abrir.
 * Os arquivos vivem em public/fonts e são pré-carregados.
 *
 * `display: swap` mostra o texto na hora com a fonte de sistema e troca
 * quando a real chega. É melhor ler numa fonte provisória por 200 ms do que
 * encarar um bloco em branco.
 */

export const sora = localFont({
  src: [
    { path: '../../public/fonts/sora-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/sora-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/sora-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--f-display',
  display: 'swap',
  // Ajusta a métrica do fallback para reduzir o pulo de layout na troca.
  adjustFontFallback: 'Arial',
})

export const manrope = localFont({
  src: [
    { path: '../../public/fonts/manrope-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/manrope-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/manrope-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/manrope-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--f-texto',
  display: 'swap',
  adjustFontFallback: 'Arial',
})

export const jetbrains = localFont({
  src: [
    { path: '../../public/fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/jetbrains-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--f-mono',
  display: 'swap',
})

export const classesDeFonte = `${sora.variable} ${manrope.variable} ${jetbrains.variable}`
