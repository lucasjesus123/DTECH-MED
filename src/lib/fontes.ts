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
 * INTER — a fonte de quem trabalha oito horas na tela.
 *
 * =============================================================================
 * POR QUE ELA ENTROU NO LUGAR DA JAKARTA
 * =============================================================================
 * O pedido do dono, olhando a janela da O.S.:
 *
 *   "consegue mudar as fonte do meu sistema? eu gostaria de uma fonte mais
 *    visível, melhor... acho essa muito estranha e ruim"
 *
 * A Plus Jakarta Sans não é uma fonte ruim — ela é uma fonte com PERSONALIDADE,
 * e personalidade é o que se quer numa página que vende, não numa tela que se
 * encara o dia inteiro. O que dá o ar "estranho" nela é concreto e dá para
 * apontar: as terminações inclinadas do `t` e do `f`, o `J` que desce abaixo da
 * linha, o `l` sem qualquer marca que o separe do `I` maiúsculo e do `1`.
 *
 * Nesta tela isso não é gosto. "LAUR0 JUNI0R" e "LAURO JUNIOR" precisam ser
 * diferentes à primeira vista num nome de motorista, e `1180` num endereço não
 * pode virar `ll80`.
 *
 * A Inter foi desenhada exatamente para isto: para texto de interface, em
 * tamanho pequeno, em tela. Ela tem a altura de x mais alta (a letra minúscula
 * ocupa mais do corpo, então lê maior no MESMO tamanho — que é literalmente o
 * "mais visível" que ele pediu), as aberturas mais largas no `c`, `e` e `s`, e
 * o `1` com pé, que é o que separa um do outro.
 *
 * O QUE ELA NÃO FAZ é ter opinião. E é o ponto: numa ferramenta, a fonte que
 * não se nota é a que está funcionando.
 *
 * =============================================================================
 * ELA É CARREGADA AQUI, MAS SÓ APONTADA DENTRO DE `.app`
 * =============================================================================
 * O `next/font` precisa ser declarado no módulo para gerar o `@font-face` e o
 * `preload`. Quem decide ONDE ela vale é o CSS: `--f-display` e `--f-texto`
 * são reapontados dentro de `.app` (o painel) e de `.aparelho` (o aplicativo
 * de campo). O site não referencia `--fonte-console` em lugar nenhum.
 *
 * =============================================================================
 * O SITE NÃO MUDA
 * =============================================================================
 * `dtechmed.com.br` continua na Sora e na Manrope, e é para continuar mesmo: a
 * Sora ecoa o desenho do logotipo e o site É a página que vende. A regra da
 * casa segue valendo — mexer no sistema não é mexer no site.
 *
 * Auto-hospedada, como todas: os arquivos vieram do pacote do Fontsource e
 * moram em `public/fonts`. Sem Google Fonts, sem CDN, sem exceção na CSP.
 */
export const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/inter-latin-800-normal.woff2', weight: '800', style: 'normal' },
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

export const classesDeFonte = `${sora.variable} ${manrope.variable} ${jetbrains.variable} ${inter.variable}`
