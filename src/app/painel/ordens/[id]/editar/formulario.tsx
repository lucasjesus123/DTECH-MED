'use client'

import { useState, useTransition } from 'react'
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
  const [pendente, iniciar] = useTransition()
  const [resposta, setResposta] = useState<
    { estado: 'parado' } | { estado: 'salvo' } | { estado: 'erro'; motivo: string }
  >({ estado: 'parado' })

  /**
   * ISTO SALVAVA E NÃO DIZIA QUE SALVOU — e por isso parecia não salvar.
   *
   * =============================================================================
   * O DEFEITO, MEDIDO
   * =============================================================================
   * A ação `editarOrdem` gravava certo: conferido no banco, o defeito, a
   * prioridade e o rastreio mudavam. A tela é que ficava idêntica. O
   * `useActionState` devolve `{ok:true}` tanto no estado inicial quanto depois
   * de um salvamento bem-sucedido, e o formulário só desenhava alguma coisa no
   * caminho do ERRO. Salvar com sucesso não mudava um pixel.
   *
   * O `setTimeout(refresh, 900)` piorava: ele recarregava a página no escuro,
   * 900ms depois do clique, sem saber se a ação já tinha terminado. Quando ela
   * demorava mais que isso, o recarregamento trazia os valores VELHOS do
   * servidor e os plantava de volta nos campos — a correção sumia da tela
   * depois de gravada, que é a pior das duas aparências possíveis.
   *
   * O relato do dono do sistema foi exatamente este: "quando edito e tento
   * salvar não está salvando".
   *
   * =============================================================================
   * O QUE FAZ AGORA
   * =============================================================================
   * Espera a ação terminar, diz o que aconteceu, e só então recarrega — nesta
   * ordem, que é a única em que a pessoa vê a confirmação antes de a tela mexer.
   */
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    setResposta({ estado: 'parado' })
    iniciar(async () => {
      const r = await editarOrdem({ ok: true }, dados)
      if (!r.ok) {
        setResposta({ estado: 'erro', motivo: r.motivo })
        return
      }
      setResposta({ estado: 'salvo' })
      router.refresh()
    })
  }

  return (
    <form className={estilo.form} onSubmit={enviar}>
      <input type="hidden" name="ordemId" value={ordemId} />

      {resposta.estado === 'erro' ? (
        <p className={estilo.erro} role="alert">
          {resposta.motivo}
        </p>
      ) : resposta.estado === 'salvo' ? (
        <p className={estilo.sucesso} role="status">
          Correção salva. Ela ficou registrada na trilha, com o que estava antes.
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
