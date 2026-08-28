'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL, lerValorBR } from '@/lib/dinheiro'
import {
  baixarConta,
  desfazerBaixa,
  excluirConta,
  lancarConta,
} from '@/server/acoes/caixa'
import estilo from '../painel.module.css'

export type Conta = {
  id: string
  descricao: string
  categoria: string | null
  contraparte: string | null
  clienteNome: string | null
  valorCentavos: number
  valorPagoCentavos: number
  vencimento: string
  pagoEm: string | null
  forma: string | null
  grupo: string | null
  parcela: number
  parcelas: number
  daRecorrencia: boolean
  observacoes: string | null
}

export type ClienteBreve = { id: string; nome: string }

const FORMAS: Array<[string, string]> = [
  ['PIX', 'Pix'],
  ['DINHEIRO', 'Dinheiro'],
  ['TRANSFERENCIA', 'Transferência'],
  ['BOLETO', 'Boleto'],
  ['CARTAO_CREDITO', 'Cartão de crédito'],
  ['CARTAO_DEBITO', 'Cartão de débito'],
  ['CHEQUE', 'Cheque'],
]

/**
 * CONTAS A PAGAR E A RECEBER — a mesma tela, duas direções.
 *
 * =============================================================================
 * POR QUE UM COMPONENTE SÓ PARA AS DUAS
 * =============================================================================
 * Tudo o que se faz com uma se faz com a outra: lançar, parcelar, dar baixa,
 * desfazer, apagar, filtrar por mês. Duplicar isto em dois arquivos criaria
 * duas telas que começam iguais e divergem na primeira correção feita só de um
 * lado — e o lado esquecido é sempre o que alguém usa no fechamento do mês.
 *
 * O que muda entre elas é VOCABULÁRIO, não comportamento: "pagar" e "receber",
 * "fornecedor" e "cliente". Isso vira uma tabela de palavras no topo do
 * componente, onde dá para ler as duas versões lado a lado.
 *
 * =============================================================================
 * A BAIXA ABRE NA PRÓPRIA LINHA
 * =============================================================================
 * Sem janela flutuante. Quem dá baixa está com o extrato do banco aberto do
 * lado e vai lançar seis contas seguidas; uma janela que cobre a lista faz
 * perder o lugar a cada conta, e o erro clássico da tela de caixa é dar baixa
 * na linha de cima.
 *
 * O valor já vem preenchido com o previsto, porque pagar o previsto é o caso
 * comum — e a data vem com hoje. Quem só confere e confirma faz dois cliques.
 */
export default function Contas({
  tipo,
  mes,
  situacao,
  contas,
  categorias,
  clientes,
  podeApagar,
}: {
  tipo: 'PAGAR' | 'RECEBER'
  mes: string
  situacao: string
  contas: Conta[]
  categorias: string[]
  clientes: ClienteBreve[]
  podeApagar: boolean
}) {
  const p = tipo === 'PAGAR' ? PALAVRAS.pagar : PALAVRAS.receber
  const [abrirForm, setAbrirForm] = useState(false)
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

  const emAberto = contas.filter((c) => !c.pagoEm)
  const totalAberto = emAberto.reduce((s, c) => s + c.valorCentavos, 0)
  const totalPago = contas.filter((c) => c.pagoEm).reduce((s, c) => s + c.valorPagoCentavos, 0)

  return (
    <>
      <div className={estilo.caixaTopo}>
        <div className={estilo.caixaSomas}>
          <span>
            <span className={estilo.grav}>{p.somaAberto}</span>
            <strong className={estilo.caixaSoma}>{formatarBRL(totalAberto)}</strong>
            <span className={estilo.fraco}>
              {emAberto.length} {emAberto.length === 1 ? 'conta' : 'contas'}
            </span>
          </span>
          <span>
            <span className={estilo.grav}>{p.somaPago}</span>
            <strong className={estilo.caixaSoma}>{formatarBRL(totalPago)}</strong>
            <span className={estilo.fraco}>neste mês</span>
          </span>
        </div>

        <button
          type="button"
          className={estilo.btnPrimario}
          onClick={() => setAbrirForm((v) => !v)}
          aria-expanded={abrirForm}
        >
          {abrirForm ? 'Fechar' : p.botaoLancar}
        </button>
      </div>

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      {abrirForm ? (
        <FormularioConta
          tipo={tipo}
          mes={mes}
          palavras={p}
          categorias={categorias}
          clientes={clientes}
          aoSalvar={() => {
            setAbrirForm(false)
            router.refresh()
          }}
        />
      ) : null}

      <form method="get" className={estilo.filtros}>
        <input type="hidden" name="aba" value={tipo === 'PAGAR' ? 'pagar' : 'receber'} />
        <input type="hidden" name="mes" value={mes} />
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            placeholder={p.placeholderBusca}
            aria-label="Buscar contas"
          />
        </div>
        <select className={estilo.selecao} name="situacao" defaultValue={situacao} aria-label="Situação">
          <option value="abertas">Em aberto</option>
          <option value="vencidas">Só as vencidas</option>
          <option value="pagas">{p.filtroPagas}</option>
          <option value="todas">Tudo do mês</option>
        </select>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      {contas.length === 0 ? (
        <p className={estilo.vazio}>{p.vazio}</p>
      ) : (
        <ul className={estilo.caixaLista}>
          {contas.map((c) => (
            <Linha
              key={c.id}
              conta={c}
              palavras={p}
              podeApagar={podeApagar}
              pendente={pendente}
              agir={agir}
            />
          ))}
        </ul>
      )}

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        {p.rodape}
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Uma linha
// ---------------------------------------------------------------------------

function Linha({
  conta,
  palavras,
  podeApagar,
  pendente,
  agir,
}: {
  conta: Conta
  palavras: Palavras
  podeApagar: boolean
  pendente: boolean
  agir: (fn: () => Promise<{ ok: true; mensagem?: string } | { ok: false; motivo: string }>) => void
}) {
  const pago = Boolean(conta.pagoEm)
  const vencida = !pago && new Date(conta.vencimento) < new Date()
  const quem = conta.clienteNome ?? conta.contraparte

  return (
    <li className={vencida ? `${estilo.caixaItem} ${estilo.caixaItemVencido}` : estilo.caixaItem}>
      <div className={estilo.caixaQuando}>
        <strong>{dia(conta.vencimento)}</strong>
        <span className={estilo.fraco}>{mesCurto(conta.vencimento)}</span>
      </div>

      <div className={estilo.caixaMeio}>
        <strong className={estilo.caixaDesc}>{conta.descricao}</strong>
        <p className={estilo.caixaDetalhe}>
          {quem ? <span>{quem}</span> : null}
          {conta.categoria ? <span className={estilo.caixaCat}>{conta.categoria}</span> : null}
          {conta.daRecorrencia ? <span className={estilo.caixaCat}>recorrente</span> : null}
          {!quem && !conta.categoria && !conta.daRecorrencia ? (
            <span className={estilo.fraco}>sem categoria</span>
          ) : null}
        </p>
        {conta.observacoes ? <p className={estilo.fraco}>{conta.observacoes}</p> : null}
      </div>

      <div className={estilo.caixaValor}>
        <strong>{formatarBRL(conta.valorCentavos)}</strong>
        {pago ? (
          <span className={`${estilo.tag} ${estilo.tagOk}`}>
            {palavras.selo} {curto(conta.pagoEm!)}
          </span>
        ) : vencida ? (
          <span className={`${estilo.tag} ${estilo.tagAlerta}`}>venceu {curto(conta.vencimento)}</span>
        ) : (
          <span className={`${estilo.tag} ${estilo.tagEspera}`}>em aberto</span>
        )}
        {/* Divergência entre previsto e pago tem que ficar VISÍVEL: é desconto,
            juros ou pagamento a menor, e é a informação que alguém procura no
            mês seguinte quando a conta não bate. */}
        {pago && conta.valorPagoCentavos !== conta.valorCentavos ? (
          <span className={estilo.fraco}>pago {formatarBRL(conta.valorPagoCentavos)}</span>
        ) : null}
      </div>

      <div className={estilo.caixaAcoes}>
        {pago ? (
          <button
            type="button"
            className={estilo.btnSec}
            disabled={pendente}
            onClick={() => agir(() => desfazerBaixa(conta.id))}
          >
            Desfazer baixa
          </button>
        ) : (
          <details className={estilo.caixaBaixa}>
            <summary className={estilo.btnPrimario}>{palavras.botaoBaixa}</summary>
            <FormularioBaixa conta={conta} palavras={palavras} />
          </details>
        )}

        {podeApagar && !pago ? (
          <>
            <button
              type="button"
              className={estilo.acaoRara}
              disabled={pendente}
              onClick={() => {
                if (confirm(`Apagar "${conta.descricao}"? Isso não deixa rastro na lista.`)) {
                  agir(() => excluirConta(conta.id, false))
                }
              }}
            >
              Apagar
            </button>
            {conta.grupo ? (
              <button
                type="button"
                className={estilo.acaoRara}
                disabled={pendente}
                onClick={() => {
                  if (
                    confirm(
                      'Apagar TODAS as parcelas ainda em aberto deste lançamento? As já pagas continuam no caixa.',
                    )
                  ) {
                    agir(() => excluirConta(conta.id, true))
                  }
                }}
              >
                Apagar as parcelas
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}

/** A baixa: valor, forma e data. Tudo já preenchido com o caso comum. */
function FormularioBaixa({ conta, palavras }: { conta: Conta; palavras: Palavras }) {
  const [estado, acao, pendente] = useActionState(baixarConta, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const router = useRouter()

  useEffect(() => {
    if (estado.ok && estado.mensagem) router.refresh()
  }, [estado, router])

  return (
    <form action={acao} className={estilo.caixaBaixaForm}>
      <input type="hidden" name="id" value={conta.id} />

      <label className={estilo.rotulo}>
        Valor {palavras.baixaValor}
        <input
          className={estilo.campo}
          name="valor"
          inputMode="decimal"
          defaultValue={(conta.valorCentavos / 100).toFixed(2)}
        />
      </label>

      <label className={estilo.rotulo}>
        Forma
        <select className={estilo.selecao} name="forma" defaultValue="PIX">
          {FORMAS.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className={estilo.rotulo}>
        {palavras.baixaData}
        <input className={estilo.campo} type="date" name="data" defaultValue={hojeISO()} />
      </label>

      <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
        {pendente ? 'Salvando…' : 'Confirmar'}
      </button>

      {!estado.ok ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Lançar
// ---------------------------------------------------------------------------

function FormularioConta({
  tipo,
  mes,
  palavras,
  categorias,
  clientes,
  aoSalvar,
}: {
  tipo: 'PAGAR' | 'RECEBER'
  mes: string
  palavras: Palavras
  categorias: string[]
  clientes: ClienteBreve[]
  aoSalvar: () => void
}) {
  const [estado, acao, pendente] = useActionState(lancarConta, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const [parcelas, setParcelas] = useState(1)
  const [valor, setValor] = useState('')
  const jaAvisou = useRef(false)

  useEffect(() => {
    if (estado.ok && estado.mensagem && !jaAvisou.current) {
      jaAvisou.current = true
      aoSalvar()
    }
  }, [estado, aoSalvar])

  // O mesmo leitor de vírgula do servidor, para a prévia não discordar do que
  // vai ser gravado. Duas leituras diferentes do mesmo campo é como uma prévia
  // passa a mentir.
  const centavos = Math.round((lerValorBR(valor) ?? 0) * 100)

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.caixaForm}`}>
      <p className={estilo.blocoTitulo}>{palavras.tituloForm}</p>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="mes" value={mes} />

      <div className={estilo.form}>
        <label className={estilo.rotulo}>
          Do que se trata
          <input
            className={estilo.campo}
            name="descricao"
            required
            maxLength={140}
            placeholder={palavras.placeholderDesc}
          />
        </label>

        <label className={estilo.rotulo}>
          Categoria
          {/* Lista aberta com sugestões, e não `select`: cada empresa organiza o
              próprio plano de contas, e lista fechada vira "Outros" com 80% dos
              lançamentos dentro. */}
          <input className={estilo.campo} name="categoria" list="cat-caixa" maxLength={60} placeholder={palavras.placeholderCat} />
          <datalist id="cat-caixa">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
            {palavras.sugestoes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className={estilo.rotulo}>
          {palavras.rotuloCliente}
          <select className={estilo.selecao} name="clienteId" defaultValue="">
            <option value="">— {palavras.semCliente} —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={estilo.rotulo}>
          {palavras.rotuloContraparte}
          <input
            className={estilo.campo}
            name="contraparte"
            maxLength={140}
            placeholder={palavras.placeholderContraparte}
          />
        </label>

        <label className={estilo.rotulo}>
          Valor {parcelas > 1 ? 'total' : ''} (R$)
          <input
            className={estilo.campo}
            name="valor"
            inputMode="decimal"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </label>

        <label className={estilo.rotulo}>
          {parcelas > 1 ? 'Vencimento da 1ª parcela' : 'Vencimento'}
          <input className={estilo.campo} type="date" name="vencimento" required defaultValue={hojeISO()} />
        </label>

        <label className={estilo.rotulo}>
          Parcelas
          <input
            className={estilo.campo}
            type="number"
            name="parcelas"
            min={1}
            max={60}
            value={parcelas}
            onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label className={estilo.rotulo} style={{ gridColumn: '1 / -1' }}>
          Observação
          <input className={estilo.campo} name="observacoes" maxLength={500} placeholder="opcional" />
        </label>
      </div>

      {/* O parcelamento mostrado ANTES de salvar. Sem isto, a pessoa descobre
          como o sistema dividiu depois que as linhas já existem — e a diferença
          de um centavo na última parcela vira desconfiança. */}
      {parcelas > 1 && centavos > 0 ? (
        <p className={estilo.dica} role="status">
          Vai virar {parcelas} contas de {formatarBRL(Math.floor(centavos / parcelas))}, com{' '}
          {formatarBRL(centavos - Math.floor(centavos / parcelas) * (parcelas - 1))} na última — uma
          por mês, para cada uma cair no caixa do mês dela.
        </p>
      ) : null}

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
          {pendente ? 'Salvando…' : palavras.botaoSalvar}
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

// ---------------------------------------------------------------------------
// O vocabulário das duas direções
// ---------------------------------------------------------------------------

type Palavras = {
  somaAberto: string
  somaPago: string
  botaoLancar: string
  botaoBaixa: string
  botaoSalvar: string
  tituloForm: string
  selo: string
  filtroPagas: string
  vazio: string
  rodape: string
  rotuloCliente: string
  semCliente: string
  rotuloContraparte: string
  placeholderDesc: string
  placeholderCat: string
  placeholderContraparte: string
  placeholderBusca: string
  baixaValor: string
  baixaData: string
  sugestoes: string[]
}

const PALAVRAS: { pagar: Palavras; receber: Palavras } = {
  pagar: {
    somaAberto: 'A pagar em aberto',
    somaPago: 'Já pago',
    botaoLancar: 'Lançar conta a pagar',
    botaoBaixa: 'Pagar',
    botaoSalvar: 'Lançar a pagar',
    tituloForm: 'Nova conta a pagar',
    selo: 'pago',
    filtroPagas: 'Pagas no mês',
    vazio: 'Nenhuma conta a pagar com esse filtro. Boa notícia, se o mês já estiver lançado.',
    rodape:
      'Ao pagar, a conta sai desta lista de abertas e vai para o filtro "Pagas no mês" — ela não é apagada. "Tudo do mês" mostra as duas juntas, que é a visão do fechamento.',
    rotuloCliente: 'É de um cliente da carteira?',
    semCliente: 'não é cliente',
    rotuloContraparte: 'Para quem se paga',
    placeholderDesc: 'Aluguel da oficina, energia, contador…',
    placeholderCat: 'Ex.: Instalações',
    placeholderContraparte: 'Fornecedor, prefeitura, contador…',
    placeholderBusca: 'Descrição, fornecedor ou categoria',
    baixaValor: 'pago (R$)',
    baixaData: 'Saiu em',
    sugestoes: [
      'Instalações',
      'Energia e água',
      'Telefonia e internet',
      'Impostos',
      'Salários',
      'Contador',
      'Peças e fornecedores',
      'Combustível',
      'Veículo',
      'Marketing',
      'Software',
      'Manutenção',
    ],
  },
  receber: {
    somaAberto: 'A receber em aberto',
    somaPago: 'Já recebido',
    botaoLancar: 'Lançar a receber',
    botaoBaixa: 'Receber',
    botaoSalvar: 'Lançar a receber',
    tituloForm: 'Novo valor a receber',
    selo: 'recebido',
    filtroPagas: 'Recebidas no mês',
    vazio:
      'Nada avulso a receber com esse filtro. A cobrança dos consertos fica na aba Faturas de serviço.',
    rodape:
      'Aqui fica o que NÃO nasceu de uma ordem: contrato mensal, locação, venda de peça no balcão. A cobrança do conserto continua na aba de faturas — e as duas somam no mesmo número lá em cima.',
    rotuloCliente: 'De qual cliente',
    semCliente: 'não está na carteira',
    rotuloContraparte: 'Ou de quem, por escrito',
    placeholderDesc: 'Contrato mensal, locação, venda de peça…',
    placeholderCat: 'Ex.: Contrato de manutenção',
    placeholderContraparte: 'Quem paga, se não estiver na carteira',
    placeholderBusca: 'Descrição, cliente ou categoria',
    baixaValor: 'recebido (R$)',
    baixaData: 'Entrou em',
    sugestoes: [
      'Contrato de manutenção',
      'Locação de equipamento',
      'Venda de peça',
      'Treinamento',
      'Instalação',
      'Frete',
      'Outros serviços',
    ],
  },
}

// ---------------------------------------------------------------------------

function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' })
}

function mesCurto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).replace('.', '')
}

function curto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  })
}
