'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirResponsavel } from '@/server/acoes/orcamento'
import estilo from '../../painel.module.css'

/**
 * Técnico responsável, prazo e prioridade.
 *
 * O prazo prometido é o campo que alimenta o alerta de atraso — o número que o
 * sistema antigo deixava crescer até 173 sem ninguém ser cobrado. Deixá-lo em
 * branco não é erro: ordem sem prazo simplesmente não entra na conta de
 * atrasadas, o que é honesto. Prometer uma data e não cumprir é outra coisa.
 */
export default function Responsavel({
  ordemId,
  tecnicoAtualId,
  prazoPrometido,
  prioridade,
  tecnicos,
}: {
  ordemId: string
  tecnicoAtualId: string | null
  prazoPrometido: string
  prioridade: 'NORMAL' | 'ALTA'
  tecnicos: Array<{ id: string; nome: string }>
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function salvar(form: FormData) {
    setMsg(null)
    iniciar(async () => {
      const r = await definirResponsavel(form)
      setMsg(r.ok ? { ok: true, texto: 'Salvo.' } : { ok: false, texto: r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <form action={salvar} className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Responsável e prazo</p>
      <input type="hidden" name="ordemId" value={ordemId} />

      <div className={estilo.form}>
        <label className={estilo.rotulo}>
          Técnico
          <select className={estilo.selecao} name="tecnicoId" defaultValue={tecnicoAtualId ?? ''} style={{ width: '100%' }}>
            <option value="">Ninguém ainda</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={estilo.rotulo}>
          Prazo prometido
          <input className={estilo.campo} type="date" name="prazoPrometido" defaultValue={prazoPrometido} />
          <span className={estilo.dica}>
            Em branco, a ordem não conta como atrasada. Com data, o painel cobra.
          </span>
        </label>

        <label className={estilo.rotulo}>
          Prioridade
          <select className={estilo.selecao} name="prioridade" defaultValue={prioridade} style={{ width: '100%' }}>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta — clínica parada</option>
          </select>
        </label>

        {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

        <button type="submit" className={estilo.btnSec} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
