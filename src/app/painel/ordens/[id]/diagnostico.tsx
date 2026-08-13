'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarDiagnostico } from '@/server/acoes/orcamento'
import estilo from '../../painel.module.css'

/**
 * O laudo do técnico.
 *
 * Estes campos não são burocracia: o diagnóstico é **pré-condição** para o
 * orçamento sair da análise. A máquina de estados recusa o avanço sem ele, e
 * com razão — um orçamento sem laudo é um preço sem explicação, e é assim que
 * nasce a discussão de "por que tão caro" que ninguém consegue responder três
 * semanas depois.
 *
 * Os quatro campos aparecem juntos porque são a mesma conversa em momentos
 * diferentes da bancada. Espalhá-los por abas obrigaria o técnico a procurar
 * onde escrever o que acabou de descobrir.
 */
export default function Diagnostico({
  ordemId,
  diagnostico,
  parecerTecnico,
  servicoExecutado,
  testesFinais,
}: {
  ordemId: string
  diagnostico: string
  parecerTecnico: string
  servicoExecutado: string
  testesFinais: string
}) {
  const [aberto, setAberto] = useState(!diagnostico)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function salvar(form: FormData) {
    setMsg(null)
    iniciar(async () => {
      const r = await salvarDiagnostico(form)
      setMsg(r.ok ? { ok: true, texto: 'Laudo salvo.' } : { ok: false, texto: r.motivo })
      if (r.ok) {
        setAberto(false)
        router.refresh()
      }
    })
  }

  if (!aberto) {
    return (
      <div className={estilo.passos} style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(true)}>
          Editar o laudo
        </button>
      </div>
    )
  }

  return (
    <form action={salvar} className={estilo.form} style={{ marginTop: 'var(--s4)' }}>
      <input type="hidden" name="ordemId" value={ordemId} />

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

      <label className={estilo.rotulo}>
        O que você encontrou no aparelho *
        <textarea
          className={estilo.area}
          name="diagnostico"
          rows={4}
          required
          minLength={10}
          defaultValue={diagnostico}
          placeholder="Ex.: fonte sem saída nos 24V, capacitor C14 estufado e trilha com sinal de sobreaquecimento."
        />
        <span className={estilo.dica}>
          Sem este campo a ordem não sai da análise — é ele que sustenta o preço
          do orçamento.
        </span>
      </label>

      <label className={estilo.rotulo}>
        Parecer para a gestão
        <textarea
          className={estilo.area}
          name="parecerTecnico"
          rows={3}
          defaultValue={parecerTecnico}
          placeholder="Vale consertar? Recomenda trocar a peça inteira ou recuperar? O cliente não vê este campo."
        />
      </label>

      <label className={estilo.rotulo}>
        O que foi executado
        <textarea className={estilo.area} name="servicoExecutado" rows={3} defaultValue={servicoExecutado} />
      </label>

      <label className={estilo.rotulo}>
        Testes finais
        <textarea
          className={estilo.area}
          name="testesFinais"
          rows={2}
          defaultValue={testesFinais}
          placeholder="O que foi testado e como o aparelho respondeu."
        />
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar laudo'}
        </button>
        {diagnostico ? (
          <button type="button" className={estilo.btnSec} onClick={() => setAberto(false)} disabled={pendente}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  )
}
