'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { gerarContasDoMes } from '@/server/acoes/caixa'
import NovaConta, { type ClienteBreve } from './nova-conta'
import estilo from '../painel.module.css'

/**
 * AS TRÊS AÇÕES DO TOPO — e por que elas saíram de dentro das abas.
 *
 * =============================================================================
 * O QUE VALE PARA TODAS AS ABAS MORA ACIMA DELAS
 * =============================================================================
 * As três ações daqui não pertencem a nenhuma aba em particular:
 *
 *   NOVA CONTA      estava duplicada dentro de "A pagar" e de "A receber", e o
 *                   tipo vinha decidido pela aba em que a pessoa caiu. Quem
 *                   estava em Relatórios e lembrou de uma conta tinha de trocar
 *                   de aba antes de poder lançar.
 *   PROCESSAR AGORA estava dentro de Recorrências. É o botão que gera as contas
 *                   do mês — o primeiro trabalho de todo dia 1º, e a pessoa
 *                   precisava lembrar que ele existe e ir procurá-lo.
 *   HISTÓRICO       é novo: a trilha do dinheiro sem sair do Financeiro.
 *
 * =============================================================================
 * "PROCESSAR AGORA" DIZ O QUE VAI FAZER ANTES DE FAZER
 * =============================================================================
 * O número de recorrências pendentes vai no próprio botão. Um botão que gera
 * contas sem dizer quantas é um botão que ninguém aperta com confiança — e
 * quando não há nada a gerar ele fica desabilitado, dizendo isso, em vez de
 * aceitar o clique e responder "nada a fazer" depois da espera.
 */
export default function AcoesDoTopo({
  mes,
  tipoInicial,
  categorias,
  clientes,
  pendentesDeGeracao,
  podeLancar,
}: {
  mes: string
  tipoInicial: 'PAGAR' | 'RECEBER'
  categorias: string[]
  clientes: ClienteBreve[]
  pendentesDeGeracao: number
  podeLancar: boolean
}) {
  const [abrir, setAbrir] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function processar() {
    setMsg(null)
    iniciar(async () => {
      const r = await gerarContasDoMes(mes)
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <>
      <div className={estilo.acoesTopo}>
        {podeLancar ? (
          <button
            type="button"
            className={estilo.btnSec}
            onClick={processar}
            disabled={pendente || pendentesDeGeracao === 0}
            title={
              pendentesDeGeracao === 0
                ? 'As recorrências deste mês já estão lançadas.'
                : 'Gera as contas das recorrências ativas para este mês.'
            }
          >
            {pendente
              ? 'Processando…'
              : pendentesDeGeracao === 0
                ? 'Processar agora'
                : `Processar agora (${pendentesDeGeracao})`}
          </button>
        ) : null}

        {podeLancar ? (
          <button type="button" className={estilo.btnPrimario} onClick={() => setAbrir(true)}>
            + Nova conta
          </button>
        ) : null}

        <Link className={estilo.btnSec} href={`/painel/financeiro?aba=historico&mes=${mes}`}>
          Histórico
        </Link>
      </div>

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      {/* O `key` é o que faz a janela nascer limpa a cada abertura: trocá-lo
          desmonta e remonta, e todo estado dela volta ao inicializador. A
          alternativa — sincronizar em `useEffect` — provoca renderização em
          cascata e faz a janela piscar com o estado velho. Ver o comentário
          em `nova-conta.tsx`. */}
      <NovaConta
        key={abrir ? 'aberta' : 'fechada'}
        aberta={abrir}
        aoFechar={() => setAbrir(false)}
        mes={mes}
        tipoInicial={tipoInicial}
        categorias={categorias}
        clientes={clientes}
      />
    </>
  )
}
