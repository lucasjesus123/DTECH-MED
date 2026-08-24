'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelarOrdem } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

/**
 * Cancelar a ordem.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FICA ESCONDIDO ATRÁS DE UM CLIQUE
 * ---------------------------------------------------------------------------
 * É a única ação da ficha que tira a ordem da esteira, e não tem passo
 * seguinte. Deixá-la ao lado de "Manutenção iniciada", do mesmo tamanho e da
 * mesma cor, é convite a clicar errado num dia corrido.
 *
 * Então ela mora fechada, em texto pequeno, e só se abre por vontade. Aberta,
 * pede o motivo — e o botão de confirmar continua desligado enquanto o motivo
 * não estiver escrito. Ordem que some sem explicação é a pergunta que volta em
 * três meses, quando o cliente liga perguntando do aparelho dele.
 *
 * Quem NÃO é da gestão nem vê este bloco: a página decide pelo papel. E o
 * servidor recusa por conta própria de qualquer jeito — esconder na tela é
 * conforto, não permissão.
 */
export default function Cancelar({ ordemId }: { ordemId: string }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await cancelarOrdem(ordemId, motivo)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setAberto(false)
      setMotivo('')
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button type="button" className={estilo.btnLinha} onClick={() => setAberto(true)}>
        Cancelar esta ordem
      </button>
    )
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Cancelar a ordem</p>
      <p className={estilo.texto}>
        A ordem sai da esteira e não volta a andar. Nada é apagado: ela continua no
        histórico do aparelho, com o motivo que você escrever aqui. O cliente é avisado.
      </p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <label className={estilo.rotulo}>
        Por que está sendo cancelada?
        <textarea
          className={estilo.area}
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Cliente desistiu antes da retirada; aparelho já foi consertado em outro lugar…"
        />
      </label>

      <div className={estilo.acoesForm}>
        <button
          type="button"
          className={estilo.btnPerigo}
          onClick={confirmar}
          disabled={pendente || motivo.trim().length < 5}
        >
          {pendente ? 'Cancelando…' : 'Confirmar o cancelamento'}
        </button>
        <button
          type="button"
          className={estilo.btnSec}
          onClick={() => {
            setAberto(false)
            setErro(null)
          }}
          disabled={pendente}
        >
          Voltar
        </button>
      </div>
    </div>
  )
}
