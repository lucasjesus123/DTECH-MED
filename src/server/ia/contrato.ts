/**
 * =============================================================================
 * O CONTRATO DE TODA SAÍDA DE INFERÊNCIA DO SISTEMA
 * =============================================================================
 * Este arquivo existe antes de qualquer modelo, e a ordem não é acidente.
 *
 * A regra mais dura desta direção é que teal — a tinta de IA — significa
 * "conclusão da máquina", e que o operador precisa distinguir num relance dado
 * REGISTRADO de conclusão INFERIDA. O sistema opina sobre equipamento médico:
 * quem lê "76% de chance de estourar o prazo" tem de saber, sem perguntar, de
 * onde saiu esse número e o quanto ele vale.
 *
 * Daí as três obrigações, e elas são do TIPO, não da tela:
 *
 *   1. SELO — a saída se declara inferência. Quem renderiza um `Inferencia`
 *      é obrigado a marcá-la; não há caminho em que ela se disfarce de dado.
 *   2. CONFIANÇA — percentual e BASE de cálculo. "Número sem confiança não sai
 *      da máquina" é literal: o campo não é opcional.
 *   3. FONTE RASTREÁVEL — chips clicáveis com a origem. "Se não dá para clicar
 *      e conferir, não pode ser afirmado."
 *
 * =============================================================================
 * E A QUARTA COISA, QUE É A MAIS IMPORTANTE: A RECUSA
 * =============================================================================
 * Um estimador que sempre responde é um estimador que mente quando não sabe.
 * Com três amostras no histórico, qualquer modelo produz um número — e o
 * número parece igualzinho ao que ele produziria com trezentas.
 *
 * Por isso a saída é uma UNIÃO: ou uma inferência com confiança, ou uma recusa
 * com motivo. Quem chama é obrigado pelo compilador a tratar os dois casos, e
 * a tela mostra "ainda não dá para prever, faltam N O.S. no histórico" — que é
 * uma resposta honesta e útil, em vez de um palpite com cara de medida.
 */

/** Uma fonte que dá para clicar e conferir. Sem isto, não se afirma. */
export type Fonte = {
  rotulo: string
  href: string
}

export type Inferencia<T> = {
  ok: true
  valor: T
  /**
   * De 0 a 1. NÃO é a probabilidade estimada — é o quanto a estimativa vale.
   * Uma previsão de 80% com confiança 0,2 quer dizer "o modelo aponta 80%, e
   * ele mal tem base para apontar". As duas coisas aparecem juntas na tela
   * justamente para não serem confundidas.
   */
  confianca: number
  /** A base, em português: "14 O.S. do mesmo modelo concluídas". */
  base: string
  fontes: Fonte[]
}

export type Recusa = {
  ok: false
  /** O que falta, dito para quem opera — não para quem programa. */
  motivo: string
}

export type Saida<T> = Inferencia<T> | Recusa

/**
 * O INTERVALO DE WILSON, e por que ele e não o "normal aproximado".
 *
 * A conta de escola — p ± z·√(p(1−p)/n) — quebra exatamente onde este sistema
 * mais precisa dela: com n pequeno, ou com p perto de 0 ou de 1. Ela chega a
 * devolver intervalo negativo, e devolve largura ZERO quando p = 0 ou p = 1 —
 * ou seja, anuncia certeza absoluta a partir de cinco amostras que por acaso
 * deram todas o mesmo lado. É assim que um painel ganha um "100% de chance"
 * que ninguém consegue desmentir.
 *
 * Wilson não tem esse buraco: ele encolhe em direção a 1/2 quando a amostra é
 * pequena e nunca sai de [0, 1]. Com n = 5 e 5 acertos, ele devolve algo como
 * [0,57 · 1,00] — largura 0,43 —, e é isso que faz a confiança sair baixa e a
 * previsão ser recusada, que é o comportamento certo.
 *
 * @param acertos quantas amostras deram o evento
 * @param n tamanho da amostra
 * @param z escore normal; 1,645 para 90%
 */
export function wilson(acertos: number, n: number, z = 1.645): { baixo: number; alto: number } {
  if (n <= 0) return { baixo: 0, alto: 1 }
  const p = acertos / n
  const z2 = z * z
  const denominador = 1 + z2 / n
  const centro = (p + z2 / (2 * n)) / denominador
  const meia = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominador
  return {
    baixo: Math.max(0, centro - meia),
    alto: Math.min(1, centro + meia),
  }
}

/**
 * A CONFIANÇA SAI DA LARGURA DO INTERVALO, e não do tamanho da amostra.
 *
 * Amostra grande com resultado dividido ao meio também é incerteza: cem O.S.
 * em que cinquenta estouraram o prazo não permitem dizer nada sobre a próxima.
 * A largura do intervalo captura as duas fontes de dúvida de uma vez — quantas
 * observações existem, e o quanto elas concordam.
 *
 * `1 − largura` porque é assim que se lê: intervalo estreito, confiança alta.
 */
export function confiancaDe(acertos: number, n: number): number {
  const { baixo, alto } = wilson(acertos, n)
  return Math.max(0, Math.min(1, 1 - (alto - baixo)))
}

/**
 * O PISO PARA ABRIR A BOCA.
 *
 * Abaixo disto o sistema não estima — ele recusa e diz o que falta. Os dois
 * cortes existem porque falham por motivos diferentes: `AMOSTRA_MINIMA` é a
 * quantidade bruta de história, e `CONFIANCA_MINIMA` pega o caso em que há
 * história suficiente mas ela não concorda com nada.
 *
 * =============================================================================
 * 0,60 SAIU DA CONTA, E A CONTA ESTÁ AQUI PARA PODER SER CONFERIDA
 * =============================================================================
 * O primeiro valor que escrevi foi 0,35, e os testes o derrubaram na hora —
 * corretamente. Estas são as confianças reais que o Wilson devolve:
 *
 *      0,526   3 de 3 unânime        ← "100% de chance" com três observações
 *      0,497   8 empatado em 4/4     ← há história, e ela não diz nada
 *      0,547   8 com 6
 *      0,569   10 com 7
 *      0,675   10 com 9
 *      0,747   8 unânime
 *      0,858   50 com 45
 *      0,937   40 unânime
 *
 * A 0,35 as DUAS primeiras linhas passavam — e a primeira é exatamente o
 * desastre que este arquivo existe para impedir: três O.S. que por acaso
 * atrasaram viram um "100%" na tela, idêntico em tudo ao 100% que trezentas
 * produziriam. A 0,60 o corte cai entre "10 com 7" e "10 com 9", que é onde
 * uma pessoa razoável pararia de chamar aquilo de previsão.
 *
 * Mexer neste número é mexer no que o sistema afirma. Os testes ao lado fixam
 * os dois lados do corte de propósito: mudar o valor sem mudá-los reprova.
 */
export const AMOSTRA_MINIMA = 8
export const CONFIANCA_MINIMA = 0.6
