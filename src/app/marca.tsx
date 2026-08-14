import estilo from './site.module.css'

/**
 * A marca DTECH MED.
 *
 * O desenho vem do PDF oficial (`public/marca/`) e é aplicado como MÁSCARA de
 * CSS, não como `<img>` nem embutido no HTML. A escolha resolve três coisas de
 * uma vez:
 *
 *  · `currentColor` funciona. Um SVG dentro de `<img>` é um documento à parte e
 *    não enxerga a cor do texto ao redor — precisaríamos de um arquivo por cor.
 *    Com máscara, o elemento é pintado com a cor corrente e o desenho só recorta
 *    esse pincel. O mesmo arquivo serve o topo escuro, o rodapé claro e o
 *    violeta da marca.
 *  · O arquivo fica em cache. Embutir os caminhos no HTML custaria uns 8 KB em
 *    TODA página, sempre — e a marca não muda.
 *  · Não pisca. A cor é pintada de imediato; o recorte chega junto com o CSS,
 *    que já é bloqueante.
 *
 * Um detalhe que não é opcional: a proporção vai no CSS, com `aspect-ratio`.
 * Sem ela o elemento nasce com altura zero, o conteúdo abaixo sobe, e depois
 * desce quando a máscara carrega — o pulo de layout que estraga a primeira
 * impressão e o LCP junto.
 */

type Props = {
  /** Largura em pixels. A altura vem da proporção, no CSS. */
  larguraPx?: number
  className?: string
}

/** O conjunto: símbolo + palavra. Proporção 6,02 : 1. */
export function Marca({ larguraPx = 168, className }: Props) {
  return (
    <span
      className={`${estilo.marcaSvg} ${className ?? ''}`}
      style={{ width: larguraPx }}
      aria-hidden="true"
    />
  )
}

/** Só o símbolo: a cruz fundida ao D. Praticamente quadrado. */
export function Simbolo({ larguraPx = 32, className }: Props) {
  return (
    <span
      className={`${estilo.marcaSimbolo} ${className ?? ''}`}
      style={{ width: larguraPx }}
      aria-hidden="true"
    />
  )
}
