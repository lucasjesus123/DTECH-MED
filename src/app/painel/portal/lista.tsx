'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import Copiar from '../aplicativos/copiar'
import estilo from '../painel.module.css'

export type OrdemDoPortal = {
  id: string
  numero: number
  equipamento: string
  serie: string | null
  etapaRotulo: string
  link: string
}

/**
 * AS ORDENS DO CLIENTE — lista, e a janela sobre a linha clicada.
 *
 * =============================================================================
 * O QUE ELA VEIO CONSERTAR
 * =============================================================================
 * Isto era uma grade de cartões, e o dono olhou e disse: *"está bagunçado na
 * tela"*. Estava, e a causa era apontável.
 *
 * Cada cartão carregava SEIS blocos e QUATRO botões: título, subtítulo, dois
 * botões, um segundo cabeçalho ("MANDAR O LINK DE NOVO"), a URL crua, e mais
 * dois botões. A URL era o maior elemento visual da tela sendo a informação
 * menos útil dela — sessenta caracteres aleatórios que ninguém lê.
 *
 * E ela era a causa direta da desordem: o token quebrava em DUAS linhas num
 * cartão e uma em outro, conforme o comprimento. Como a grade alinha por linha,
 * um cartão alto deixava um buraco do tamanho dele ao lado do vizinho baixo.
 * A bagunça não vinha do conteúdo — vinha do wrap de uma linha de texto.
 *
 * =============================================================================
 * LISTA E POPUP, COMO NA CENTRAL DE O.S.
 * =============================================================================
 * O pedido dele: *"faz algo como uma lista e quando abre, abre uma janela tipo
 * popup"*. É exatamente o que a Central de O.S. já faz — linha na tabela, clique,
 * janela — e é por isso que a resposta certa aqui não era um cartão melhor, era
 * o padrão que o sistema já tem.
 *
 * A lista mostra o que serve para ESCOLHER: número, equipamento, série e em que
 * etapa está. Tudo o que é AÇÃO — abrir a página do cliente, ver a O.S. por
 * dentro, copiar o link, mandar no WhatsApp — mora na janela, que é onde se vai
 * para fazer, e não para procurar.
 *
 * O endereço aparece lá dentro em uma linha que não quebra. Continua
 * selecionável e continua sendo o link de verdade, lido da ordem — nunca um
 * gerado agora.
 */
export default function ListaDeOrdens({ ordens }: { ordens: OrdemDoPortal[] }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const o = ordens.find((x) => x.id === aberta) ?? null

  return (
    <>
      <div className={estilo.rolaX}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Equipamento</th>
              <th>Etapa</th>
              <th className={estilo.dir}>
                <span className={estilo.soLeitor}>Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((x) => (
              <tr
                key={x.id}
                className={estilo.linhaAbre}
                /* O MESMO PADRÃO DA CENTRAL DE O.S., e não um inventado aqui.
                   Lá o clique na linha é conforto de MOUSE, e quem navega por
                   teclado usa o botão do número — que é o controle de verdade.
                   A primeira versão desta tabela fez a linha inteira virar um
                   `tabIndex` com `role="button"`: funciona, e teria deixado
                   duas tabelas do mesmo sistema respondendo ao teclado de
                   jeitos diferentes. */
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, a')) return
                  setAberta(x.id)
                }}
              >
                <td className={estilo.num}>
                  <button
                    type="button"
                    className={estilo.linhaBotao}
                    onClick={() => setAberta(x.id)}
                    aria-label={`Abrir a O.S. ${String(x.numero).padStart(4, '0')}, ${x.equipamento}`}
                  >
                    #{String(x.numero).padStart(4, '0')}
                  </button>
                </td>
                <td>
                  <span className={estilo.forte}>{x.equipamento}</span>
                  {x.serie ? <div className={estilo.fraco}>série {x.serie}</div> : null}
                </td>
                <td>
                  <span className={estilo.tag}>{x.etapaRotulo}</span>
                </td>
                <td className={estilo.dir}>
                  <span className={estilo.fraco}>abrir</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {o ? <JanelaDoLink ordem={o} aoFechar={() => setAberta(null)} /> : null}
    </>
  )
}

/**
 * A janela de uma ordem: o que fazer com o link dela.
 *
 * Mesmo esqueleto da janela da O.S. — fundo escuro clicável, Esc fecha, o foco
 * fica preso dentro enquanto ela está aberta. Repetir esses três cuidados em
 * cada janela é o que impede uma delas de ser a que prende o teclado.
 */
function JanelaDoLink({ ordem, aoFechar }: { ordem: OrdemDoPortal; aoFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const numero = String(ordem.numero).padStart(4, '0')

  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        aoFechar()
        return
      }
      if (e.key !== 'Tab' || !caixa.current) return
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    [aoFechar],
  )

  useEffect(() => {
    document.addEventListener('keydown', aoTeclar)
    caixa.current?.focus()
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoTeclar])

  return (
    <div className={estilo.janelaFundo}>
      <button type="button" className={estilo.janelaSaida} onClick={aoFechar} aria-label="Fechar" />

      <div
        ref={caixa}
        tabIndex={-1}
        className={estilo.janela}
        role="dialog"
        aria-modal="true"
        aria-label={`O.S. ${numero}`}
      >
        <div className={estilo.janelaCab}>
          <div>
            <p className={estilo.janelaTitulo}>O.S. #{numero}</p>
            <p className={estilo.dica} style={{ margin: 0 }}>
              {ordem.equipamento}
              {ordem.serie ? ` · série ${ordem.serie}` : ''} · {ordem.etapaRotulo}
            </p>
          </div>
          <button type="button" className={estilo.janelaX} onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={estilo.janelaCorpo}>
          <p className={estilo.texto}>
            Esta é a página que o cliente abre — a mesma, pelo link que ele recebeu. Não pede
            senha.
          </p>

          <div className={estilo.acoesForm} style={{ marginTop: 'var(--s4)' }}>
            {/* Aba nova: quem está no telefone com o cliente não pode perder o
                lugar no painel no meio da ligação. */}
            <a href={ordem.link} target="_blank" rel="noreferrer" className={estilo.btn}>
              Abrir o painel do cliente
            </a>
            <Link href={`/painel/ordens/${ordem.id}`} className={estilo.btnSec}>
              Ver a O.S. por dentro
            </Link>
          </div>

          <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
            Mandar o link de novo
          </p>
          <Copiar
            compacto
            endereco={ordem.link}
            quem="Cliente"
            mensagem={`Oi! Aqui você acompanha a O.S. #${numero} do seu ${ordem.equipamento} na DTECH MED. É só abrir o link — não precisa de senha: ${ordem.link}`}
          />
        </div>
      </div>
    </div>
  )
}
