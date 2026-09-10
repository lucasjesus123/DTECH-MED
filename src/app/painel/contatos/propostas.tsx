'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import {
  cancelarProposta,
  enviarProposta,
  salvarProposta,
} from '@/server/acoes/proposta'
import type { PropostaNaLista, ResumoPropostas } from '@/server/consultas/propostas'
import estilo from '../painel.module.css'

/**
 * O ORÇAMENTO DO PASSO 1 — a tela onde ele nasce, sai e volta respondido.
 *
 * =============================================================================
 * A DIFERENÇA PARA O OUTRO ORÇAMENTO
 * =============================================================================
 * O sistema já tinha um "orçamento": o preço montado DEPOIS do laudo, de um
 * aparelho que já está na oficina. Este é o do passo 1 — o que se manda para
 * alguém que ainda está decidindo se traz o aparelho.
 *
 * Os dois se chamam orçamento na boca de quem trabalha, e a diferença é o
 * momento. Por isso as abas se chamam "Orçamentos" (este) e "Depois do laudo"
 * (aquele): nomear pelo momento é o que faz alguém acertar a aba de primeira.
 *
 * =============================================================================
 * O QUE ELE FAZ DE PONTA A PONTA
 * =============================================================================
 *   monta  →  manda o link no WhatsApp  →  o cliente aprova assinando  →
 *   vira a O.S. do passo 2, com o valor já combinado
 *
 * O último elo é o que faltava no sistema inteiro: o passo 1 existia como uma
 * anotação de valor dentro da ordem, e a ordem nascia sem nada antes dela.
 */

type Cliente = { id: string; nome: string; cidade: string | null; uf: string | null }
type Peca = { id: string; sku: string; nome: string; precoVendaCentavos: number }

type Item = {
  tipo: 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA'
  pecaId: string | null
  descricao: string
  quantidade: number
  valorUnit: number
}

const ITEM_VAZIO: Item = {
  tipo: 'SERVICO',
  pecaId: null,
  descricao: '',
  quantidade: 1,
  valorUnit: 0,
}

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'rascunho',
  ENVIADA: 'aguardando o cliente',
  APROVADA: 'aprovado',
  RECUSADA: 'recusado',
  EXPIRADA: 'venceu',
  CANCELADA: 'cancelado',
}

export default function Propostas({
  propostas,
  resumo,
  clientes,
  pecas,
}: {
  propostas: PropostaNaLista[]
  resumo: ResumoPropostas
  clientes: Cliente[]
  pecas: Peca[]
}) {
  const [editando, setEditando] = useState<PropostaNaLista | 'nova' | null>(null)

  return (
    <>
      <div className={estilo.resumo}>
        <Indicador
          rotulo="Aguardando o cliente"
          valor={String(resumo.aguardando)}
          nota={
            resumo.aguardandoCentavos > 0
              ? `${formatarBRL(resumo.aguardandoCentavos)} em jogo`
              : 'nenhum orçamento na mão do cliente'
          }
        />
        <Indicador
          rotulo="Aprovados sem O.S."
          valor={String(resumo.aprovadasSemOs)}
          nota={
            resumo.aprovadasSemOs > 0
              ? 'trabalho vendido e ainda não aberto'
              : 'tudo que foi aprovado já virou ordem'
          }
          alerta={resumo.aprovadasSemOs > 0}
        />
        <Indicador
          rotulo="Em rascunho"
          valor={String(resumo.emRascunho)}
          nota={resumo.emRascunho > 0 ? 'montados e não enviados' : '—'}
        />
        <Indicador rotulo="Aprovados" valor={String(resumo.aprovadas)} nota="no total" />
      </div>

      {editando ? (
        <Editor
          proposta={editando === 'nova' ? null : editando}
          clientes={clientes}
          pecas={pecas}
          aoFechar={() => setEditando(null)}
        />
      ) : (
        <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
          <button type="button" className={estilo.btn} onClick={() => setEditando('nova')}>
            Novo orçamento
          </button>
        </div>
      )}

      {propostas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum orçamento ainda. Este é o passo 1: monte o preço, mande o link no WhatsApp, e
          quando o cliente aprovar ele vira a O.S. com um clique.
        </p>
      ) : (
        <div className={estilo.quadro}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>Orçamento</th>
                <th>Cliente</th>
                <th>Aparelho</th>
                <th className={estilo.dir}>Total</th>
                <th>Situação</th>
                <th>{/* ações */}</th>
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <Linha key={p.id} p={p} aoEditar={() => setEditando(p)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Linha({ p, aoEditar }: { p: PropostaNaLista; aoEditar: () => void }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  function mandar() {
    setErro(null)
    iniciar(async () => {
      const r = await enviarProposta(p.id)
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  function cancelar() {
    setErro(null)
    iniciar(async () => {
      const r = await cancelarProposta(p.id, '')
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  return (
    <tr>
      <td>
        <span className={estilo.cardOs}>#{String(p.numero).padStart(4, '0')}</span>
        <span className={estilo.fraco} style={{ display: 'block' }}>
          {p.criadoEm}
          {p.autorNome ? ` · ${p.autorNome}` : ''}
        </span>
      </td>
      <td>{p.cliente}</td>
      <td>
        {p.equipamento}
        {p.ordemGeradaNumero ? (
          <Link
            href={`/painel/ordens?abrir=${p.ordemGeradaId}`}
            className={estilo.fraco}
            style={{ display: 'block' }}
          >
            virou a O.S. #{String(p.ordemGeradaNumero).padStart(4, '0')}
          </Link>
        ) : null}
      </td>
      <td className={estilo.dir}>{formatarBRL(p.totalCentavos)}</td>
      <td>
        <span
          className={
            p.status === 'APROVADA'
              ? `${estilo.tag} ${estilo.tagOk}`
              : p.vencida || p.status === 'RECUSADA'
                ? `${estilo.tag} ${estilo.tagAlerta}`
                : `${estilo.tag} ${estilo.tagNeutra}`
          }
        >
          {p.vencida ? 'venceu esperando' : ROTULO_STATUS[p.status]}
        </span>
        {p.validoAte && p.status === 'ENVIADA' ? (
          <span className={estilo.fraco} style={{ display: 'block' }}>
            vale até {p.validoAte}
          </span>
        ) : null}
        {p.aprovadaPorNome ? (
          <span className={estilo.fraco} style={{ display: 'block' }}>
            por {p.aprovadaPorNome}
          </span>
        ) : null}
        {erro ? (
          <span className={estilo.erro} role="alert">
            {erro}
          </span>
        ) : null}
      </td>
      <td className={estilo.dir}>
        <div className={estilo.acoesLinha}>
          {p.status === 'RASCUNHO' ? (
            <>
              <button type="button" className={estilo.btnLinha} onClick={aoEditar}>
                Editar
              </button>
              <button
                type="button"
                className={estilo.btnLinha}
                onClick={mandar}
                disabled={pendente}
              >
                {pendente ? 'Enviando…' : 'Enviar ao cliente'}
              </button>
            </>
          ) : null}

          {/* O LINK É COPIÁVEL SEMPRE que a proposta já saiu.
              O WhatsApp da casa cai, o cliente apaga a conversa, alguém quer
              mandar por e-mail. Ter o endereço à mão evita reenviar — que
              geraria uma segunda mensagem para a mesma proposta. */}
          {p.status !== 'RASCUNHO' ? (
            <button
              type="button"
              className={estilo.btnLinha}
              onClick={() => {
                void navigator.clipboard?.writeText(p.link)
                setCopiado(true)
                setTimeout(() => setCopiado(false), 1800)
              }}
            >
              {copiado ? 'copiado' : 'Copiar link'}
            </button>
          ) : null}

          {/* A PONTE PARA O PASSO 2. Só aparece no estado em que ela funciona:
              aprovado e ainda sem ordem. */}
          {p.status === 'APROVADA' && !p.ordemGeradaId ? (
            <Link href={`/painel/ordens/nova?proposta=${p.id}`} className={estilo.btnLinha}>
              Abrir a O.S.
            </Link>
          ) : null}

          {p.status === 'RASCUNHO' || p.status === 'ENVIADA' ? (
            <button
              type="button"
              className={estilo.linkAcao}
              onClick={cancelar}
              disabled={pendente}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// O EDITOR
// ---------------------------------------------------------------------------

function Editor({
  proposta,
  clientes,
  pecas,
  aoFechar,
}: {
  proposta: PropostaNaLista | null
  clientes: Cliente[]
  pecas: Peca[]
  aoFechar: () => void
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const [clienteId, setClienteId] = useState(proposta?.clienteId ?? '')
  const [itens, setItens] = useState<Item[]>(
    proposta && proposta.itens.length > 0
      ? proposta.itens.map((i) => ({
          tipo: i.tipo as Item['tipo'],
          pecaId: i.pecaId,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnit: i.valorUnitCentavos / 100,
        }))
      : [{ ...ITEM_VAZIO }],
  )
  const [desconto, setDesconto] = useState((proposta?.descontoCentavos ?? 0) / 100)
  const [acrescimo, setAcrescimo] = useState((proposta?.acrescimoCentavos ?? 0) / 100)

  const previa = useMemo(() => {
    const soma = itens.reduce((s, i) => s + Math.round(i.valorUnit * 100) * i.quantidade, 0)
    return Math.max(0, soma - Math.round(desconto * 100) + Math.round(acrescimo * 100))
  }, [itens, desconto, acrescimo])

  function alterar(idx: number, patch: Partial<Item>) {
    setItens((a) => a.map((i, n) => (n === idx ? { ...i, ...patch } : i)))
  }

  function escolherPeca(idx: number, pecaId: string) {
    const p = pecas.find((x) => x.id === pecaId)
    if (!p) {
      alterar(idx, { pecaId: null })
      return
    }
    // Escolher a peça preenche descrição e preço: quem monta orçamento não quer
    // digitar de novo o que já está no catálogo, e é ali que nasce a divergência
    // entre o preço da prateleira e o preço orçado.
    alterar(idx, { pecaId: p.id, descricao: p.nome, valorUnit: p.precoVendaCentavos / 100 })
  }

  function salvar(form: FormData) {
    setMsg(null)
    form.set('itensJson', JSON.stringify(itens.filter((i) => i.descricao.trim())))
    form.set('desconto', String(desconto))
    form.set('acrescimo', String(acrescimo))
    iniciar(async () => {
      const r = await salvarProposta({ ok: false, motivo: '' }, form)
      if (!r.ok) {
        setMsg({ ok: false, texto: r.motivo })
        return
      }
      setMsg({ ok: true, texto: 'Orçamento salvo. Confira antes de mandar ao cliente.' })
      router.refresh()
      aoFechar()
    })
  }

  return (
    <form action={salvar} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>
        {proposta ? `Orçamento #${String(proposta.numero).padStart(4, '0')}` : 'Novo orçamento'}
      </p>
      {proposta ? <input type="hidden" name="propostaId" value={proposta.id} /> : null}

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Cliente *
          <select
            className={estilo.selecao}
            name="clienteId"
            required
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">Escolha…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.cidade ? ` — ${c.cidade}${c.uf ? `/${c.uf}` : ''}` : ''}
              </option>
            ))}
          </select>
          <span className={estilo.dica}>
            Ainda não é cliente? <Link href="/painel/clientes">Cadastre primeiro</Link> — o
            orçamento precisa de um CPF ou CNPJ para o cliente conseguir aprovar pelo link.
          </span>
        </label>

        <label className={estilo.rotulo}>
          Qual aparelho *
          <input
            className={estilo.campo}
            name="equipamentoDescricao"
            required
            minLength={3}
            defaultValue={proposta?.equipamento ?? ''}
            placeholder="Autoclave Cristófoli Vitale 21L"
          />
          <span className={estilo.dica}>
            Texto livre — no passo 1 o aparelho quase nunca está cadastrado ainda.
          </span>
        </label>
      </div>

      <label className={estilo.rotulo}>
        O que o cliente contou
        <textarea
          className={estilo.area}
          name="necessidade"
          rows={2}
          defaultValue={proposta?.necessidade ?? ''}
          placeholder="Não fecha o ciclo, apita e desliga no meio."
        />
      </label>

      {/* ---- ITENS ---- */}
      <div className={estilo.quadro}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th className={estilo.dir}>Qtd.</th>
              <th className={estilo.dir}>Unitário</th>
              <th className={estilo.dir}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <tr key={idx}>
                <td>
                  <select
                    className={estilo.selecao}
                    value={i.tipo}
                    onChange={(e) =>
                      alterar(idx, { tipo: e.target.value as Item['tipo'], pecaId: null })
                    }
                  >
                    <option value="SERVICO">Serviço</option>
                    <option value="PECA">Peça</option>
                    <option value="DESLOCAMENTO">Deslocamento</option>
                    <option value="TAXA">Taxa</option>
                  </select>
                </td>
                <td>
                  {i.tipo === 'PECA' ? (
                    <select
                      className={estilo.selecao}
                      value={i.pecaId ?? ''}
                      onChange={(e) => escolherPeca(idx, e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Escolha a peça…</option>
                      {pecas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} ({p.sku})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={estilo.campo}
                      value={i.descricao}
                      onChange={(e) => alterar(idx, { descricao: e.target.value })}
                      placeholder="O que será feito"
                    />
                  )}
                </td>
                <td className={estilo.dir}>
                  <input
                    className={estilo.campo}
                    type="number"
                    min={0.001}
                    step="any"
                    value={i.quantidade}
                    onChange={(e) => alterar(idx, { quantidade: Number(e.target.value) || 1 })}
                    style={{ width: 80 }}
                  />
                </td>
                <td className={estilo.dir}>
                  <input
                    className={estilo.campo}
                    type="number"
                    min={0}
                    step="0.01"
                    value={i.valorUnit}
                    onChange={(e) => alterar(idx, { valorUnit: Number(e.target.value) || 0 })}
                    style={{ width: 110 }}
                  />
                </td>
                <td className={estilo.dir}>
                  {formatarBRL(Math.round(i.valorUnit * 100) * i.quantidade)}
                </td>
                <td className={estilo.dir}>
                  <button
                    type="button"
                    className={estilo.linkAcao}
                    onClick={() => setItens((a) => a.filter((_, n) => n !== idx))}
                    aria-label="Remover item"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={estilo.acoesForm}>
        <button
          type="button"
          className={estilo.btnSec}
          onClick={() => setItens((a) => [...a, { ...ITEM_VAZIO }])}
        >
          + Adicionar item
        </button>
        <span className={estilo.texto}>
          Total: <strong>{formatarBRL(previa)}</strong>
        </span>
      </div>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Desconto (R$)
          <input
            className={estilo.campo}
            type="number"
            min={0}
            step="0.01"
            value={desconto}
            onChange={(e) => setDesconto(Number(e.target.value) || 0)}
          />
        </label>
        <label className={estilo.rotulo}>
          Acréscimo (R$)
          <input
            className={estilo.campo}
            type="number"
            min={0}
            step="0.01"
            value={acrescimo}
            onChange={(e) => setAcrescimo(Number(e.target.value) || 0)}
          />
        </label>
        <label className={estilo.rotulo}>
          Vale até
          <input
            className={estilo.campo}
            type="date"
            name="validoAte"
            defaultValue={proposta?.validoAteCampo ?? ''}
          />
          <span className={estilo.dica}>Em branco, vale por 15 dias.</span>
        </label>
      </div>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Garantia (dias)
          <input
            className={estilo.campo}
            type="number"
            name="garantiaDias"
            min={0}
            defaultValue={proposta?.garantiaDias ?? 90}
          />
        </label>
        <label className={estilo.rotulo}>
          Prazo de execução (dias)
          <input
            className={estilo.campo}
            type="number"
            name="prazoExecucaoDias"
            min={0}
            defaultValue={proposta?.prazoExecucaoDias ?? 7}
          />
        </label>
        <label className={estilo.rotulo}>
          Condições de pagamento
          <input
            className={estilo.campo}
            name="condicoesPagamento"
            defaultValue={proposta?.condicoesPagamento ?? ''}
            placeholder="50% na aprovação, 50% na entrega"
          />
        </label>
      </div>

      <label className={estilo.rotulo}>
        Observações — o cliente lê
        <textarea
          className={estilo.area}
          name="observacoes"
          rows={2}
          defaultValue={proposta?.observacoes ?? ''}
          placeholder="Retirada e entrega inclusas em Lajeado e região."
        />
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente || !clienteId}>
          {pendente ? 'Salvando…' : 'Salvar orçamento'}
        </button>
        <button type="button" className={estilo.linkAcao} onClick={aoFechar} disabled={pendente}>
          Cancelar
        </button>
      </div>
      <p className={estilo.dica}>
        Salvar não manda nada ao cliente. O envio é o botão da lista — e depois de enviado o preço
        não muda mais, porque o cliente está com um link aberto mostrando um total.
      </p>
    </form>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta = false,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  // As mesmas classes do indicador da aba ao lado. Um segundo desenho para o
  // mesmo objeto faria o Comercial parecer duas telas.
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={alerta ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
