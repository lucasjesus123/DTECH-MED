'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { emitirDocumento } from '@/server/acoes/documentos'
import estilo from '../../painel.module.css'

/**
 * OS DOIS DOCUMENTOS QUE SE PEDEM.
 *
 * =============================================================================
 * POR QUE ELES NÃO NASCEM SOZINHOS
 * =============================================================================
 * Os outros documentos acompanham fatos que sempre acontecem: a ordem de
 * retirada quando a coleta é agendada, o recibo quando a fatura é quitada.
 *
 * Estes dois dependem de quem é o cliente. O contrato só é preciso quando o
 * setor de compras exige instrumento assinado antes de liberar a nota; a nota
 * promissória, quando o aparelho sai e o pagamento fica para depois. Emitir os
 * dois em toda ordem encheria a pasta de papel que ninguém pediu — e uma nota
 * promissória gerada sem necessidade é um TÍTULO DE CRÉDITO solto, com o valor
 * da dívida escrito nele.
 *
 * =============================================================================
 * O BOTÃO NÃO PERGUNTA VALOR
 * =============================================================================
 * Ele vem da fatura, ou do orçamento aprovado. Um campo aqui seria a porta para
 * cobrar diferente do combinado — e, na promissória, para emitir um título por
 * uma quantia que o cliente nunca aprovou.
 */
export default function EmitirDocumentos({ ordemId }: { ordemId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function emitir(tipo: string) {
    setMsg(null)
    iniciar(async () => {
      const r = await emitirDocumento(ordemId, tipo)
      setMsg({ ok: r.ok, texto: r.ok ? r.mensagem : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <>
      <div className={estilo.acoesForm}>
        <button
          type="button"
          className={estilo.btnSec}
          disabled={pendente}
          onClick={() => emitir('CONTRATO_PRESTACAO')}
        >
          {pendente ? 'Gerando…' : 'Emitir contrato'}
        </button>
        <button
          type="button"
          className={estilo.btnSec}
          disabled={pendente}
          onClick={() => emitir('NOTA_PROMISSORIA')}
        >
          Emitir nota promissória
        </button>
      </div>

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <p className={estilo.dica}>
        O valor sai do orçamento aprovado, nunca digitado de novo. A nota promissória é um título:
        emita só quando o aparelho for entregue antes do pagamento.
      </p>
    </>
  )
}
