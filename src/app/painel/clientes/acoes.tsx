'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { arquivarCliente } from '@/server/acoes/cadastros'
import estilo from '../painel.module.css'

/**
 * O QUE SE FAZ COM UM CLIENTE, NA PRÓPRIA LINHA.
 *
 * =============================================================================
 * A LISTA ERA UM BECO
 * =============================================================================
 * Dava para ver que o cliente existe e para abrir a ficha dele. Só. Quem
 * precisava trocar um telefone errado, chamar a clínica no WhatsApp ou tirar da
 * carteira um cadastro duplicado não tinha por onde — e o trabalho vazava para
 * fora do sistema, no caderno e no celular pessoal.
 *
 * =============================================================================
 * TRÊS AÇÕES, E CADA UMA É O ATALHO DE UM GESTO REAL
 * =============================================================================
 *   EDITAR    abre a ficha JÁ no formulário, sem procurar o botão
 *   WHATSAPP  abre a conversa com o número que está no cadastro
 *   ARQUIVAR  tira das listas sem apagar o histórico (ver `arquivarCliente`)
 *
 * O WhatsApp é `wa.me`, e não a integração da casa: aqui a pessoa quer FALAR
 * com o cliente do jeito dela, agora, do aparelho que tiver na mão. A
 * integração serve para o sistema avisar sozinho; ela não substitui alguém
 * ligando.
 *
 * =============================================================================
 * POR QUE VIRARAM DESENHO, E O QUE ISSO CUSTA
 * =============================================================================
 * Eram três palavras soltas — "editar chamar arquivar" — no fim de uma tabela
 * de sete colunas. Três verbos em minúscula empilhados espremem a coluna, e o
 * olho que percorre a lista procurando um cliente tropeça neles em toda linha.
 *
 * O que um ícone sozinho PERDE é o nome. Por isso a palavra não sumiu: ela
 * volta na dica, ao passar o mouse — e, o que importa mais, ao chegar pelo
 * TECLADO, porque quem navega com Tab não passa mouse em lugar nenhum.
 *
 * E onde não há mouse nenhum — celular, tablet — a dica não existe e o desenho
 * teria de se explicar sozinho. É por isso que o `aria-label` de cada um
 * continua obrigatório e diz o nome do cliente junto: sem ele, o leitor de tela
 * anuncia "botão" e a pessoa fica sabendo que existe um botão sem saber o que
 * ele faz nem em quem.
 *
 * =============================================================================
 * ARQUIVAR PERGUNTA ANTES, REATIVAR NÃO
 * =============================================================================
 * Arquivar tira o cliente da vista de todo mundo — é o tipo de clique que
 * assusta quando acontece por engano. Reativar só devolve o que já existia, e
 * uma confirmação para desfazer um susto seria um segundo susto.
 */
export default function AcoesDoCliente({
  id,
  nome,
  whatsapp,
  ativo,
}: {
  id: string
  nome: string
  whatsapp: string | null
  ativo: boolean
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  function mudar(arquivar: boolean) {
    setErro(null)
    iniciar(async () => {
      const r = await arquivarCliente(id, arquivar)
      if (r.ok) router.refresh()
      else setErro(r.motivo)
    })
  }

  return (
    <>
      <span className={estilo.acoesLinha}>
        <Dica texto="Editar">
          <Link
            href={`/painel/clientes/${id}?editar=1`}
            className={estilo.btnIcone}
            aria-label={`Editar o cadastro de ${nome}`}
          >
            <IconeLapis />
          </Link>
        </Dica>

        {whatsapp ? (
          <Dica texto="Chamar no WhatsApp">
            <a
              href={`https://wa.me/55${whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className={estilo.btnIcone}
              aria-label={`Chamar ${nome} no WhatsApp`}
            >
              <IconeConversa />
            </a>
          </Dica>
        ) : (
          /* Sem número, o lugar do botão não fica vazio: um desenho apagado diz
             que a ação existe e por que ela não está disponível aqui. Buraco na
             linha faria parecer que a coluna quebrou. */
          <Dica texto="Sem WhatsApp no cadastro">
            <span
              className={`${estilo.btnIcone} ${estilo.btnIconeMudo}`}
              aria-label={`${nome} não tem WhatsApp no cadastro`}
              role="img"
            >
              <IconeConversaMuda />
            </span>
          </Dica>
        )}

        {ativo ? (
          <Dica texto="Arquivar">
            <button
              type="button"
              className={`${estilo.btnIcone} ${estilo.btnIconePerigo}`}
              disabled={pendente}
              aria-label={`Arquivar ${nome}`}
              onClick={() => {
                if (
                  confirm(
                    `Arquivar ${nome}?\n\nEle sai da carteira e das listas de escolha do sistema. Nenhuma ordem, nota ou histórico é apagado — e dá para reativar quando quiser.`,
                  )
                ) {
                  mudar(true)
                }
              }}
            >
              <IconeArquivar />
            </button>
          </Dica>
        ) : (
          <Dica texto="Reativar">
            <button
              type="button"
              className={estilo.btnIcone}
              disabled={pendente}
              aria-label={`Reativar ${nome}`}
              onClick={() => mudar(false)}
            >
              <IconeReativar />
            </button>
          </Dica>
        )}
      </span>

      {/* A recusa aparece NA LINHA do cliente, e não num aviso no topo: numa
          carteira de duzentos nomes, um erro no topo não diz de quem ele é. */}
      {erro ? (
        <span className={estilo.erroLinha} role="alert">
          {erro}
        </span>
      ) : null}
    </>
  )
}

/**
 * A DICA QUE DEVOLVE A PALAVRA AO DESENHO.
 *
 * `focus-within` e não só `hover`: quem atravessa a tabela com Tab nunca passa
 * o mouse, e sem isso o teclado ficaria com os ícones mudos.
 *
 * `aria-hidden` porque o nome acessível já vem do `aria-label` de quem está
 * dentro. Sem isto o leitor de tela leria duas vezes — "Editar, Editar o
 * cadastro de Lucas" — e a repetição atrapalha quem depende dela.
 */
function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <span className={estilo.comDica} data-dica={texto} aria-hidden={false}>
      {children}
    </span>
  )
}

/* Os ícones são desenhados aqui, e não vêm de biblioteca: são cinco, e uma
   dependência inteira para cinco caminhos de SVG é peso que o navegador baixa
   sem precisar. `currentColor` faz cada um herdar a cor do botão, inclusive nos
   estados de hover e de perigo. */

const svg = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconeLapis() {
  return (
    <svg {...svg}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconeConversa() {
  return (
    <svg {...svg}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
    </svg>
  )
}

function IconeConversaMuda() {
  return (
    <svg {...svg}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

function IconeArquivar() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function IconeReativar() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M12 17v-5" />
      <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    </svg>
  )
}
