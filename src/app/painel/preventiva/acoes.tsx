'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { encerrarContratoPreventiva, gerarOrdemDaVisita } from '@/server/acoes/preventiva'
import estilo from '../painel.module.css'

/**
 * O botão que transforma a visita em trabalho.
 *
 * ---------------------------------------------------------------------------
 * É AQUI QUE O CONTRATO DEIXA DE SER PAPEL
 * ---------------------------------------------------------------------------
 * Um contrato de preventiva sem este botão é um calendário: bonito, e nada
 * acontece. Clicando, a visita entra na MESMA esteira de 18 etapas de qualquer
 * conserto — com ordem de retirada, foto, assinatura, laudo e faturamento. Não
 * existe um caminho paralelo para a preventiva, de propósito: um segundo
 * caminho seria um segundo sistema, sempre atrasado em relação ao primeiro.
 *
 * Depois de gerada, a página vai direto para a ordem. Quem clicou em "gerar
 * ordem" quer agendar a retirada agora, e não voltar para a lista.
 */
export function GerarOrdem({ visitaId }: { visitaId: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function gerar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('visitaId', visitaId)
      const r = await gerarOrdemDaVisita(form)
      if (r.ok && r.dados) router.push(`/painel/ordens/${r.dados.id}`)
      else if (!r.ok) setErro(r.motivo)
    })
  }

  return (
    <>
      <button type="button" className={estilo.btnSec} onClick={gerar} disabled={pendente}>
        {pendente ? 'Abrindo…' : 'Gerar ordem'}
      </button>
      {erro ? <div className={estilo.erro}>{erro}</div> : null}
    </>
  )
}

/**
 * Encerrar o contrato.
 *
 * Pede confirmação porque leva junto as visitas ainda previstas — é a agenda
 * futura do aparelho que some. As já realizadas ficam: são o histórico que
 * sustenta o prontuário.
 */
export function EncerrarContrato({ contratoId, numero }: { contratoId: string; numero: number }) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function encerrar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('contratoId', contratoId)
      const r = await encerrarContratoPreventiva(form)
      if (r.ok) {
        setConfirmando(false)
        router.refresh()
      } else setErro(r.motivo)
    })
  }

  if (!confirmando) {
    return (
      <button type="button" className={estilo.acaoRara} onClick={() => setConfirmando(true)}>
        Encerrar contrato
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', gap: 'var(--s2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span className={estilo.fraco}>
        Encerrar o #{String(numero).padStart(4, '0')} cancela as visitas futuras.
      </span>
      <button
        type="button"
        className={`${estilo.btnSec} ${estilo.btnPerigo}`}
        onClick={encerrar}
        disabled={pendente}
      >
        {pendente ? 'Encerrando…' : 'Confirmar'}
      </button>
      <button type="button" className={estilo.acaoRara} onClick={() => setConfirmando(false)} disabled={pendente}>
        Não
      </button>
      {erro ? <span className={estilo.erro}>{erro}</span> : null}
    </span>
  )
}
