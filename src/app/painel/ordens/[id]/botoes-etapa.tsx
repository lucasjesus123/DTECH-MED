'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { avancar } from '@/server/acoes/ordem'
import AgendarParada, { type DadosDaParada } from './agendar-parada'
import estilo from '../../painel.module.css'

type Passo = { para: EtapaOrdem; titulo: string; avisaCliente: boolean }

/**
 * Os botões de avanço da ordem.
 *
 * Três cuidados de interface que evitam erro caro:
 *
 *  • O botão diz **se o cliente vai ser avisado**. Um passo que dispara
 *    WhatsApp para a clínica não pode parecer igual a um passo interno — quem
 *    clica precisa saber que a mensagem sai na hora.
 *  • O motivo da recusa aparece inteiro. A máquina de estados escreve mensagens
 *    para serem lidas por gente ("faltam 3 fotos"), e engoli-las obrigaria a
 *    pessoa a adivinhar por que o botão não funcionou.
 *  • **O passo que exige parada abre a marcação, em vez de recusar.** Era a
 *    recusa mais frequente da ficha: "Marque a parada na Agenda de rota antes".
 *    A mensagem está certa e não resolve nada — mandava a pessoa decorar o
 *    número da O.S., abrir outra tela, achar a ordem na fila e voltar. Agora o
 *    mesmo clique abre a janela com a agenda dos motoristas, marca a parada e o
 *    passo anda em seguida. Quando a parada JÁ existe, o botão volta a ser o
 *    botão de sempre — a trava do motor continua sendo a do motor.
 */
export default function BotoesEtapa({
  ordemId,
  passos,
  parada,
}: {
  ordemId: string
  passos: Passo[]
  /**
   * Presente só quando falta a parada. Nulo quando ela já existe (ou quando o
   * perfil não agenda rota) — e aí nenhum passo abre janela nenhuma.
   */
  parada?: { exigidaPor: EtapaOrdem[]; dados: DadosDaParada } | null
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [marcando, setMarcando] = useState<Passo | null>(null)
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

  function aoClicar(p: Passo) {
    if (parada && parada.exigidaPor.includes(p.para)) {
      setErro(null)
      setMarcando(p)
      return
    }
    executar(p)
  }

  return (
    <div className={estilo.form}>
      {erro ? <p className={estilo.erro} role="alert">{erro}</p> : null}

      <div className={estilo.acoesForm}>
        {passos.map((p) => {
          const abreJanela = Boolean(parada && parada.exigidaPor.includes(p.para))
          return (
            <button
              key={p.para}
              type="button"
              className={estilo.btn}
              disabled={pendente}
              onClick={() => aoClicar(p)}
              title={abreJanela ? 'Abre a agenda dos motoristas para marcar a parada' : undefined}
            >
              {p.titulo}
              {/* O passo que ainda vai passar pela janela NÃO promete o aviso
                  aqui: quem dispara o WhatsApp é a marcação, e a janela é que
                  diz isso, depois de a pessoa escolher o dia e quem vai. */}
              {p.avisaCliente && !abreJanela ? ' · avisa o cliente' : ''}
              {abreJanela ? ' · escolher dia e motorista' : ''}
            </button>
          )
        })}
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

      {marcando && parada ? (
        <AgendarParada
          dados={parada.dados}
          titulo={marcando.titulo}
          aoFechar={() => setMarcando(null)}
        />
      ) : null}
    </div>
  )
}
