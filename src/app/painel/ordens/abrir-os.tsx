'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Formulario from './nova/formulario'
import JanelaOS from './janela-os'
import estilo from '../painel.module.css'

/**
 * ABRIR A O.S. SEM SAIR DA CENTRAL.
 *
 * =============================================================================
 * POR QUE VIROU JANELA
 * =============================================================================
 * O assistente de abertura já existia e já era bom — quatro perguntas, uma de
 * cada vez. O que não era bom era o CAMINHO: clicar em "Abrir O.S." trocava a
 * página, e quem desistia no meio voltava para uma lista sem o filtro que tinha
 * digitado. Pior, ao emitir, a pessoa caía na ficha da ordem nova e perdia de
 * vista a fila que estava trabalhando.
 *
 * Agora abre por cima, e ao emitir a própria janela do passo a passo assume,
 * já mostrando o que fazer em seguida: escolher quem vai buscar. A lista
 * continua atrás, intacta.
 *
 * A rota `/painel/ordens/nova` continua existindo e não muda: ela é o destino
 * de quem vem de um contato do site, com os campos já preenchidos, e o alvo de
 * qualquer link antigo que alguém tenha salvo.
 */
export default function AbrirOS() {
  const [aberta, setAberta] = useState(false)
  const [ordemNova, setOrdemNova] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  const fechar = useCallback(() => setAberta(false), [])

  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
        return
      }
      if (e.key !== 'Tab' || !caixa.current) return
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    },
    [fechar],
  )

  useEffect(() => {
    if (!aberta) return
    document.addEventListener('keydown', aoTeclar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [aberta, aoTeclar])

  return (
    <>
      <button type="button" className={estilo.btnOS} onClick={() => setAberta(true)}>
        Abrir O.S.
      </button>

      {aberta ? (
        <div className={estilo.janelaFundo}>
          <button type="button" className={estilo.janelaSaida} onClick={fechar} aria-label="Fechar" />

          <div
            ref={caixa}
            className={`${estilo.janela} ${estilo.osJan}`}
            role="dialog"
            aria-modal="true"
            aria-label="Abrir O.S."
          >
            <div className={estilo.janelaCab}>
              <p className={estilo.janelaTitulo}>Abrir O.S.</p>
              <button type="button" className={estilo.janelaX} onClick={fechar} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className={estilo.janelaCorpo}>
              <Formulario
                lead={null}
                /* A janela de abrir O.S. da lista nasce em branco. Quem vem de
                   um orçamento aprovado entra por `/painel/ordens/nova?proposta=`,
                   que é a porta com o valor já preenchido. */
                proposta={null}
                aoAbrir={(id) => {
                  setAberta(false)
                  setOrdemNova(id)
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Emitida a ordem, o passo a passo dela assume — no passo 3, que é
          justamente "quem leva o aparelho até a bancada". Emitir e despachar
          são o mesmo movimento; separá-los em duas telas era o que fazia
          alguém emitir e ir embora sem dizer quem vai buscar. */}
      {ordemNova ? (
        <JanelaOS ordemId={ordemNova} aoFechar={() => setOrdemNova(null)} />
      ) : null}
    </>
  )
}
