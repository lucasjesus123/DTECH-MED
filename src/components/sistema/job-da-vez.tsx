'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceitarCorrida, sairParaParada } from '@/server/acoes/ordem'
import estilo from './pecas.module.css'

/**
 * O MODO FOCO — o job da vez, com UM botão grande.
 *
 * =============================================================================
 * TRÊS ESTADOS, TRÊS RÓTULOS, UM BOTÃO
 * =============================================================================
 *   Aceitar → A caminho → Cheguei
 *
 * Nunca dois botões ao mesmo tempo. A rota já foi ordenada por quem despachou;
 * pedir ao motorista que escolha entre "sair" e "chegar" é devolver a ele uma
 * decisão que ninguém tomou por ele — e que ele vai tomar errado uma vez por
 * semana, dirigindo.
 *
 * =============================================================================
 * POR QUE O "ACEITAR" EXISTE
 * =============================================================================
 * É o que separa "a central marcou" de "ele vai". Enquanto ninguém aceitou, a
 * central não sabe se o motorista viu a corrida — e a `sairParaParada` recusa
 * no servidor, então o aceite não é enfeite de tela.
 *
 * =============================================================================
 * O GPS AVISA, MAS NÃO TRAVA
 * =============================================================================
 * Quando a O.S. não tem coordenada, a tela diz isso e segue. GPS falha em
 * subsolo, em prédio e em celular velho; travar a chegada por causa dele
 * deixaria o motorista parado na porta do cliente com o aparelho na mão.
 */

export type EstadoDoJob = {
  agendamentoId: string
  ordemId: string
  tipo: 'RETIRADA' | 'ENTREGA'
  aceito: boolean
  emRota: boolean
  /** `false` quando ninguém registrou onde fica este endereço. */
  temGps: boolean
  /** A parada é DESTE motorista? A gestão vê a tela e não age nela. */
  minha: boolean
}

const PASSOS = ['Aceitar', 'A caminho', 'Cheguei'] as const

export default function JobDaVez({ job }: { job: EstadoDoJob }) {
  const router = useRouter()
  const [indo, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const passoAtual = !job.aceito ? 0 : !job.emRota ? 1 : 2

  function agir() {
    setErro(null)
    iniciar(async () => {
      if (!job.aceito) {
        const r = await aceitarCorrida(job.agendamentoId)
        if (!r.ok) setErro(r.motivo)
        else router.refresh()
        return
      }
      if (!job.emRota) {
        const r = await sairParaParada(job.ordemId, job.tipo)
        if (!r.ok) setErro(r.motivo)
        else router.refresh()
        return
      }
      // "Cheguei" abre a captura guiada: foto, termo, assinatura no dedo. Ela
      // é quem finaliza a etapa.
      router.push(
        `/campo/parada/${job.ordemId}?tipo=${job.tipo === 'RETIRADA' ? 'coleta' : 'entrega'}`,
      )
    })
  }

  const rotulo = !job.aceito
    ? 'Aceitar corrida'
    : !job.emRota
      ? job.tipo === 'RETIRADA'
        ? 'Sair para a coleta'
        : 'Sair para a entrega'
      : 'Cheguei'

  return (
    <>
      <div className={estilo.passos} aria-label="Andamento desta parada">
        {PASSOS.map((p, i) => (
          <div
            key={p}
            className={i < passoAtual ? estilo.passoFeito : i === passoAtual ? estilo.passoAgora : estilo.passo}
          >
            <span className={estilo.passoBarra} aria-hidden="true" />
            {p}
          </div>
        ))}
      </div>

      {!job.temGps ? (
        <p className={estilo.semGps}>
          Esta parada não tem localização registrada — a chegada vai ficar sem
          coordenada, e isso fica anotado.
        </p>
      ) : null}

      {job.minha ? (
        <button
          type="button"
          className={`${estilo.acaoLarga} ${passoAtual === 2 ? estilo.acaoOk : ''}`}
          onClick={agir}
          disabled={indo}
        >
          {indo ? 'Um instante…' : rotulo}
        </button>
      ) : (
        <p className={estilo.semGps}>
          Esta parada é de outro motorista. Você está vendo a tela dele.
        </p>
      )}

      {erro ? (
        <p className={estilo.acaoErro} role="alert">
          {erro}
        </p>
      ) : null}
    </>
  )
}
