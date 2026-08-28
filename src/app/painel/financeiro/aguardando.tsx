'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatarBRL } from '@/lib/dinheiro'
import { emitir } from '@/server/acoes/financeiro'
import estilo from '../painel.module.css'

export type Pendente = {
  ordemId: string
  numero: number
  cliente: string
  equipamento: string
  totalCentavos: number
}

/**
 * ORDENS LIBERADAS, ESPERANDO FATURA — acima das abas, em todas elas.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É CONTEÚDO DE UMA ABA
 * =============================================================================
 * Este bloco morava dentro da aba de faturas. Quando o Financeiro ganhou abas e
 * "A receber" virou a tela de entrada, ele sumiu de vista — e sumiu junto a
 * ação mais urgente da tela.
 *
 * O teste das 18 etapas pegou na hora: o financeiro abria `/painel/financeiro`,
 * não achava "Emitir fatura", a fatura não nascia, e a ordem ficava presa na
 * etapa 14 para sempre. Onze conferências caíram por causa de um clique que
 * mudou de lugar.
 *
 * A lição do desenho é a mesma que organizou o menu: **aba é um recorte do que
 * já aconteceu; o que BLOQUEIA a esteira não é recorte, é chamado.** Uma ordem
 * liberada pela gestão e sem fatura trava o aparelho de um cliente na oficina —
 * isso pertence ao topo da tela, ao lado dos números, não atrás de uma aba.
 *
 * =============================================================================
 * A MENSAGEM PRECISA SOBREVIVER AO SUMIÇO DA LINHA
 * =============================================================================
 * Emitida a fatura, a ordem sai desta lista. Se a confirmação morasse dentro do
 * bloco, ela desapareceria no exato instante em que é necessária: a linha some
 * e quem clicou fica sem saber se funcionou.
 *
 * Por isso o parágrafo da mensagem fica FORA do `if` da lista — o componente
 * continua montado com a lista vazia, e a frase "Fatura emitida no valor de…"
 * permanece na tela.
 */
export default function Aguardando({ pendentes }: { pendentes: Pendente[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function agir(fn: () => Promise<{ ok: boolean; motivo?: string; mensagem?: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : (r.motivo ?? 'Não deu certo.') })
      if (r.ok) router.refresh()
    })
  }

  // Sem nada pendente e sem nada a confirmar, o bloco não ocupa espaço nenhum.
  if (pendentes.length === 0 && !msg) return null

  return (
    <>
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      {pendentes.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Liberadas pela gestão, ainda sem fatura</p>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th scope="col">O.S.</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Equipamento</th>
                  <th scope="col" className={estilo.dir}>
                    Aprovado
                  </th>
                  {/* Rótulo invisível na tela, presente para quem navega a
                      tabela por leitor de tela. Um `<th>` vazio faz a tabela
                      inteira perder o cabeçalho. */}
                  <th scope="col">
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr key={p.ordemId}>
                    <td className={estilo.num}>
                      <Link href={`/painel/ordens/${p.ordemId}`}>
                        #{String(p.numero).padStart(4, '0')}
                      </Link>
                    </td>
                    <td>{p.cliente}</td>
                    <td>{p.equipamento}</td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(p.totalCentavos)}
                    </td>
                    <td className={estilo.dir}>
                      <button
                        type="button"
                        className={estilo.btnSec}
                        disabled={pendente}
                        onClick={() => agir(() => emitir(p.ordemId))}
                      >
                        Emitir fatura
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* O valor não é digitado aqui de propósito: ele vem do orçamento que
              o cliente aprovou. Um campo editável neste ponto seria a porta
              para cobrar diferente do que foi combinado — sem deixar rastro de
              que mudou. */}
          <p className={estilo.dica}>
            A fatura sai com o valor do orçamento aprovado, nunca digitado de novo.
          </p>
        </div>
      ) : null}
    </>
  )
}
