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

/**
 * PLUS JAKARTA SANS — a fonte do CONSOLE, e só dele.
 *
 * =============================================================================
 * POR QUE UMA QUARTA FAMÍLIA, SE JÁ HAVIA TRÊS
 * =============================================================================
 * O site e o sistema deixaram de ser a mesma cara de propósito. O site vende:
 * ele é violeta, arejado, e a Sora ali ecoa o desenho do logotipo. O sistema é
 * operado oito horas por dia por quem já foi convencido — ele precisa de
 * densidade, de número grande legível de relance e de contraste extremo entre
 * o número e o rótulo.
 *
 * A Jakarta 800 tem o contraforma fechado e a haste reta que aguentam um
 * número de 60px sem virar mancha, e a 400 lê bem em 13px numa tabela de
 * quarenta linhas. A Sora, no mesmo tamanho pequeno, abre demais.
 *
 * =============================================================================
 * ELA É CARREGADA AQUI, MAS SÓ APONTADA DENTRO DE `.app`
 * =============================================================================
 * O `next/font` precisa ser declarado no módulo para gerar o `@font-face` e o
 * `preload`. Quem decide ONDE ela vale é o CSS: `--f-display` e `--f-texto`
 * são reapontados dentro de `.app`, o invólucro do painel. O site continua com
 * Sora e Manrope, e nenhuma linha dele muda.
 *
 * AUTO-HOSPEDADA, como as outras. O documento de direção pedia `<link>` para o
 * Google Fonts; a regra desta casa é mais antiga e vale mais: host externo é
 * ponto de falha, vazamento de referrer e exceção na CSP. Os arquivos vieram
 * do pacote do Fontsource e moram em `public/fonts`.
 */
export const jakarta = localFont({
  src: [
    { path: '../../public/fonts/plus-jakarta-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/plus-jakarta-sans-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--f-console',
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

export const classesDeFonte = `${sora.variable} ${manrope.variable} ${jetbrains.variable} ${jakarta.variable}`

/**
 * IBM PLEX SANS E IBM PLEX MONO — a tipografia do SISTEMA NOVO (ui_v2).
 *
 * =============================================================================
 * POR QUE MAIS DUAS, SE JÁ HAVIA QUATRO
 * =============================================================================
 * O redesenho "Azul Máquina" pede três vozes com papéis separados: Sora nos
 * títulos (ela já está aqui, e é a que ecoa o logotipo), Plex Sans no texto de
 * interface e Plex Mono nos rótulos técnicos — `ESTEIRA // BANCADA`, número de
 * O.S., id, valor em coluna.
 *
 * A Plex Sans não é a Jakarta com outro nome. A Jakarta foi escolhida para o
 * painel antigo por causa do NÚMERO GRANDE: contraforma fechado que aguenta
 * 60px sem virar mancha. O sistema novo não tem número de 60px — ele tem
 * dezenas de linhas de lista com rótulo, chip de estado e botão, e é aí que a
 * Plex ganha: altura-x alta, terminais retos, e uma mono da MESMA FAMÍLIA, com
 * as mesmas proporções. Rótulo em mono ao lado de texto em sans, quando as
 * duas são desenhadas juntas, param de parecer dois sistemas colados.
 *
 * =============================================================================
 * AUTO-HOSPEDADAS, COMO TODAS AS OUTRAS
 * =============================================================================
 * O documento de direção pedia as fontes do Google. A regra desta casa é mais
 * antiga e vale mais: host externo é ponto de falha, vazamento de referrer e
 * uma exceção que a CSP teria de abrir. Os arquivos vieram do pacote do
 * Fontsource e moram em `public/fonts`, como as outras quatro.
 *
 * ELAS SÃO CARREGADAS AQUI E SÓ APONTADAS DENTRO DO SISTEMA NOVO. O
 * `next/font` precisa da declaração no módulo para gerar o `@font-face`; quem
 * decide ONDE elas valem é o CSS de `/sistema`. O site e o painel antigo não
 * referenciam estas variáveis em lugar nenhum.
 */
export const plex = localFont({
  src: [
    { path: '../../public/fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--f-plex',
  display: 'swap',
  adjustFontFallback: 'Arial',
})

export const plexMono = localFont({
  src: [
    { path: '../../public/fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--f-plex-mono',
  display: 'swap',
})
