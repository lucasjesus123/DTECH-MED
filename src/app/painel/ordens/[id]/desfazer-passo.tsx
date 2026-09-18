'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { desfazerUltimoPasso } from '@/server/acoes/assistente'
import estilo from '../../painel.module.css'

/**
 * VOLTAR UM PASSO — a correção do clique errado.
 *
 * =============================================================================
 * O QUE ELA VEIO CONSERTAR
 * =============================================================================
 * A esteira só andava para a frente. "Recebido" apertado antes de o aparelho
 * chegar, "faturado" na ordem do vizinho, "coletado" no dia errado: qualquer um
 * desses ficava de pé para sempre, e a única saída era cancelar a ordem e abrir
 * outra — perdendo a numeração, os documentos e o histórico.
 *
 * O dono disse assim: *"chega na parte de coleta, eu não consigo trazer de
 * volta"*.
 *
 * =============================================================================
 * MESMO DESENHO DO CANCELAR, E DE PROPÓSITO
 * =============================================================================
 * Fechada em texto pequeno, aberta por vontade, com motivo obrigatório e o
 * botão desligado até a frase existir. As duas são ações que mexem no que já
 * está escrito, e uma que fosse mais fácil de apertar que a outra viraria a
 * preferida — não pelo que resolve, mas por estar mais à mão.
 *
 * O motivo não é burocracia: esta é a única ação do sistema que move a ordem
 * para trás, e daqui a seis meses a pergunta na trilha vai ser "por que esta
 * ordem voltou de faturado?". Sem a frase escrita na hora, ninguém lembra.
 *
 * =============================================================================
 * O QUE A TELA PRECISA DIZER ANTES
 * =============================================================================
 * Que o WhatsApp já saiu. O aviso da etapa errada está no celular do cliente e
 * nenhum clique aqui o traz de volta — quem conserta isso é uma mensagem de
 * gente. Esconder esse detalhe faria alguém desfazer achando que apagou o
 * estrago, e o estrago já tinha sido entregue.
 */
export default function DesfazerPasso({
  ordemId,
  deOnde,
  aoDesfazer,
}: {
  ordemId: string
  /** O nome da etapa em que a ordem está — o passo que vai ser desfeito. */
  deOnde: string
  /** A janela guarda o painel em estado próprio e precisa recarregar. */
  aoDesfazer?: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('ordemId', ordemId)
      form.set('motivo', motivo)
      const r = await desfazerUltimoPasso(null, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setAberto(false)
      setMotivo('')
      router.refresh()
      aoDesfazer?.()
    })
  }

  if (!aberto) {
    return (
      <button type="button" className={estilo.btnLinha} onClick={() => setAberto(true)}>
        Voltar um passo
      </button>
    )
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Voltar um passo</p>
      <p className={estilo.texto}>
        A ordem volta de <strong>{deOnde}</strong> para a etapa anterior. Nada é apagado: a volta
        entra na trilha como mais uma linha, com o seu nome, a hora e o motivo.
      </p>
      <p className={estilo.dica} style={{ marginTop: 0 }}>
        O que já saiu não volta: se o cliente recebeu aviso no WhatsApp ou um PDF foi gerado, eles
        continuam lá. Avise-o você mesmo, se for o caso.
      </p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <label className={estilo.rotulo}>
        Por que está voltando?
        <textarea
          className={estilo.area}
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Marquei recebido antes de o aparelho chegar; cliquei na ordem errada…"
        />
      </label>

      <div className={estilo.acoesForm}>
        <button
          type="button"
          className={estilo.btn}
          onClick={confirmar}
          disabled={pendente || motivo.trim().length < 5}
        >
          {pendente ? 'Voltando…' : 'Confirmar e voltar'}
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
          Deixar como está
        </button>
      </div>
    </div>
  )
}
