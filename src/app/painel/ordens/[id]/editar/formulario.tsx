'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { editarOrdem } from '@/server/acoes/ordem'
import estilo from '../../../painel.module.css'

/**
 * O formulário da correção.
 *
 * Ele nasce PREENCHIDO com o que está gravado, e não em branco. Um formulário
 * de edição vazio faz a pessoa redigitar o que já estava certo — e redigitar é
 * onde nascem os erros que esta tela existe para consertar.
 */
export default function FormEditar({
  ordemId,
  defeito,
  prioridade,
  prazo,
  viaCorreio,
  codigoRastreio,
}: {
  ordemId: string
  defeito: string
  prioridade: 'NORMAL' | 'ALTA'
  prazo: string
  viaCorreio: boolean
  codigoRastreio: string
}) {
  const router = useRouter()
  const [estado, acao, pendente] = useActionState(editarOrdem, {
    ok: true as const,
  })

  return (
    <form
      action={acao}
      className={estilo.form}
      onSubmit={() => setTimeout(() => router.refresh(), 900)}
    >
      <input type="hidden" name="ordemId" value={ordemId} />

      {!estado.ok ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <label className={estilo.rotulo}>
        O que o cliente relatou *
        <textarea
          className={estilo.area}
          name="defeito"
          required
          minLength={10}
          maxLength={2000}
          defaultValue={defeito}
        />
        <span className={estilo.dica}>
          É o relato em português do cliente. O laudo do técnico tem lugar próprio na ficha.
        </span>
      </label>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Prioridade
          <select className={estilo.campo} name="prioridade" defaultValue={prioridade}>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta — aparelho parado em clínica faturando</option>
          </select>
        </label>

        <label className={estilo.rotulo}>
          Prazo prometido
          <input className={estilo.campo} name="prazo" type="date" defaultValue={prazo} />
          {/* Apagar o prazo é uma edição legítima: promessa feita por engano
              some, e o alerta de atraso para de acusar o que não foi prometido. */}
          <span className={estilo.dica}>Deixe em branco para não prometer data.</span>
        </label>
      </div>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Veio pelo correio?
          <select className={estilo.campo} name="viaCorreio" defaultValue={viaCorreio ? '1' : '0'}>
            <option value="0">Não — retirada nossa</option>
            <option value="1">Sim, veio pelo correio</option>
          </select>
        </label>

        <label className={estilo.rotulo}>
          Código de rastreio
          <input
            className={estilo.campo}
            name="codigoRastreio"
            maxLength={60}
            defaultValue={codigoRastreio}
            placeholder="Só quando vier pelo correio"
          />
        </label>
      </div>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar correção'}
        </button>
      </div>

      <p className={estilo.dica}>
        A correção fica registrada na trilha, com o que estava antes e o que ficou. Uma mudança
        silenciosa num campo que o cliente já leu no orçamento não se distingue de alguém
        reescrevendo a história do serviço.
      </p>
    </form>
  )
}
