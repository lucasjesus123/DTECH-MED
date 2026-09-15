'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL, lerValorBR } from '@/lib/dinheiro'
import { Papel } from '@/generated/prisma/enums'
import { enviarOrcamento, salvarOrcamento } from '@/server/acoes/orcamento'
import CampoValor from '../../campo-valor'
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

/**
 * =============================================================================
 * QUANTIDADE E VALOR SÃO TEXTO AQUI DENTRO, E VIRAM NÚMERO NA HORA DE SALVAR
 * =============================================================================
 * Eram `number`, presos ao campo com `Number(e.target.value)`. Isso torna o
 * campo impossível de usar, de três jeitos que se somam:
 *
 *   · APAGAR NÃO APAGA. `Number('')` é 0, então no instante em que você limpa o
 *     campo para digitar, o "0" volta escrito por cima. É o que trava a pessoa:
 *     ela apaga, aparece 0, ela digita, e sai "0380".
 *   · VÍRGULA QUEBRA. `Number('380,50')` é NaN — e vírgula é como se escreve
 *     dinheiro aqui. O total virava NaN, ou R$ 0,00.
 *   · PONTO DE MILHAR MENTE. `Number('1.200')` é 1,2. Mil e duzentos viram um e
 *     vinte, sem aviso nenhum, num campo de dinheiro.
 *
 * Guardando o que foi DIGITADO, o campo aceita "38," no meio da digitação sem
 * que a tela reescreva nada. A conversão acontece em dois lugares só: na soma
 * que aparece na linha e no envio — e usa `lerValorBR`, que o resto do sistema
 * já usa e que sabe que "1.200" é mil e duzentos.
 */
type Item = {
  tipo: 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA'
  pecaId: string | null
  descricao: string
  /** O que a pessoa digitou. Vazio é vazio, e não zero. */
  quantidade: string
  valorUnit: string
}

/** O que foi digitado, em número. Campo vazio ou pela metade vale zero. */
const emNumero = (texto: string): number => lerValorBR(texto) ?? 0

/** Número em texto brasileiro, para nascer no campo já legível. */
const emTexto = (n: number, casas = 2): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

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

/**
 * Montar e ENVIAR são coisas diferentes, e é essa diferença que segura o preço.
 *
 * A atendente monta — é ela quem fala com o cliente e o processo da casa diz
 * que a secretaria gera o orçamento. Mas quem libera o número para o cliente
 * continua sendo a gestão, aqui e na máquina de estados do servidor.
 *
 * Esta lista é só para a tela não oferecer o que ia falhar. Quem decide de
 * verdade é o guarda no servidor, em `@/server/acoes/orcamento`.
 */
const PODE_MONTAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.TECNICO,
  Papel.ATENDENTE,
]
const PODE_ENVIAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

export default function Orcamento({
  ordemId,
  etapa,
  papel,
  orcamentos,
  pecas,
  aoMudar,
  comecaAberto,
}: {
  ordemId: string
  etapa: string
  papel: Papel
  orcamentos: OrcamentoView[]
  pecas: Array<{ id: string; sku: string; nome: string; precoVendaCentavos: number; livre: number }>
  /**
   * Chamado depois de salvar ou enviar. A ficha longa não precisa dele — o
   * `router.refresh()` já a redesenha inteira. A JANELA da O.S. precisa: ela
   * guarda o painel em estado próprio, e o refresh da rota não o toca.
   */
  aoMudar?: () => void
  /** Ver a nota igual em `diagnostico.tsx`: na ficha o editor não escancara. */
  comecaAberto?: boolean
}) {
  const atual = orcamentos[0] ?? null
  const editavel =
    PODE_MONTAR.includes(papel) &&
    (!atual || atual.status === 'RASCUNHO' || atual.status === 'EM_REVISAO' || atual.status === 'REPROVADO')

  const [abrirEditor, setAbrirEditor] = useState(comecaAberto ?? !atual)
  const [itens, setItens] = useState<Item[]>(
    atual && atual.itens.length
      ? atual.itens.map((i) => ({
          tipo: i.tipo as Item['tipo'],
          pecaId: null,
          descricao: i.descricao,
          // Quantidade inteira sai sem as casas decimais: "2", e não "2,00".
          quantidade: emTexto(i.quantidade, Number.isInteger(i.quantidade) ? 0 : 3),
          valorUnit: emTexto(i.valorUnitCentavos / 100),
        }))
      : [{ tipo: 'SERVICO', pecaId: null, descricao: '', quantidade: '1', valorUnit: '' }],
  )
  // Texto, pelo mesmo motivo dos itens: nasce VAZIO quando é zero, para a
  // pessoa digitar num campo limpo em vez de brigar com um "0" que não sai.
  const [desconto, setDesconto] = useState(
    atual?.descontoCentavos ? emTexto(atual.descontoCentavos / 100) : '',
  )
  const [acrescimo, setAcrescimo] = useState(
    atual?.acrescimoCentavos ? emTexto(atual.acrescimoCentavos / 100) : '',
  )
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const previa = useMemo(() => {
    const soma = itens.reduce(
      (s, i) => s + Math.round(emNumero(i.valorUnit) * 100) * emNumero(i.quantidade),
      0,
    )
    return Math.max(
      0,
      soma - Math.round(emNumero(desconto) * 100) + Math.round(emNumero(acrescimo) * 100),
    )
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
      // O preço do catálogo entra PREENCHIDO e continua editável: é a base, não
      // uma trava. Peça vendida com desconto, ou com o frete embutido, é coisa
      // de todo dia — e quem monta o orçamento é quem sabe.
      valorUnit: emTexto(p.precoVendaCentavos / 100),
    })
  }

  function salvar(form: FormData) {
    setMsg(null)
    /**
     * A BORDA ONDE O TEXTO VIRA NÚMERO.
     *
     * Dentro da tela os campos guardam o que foi digitado — é o que permite o
     * "38," existir no meio da digitação. O servidor espera número, e é aqui
     * que `lerValorBR` traduz: ele sabe que "1.200" é mil e duzentos e que
     * "380,50" é trezentos e oitenta e cinquenta.
     */
    form.set(
      'itensJson',
      JSON.stringify(
        itens
          .filter((i) => i.descricao.trim())
          .map((i) => ({
            tipo: i.tipo,
            pecaId: i.pecaId,
            descricao: i.descricao,
            quantidade: emNumero(i.quantidade),
            valorUnit: emNumero(i.valorUnit),
          })),
      ),
    )
    // Os dois campos viajam no FormData com o texto digitado; o servidor lê
    // número. Reescrevemos com o valor já traduzido.
    form.set('desconto', String(emNumero(desconto)))
    form.set('acrescimo', String(emNumero(acrescimo)))
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
      aoMudar?.()
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
      if (r.ok) {
        router.refresh()
        aoMudar?.()
      }
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

      {/*
        O aviso nasce depois do clique, e quem usa leitor de tela não tem como
        adivinhar que ele apareceu. `alert` interrompe para a recusa — que é o
        que precisa ser ouvido na hora; `status` espera a pausa para o "salvo".
      */}
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

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
                      <CampoValor
                        valor={i.quantidade}
                        aoMudar={(t) => alterar(idx, { quantidade: t })}
                        rotulo="Quantidade"
                        placeholder="1"
                      />
                    </td>
                    <td>
                      <CampoValor
                        valor={i.valorUnit}
                        aoMudar={(t) => alterar(idx, { valorUnit: t })}
                        rotulo="Valor unitário"
                      />
                    </td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(Math.round(emNumero(i.valorUnit) * 100) * emNumero(i.quantidade))}
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
              setItens((a) => [
                ...a,
                { tipo: 'SERVICO', pecaId: null, descricao: '', quantidade: '1', valorUnit: '' },
              ])
            }
            style={{ justifySelf: 'start' }}
          >
            + Adicionar item
          </button>

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Desconto (R$)
              <CampoValor
                valor={desconto}
                aoMudar={setDesconto}
                rotulo="Desconto em reais"
                nome="desconto"
                alinharDireita={false}
              />
            </label>
            <label className={estilo.rotulo}>
              Acréscimo (R$)
              <CampoValor
                valor={acrescimo}
                aoMudar={setAcrescimo}
                rotulo="Acréscimo em reais"
                nome="acrescimo"
                alinharDireita={false}
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
        <>
          <p className={estilo.texto}>
            Ainda não há orçamento.{' '}
            {editavel ? 'Monte um para a gestão revisar.' : 'Aguardando o técnico montar.'}
          </p>
          {/* O BOTÃO QUE FALTAVA.
              Este estado — sem orçamento e com o editor fechado — era
              inalcançável enquanto `abrirEditor` começava sempre em `!atual`:
              sem orçamento, ele já vinha aberto. Agora a ficha pode pedir que
              comece fechado, e sem este botão a frase acima seria um beco:
              "monte um" sem nenhum lugar onde montar. */}
          {editavel ? (
            <div className={estilo.passos}>
              <button type="button" className={estilo.btn} onClick={() => setAbrirEditor(true)}>
                Montar o orçamento
              </button>
            </div>
          ) : null}
        </>
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
