'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AcaoDaVez } from '@/lib/esteira'
import { avancarNaEsteira } from '@/server/acoes/sistema'
import estilo from './pecas.module.css'

/**
 * O BOTÃO-DA-VEZ (`<StageButton>`).
 *
 * =============================================================================
 * UM BOTÃO, E ELE MUDA COM A ETAPA
 * =============================================================================
 * O sistema antigo mostrava um MENU de próximos passos e pedia à pessoa que
 * escolhesse o certo. Escolher entre "enviar para conferência", "devolver ao
 * técnico" e "cancelar" é trabalho de quem conhece a esteira — e quem está na
 * bancada não deveria precisar conhecer a esteira.
 *
 * Aqui existe UM próximo passo natural, e é ele que vira botão. Os outros
 * caminhos continuam existindo, como ações secundárias no painel da O.S., onde
 * não competem com o principal.
 *
 * O rótulo, a cor e a sequência de saltos vêm todos de `acaoDaVez`, no
 * `lib/esteira`. Este componente não sabe nada sobre a esteira: ele recebe a
 * decisão pronta e a executa. É o que permite o mesmo botão servir a lista, o
 * quadro, o painel da O.S. e o app do motorista sem quatro versões da regra.
 *
 * =============================================================================
 * O QUE ACONTECE AO CLICAR
 * =============================================================================
 * Passo DIRETO: dispara os saltos na hora.
 *
 * Passo que precisa de prova ou de dado — foto, assinatura, motorista, valor —
 * leva à folha que colhe isso. Não é um desvio: é o passo 9 da direção, a
 * captura guiada. Disparar o salto sem a prova só faria o motor recusar, e a
 * pessoa levaria um "não" sem saber o que fazer com ele.
 *
 * =============================================================================
 * A RECUSA APARECE, E APARECE INTEIRA
 * =============================================================================
 * O motor recusa com frases escritas para o operador — "faltam 4 fotos do
 * recebimento", "a fatura ainda não está quitada". Engolir isso e mostrar
 * "erro ao avançar" seria jogar fora a única parte útil da resposta.
 */

const Seta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
  </svg>
)

const CLASSE: Record<string, string | undefined> = {
  ok: estilo.acaoOk,
  warn: estilo.acaoWarn,
  danger: estilo.acaoDanger,
  info: '',
  pending: '',
}

export default function BotaoDaVez({
  ordemId,
  acao,
  largo = false,
}: {
  ordemId: string
  acao: AcaoDaVez
  /** No app de campo o botão ocupa a largura toda e cresce. */
  largo?: boolean
}) {
  const router = useRouter()
  const [indo, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function clicou() {
    setErro(null)

    if (acao.fluxo !== 'direto') {
      // A folha que colhe a prova vive na ficha da O.S. Levar para lá com o
      // fluxo já aberto é o caminho mais curto entre a intenção e a tela — e
      // é um endereço de verdade, então dá para voltar, recarregar e mandar
      // por WhatsApp para o colega terminar.
      router.push(`/sistema/ordens/${ordemId}?fluxo=${acao.fluxo}`)
      return
    }

    iniciar(async () => {
      const r = await avancarNaEsteira({ ordemId, passos: acao.passos })
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  return (
    <div>
      <button
        type="button"
        className={`${largo ? estilo.acaoLarga : estilo.acao} ${CLASSE[acao.tom] ?? ''}`}
        onClick={clicou}
        disabled={indo}
      >
        <Seta />
        {indo ? 'Um instante…' : acao.rotulo}
      </button>

      {/* O selo da fusão. Discreto de propósito: é informação para quem quer
          conferir o que o clique vai fazer, não propaganda de recurso. */}
      {acao.fundida ? (
        <p className={estilo.fundida}>{acao.passos.length} PASSOS EM UM CLIQUE</p>
      ) : null}

      {erro ? (
        <p className={estilo.acaoErro} role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}
