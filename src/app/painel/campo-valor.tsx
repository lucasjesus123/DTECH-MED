'use client'

import estilo from './painel.module.css'

/**
 * =============================================================================
 * UM CAMPO DE DINHEIRO QUE DEIXA DIGITAR
 * =============================================================================
 * Os campos de valor do sistema eram `<input type="number">` presos ao estado
 * com `Number(e.target.value)`. Parece a coisa óbvia e torna o campo inutilizável
 * de três jeitos que se somam — os três medidos na tela, não deduzidos:
 *
 *   · APAGAR NÃO APAGA. `Number('')` é 0. No instante em que a pessoa limpa o
 *     campo para digitar, o "0" volta escrito por cima. É isto que trava: ela
 *     apaga, aparece 0, ela digita 52, e o campo mostra "052".
 *   · VÍRGULA QUEBRA. `Number('380,50')` é NaN — e vírgula é como se escreve
 *     dinheiro no Brasil. O total ia para NaN ou para R$ 0,00.
 *   · PONTO DE MILHAR MENTE. `Number('1.200')` é 1,2. Mil e duzentos viram um e
 *     vinte, calados, num campo de dinheiro.
 *
 * -----------------------------------------------------------------------------
 * POR QUE `type="text"` E NÃO `type="number"`
 * -----------------------------------------------------------------------------
 * `number` traz a setinha de incremento — que num campo de preço não serve para
 * nada, ocupa a largura onde o valor deveria caber e ainda muda o valor quando
 * a roda do mouse passa por cima. E ele recusa a vírgula em boa parte dos
 * navegadores, que é justamente o separador daqui.
 *
 * `inputMode="decimal"` é o que importa no celular: o teclado abre numérico do
 * mesmo jeito, com a vírgula à mão.
 *
 * -----------------------------------------------------------------------------
 * ELE GUARDA O QUE FOI DIGITADO
 * -----------------------------------------------------------------------------
 * O estado é TEXTO. É o que permite existir o momento em que o campo está em
 * "38," — no meio da digitação, sem valor ainda. Um estado numérico não tem
 * como representar esse instante, e é por isso que ele reescrevia por cima.
 *
 * A conversão acontece na borda: na soma que a tela mostra e no envio, com
 * `lerValorBR`, que é a função que o resto do sistema já usa para ler dinheiro
 * digitado por gente.
 */
export default function CampoValor({
  valor,
  aoMudar,
  rotulo,
  nome,
  placeholder = '0,00',
  alinharDireita = true,
}: {
  valor: string
  aoMudar: (texto: string) => void
  /** Vai para o leitor de tela; o rótulo visível costuma ser o `<label>` de fora. */
  rotulo: string
  /** Quando o campo também precisa viajar no FormData. */
  nome?: string
  placeholder?: string
  alinharDireita?: boolean
}) {
  return (
    <input
      className={alinharDireita ? `${estilo.campo} ${estilo.dir}` : estilo.campo}
      type="text"
      inputMode="decimal"
      name={nome}
      value={valor}
      onChange={(e) => aoMudar(limpar(e.target.value))}
      placeholder={placeholder}
      aria-label={rotulo}
      autoComplete="off"
    />
  )
}

/**
 * Deixa passar o que compõe um número digitado por gente — dígito, vírgula e
 * ponto — e barra o resto.
 *
 * O que ela NÃO faz é tão importante quanto o que faz: não normaliza, não
 * completa, não conserta. "38," continua "38," enquanto a pessoa não terminou.
 * Corrigir no meio da digitação é o mesmo erro do `Number()`, escrito mais
 * devagar.
 */
function limpar(texto: string): string {
  return texto.replace(/[^\d.,]/g, '')
}
