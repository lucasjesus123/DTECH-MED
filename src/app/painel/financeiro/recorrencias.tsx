'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import {
  alternarRecorrencia,
  excluirRecorrencia,
  gerarContasDoMes,
  salvarRecorrencia,
} from '@/server/acoes/caixa'
import type { ClienteBreve } from './contas'
import estilo from '../painel.module.css'

export type Recorrencia = {
  id: string
  tipo: 'PAGAR' | 'RECEBER'
  descricao: string
  categoria: string | null
  contraparte: string | null
  clienteId: string | null
  clienteNome: string | null
  valorCentavos: number
  diaVencimento: number
  ativo: boolean
  fim: string | null
  ultimoMesGerado: string | null
  observacoes: string | null
}

/**
 * O QUE SE REPETE TODO MÊS.
 *
 * =============================================================================
 * RECORRÊNCIA É MODELO, NÃO É CONTA
 * =============================================================================
 * Esta tela não mostra dinheiro nenhum do caixa. Ela mostra REGRAS: "todo dia 5,
 * aluguel, R$ 4.200". A conta de agosto é outra coisa — nasce daqui, vive na aba
 * A pagar, e pode ter o valor corrigido naquele mês sem mexer no modelo (a conta
 * de luz nunca vem igual).
 *
 * Confundir os dois é o defeito clássico: editar a recorrência esperando
 * corrigir a conta do mês, e acabar mudando os doze meses seguintes.
 *
 * =============================================================================
 * GERAR É UM BOTÃO, DE PROPÓSITO
 * =============================================================================
 * Uma rotina noturna que cria contas sozinha é ótima até criar a errada — e aí
 * ninguém sabe quando nem por quê. O botão diz QUANTAS contas vai criar antes de
 * criar, a trilha registra quem apertou, e apertar duas vezes não duplica nada
 * (o mês gerado fica gravado na mesma transação).
 */
export default function Recorrencias({
  recorrencias,
  clientes,
  mes,
  mesExtenso,
  pendentes,
  podeApagar,
}: {
  recorrencias: Recorrencia[]
  clientes: ClienteBreve[]
  mes: string
  mesExtenso: string
  pendentes: number
  podeApagar: boolean
}) {
  const [editando, setEditando] = useState<Recorrencia | 'nova' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function agir(fn: () => Promise<{ ok: true; mensagem?: string } | { ok: false; motivo: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  const ativas = recorrencias.filter((r) => r.ativo)
  const mensalPagar = ativas.filter((r) => r.tipo === 'PAGAR').reduce((s, r) => s + r.valorCentavos, 0)
  const mensalReceber = ativas
    .filter((r) => r.tipo === 'RECEBER')
    .reduce((s, r) => s + r.valorCentavos, 0)

  return (
    <>
      <div className={estilo.caixaTopo}>
        <div className={estilo.caixaSomas}>
          <span>
            <span className={estilo.grav}>Custo fixo mensal</span>
            <strong className={estilo.caixaSoma}>{formatarBRL(mensalPagar)}</strong>
            <span className={estilo.fraco}>sai todo mês, sem ninguém pedir</span>
          </span>
          <span>
            <span className={estilo.grav}>Receita fixa mensal</span>
            <strong className={estilo.caixaSoma}>{formatarBRL(mensalReceber)}</strong>
            <span className={estilo.fraco}>entra todo mês</span>
          </span>
          <span>
            <span className={estilo.grav}>Sobra fixa</span>
            <strong
              className={
                mensalReceber - mensalPagar < 0
                  ? `${estilo.caixaSoma} ${estilo.indAlerta}`
                  : estilo.caixaSoma
              }
            >
              {formatarBRL(mensalReceber - mensalPagar)}
            </strong>
            <span className={estilo.fraco}>antes de qualquer serviço</span>
          </span>
        </div>

        <button
          type="button"
          className={estilo.btnPrimario}
          onClick={() => setEditando(editando === 'nova' ? null : 'nova')}
          aria-expanded={editando === 'nova'}
        >
          {editando === 'nova' ? 'Fechar' : 'Nova recorrência'}
        </button>
      </div>

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>As contas de {mesExtenso}</p>
        {pendentes > 0 ? (
          <>
            <p>
              {pendentes === 1
                ? '1 recorrência ativa ainda não gerou a conta deste mês.'
                : `${pendentes} recorrências ativas ainda não geraram a conta deste mês.`}{' '}
              Gerar cria as contas em aberto, com o vencimento no dia certo.
            </p>
            <div className={estilo.acoesForm}>
              <button
                type="button"
                className={estilo.btnPrimario}
                disabled={pendente}
                onClick={() => agir(() => gerarContasDoMes(mes))}
              >
                {pendente ? 'Gerando…' : `Gerar as ${pendentes === 1 ? 'conta' : `${pendentes} contas`} de ${mesExtenso}`}
              </button>
            </div>
          </>
        ) : (
          <p className={estilo.fraco}>
            Tudo gerado. As recorrências ativas já lançaram a conta de {mesExtenso} — apertar de novo
            não cria nada em dobro.
          </p>
        )}
      </div>

      {editando === 'nova' ? (
        <Formulario
          clientes={clientes}
          aoSalvar={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      ) : null}

      {recorrencias.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma recorrência. Cadastre o aluguel, a energia, o contador e os contratos mensais — o
          sistema passa a lançá-los sozinho, e o custo fixo da empresa vira um número que você vê.
        </p>
      ) : (
        <ul className={estilo.caixaLista}>
          {recorrencias.map((r) => (
            <li
              key={r.id}
              className={r.ativo ? estilo.caixaItem : `${estilo.caixaItem} ${estilo.caixaItemFrio}`}
            >
              <div className={estilo.caixaQuando}>
                <strong>{String(r.diaVencimento).padStart(2, '0')}</strong>
                <span className={estilo.fraco}>todo mês</span>
              </div>

              <div className={estilo.caixaMeio}>
                <strong className={estilo.caixaDesc}>{r.descricao}</strong>
                <p className={estilo.caixaDetalhe}>
                  <span className={estilo.caixaCat}>{r.tipo === 'PAGAR' ? 'a pagar' : 'a receber'}</span>
                  {r.clienteNome ?? r.contraparte ? <span>{r.clienteNome ?? r.contraparte}</span> : null}
                  {r.categoria ? <span className={estilo.caixaCat}>{r.categoria}</span> : null}
                </p>
                <p className={estilo.fraco}>
                  {r.ultimoMesGerado
                    ? `última conta gerada: ${r.ultimoMesGerado}`
                    : 'ainda não gerou nenhuma conta'}
                  {r.fim ? ` · termina em ${curto(r.fim)}` : ''}
                </p>
              </div>

              <div className={estilo.caixaValor}>
                <strong>{formatarBRL(r.valorCentavos)}</strong>
                <span className={r.ativo ? `${estilo.tag} ${estilo.tagOk}` : `${estilo.tag} ${estilo.tagNeutra}`}>
                  {r.ativo ? 'ativa' : 'desligada'}
                </span>
              </div>

              <div className={estilo.caixaAcoes}>
                <button
                  type="button"
                  className={estilo.btnSec}
                  onClick={() => setEditando(editando !== 'nova' && editando?.id === r.id ? null : r)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={estilo.btnSec}
                  disabled={pendente}
                  onClick={() => agir(() => alternarRecorrencia(r.id, !r.ativo))}
                >
                  {r.ativo ? 'Desligar' : 'Ligar'}
                </button>
                {podeApagar ? (
                  <button
                    type="button"
                    className={estilo.acaoRara}
                    disabled={pendente}
                    onClick={() => {
                      if (
                        confirm(
                          `Apagar a recorrência "${r.descricao}"? As contas que ela já gerou continuam no caixa.\n\nDesligar costuma ser o certo — mantém o histórico explicando de onde vieram aquelas contas.`,
                        )
                      ) {
                        agir(() => excluirRecorrencia(r.id))
                      }
                    }}
                  >
                    Apagar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando && editando !== 'nova' ? (
        <Formulario
          recorrencia={editando}
          clientes={clientes}
          aoSalvar={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      ) : null}

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        Editar a recorrência muda os meses que ainda VÃO nascer. A conta que já está lá em A pagar
        continua como estava — é ela que você corrige quando a luz vem mais cara.
      </p>
    </>
  )
}

function Formulario({
  recorrencia,
  clientes,
  aoSalvar,
}: {
  recorrencia?: Recorrencia
  clientes: ClienteBreve[]
  aoSalvar: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarRecorrencia, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const jaAvisou = useRef(false)

  useEffect(() => {
    if (estado.ok && estado.mensagem && !jaAvisou.current) {
      jaAvisou.current = true
      aoSalvar()
    }
  }, [estado, aoSalvar])

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.caixaForm}`}>
      <p className={estilo.blocoTitulo}>
        {recorrencia ? `Editar: ${recorrencia.descricao}` : 'Nova recorrência'}
      </p>
      {recorrencia ? <input type="hidden" name="id" value={recorrencia.id} /> : null}

      <div className={estilo.form}>
        <label className={estilo.rotulo}>
          Direção
          <select className={estilo.selecao} name="tipo" defaultValue={recorrencia?.tipo ?? 'PAGAR'}>
            <option value="PAGAR">Sai todo mês (a pagar)</option>
            <option value="RECEBER">Entra todo mês (a receber)</option>
          </select>
        </label>

        <label className={estilo.rotulo}>
          Do que se trata
          <input
            className={estilo.campo}
            name="descricao"
            required
            maxLength={140}
            defaultValue={recorrencia?.descricao ?? ''}
            placeholder="Aluguel da oficina"
          />
        </label>

        <label className={estilo.rotulo}>
          Categoria
          <input
            className={estilo.campo}
            name="categoria"
            maxLength={60}
            defaultValue={recorrencia?.categoria ?? ''}
            placeholder="Ex.: Instalações"
          />
        </label>

        <label className={estilo.rotulo}>
          Cliente da carteira
          <select className={estilo.selecao} name="clienteId" defaultValue={recorrencia?.clienteId ?? ''}>
            <option value="">— não é cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={estilo.rotulo}>
          Ou quem, por escrito
          <input
            className={estilo.campo}
            name="contraparte"
            maxLength={140}
            defaultValue={recorrencia?.contraparte ?? ''}
            placeholder="Fornecedor, imobiliária…"
          />
        </label>

        <label className={estilo.rotulo}>
          Valor por mês (R$)
          <input
            className={estilo.campo}
            name="valor"
            inputMode="decimal"
            required
            defaultValue={recorrencia ? (recorrencia.valorCentavos / 100).toFixed(2) : ''}
            placeholder="0,00"
          />
        </label>

        <label className={estilo.rotulo}>
          Vence todo dia
          {/* 31 é aceito: a geração empurra para o último dia do mês em
              fevereiro, nunca para o dia 1º do mês seguinte — uma conta que
              vence dia 31 vence NAQUELE mês. */}
          <input
            className={estilo.campo}
            type="number"
            name="diaVencimento"
            min={1}
            max={31}
            required
            defaultValue={recorrencia?.diaVencimento ?? 5}
          />
        </label>

        <label className={estilo.rotulo}>
          Termina em
          <input
            className={estilo.campo}
            type="date"
            name="fim"
            defaultValue={recorrencia?.fim ? recorrencia.fim.slice(0, 10) : ''}
          />
          <span className={estilo.fraco}>vazio = sem prazo</span>
        </label>

        <label className={estilo.rotulo} style={{ gridColumn: '1 / -1' }}>
          Observação
          <input
            className={estilo.campo}
            name="observacoes"
            maxLength={500}
            defaultValue={recorrencia?.observacoes ?? ''}
            placeholder="opcional"
          />
        </label>
      </div>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
          {pendente ? 'Salvando…' : recorrencia ? 'Salvar alterações' : 'Criar recorrência'}
        </button>
      </div>

      {!estado.ok ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}
    </form>
  )
}

function curto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}
