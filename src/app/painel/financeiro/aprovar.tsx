'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aprovarConta, desaprovarConta } from '@/server/acoes/caixa'
import { formatarBRL } from '@/lib/dinheiro'
import estilo from '../painel.module.css'

/**
 * A FILA DE APROVAÇÃO.
 *
 * =============================================================================
 * A TELA MOSTRA QUEM LANÇOU, E ISSO É O PONTO
 * =============================================================================
 * Sem o nome de quem lançou, aprovar vira apertar um botão numa lista de
 * descrições — e o controle que a segregação de função existe para criar
 * desaparece, sobrando só o clique.
 *
 * Com o nome, a pergunta que o aprovador faz muda: deixa de ser "esta conta
 * parece certa?" e passa a ser "faz sentido o Fábio ter lançado isto?". É essa
 * segunda pergunta que pega a conta inventada.
 *
 * Quando quem aprova é quem lançou, a tela DIZ ISSO em vez de bloquear: numa
 * empresa de sete pessoas o administrador às vezes é mesmo quem lançou, e
 * proibir travaria o trabalho. O aviso deixa a escolha visível, e a trilha
 * guarda os dois nomes.
 */

type Conta = {
  id: string
  tipo: string
  descricao: string
  categoria: string | null
  contraparte: string | null
  valorCentavos: number
  vencimento: Date
  autorNome: string | null
  criadoEm: Date
  cliente: { nome: string } | null
}

export default function FilaDeAprovacao({
  contas,
  meuNome,
}: {
  contas: Conta[]
  meuNome: string
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string; motivo?: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Pronto.') : (r.motivo ?? 'Não deu certo.') })
      router.refresh()
    })
  }

  if (contas.length === 0) {
    return (
      <div className={estilo.vazio}>
        Nada esperando aprovação. Toda conta lançada aparece aqui antes de poder receber baixa — é o
        segundo par de olhos antes de o dinheiro sair.
      </div>
    )
  }

  const total = contas.reduce((s, c) => s + c.valorCentavos, 0)

  return (
    <>
      <p className={estilo.texto} style={{ marginBottom: 'var(--s3)' }}>
        {contas.length} conta{contas.length > 1 ? 's' : ''} esperando · {formatarBRL(total)} no total.
        Aprovar libera a baixa; enquanto isso não acontece, ninguém consegue pagar.
      </p>

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s3)' }}>
        {contas.map((c) => {
          const euMesmo = c.autorNome != null && c.autorNome === meuNome
          return (
            <li key={c.id} className={estilo.modeloCartao}>
              <div className={estilo.modeloCartaoTopo}>
                <div>
                  <p className={estilo.modeloCartaoNome}>{c.descricao}</p>
                  <p className={estilo.dica}>
                    {c.tipo === 'PAGAR' ? 'a pagar' : 'a receber'}
                    {c.contraparte ? ` · ${c.contraparte}` : ''}
                    {c.cliente ? ` · ${c.cliente.nome}` : ''}
                    {c.categoria ? ` · ${c.categoria}` : ''}
                  </p>
                </div>
                <strong>{formatarBRL(c.valorCentavos)}</strong>
              </div>

              <p className={estilo.dica}>
                vence em {c.vencimento.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {c.autorNome ? ` · lançada por ${c.autorNome}` : ' · sem autor registrado'}
              </p>

              {/* Não bloqueia — mostra. Ver o comentário do topo do arquivo. */}
              {euMesmo ? (
                <p className={estilo.dica} role="status">
                  Você mesmo lançou esta conta. Aprovar a própria conta é permitido, e fica registrado
                  na trilha como tal.
                </p>
              ) : null}

              <div className={estilo.modeloCartaoAcoes}>
                <button
                  type="button"
                  className={estilo.btn}
                  disabled={pendente}
                  onClick={() => rodar(() => aprovarConta(c.id))}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  className={estilo.linkAcao}
                  disabled={pendente}
                  onClick={() => rodar(() => desaprovarConta(c.id))}
                >
                  Desfazer aprovação
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
