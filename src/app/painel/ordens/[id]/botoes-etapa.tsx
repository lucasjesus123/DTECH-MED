'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { avancar } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

type Passo = { para: EtapaOrdem; titulo: string; avisaCliente: boolean }

/**
 * Os botões de avanço da ordem.
 *
 * Dois cuidados de interface que evitam erro caro:
 *
 *  • O botão diz **se o cliente vai ser avisado**. Um passo que dispara
 *    WhatsApp para a clínica não pode parecer igual a um passo interno — quem
 *    clica precisa saber que a mensagem sai na hora.
 *  • O motivo da recusa aparece inteiro. A máquina de estados escreve mensagens
 *    para serem lidas por gente ("faltam 3 fotos"), e engoli-las obrigaria a
 *    pessoa a adivinhar por que o botão não funcionou.
 */
export default function BotoesEtapa({ ordemId, passos }: { ordemId: string; passos: Passo[] }) {
  const [erro, setErro] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function executar(p: Passo) {
    setErro(null)
    iniciar(async () => {
      const r = await avancar({ ordemId, para: p.para, observacao: observacao.trim() || undefined })
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setObservacao('')
      router.refresh()
    })
  }

  return (
    <div className={estilo.form}>
      {erro ? <p className={estilo.erro} role="alert">{erro}</p> : null}

      <div className={estilo.acoesForm}>
        {passos.map((p) => (
          <button
            key={p.para}
            type="button"
            className={estilo.btn}
            disabled={pendente}
            onClick={() => executar(p)}
          >
            {p.titulo}
            {p.avisaCliente ? ' · avisa o cliente' : ''}
          </button>
        ))}
      </div>

      <label className={estilo.rotulo}>
        Observação (opcional)
        <input
          className={estilo.campo}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Fica registrada na linha do tempo, junto do seu nome"
          disabled={pendente}
        />
      </label>
    </div>
  )
}
