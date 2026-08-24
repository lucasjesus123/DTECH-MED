'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import estilo from '../painel.module.css'

/**
 * A tela do Ao vivo se atualizando sozinha, sem recarregar a página.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTAVA AQUI ANTES, E POR QUE SAIU
 * ---------------------------------------------------------------------------
 * Havia um `<meta http-equiv="refresh" content="30">`, escolhido de propósito
 * para não depender de JavaScript. A intenção era boa e o efeito colateral
 * ficou invisível até a varredura de acessibilidade apontá-lo — foi a ÚNICA
 * violação crítica do sistema inteiro.
 *
 * O critério é o 2.2.1 da WCAG: uma página que se recarrega sozinha e não dá
 * como parar prende quem lê devagar. O leitor de tela recomeça do zero a cada
 * meio minuto, no meio da frase.
 *
 * E tinha um incômodo que qualquer um sente, sem precisar de leitor de tela: o
 * recarregamento é do documento inteiro, então a rolagem volta ao topo. Quem
 * estava lendo o cartão do quarto motorista era jogado para o começo a cada 30
 * segundos.
 *
 * `router.refresh()` busca os dados novos e troca só o que mudou: a rolagem
 * fica onde estava, o foco do teclado também. E o botão ao lado para o relógio
 * quando a pessoa precisa ler com calma — que é exatamente o que o critério
 * pede.
 */
export function AtualizaSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter()
  const [ligado, setLigado] = useState(true)
  const [faltam, setFaltam] = useState(segundos)

  useEffect(() => {
    if (!ligado) return
    const relogio = setInterval(() => {
      setFaltam((n) => {
        if (n > 1) return n - 1
        router.refresh()
        return segundos
      })
    }, 1000)
    return () => clearInterval(relogio)
  }, [ligado, segundos, router])

  return (
    <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
      {ligado ? (
        <>
          Atualizando sozinha — a próxima em{' '}
          <strong aria-live="off">{faltam}s</strong>.{' '}
        </>
      ) : (
        <>Atualização pausada. Os dados são do momento em que você pausou. </>
      )}
      <button
        type="button"
        className={estilo.btnSec}
        onClick={() => {
          setFaltam(segundos)
          setLigado((v) => !v)
        }}
      >
        {ligado ? 'Pausar' : 'Voltar a atualizar'}
      </button>
    </p>
  )
}
