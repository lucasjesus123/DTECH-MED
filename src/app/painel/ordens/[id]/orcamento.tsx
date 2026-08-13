'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import { Papel } from '@/generated/prisma/enums'
import { enviarOrcamento, salvarOrcamento } from '@/server/acoes/orcamento'
import estilo from '../../painel.module.css'

/**
 * Montagem do orçamento na tela.
 *
 * O total aparece enquanto se digita, mas **não é ele que vale**: o servidor
 * recalcula tudo a partir dos itens. O número daqui existe para a pessoa
 * conferir antes de mandar, não para o sistema confiar.
 *
 * Peça escolhida da lista carrega o `pecaId` junto. É esse elo que faz a
 * aprovação do cliente reservar o material sozinha — sem ele, o estoque
 * voltaria a ser um módulo paralelo que alguém precisa lembrar de atualizar.
 */

type Item = {
  tipo: 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA'
  pecaId: string | null
  descricao: string
  quantidade: number
  valorUnit: number
}

type OrcamentoView = {
  id: string
  numero: number
  versao: number
  status: string
  totalCentavos: number
  subtotalPecas: number
  subtotalServicos: number
  descontoCentavos: number
  acrescimoCentavos: number
  garantiaDias: number
  prazoExecucaoDias: number
  validoAte: string | null
  enviadoEm: string | null
  respondidoEm: string | null
  aprovadoPorNome: string | null
  motivoReprovacao: string | null
  itens: Array<{
    id: string
    tipo: string
    descricao: string
    quantidade: number
    valorUnitCentavos: number
    valorTotalCentavos: number
  }>
}

const PODE_MONTAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO]
const PODE_ENVIAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

export default function Orcamento({
  ordemId,
  etapa,
  papel,
  orcamentos,
  pecas,
}: {
  ordemId: string
  etapa: string
  papel: Papel
  orcamentos: OrcamentoView[]
  pecas: Array<{ id: string; sku: string; nome: string; precoVendaCentavos: number; livre: number }>
}) {
  const atual = orcamentos[0] ?? null
  const editavel =
    PODE_MONTAR.includes(papel) &&
    (!atual || atual.status === 'RASCUNHO' || atual.status === 'EM_REVISAO' || atual.status === 'REPROVADO')

  const [abrirEditor, setAbrirEditor] = useState(!atual)
  const [itens, setItens] = useState<Item[]>(
    atual && atual.itens.length
      ? atual.itens.map((i) => ({
          tipo: i.tipo as Item['tipo'],
          pecaId: null,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnit: i.valorUnitCentavos / 100,
        }))
      : [{ tipo: 'SERVICO', pecaId: null, descricao: '', quantidade: 1, valorUnit: 0 }],
  )
  const [desconto, setDesconto] = useState((atual?.descontoCentavos ?? 0) / 100)
  const [acrescimo, setAcrescimo] = useState((atual?.acrescimoCentavos ?? 0) / 100)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const previa = useMemo(() => {
    const soma = itens.reduce((s, i) => s + Math.round(i.valorUnit * 100) * i.quantidade, 0)
    return Math.max(0, soma - Math.round(desconto * 100) + Math.round(acrescimo * 100))
  }, [itens, desconto, acrescimo])

  function alterar(idx: number, patch: Partial<Item>) {
    setItens((atual2) => atual2.map((i, n) => (n === idx ? { ...i, ...patch } : i)))
  }

  function escolherPeca(idx: number, pecaId: string) {
    const p = pecas.find((x) => x.id === pecaId)
    if (!p) {
      alterar(idx, { pecaId: null })
      return
    }
    alterar(idx, {
      pecaId: p.id,
      descricao: p.nome,
      valorUnit: p.precoVendaCentavos / 100,
    })
  }

  function salvar(form: FormData) {
    setMsg(null)
    form.set('itensJson', JSON.stringify(itens.filter((i) => i.descricao.trim())))
    iniciar(async () => {
      const r = await salvarOrcamento({ ok: false, motivo: '' }, form)
      if (!r.ok) {
        setMsg({ ok: false, texto: r.motivo })
        return
      }
      // O orçamento foi salvo, mas a ordem pode não ter avançado — falta o
      // diagnóstico, por exemplo. Mostrar isso como alerta, e não como sucesso,
      // é o que evita a pessoa ficar procurando um botão que nunca vai aparecer.
      setMsg(
        r.dados?.aviso
          ? { ok: false, texto: `Orçamento salvo, mas a ordem não avançou: ${r.dados.aviso}` }
          : { ok: true, texto: 'Orçamento salvo. Confira antes de mandar ao cliente.' },
      )
      setAbrirEditor(false)
      router.refresh()
    })
  }

  function enviar() {
    setMsg(null)
    iniciar(async () => {
      const r = await enviarOrcamento(ordemId)
      setMsg(
        r.ok
          ? { ok: true, texto: 'Enviado. O cliente recebeu o link e o PDF no WhatsApp.' }
          : { ok: false, texto: r.motivo },
      )
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>Orçamento</span>
        {atual ? (
          <span
            className={`${estilo.tag} ${
              atual.status === 'APROVADO'
                ? estilo.tagOk
                : atual.status === 'REPROVADO'
                  ? estilo.tagAlerta
                  : atual.status === 'ENVIADO'
                    ? estilo.tagEspera
                    : estilo.tagNeutra
            }`}
          >
            {rotuloStatus(atual.status)} · versão {atual.versao}
          </span>
        ) : (
          <span className={`${estilo.tag} ${estilo.tagNeutra}`}>ainda não montado</span>
        )}
      </p>

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

      {/* ----- Orçamento já montado --------------------------------------- */}
      {atual && !abrirEditor ? (
        <>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={estilo.dir}>Qtd.</th>
                  <th className={estilo.dir}>Unitário</th>
                  <th className={estilo.dir}>Total</th>
                </tr>
              </thead>
              <tbody>
                {atual.itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className={estilo.forte}>{i.descricao}</span>
                      <div className={estilo.fraco}>{i.tipo.toLowerCase()}</div>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{i.quantidade}</td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{formatarBRL(i.valorUnitCentavos)}</td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(i.valorTotalCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={estilo.pares} style={{ marginTop: 'var(--s4)' }}>
            <Par rot="Peças" val={formatarBRL(atual.subtotalPecas)} />
            <Par rot="Serviços" val={formatarBRL(atual.subtotalServicos)} />
            {atual.descontoCentavos > 0 ? <Par rot="Desconto" val={`− ${formatarBRL(atual.descontoCentavos)}`} /> : null}
            <Par rot="Total" val={formatarBRL(atual.totalCentavos)} />
            <Par rot="Garantia" val={`${atual.garantiaDias} dias`} />
            <Par rot="Prazo de execução" val={`${atual.prazoExecucaoDias} dias`} />
          </div>

          {atual.aprovadoPorNome ? (
            <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
              Aprovado por {atual.aprovadoPorNome} pelo portal.
            </p>
          ) : null}
          {atual.motivoReprovacao ? (
            <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
              Motivo da recusa: {atual.motivoReprovacao}
            </p>
          ) : null}

          <div className={estilo.passos}>
            {editavel ? (
              <button type="button" className={estilo.btnSec} onClick={() => setAbrirEditor(true)}>
                {atual.status === 'REPROVADO' ? 'Refazer em nova versão' : 'Editar'}
              </button>
            ) : null}
            {PODE_ENVIAR.includes(papel) &&
            atual.status !== 'ENVIADO' &&
            atual.status !== 'APROVADO' &&
            etapa === 'ORCAMENTO_INTERNO' ? (
              <button type="button" className={estilo.btn} onClick={enviar} disabled={pendente}>
                {pendente ? 'Enviando…' : 'Enviar ao cliente'}
              </button>
            ) : null}
          </div>

          {atual.status === 'ENVIADO' ? (
            <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
              No WhatsApp do cliente desde {new Date(atual.enviadoEm ?? '').toLocaleDateString('pt-BR')}.
              A resposta vem pelo portal — nem a gestão aprova no lugar dele.
            </p>
          ) : null}
        </>
      ) : null}

      {/* ----- Editor ------------------------------------------------------ */}
      {abrirEditor && editavel ? (
        <form action={salvar} className={estilo.form}>
          <input type="hidden" name="ordemId" value={ordemId} />

          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Tipo</th>
                  <th>Descrição</th>
                  <th style={{ width: 90 }} className={estilo.dir}>Qtd.</th>
                  <th style={{ width: 120 }} className={estilo.dir}>Unitário</th>
                  <th style={{ width: 110 }} className={estilo.dir}>Total</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        className={estilo.selecao}
                        value={i.tipo}
                        onChange={(e) => alterar(idx, { tipo: e.target.value as Item['tipo'], pecaId: null })}
                        style={{ width: '100%', minWidth: 0 }}
                        aria-label="Tipo do item"
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
                          style={{ width: '100%', minWidth: 0 }}
                          aria-label="Peça do estoque"
                        >
                          <option value="">Escolha a peça…</option>
                          {pecas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.nome} ({p.livre} livre)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={estilo.campo}
                          value={i.descricao}
                          onChange={(e) => alterar(idx, { descricao: e.target.value })}
                          placeholder="O que será feito"
                          aria-label="Descrição do item"
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className={`${estilo.campo} ${estilo.dir}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={i.quantidade}
                        onChange={(e) => alterar(idx, { quantidade: Number(e.target.value) })}
                        aria-label="Quantidade"
                      />
                    </td>
                    <td>
                      <input
                        className={`${estilo.campo} ${estilo.dir}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={i.valorUnit}
                        onChange={(e) => alterar(idx, { valorUnit: Number(e.target.value) })}
                        aria-label="Valor unitário"
                      />
                    </td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(Math.round(i.valorUnit * 100) * i.quantidade)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={estilo.btnSec}
                        onClick={() => setItens((a) => a.filter((_, n) => n !== idx))}
                        disabled={itens.length === 1}
                        aria-label="Remover item"
                        style={{ padding: '6px 10px' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className={estilo.btnSec}
            onClick={() =>
              setItens((a) => [...a, { tipo: 'SERVICO', pecaId: null, descricao: '', quantidade: 1, valorUnit: 0 }])
            }
            style={{ justifySelf: 'start' }}
          >
            + Adicionar item
          </button>

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Desconto (R$)
              <input
                className={estilo.campo}
                type="number"
                name="desconto"
                min="0"
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
              />
            </label>
            <label className={estilo.rotulo}>
              Acréscimo (R$)
              <input
                className={estilo.campo}
                type="number"
                name="acrescimo"
                min="0"
                step="0.01"
                value={acrescimo}
                onChange={(e) => setAcrescimo(Number(e.target.value))}
              />
            </label>
            <label className={estilo.rotulo}>
              Garantia (dias)
              <input className={estilo.campo} type="number" name="garantiaDias" min="0" defaultValue={atual?.garantiaDias ?? 90} />
            </label>
            <label className={estilo.rotulo}>
              Prazo de execução (dias)
              <input
                className={estilo.campo}
                type="number"
                name="prazoExecucaoDias"
                min="0"
                defaultValue={atual?.prazoExecucaoDias ?? 7}
              />
            </label>
            <label className={estilo.rotulo}>
              Validade da proposta (dias)
              <input className={estilo.campo} type="number" name="validadeDias" min="1" defaultValue={15} />
            </label>
          </div>

          <label className={estilo.rotulo}>
            Observações que vão no documento
            <textarea className={estilo.area} name="observacoes" rows={3} />
          </label>

          <p className={estilo.parVal} style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>
            Total: {formatarBRL(previa)}
            <span className={estilo.dica}> — o servidor recalcula na hora de salvar</span>
          </p>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar orçamento'}
            </button>
            {atual ? (
              <button type="button" className={estilo.btnSec} onClick={() => setAbrirEditor(false)} disabled={pendente}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!atual && !abrirEditor ? (
        <p className={estilo.texto}>
          Ainda não há orçamento. {editavel ? 'Monte um para a gestão revisar.' : 'Aguardando o técnico montar.'}
        </p>
      ) : null}
    </div>
  )
}

function Par({ rot, val }: { rot: string; val: string }) {
  return (
    <div className={estilo.par}>
      <span className={estilo.parRot}>{rot}</span>
      <span className={estilo.parVal}>{val}</span>
    </div>
  )
}

function rotuloStatus(s: string): string {
  const m: Record<string, string> = {
    RASCUNHO: 'rascunho',
    EM_REVISAO: 'na mesa da gestão',
    ENVIADO: 'com o cliente',
    APROVADO: 'aprovado',
    REPROVADO: 'recusado',
    EXPIRADO: 'expirado',
    CANCELADO: 'cancelado',
  }
  return m[s] ?? s.toLowerCase()
}
