'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import { conferirFatura, emitir, estornarPagamento, receber } from '@/server/acoes/financeiro'
import estilo from '../painel.module.css'

/**
 * A tela onde o dinheiro entra.
 *
 * O ponto que define este componente é o **pagamento fracionado**: o cliente
 * paga parte no pix, parte em dinheiro e o resto no cartão, tudo no mesmo
 * balcão. Registrar isso como um pagamento só apagaria a informação de que
 * parte entrou na conta e parte ficou na gaveta — e o fechamento do dia depende
 * exatamente dessa separação.
 *
 * Por isso a baixa é uma LISTA de linhas, com o restante recalculado a cada
 * mudança. Quem está atendendo vê na hora quanto ainda falta.
 */

type Pagamento = {
  id: string
  forma: string
  valorCentavos: number
  parcelas: number
  bandeira: string | null
  autorNome: string
  recebidoEm: string
  estornado: boolean
}

type Fatura = {
  id: string
  numero: number
  status: string
  cliente: string
  ordemId: string
  ordemNumero: number
  valorTotalCentavos: number
  valorPagoCentavos: number
  multaCentavos: number
  jurosCentavos: number
  taxaCentavos: number
  abertoCentavos: number
  vencida: boolean
  vencimento: string | null
  conferido: boolean
  conferidoPorNome: string | null
  pagamentos: Pagamento[]
}

type Pendente = {
  ordemId: string
  numero: number
  cliente: string
  equipamento: string
  totalCentavos: number
}

type Linha = { forma: string; valor: number; parcelas: number; bandeira: string; autorizacao: string }

const FORMAS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'Pix'],
  ['CARTAO_CREDITO', 'Cartão de crédito'],
  ['CARTAO_DEBITO', 'Cartão de débito'],
  ['BOLETO', 'Boleto'],
  ['TRANSFERENCIA', 'Transferência'],
  ['CHEQUE', 'Cheque'],
] as const

/**
 * Um componente só para as duas listas, e não um por bloco.
 *
 * O motivo é concreto e apareceu no teste de navegador: quando a emissão dava
 * certo, a ordem saía da lista de pendentes, o bloco inteiro desaparecia da
 * página — e levava junto a mensagem "Fatura emitida". Quem clicava via a linha
 * sumir sem confirmação nenhuma e ficava sem saber se tinha funcionado. O mesmo
 * acontecia ao quitar (a fatura saía do filtro "em aberto") e ao conferir.
 *
 * Mantendo tudo sob um componente que NUNCA desmonta, a confirmação sobrevive
 * exatamente ao momento em que ela é necessária: o instante em que a coisa
 * confirmada sai da tela.
 */
export default function Faturas({
  faturas,
  pendentes,
  podeConferir,
}: {
  faturas: Fatura[]
  pendentes: Pendente[]
  podeConferir: boolean
}) {
  const [aberta, setAberta] = useState<string | null>(null)
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

  return (
    <>
      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

      {/* ----- Ordens liberadas, ainda sem fatura --------------------------- */}
      {pendentes.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Liberadas pela gestão, ainda sem fatura</p>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>O.S.</th>
                  <th>Cliente</th>
                  <th>Equipamento</th>
                  <th className={estilo.dir}>Aprovado</th>
                  {/* A coluna dos botões: rótulo invisível na tela, presente para
                      quem navega a tabela por leitor de tela. Um `<th>` vazio faz a
                      tabela inteira perder o cabeçalho. */}
                  <th>
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((p) => (
                  <tr key={p.ordemId}>
                    <td className={estilo.num}>
                      <Link href={`/painel/ordens/${p.ordemId}`}>#{String(p.numero).padStart(4, '0')}</Link>
                    </td>
                    <td>{p.cliente}</td>
                    <td>{p.equipamento}</td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>{formatarBRL(p.totalCentavos)}</td>
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
        </div>
      ) : null}

      {/* ----- Faturas ------------------------------------------------------ */}
      {faturas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma fatura com esses critérios. Elas nascem quando a gestão libera a
          ordem para faturamento.
        </p>
      ) : (
      <div className={`${estilo.quadro} ${estilo.rolaX}`}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>Fatura</th>
              <th>Cliente</th>
              <th>O.S.</th>
              <th className={estilo.dir}>Total</th>
              <th className={estilo.dir}>Recebido</th>
              <th className={estilo.dir}>Em aberto</th>
              <th>Situação</th>
              {/* A coluna dos botões: rótulo invisível na tela, presente para
                  quem navega a tabela por leitor de tela. Um `<th>` vazio faz a
                  tabela inteira perder o cabeçalho. */}
              <th>
                <span className={estilo.soLeitor}>Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((f) => (
              <tr key={f.id}>
                <td className={estilo.num}>
                  #{f.numero}
                  {f.vencimento ? (
                    <div className={f.vencida ? estilo.atrasado : estilo.fraco}>
                      vence {new Date(f.vencimento).toLocaleDateString('pt-BR')}
                    </div>
                  ) : null}
                </td>
                <td>{f.cliente}</td>
                <td className={estilo.num}>
                  <Link href={`/painel/ordens/${f.ordemId}`}>#{String(f.ordemNumero).padStart(4, '0')}</Link>
                </td>
                <td className={`${estilo.num} ${estilo.dir}`}>
                  {formatarBRL(f.valorTotalCentavos)}
                  {f.multaCentavos + f.jurosCentavos > 0 ? (
                    <div className={estilo.fraco}>+ {formatarBRL(f.multaCentavos + f.jurosCentavos)} encargos</div>
                  ) : null}
                </td>
                <td className={`${estilo.num} ${estilo.dir}`}>
                  {formatarBRL(f.valorPagoCentavos)}
                  {f.taxaCentavos > 0 ? (
                    <div className={estilo.fraco}>líquido {formatarBRL(f.valorPagoCentavos - f.taxaCentavos)}</div>
                  ) : null}
                </td>
                <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                  <span className={f.abertoCentavos > 0 && f.vencida ? estilo.atrasado : undefined}>
                    {formatarBRL(f.abertoCentavos)}
                  </span>
                </td>
                <td>
                  <span
                    className={`${estilo.tag} ${
                      f.status === 'QUITADA' ? estilo.tagOk : f.status === 'PARCIAL' ? estilo.tagEspera : estilo.tagNeutra
                    }`}
                  >
                    {f.status.toLowerCase()}
                  </span>
                  {f.conferido ? (
                    <div className={estilo.fraco}>conferida por {f.conferidoPorNome}</div>
                  ) : f.status === 'QUITADA' ? (
                    <div className={estilo.fraco}>falta conferir</div>
                  ) : null}
                </td>
                <td className={estilo.dir}>
                  <button
                    type="button"
                    className={estilo.btnSec}
                    onClick={() => setAberta(aberta === f.id ? null : f.id)}
                  >
                    {aberta === f.id ? 'Fechar' : 'Abrir'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {faturas
        .filter((f) => f.id === aberta)
        .map((f) => (
          <Detalhe
            key={f.id}
            fatura={f}
            podeConferir={podeConferir}
            pendente={pendente}
            onAcao={agir}
          />
        ))}
    </>
  )
}

function Detalhe({
  fatura: f,
  podeConferir,
  pendente,
  onAcao,
}: {
  fatura: Fatura
  podeConferir: boolean
  pendente: boolean
  onAcao: (fn: () => Promise<{ ok: boolean; motivo?: string; mensagem?: string }>) => void
}) {
  const [linhas, setLinhas] = useState<Linha[]>([
    { forma: 'PIX', valor: f.abertoCentavos / 100, parcelas: 1, bandeira: '', autorizacao: '' },
  ])
  const [multa, setMulta] = useState(f.multaCentavos / 100)
  const [juros, setJuros] = useState(f.jurosCentavos / 100)
  const [taxa, setTaxa] = useState(f.taxaCentavos / 100)

  const somaNova = linhas.reduce((s, l) => s + Math.round(l.valor * 100), 0)
  const devido = f.valorTotalCentavos + Math.round(multa * 100) + Math.round(juros * 100)
  const restaria = Math.max(0, devido - f.valorPagoCentavos - somaNova)

  function alterar(i: number, patch: Partial<Linha>) {
    setLinhas((a) => a.map((l, n) => (n === i ? { ...l, ...patch } : l)))
  }

  function enviar(form: FormData) {
    form.set('pagamentosJson', JSON.stringify(linhas.filter((l) => l.valor > 0)))
    onAcao(() => receber({ ok: false, motivo: '' }, form))
  }

  return (
    <div className={estilo.bloco} style={{ marginTop: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>
        <span>
          Fatura #{f.numero} · {f.cliente}
        </span>
        <span className={estilo.fraco}>em aberto {formatarBRL(f.abertoCentavos)}</span>
      </p>

      {f.pagamentos.length > 0 ? (
        <div className={estilo.rolaX} style={{ marginBottom: 'var(--s4)' }}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>Recebido em</th>
                <th>Forma</th>
                <th className={estilo.dir}>Valor</th>
                <th>Quem lançou</th>
                {/* A coluna dos botões: rótulo invisível na tela, presente para
                    quem navega a tabela por leitor de tela. Um `<th>` vazio faz a
                    tabela inteira perder o cabeçalho. */}
                <th>
                  <span className={estilo.soLeitor}>Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {f.pagamentos.map((p) => (
                <tr key={p.id}>
                  <td className={estilo.num}>{new Date(p.recebidoEm).toLocaleDateString('pt-BR')}</td>
                  <td>
                    {rotuloForma(p.forma)}
                    {p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}
                    {p.bandeira ? ` · ${p.bandeira}` : ''}
                  </td>
                  <td className={`${estilo.num} ${estilo.dir} ${p.estornado ? '' : estilo.forte}`}>
                    <span style={p.estornado ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                      {formatarBRL(p.valorCentavos)}
                    </span>
                  </td>
                  <td>{p.autorNome}</td>
                  <td className={estilo.dir}>
                    {p.estornado ? (
                      <span className={`${estilo.tag} ${estilo.tagAlerta}`}>estornado</span>
                    ) : podeConferir ? (
                      <button
                        type="button"
                        className={estilo.btnPerigo}
                        disabled={pendente}
                        onClick={() => {
                          const motivo = window.prompt('Por que este recebimento está sendo estornado?')
                          if (motivo) onAcao(() => estornarPagamento(p.id, motivo))
                        }}
                      >
                        Estornar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {f.status !== 'QUITADA' ? (
        <form action={enviar} className={estilo.form}>
          <input type="hidden" name="faturaId" value={f.id} />
          <input type="hidden" name="ordemId" value={f.ordemId} />

          <p className={estilo.blocoTitulo}>Registrar recebimento</p>

          {linhas.map((l, i) => (
            <div key={i} className={estilo.grade}>
              <label className={estilo.rotulo}>
                Forma
                <select
                  className={estilo.selecao}
                  value={l.forma}
                  onChange={(e) => alterar(i, { forma: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {FORMAS.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className={estilo.rotulo}>
                Valor (R$)
                <input
                  className={estilo.campo}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.valor}
                  onChange={(e) => alterar(i, { valor: Number(e.target.value) })}
                />
              </label>
              {l.forma === 'CARTAO_CREDITO' ? (
                <>
                  <label className={estilo.rotulo}>
                    Parcelas
                    <input
                      className={estilo.campo}
                      type="number"
                      min={1}
                      max={24}
                      value={l.parcelas}
                      onChange={(e) => alterar(i, { parcelas: Number(e.target.value) })}
                    />
                  </label>
                  <label className={estilo.rotulo}>
                    Bandeira
                    <input
                      className={estilo.campo}
                      value={l.bandeira}
                      onChange={(e) => alterar(i, { bandeira: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
              <label className={estilo.rotulo}>
                NSU / e2e
                <input
                  className={estilo.campo}
                  value={l.autorizacao}
                  onChange={(e) => alterar(i, { autorizacao: e.target.value })}
                  placeholder="Código da maquininha ou do Pix"
                />
                <span className={estilo.dica}>É o que permite conciliar com o extrato.</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  type="button"
                  className={estilo.btnSec}
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((a) => a.filter((_, n) => n !== i))}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            className={estilo.btnSec}
            style={{ justifySelf: 'start' }}
            onClick={() =>
              setLinhas((a) => [
                ...a,
                { forma: 'DINHEIRO', valor: restaria / 100, parcelas: 1, bandeira: '', autorizacao: '' },
              ])
            }
          >
            + Outra forma de pagamento
          </button>

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Multa (R$)
              <input
                className={estilo.campo}
                name="multa"
                type="number"
                min="0"
                step="0.01"
                value={multa}
                onChange={(e) => setMulta(Number(e.target.value))}
              />
            </label>
            <label className={estilo.rotulo}>
              Juros (R$)
              <input
                className={estilo.campo}
                name="juros"
                type="number"
                min="0"
                step="0.01"
                value={juros}
                onChange={(e) => setJuros(Number(e.target.value))}
              />
            </label>
            <label className={estilo.rotulo}>
              Taxa da maquininha (R$)
              <input
                className={estilo.campo}
                name="taxa"
                type="number"
                min="0"
                step="0.01"
                value={taxa}
                onChange={(e) => setTaxa(Number(e.target.value))}
              />
              <span className={estilo.dica}>Custo nosso — não soma ao que o cliente deve.</span>
            </label>
          </div>

          <p className={estilo.parVal} style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>
            {restaria === 0 ? 'Quita a fatura.' : `Ainda ficariam ${formatarBRL(restaria)} em aberto.`}
          </p>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente || somaNova <= 0}>
              {pendente ? 'Registrando…' : 'Registrar recebimento'}
            </button>
          </div>
        </form>
      ) : !f.conferido && podeConferir ? (
        <div className={estilo.acoesForm}>
          <button
            type="button"
            className={estilo.btn}
            disabled={pendente}
            onClick={() => onAcao(() => conferirFatura(f.id))}
          >
            Conferir e fechar
          </button>
          <span className={estilo.dica}>
            A conferência é a última etapa da linha do tempo: a gestão olha o que
            entrou e valida.
          </span>
        </div>
      ) : (
        <p className={estilo.texto}>
          Fatura quitada{f.conferido ? ` e conferida por ${f.conferidoPorNome}` : ', aguardando a conferência da gestão'}.
        </p>
      )}
    </div>
  )
}

function rotuloForma(f: string): string {
  const m: Record<string, string> = {
    DINHEIRO: 'Dinheiro',
    PIX: 'Pix',
    CARTAO_CREDITO: 'Cartão de crédito',
    CARTAO_DEBITO: 'Cartão de débito',
    BOLETO: 'Boleto',
    TRANSFERENCIA: 'Transferência',
    CHEQUE: 'Cheque',
  }
  return m[f] ?? f
}
