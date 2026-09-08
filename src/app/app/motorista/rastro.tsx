'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { registrarPosicao } from '@/server/acoes/rastro'
import estilo from '../app.module.css'

/**
 * O RASTRO, NA MÃO DE QUEM DIRIGE.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE PRECISA SER LIGADO, E NÃO LIGA SOZINHO
 * ---------------------------------------------------------------------------
 * O navegador não deixa pedir a localização sem um toque da pessoa — e mesmo
 * que deixasse, seria errado. O motorista precisa SABER que está sendo
 * acompanhado, e precisa poder parar. Uma tela que rastreia calada é uma tela
 * que alguém desinstala no dia em que descobre.
 *
 * Por isso o botão diz o que faz, o estado fica à vista enquanto está ligado, e
 * desligar é um toque no mesmo lugar.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE NUNCA FAZ
 * ---------------------------------------------------------------------------
 *  • Não trava a tela. Se a posição falhar, o motorista continua fotografando,
 *    colhendo assinatura e concluindo a parada. Rastro é conveniência para a
 *    central; a rua não pode parar por causa dele.
 *  • Não roda fora da parada. Ele só existe enquanto há parada EM ROTA, e o
 *    servidor recusa de qualquer jeito — a trava não depende desta tela.
 *  • Não avisa erro a cada tentativa. Sinal ruim é normal na rua; encher a tela
 *    de aviso vermelho ensina a ignorar aviso vermelho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE PRECISOU LEMBRAR QUE ESTAVA LIGADO
 * ---------------------------------------------------------------------------
 * `watchPosition` vive enquanto a tela vive. O motorista tocava em
 * "Compartilhar minha rota", abria a parada para ver o endereço, o celular
 * bloqueava no bolso, o navegador descarregava a aba — e o rastro morria sem
 * dizer nada. Do lado de cá o botão voltava a dizer "Compartilhar minha rota",
 * e do lado da central o ponto no mapa ficava parado onde ele passou.
 *
 * Agora a decisão fica gravada no aparelho, por parada. Voltando à tela, o
 * rastro se rearma sozinho — a permissão de localização já foi dada, e o
 * navegador não exige toque de novo para quem já autorizou.
 *
 * A marca é por PARADA, e some ao desligar. Quando a parada é concluída, este
 * componente deixa de ser desenhado — ele só existe para parada em rota — então
 * uma marca esquecida no aparelho não rearma coisa nenhuma: ela fica sem tela
 * que a leia.
 */
const CHAVE = 'dtechmed:rastro:'

export function Rastro({ agendamentoId }: { agendamentoId: string }) {
  const [ligado, setLigado] = useState(false)
  const [ultima, setUltima] = useState<Date | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const vigia = useRef<number | null>(null)

  const desligar = useCallback(() => {
    if (vigia.current !== null) {
      navigator.geolocation.clearWatch(vigia.current)
      vigia.current = null
    }
    // `try` porque navegador em aba anônima com armazenamento bloqueado lança
    // aqui — e não é motivo para o rastro parar de funcionar.
    try {
      localStorage.removeItem(CHAVE + agendamentoId)
    } catch {
      /* sem memória, o rastro simplesmente não se rearma. */
    }
    setLigado(false)
  }, [agendamentoId])

  const ligar = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setAviso('Este aparelho não informa localização.')
      return
    }
    setAviso(null)
    setLigado(true)
    try {
      localStorage.setItem(CHAVE + agendamentoId, '1')
    } catch {
      /* idem: sem memória, ele vale só enquanto esta tela estiver aberta. */
    }

    vigia.current = navigator.geolocation.watchPosition(
      (pos) => {
        void registrarPosicao({
          agendamentoId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisaoM: pos.coords.accuracy ?? null,
          // Em m/s, e às vezes negativo ou nulo quando o aparelho não sabe.
          velocidade:
            typeof pos.coords.speed === 'number' && pos.coords.speed >= 0 ? pos.coords.speed : null,
        })
          .then((r) => {
            if (r.ok) setUltima(new Date())
          })
          .catch(() => {
            /* Sinal ruim é rotina na rua. A próxima tentativa resolve. */
          })
      },
      (erro) => {
        // Só a recusa de permissão merece texto: é a única que a pessoa
        // resolve. Sinal fraco e tempo esgotado se resolvem sozinhos.
        if (erro.code === erro.PERMISSION_DENIED) {
          setAviso('A localização está bloqueada para este site nas configurações do navegador.')
          desligar()
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
  }, [agendamentoId, desligar])

  useEffect(() => {
    let marcado = false
    try {
      marcado = localStorage.getItem(CHAVE + agendamentoId) === '1'
    } catch {
      /* sem memória: começa desligado, como antes. */
    }
    // O `setTimeout(0)` tira o `ligar()` do corpo do efeito: ele mexe em estado,
    // e estado mexido dentro do efeito faz uma segunda pintura em cascata.
    const t = marcado ? setTimeout(ligar, 0) : null
    return () => {
      if (t) clearTimeout(t)
      if (vigia.current !== null) navigator.geolocation.clearWatch(vigia.current)
    }
  }, [agendamentoId, ligar])

  return (
    <div className={estilo.rastro}>
      <button
        type="button"
        className={ligado ? estilo.rastroLigado : estilo.rastroBtn}
        onClick={() => (ligado ? desligar() : ligar())}
      >
        <span className={ligado ? estilo.rastroPulso : estilo.rastroPonto} aria-hidden="true" />
        {ligado ? 'Compartilhando a rota' : 'Compartilhar minha rota'}
      </button>

      <p className={estilo.notaCampo}>
        {ligado
          ? ultima
            ? `A central está vendo onde você está. Última posição às ${hora(ultima)}.`
            : 'Procurando o sinal do GPS…'
          : 'Liga só enquanto você está na rua. Serve para a central responder ao cliente sem te ligar.'}
      </p>

      {aviso ? <p className={estilo.erroCampo}>{aviso}</p> : null}
    </div>
  )
}

const hora = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
