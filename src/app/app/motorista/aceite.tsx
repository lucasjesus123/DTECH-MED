'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceitarCorrida } from '@/server/acoes/ordem'
import estilo from '../app.module.css'

/**
 * "ACEITO ESTA CORRIDA."
 *
 * A central designa; quem vai é que confirma. Antes disto, a parada aparecia no
 * aplicativo do motorista já como coisa combinada — e a central não tinha como
 * saber se ele viu, se está de folga, se o celular ficou sem bateria. O
 * aparelho do cliente ficava esperando alguém que talvez não estivesse vindo.
 *
 * ENQUANTO NÃO ACEITA, A PARADA NÃO ANDA. Nem "saí para esta parada", nem
 * "cheguei": esconder os dois é o que faz o aceite ser um passo de verdade e
 * não um botão a mais. A recusa também vive no servidor — a tela esconder nunca
 * bastou aqui.
 *
 * O botão é grande e sozinho de propósito: é a única decisão daquele cartão até
 * ela ser tomada.
 */
export function Aceite({ agendamentoId }: { agendamentoId: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function aceitar() {
    setErro(null)
    iniciar(async () => {
      const r = await aceitarCorrida(agendamentoId)
      if (!r.ok) return setErro(r.motivo)
      router.refresh()
    })
  }

  return (
    <>
      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}
      <p className={estilo.aguardaAceite}>
        A central marcou esta corrida para você. Aceite para ela entrar na sua rota.
      </p>
      <button type="button" className={estilo.btnAceite} onClick={aceitar} disabled={pendente}>
        {pendente ? 'Aceitando…' : 'Aceitar esta corrida'}
      </button>
    </>
  )
}
