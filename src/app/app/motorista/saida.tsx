'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sairParaParada } from '@/server/acoes/ordem'
import estilo from '../app.module.css'

/**
 * "Saí para esta parada."
 *
 * O botão existe porque o aviso de "motorista a caminho" é um passo da linha do
 * tempo, e sem ele o cliente só descobria a visita quando a campainha tocava.
 *
 * Ele some depois de apertado: quem já saiu não sai de novo, e um botão que
 * continua ali convidando ao clique é um botão que vai ser clicado por engano.
 */
export function Saida({ ordemId, tipo }: { ordemId: string; tipo: 'RETIRADA' | 'ENTREGA' }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function sair() {
    setErro(null)
    iniciar(async () => {
      const r = await sairParaParada(ordemId, tipo)
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
      <button type="button" className={estilo.btnSaida} onClick={sair} disabled={pendente}>
        {pendente ? 'Avisando o cliente…' : 'Saí para esta parada'}
      </button>
    </>
  )
}
