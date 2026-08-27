'use client'

import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { agendar } from '@/server/acoes/agenda'
import { hoje } from '@/lib/datas'
import estilo from '../painel.module.css'

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * DESPACHAR — mandar o aparelho para a rua.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE BOTÃO É, DE VERDADE
 * ---------------------------------------------------------------------------
 * "Despachar" não é um estado novo no sistema: é MARCAR A PARADA e mandar a
 * ordem andar. Nas duas pontas do serviço a rua é a próxima coisa a acontecer —
 * a ordem de retirada esperando alguém buscar, e a faturada esperando alguém
 * entregar — e as duas viviam a três telas de distância de quem estava olhando
 * a lista.
 *
 * Ele reaproveita a MESMA ação da tela de Agenda. Não existe um segundo
 * caminho para marcar parada: um segundo caminho seria a chance de um deles
 * esquecer o aviso ao cliente, ou a exigência de assinatura, ou o evento na
 * trilha. É a ação de lá, com o formulário curto.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O MOTORISTA É OPCIONAL
 * ---------------------------------------------------------------------------
 * Porque a decisão de QUANDO e a de QUEM não acontecem no mesmo momento. Quem
 * atende marca a data com o cliente ao telefone; quem monta a rota escolhe o
 * motorista depois, olhando o dia inteiro. Exigir os dois aqui obrigaria a
 * inventar um nome para poder salvar — e nome inventado em escala de rota é
 * pior que campo vazio.
 */
export function Despachar({
  ordemId,
  tipo,
  enderecoSugerido,
  contatoNome,
  contatoTelefone,
  motoristas,
  aoDespachar,
}: {
  ordemId: string
  tipo: 'RETIRADA' | 'ENTREGA'
  enderecoSugerido: string
  contatoNome: string
  contatoTelefone: string
  motoristas?: Array<{ id: string; nome: string }>
  aoDespachar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(agendar, inicial)

  useEffect(() => {
    if (estado.ok) aoDespachar()
  }, [estado, aoDespachar])

  if (!aberto) {
    return (
      <button type="button" className={estilo.btn} onClick={() => setAberto(true)}>
        Despachar {tipo === 'RETIRADA' ? 'retirada' : 'entrega'}
      </button>
    )
  }

  return (
    <form action={acao} className={estilo.despachoForm}>
      <input type="hidden" name="ordemId" value={ordemId} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="contatoNome" value={contatoNome} />
      <input type="hidden" name="contatoTelefone" value={contatoTelefone} />

      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}

      <div className={estilo.despachoLinha}>
        <label className={estilo.rotulo}>
          Dia
          <input className={estilo.campo} type="date" name="data" required defaultValue={hoje()} />
        </label>
        <label className={estilo.rotulo}>
          Hora
          <input className={estilo.campo} type="time" name="hora" defaultValue="09:00" />
        </label>
        {motoristas && motoristas.length > 0 ? (
          <label className={estilo.rotulo}>
            Motorista
            <select className={estilo.selecao} name="motoristaId" defaultValue="">
              <option value="">definir depois</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className={estilo.rotulo}>
        Endereço da parada
        <input
          className={estilo.campo}
          name="endereco"
          required
          minLength={5}
          defaultValue={enderecoSugerido}
          placeholder="Rua, número, bairro"
        />
        <span className={estilo.dica}>
          Vem do cadastro do cliente. Confira: quem atende no balcão é quem sabe se mudou.
        </span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Despachando…' : 'Confirmar'}
        </button>
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
