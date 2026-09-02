'use client'

import { useEffect, useId, useRef } from 'react'
import estilo from '../painel.module.css'

/**
 * A JANELA — e por que ela é um `<dialog>` de verdade.
 *
 * =============================================================================
 * O QUE VEM DE GRAÇA, E QUE UMA DIV NUNCA TERIA
 * =============================================================================
 * `showModal()` entrega quatro coisas que ninguém escreve à mão sem esquecer
 * uma delas:
 *
 *   · Esc fecha.
 *   · O foco fica PRESO dentro da janela — Tab não sai por baixo e vai
 *     navegar o menu lateral que a pessoa nem está vendo.
 *   · O resto da página vira inerte para o leitor de tela, que passa a ler só
 *     o que está na janela.
 *   · O fundo escurece via `::backdrop`, sem uma segunda div para posicionar.
 *
 * Uma `<div>` com `position: fixed` parece a mesma coisa na tela e falha nos
 * quatro pontos. O roteiro de acessibilidade da bateria pega exatamente isso.
 *
 * =============================================================================
 * O CLIQUE NO FUNDO
 * =============================================================================
 * O `::backdrop` não é um elemento próprio: o clique nele chega com
 * `e.target === o dialog`. Por isso o `<dialog>` não pode ter espaçamento —
 * a folga toda vive no `janelaCorpo` de dentro. Com espaçamento no `<dialog>`,
 * clicar na borda interna fecharia a janela por engano, no meio do formulário.
 */
export default function Janela({
  titulo,
  aberta,
  aoFechar,
  children,
}: {
  titulo: string
  aberta: boolean
  aoFechar: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    // `showModal()` numa janela já aberta dispara erro; `close()` numa fechada
    // dispara `close` de novo e cairíamos num laço com o `onClose` abaixo.
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])

  return (
    <dialog
      ref={ref}
      className={estilo.janela}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar()
      }}
    >
      <div className={estilo.janelaCorpo}>
        <div className={estilo.janelaCab}>
          <h2 className={estilo.janelaTitulo}>{titulo}</h2>
          <button
            type="button"
            className={estilo.janelaFechar}
            onClick={aoFechar}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

/**
 * O CAMPO DE DINHEIRO — grande, e no alto.
 *
 * Não é enfeite. Numa janela de lançamento, o valor é a única coisa que a
 * pessoa está pensando quando abre; tudo o mais ela preenche por obrigação. Pôr
 * o valor como o sexto campo de uma grade, do mesmo tamanho da categoria, é
 * fazer a informação mais importante da tela parecer a menos.
 *
 * `tabular-nums` porque dígito de largura variável faz o número dançar enquanto
 * se digita, e dinheiro que dança na tela dá a sensação de erro.
 *
 * =============================================================================
 * O `id` VEM DO `useId`, E NÃO DO NOME DO CAMPO
 * =============================================================================
 * A primeira versão montava `id="din-${nome}"`. As duas janelas do Financeiro —
 * nova conta e edição — vivem na MESMA página e ambas têm um campo chamado
 * `valor`: a página passou a ter dois elementos com `id="din-valor"`.
 *
 * Isso não é detalhe de estilo. `htmlFor` casa com o PRIMEIRO id igual do
 * documento, então o rótulo da janela de edição apontava para o campo da janela
 * de lançamento — que está fechada. Quem usa leitor de tela ouve o campo sem
 * nome, e quem clica no rótulo não põe o cursor em lugar nenhum.
 *
 * `useId` dá um identificador único por instância do componente, estável entre
 * servidor e cliente. É exatamente o problema para o qual ele existe.
 */
export function CampoDinheiro({
  nome,
  valor,
  aoMudar,
  rotulo,
}: {
  nome: string
  valor: string
  aoMudar: (v: string) => void
  rotulo: string
}) {
  const id = useId()

  return (
    <div className={estilo.dinCampo}>
      <label className={estilo.dinRotulo} htmlFor={id}>
        {rotulo}
      </label>
      <span className={estilo.dinMoeda} aria-hidden="true">
        BRL
      </span>
      <span className={estilo.dinLinha}>
        <span className={estilo.dinCifrao} aria-hidden="true">
          R$
        </span>
        <input
          id={id}
          className={estilo.dinValor}
          name={nome}
          inputMode="decimal"
          required
          autoComplete="off"
          placeholder="0,00"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      </span>
    </div>
  )
}
