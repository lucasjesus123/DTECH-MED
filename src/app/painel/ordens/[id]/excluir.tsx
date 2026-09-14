'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { examinarExclusao, excluirOrdem } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

/**
 * Apagar a ordem de vez.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA É FEITA DE RECUSAS
 * ---------------------------------------------------------------------------
 * "Excluir" existe porque O.S. aberta por engano — nome errado, cliente
 * duplicado, teste que ficou — suja a lista de quem trabalha e não prova nada
 * de ninguém. Cancelar não resolve isso: cancelada CONTINUA aparecendo, porque
 * cancelar é um fato sobre uma ordem de verdade.
 *
 * Só que apagar uma ordem não apaga uma linha: o banco leva junto, em cascata,
 * a linha do tempo inteira, as fotos e as assinaturas. Então a tela é montada
 * de trás para frente — primeiro o servidor DIZ SE PODE, e só se puder é que
 * aparece onde digitar. Nunca ao contrário. Quem abre uma ordem que já virou
 * prova não vê campo nenhum: vê o motivo, e o botão de cancelar ao lado.
 *
 * O número da O.S. digitado à mão não é burocracia — é o que separa apagar
 * ESTA ordem de apagar a que estava aberta antes dela na lista.
 *
 * A palavra final é sempre do servidor: `excluirOrdem` pergunta de novo, por
 * conta própria. Esta tela é conforto, não permissão.
 */

type Veredito =
  | { pode: true; avisos: string[] }
  | { pode: false; motivo: string; alternativa: string }

export default function Excluir({ ordemId }: { ordemId: string }) {
  const [aberto, setAberto] = useState(false)
  const [exame, setExame] = useState<{ numero: number; veredito: Veredito } | null>(null)
  const [numero, setNumero] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function abrir() {
    setErro(null)
    setExame(null)
    setAberto(true)
    iniciar(async () => {
      const r = await examinarExclusao(ordemId)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setExame(r.dados ?? null)
    })
  }

  function fechar() {
    setAberto(false)
    setExame(null)
    setNumero('')
    setMotivo('')
    setErro(null)
  }

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await excluirOrdem(ordemId, numero, motivo)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      // A ordem não existe mais: ficar na ficha dela seria mostrar um 404.
      router.push('/painel/ordens')
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button type="button" className={estilo.acaoRara} onClick={abrir}>
        Excluir esta ordem
      </button>
    )
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Excluir a ordem</p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      {!exame && !erro ? <p className={estilo.texto}>Conferindo o que esta ordem carrega…</p> : null}

      {/* -------------------------------------------------------------------
          NÃO PODE. Aqui não existe campo nenhum para preencher: o caminho
          está fechado, e a tela mostra o que fazer no lugar.
          ----------------------------------------------------------------- */}
      {exame && !exame.veredito.pode ? (
        <>
          <p className={estilo.avisoCaixaForte}>
            <strong>Esta ordem não pode ser apagada.</strong> {exame.veredito.motivo}
          </p>
          <p className={estilo.texto}>{exame.veredito.alternativa}</p>
          <div className={estilo.acoesForm}>
            <button type="button" className={estilo.btnSec} onClick={fechar}>
              Voltar
            </button>
          </div>
        </>
      ) : null}

      {/* -------------------------------------------------------------------
          PODE. O que vai ser destruído é dito ANTES de pedir qualquer coisa —
          descobrir depois não serve para nada.
          ----------------------------------------------------------------- */}
      {exame && exame.veredito.pode ? (
        <>
          <ul className={estilo.listaSimples}>
            {exame.veredito.avisos.map((aviso) => (
              <li key={aviso} className={estilo.texto}>
                {aviso}
              </li>
            ))}
          </ul>

          <label className={estilo.rotulo}>
            Digite o número da ordem ({exame.numero}) para confirmar
            <input
              className={estilo.campo}
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              /* Sem placeholder com o número dentro: um campo que já mostra a
                 resposta parece preenchido, e o que se quer aqui é justamente
                 o segundo de atenção de quem digita. O rótulo acima já diz. */
              autoComplete="off"
            />
          </label>

          <label className={estilo.rotulo}>
            Por que está sendo apagada?
            <textarea
              className={estilo.area}
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Aberta em duplicidade; cliente errado; ordem de teste…"
            />
          </label>
          <p className={estilo.dica}>
            Esta frase fica na trilha de auditoria junto com o seu nome. É a única coisa que vai
            sobrar sobre esta ordem.
          </p>

          <div className={estilo.acoesForm}>
            <button
              type="button"
              className={estilo.btnPerigo}
              onClick={confirmar}
              disabled={
                pendente ||
                motivo.trim().length < 5 ||
                numero.trim().replace(/^#/, '').replace(/^0+/, '') !== String(exame.numero)
              }
            >
              {pendente ? 'Apagando…' : 'Apagar para sempre'}
            </button>
            <button type="button" className={estilo.btnSec} onClick={fechar} disabled={pendente}>
              Voltar
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
