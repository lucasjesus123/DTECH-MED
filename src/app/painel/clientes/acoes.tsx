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
        <Link
          href={`/painel/clientes/${id}?editar=1`}
          className={estilo.linkAcao}
          aria-label={`Editar o cadastro de ${nome}`}
        >
          editar
        </Link>

        {whatsapp ? (
          <a
            href={`https://wa.me/55${whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className={estilo.linkAcao}
            aria-label={`Chamar ${nome} no WhatsApp`}
          >
            chamar
          </a>
        ) : (
          <span className={estilo.fraco} title="Este cliente não tem WhatsApp no cadastro">
            sem zap
          </span>
        )}

        {ativo ? (
          <button
            type="button"
            className={estilo.acaoRara}
            disabled={pendente}
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
            arquivar
          </button>
        ) : (
          <button
            type="button"
            className={estilo.linkAcao}
            disabled={pendente}
            onClick={() => mudar(false)}
          >
            reativar
          </button>
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
