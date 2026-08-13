'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { agendar } from '@/server/acoes/agenda'
import estilo from '../painel.module.css'

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Pendente = {
  ordemId: string
  numero: number
  tipo: 'RETIRADA' | 'ENTREGA'
  cliente: string
  equipamento: string
  endereco: string
  contatoNome: string
  contatoTelefone: string
}

/**
 * Marcação da parada.
 *
 * O endereço vem preenchido do cadastro mas continua **editável**, e o que for
 * salvo é congelado no agendamento. Quem atende sabe coisas que o cadastro não
 * tem — "entrar pelos fundos", "a sala mudou para o 3º andar" — e essa
 * informação precisa chegar ao motorista sem exigir que alguém corrija o
 * cadastro inteiro antes.
 */
export default function Agendador({
  pendentes,
  motoristas,
}: {
  pendentes: Pendente[]
  motoristas: Array<{ id: string; nome: string }>
}) {
  const [abrir, setAbrir] = useState<string | null>(null)
  const [estado, acao, pendente] = useActionState(agendar, inicial)

  if (pendentes.length === 0) {
    return (
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Esperando agendamento</p>
        <p className={estilo.texto}>
          Nada pendente. Toda ordem de retirada gerada e toda ordem já faturada
          têm parada marcada.
        </p>
      </div>
    )
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>Esperando agendamento</span>
        <span className={estilo.fraco}>{pendentes.length}</span>
      </p>

      {!estado.ok && estado.motivo ? <p className={estilo.erro}>{estado.motivo}</p> : null}
      {estado.ok ? <p className={estilo.sucesso}>Parada marcada. O cliente foi avisado com data, hora e motorista.</p> : null}

      <div className={estilo.rolaX}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Equipamento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pendentes.map((p) => (
              <tr key={p.ordemId}>
                <td className={estilo.num}>
                  <Link href={`/painel/ordens/${p.ordemId}`}>#{String(p.numero).padStart(4, '0')}</Link>
                </td>
                <td>
                  <span className={estilo.tag}>{p.tipo === 'RETIRADA' ? 'retirada' : 'entrega'}</span>
                </td>
                <td>{p.cliente}</td>
                <td>{p.equipamento}</td>
                <td className={estilo.dir}>
                  <button
                    type="button"
                    className={estilo.btnSec}
                    onClick={() => setAbrir(abrir === p.ordemId ? null : p.ordemId)}
                  >
                    {abrir === p.ordemId ? 'Fechar' : 'Marcar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendentes
        .filter((p) => p.ordemId === abrir)
        .map((p) => (
          <form key={p.ordemId} action={acao} className={estilo.form} style={{ marginTop: 'var(--s5)' }}>
            <input type="hidden" name="ordemId" value={p.ordemId} />
            <input type="hidden" name="tipo" value={p.tipo} />

            <p className={estilo.blocoTitulo}>
              {p.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'} da O.S. #{String(p.numero).padStart(4, '0')} —{' '}
              {p.cliente}
            </p>

            <div className={estilo.grade}>
              <label className={estilo.rotulo}>
                Data *
                <input className={estilo.campo} type="date" name="data" required />
              </label>
              <label className={estilo.rotulo}>
                A partir das
                <input className={estilo.campo} type="time" name="hora" defaultValue="09:00" />
              </label>
              <label className={estilo.rotulo}>
                Até
                <input className={estilo.campo} type="time" name="janelaFim" />
                <span className={estilo.dica}>A janela combinada com o cliente.</span>
              </label>
              <label className={estilo.rotulo}>
                Motorista
                <select className={estilo.selecao} name="motoristaId" style={{ width: '100%' }}>
                  <option value="">Definir depois</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={estilo.rotulo}>
              Endereço da parada *
              <input className={estilo.campo} name="endereco" defaultValue={p.endereco} required minLength={5} />
              <span className={estilo.dica}>
                Fica congelado nesta parada — se o cadastro mudar depois, o
                comprovante continua mostrando onde o motorista foi.
              </span>
            </label>

            <div className={estilo.grade}>
              <label className={estilo.rotulo}>
                Falar com
                <input className={estilo.campo} name="contatoNome" defaultValue={p.contatoNome} />
              </label>
              <label className={estilo.rotulo}>
                Telefone no local
                <input className={estilo.campo} name="contatoTelefone" defaultValue={p.contatoTelefone} inputMode="tel" />
              </label>
              <label className={estilo.rotulo}>
                Ponto de referência
                <input className={estilo.campo} name="pontoReferencia" placeholder="Portão azul, ao lado da farmácia" />
              </label>
            </div>

            <label className={estilo.rotulo}>
              Recado para o motorista
              <textarea className={estilo.area} name="observacoes" rows={2} placeholder="Levar carrinho, estacionar nos fundos…" />
            </label>

            <div className={estilo.acoesForm}>
              <button type="submit" className={estilo.btn} disabled={pendente}>
                {pendente ? 'Marcando…' : 'Marcar e avisar o cliente'}
              </button>
            </div>
          </form>
        ))}
    </div>
  )
}
