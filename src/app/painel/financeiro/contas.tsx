'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import { baixarConta, desfazerBaixa, excluirConta } from '@/server/acoes/caixa'
import EditarConta, { type ContaParaEditar } from './editar-conta'
import type { ClienteBreve } from './nova-conta'
import estilo from '../painel.module.css'

export type { ClienteBreve }

export type Conta = {
  id: string
  descricao: string
  categoria: string | null
  contraparte: string | null
  clienteId: string | null
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
  aprovadoEm: string | null
  aprovadoPorNome: string | null
}

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
 * desfazer, editar, apagar, filtrar por mês. Duplicar isto em dois arquivos
 * criaria duas telas que começam iguais e divergem na primeira correção feita
 * só de um lado — e o lado esquecido é sempre o que alguém usa no fechamento.
 *
 * O que muda entre elas é VOCABULÁRIO, não comportamento: "pagar" e "receber",
 * "fornecedor" e "cliente". Isso vira uma tabela de palavras no fim do arquivo,
 * onde dá para ler as duas versões lado a lado.
 *
 * =============================================================================
 * VIROU TABELA, E ANTES ERA LISTA DE PROPÓSITO
 * =============================================================================
 * O comentário antigo do CSS dizia, com razão, que descrição de tamanho
 * imprevisível ("Energia" ao lado de "Parcela 3/12 do compressor do
 * laboratório") desalinha uma tabela inteira. O que resolve isso não é voltar
 * para lista: é a coluna da esquerda ter largura própria e a descrição cortar
 * com reticências, em vez de empurrar as outras três colunas.
 *
 * A tabela ganha o que a lista não dava: STATUS numa coluna só, sempre no mesmo
 * lugar. Numa lista, o selo flutuava junto do valor e a leitura vertical de
 * "quais destas estão atrasadas" exigia percorrer linha a linha.
 *
 * =============================================================================
 * A BAIXA ABRE NA PRÓPRIA LINHA — E A EDIÇÃO, NUMA JANELA
 * =============================================================================
 * Não é inconsistência, são dois trabalhos diferentes. Quem dá baixa está com o
 * extrato do banco aberto do lado e vai lançar seis contas seguidas; uma janela
 * que cobre a lista faz perder o lugar a cada conta, e o erro clássico da tela
 * de caixa é dar baixa na linha de cima. Editar é o oposto: acontece uma vez,
 * exige atenção, e tem avisos que precisam ser lidos antes de salvar — é
 * exatamente o caso em que cobrir o resto da tela ajuda.
 */
export default function Contas({
  tipo,
  mes,
  situacao,
  busca,
  contas,
  categorias,
  clientes,
  podeApagar,
}: {
  tipo: 'PAGAR' | 'RECEBER'
  mes: string
  situacao: string
  busca: string
  contas: Conta[]
  categorias: string[]
  clientes: ClienteBreve[]
  podeApagar: boolean
}) {
  const p = tipo === 'PAGAR' ? PALAVRAS.pagar : PALAVRAS.receber
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [editando, setEditando] = useState<ContaParaEditar | null>(null)
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

  return (
    <>
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <form method="get" className={estilo.filtros}>
        <input type="hidden" name="aba" value={tipo === 'PAGAR' ? 'pagar' : 'receber'} />
        <input type="hidden" name="mes" value={mes} />
        <div className={estilo.busca}>
          {/* O campo GUARDA o que foi buscado. Sem isto ele voltava vazio depois
              de filtrar, e a pessoa ficava com uma lista curta e nenhuma pista
              do porquê — o filtro seguia ativo, invisível. */}
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={busca}
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
        <div className={estilo.rolaX}>
          <table className={`${estilo.tabela} ${estilo.tabelaCaixa}`}>
            <thead>
              <tr>
                <th scope="col">{p.colunaQuem}</th>
                <th scope="col">Status</th>
                <th scope="col" className={estilo.colDir}>
                  Valor
                </th>
                <th scope="col" className={estilo.colDir}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <Linha
                  key={c.id}
                  conta={c}
                  palavras={p}
                  podeApagar={podeApagar}
                  pendente={pendente}
                  agir={agir}
                  aoEditar={() => setEditando(paraEdicao(c))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* O `key` faz a janela remontar a cada linha aberta, e é o que garante
          que os campos nasçam com os valores DESTA conta. Ver o comentário do
          inicializador em `editar-conta.tsx`. */}
      <EditarConta
        key={editando?.id ?? 'nenhuma'}
        conta={editando}
        aoFechar={() => setEditando(null)}
        clientes={clientes}
        categorias={categorias}
      />

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        {p.rodape}
      </p>
    </>
  )
}

/** O recorte que a janela de edição precisa — nem mais, nem menos. */
function paraEdicao(c: Conta): ContaParaEditar {
  return {
    id: c.id,
    descricao: c.descricao,
    categoria: c.categoria,
    contraparte: c.contraparte,
    clienteId: c.clienteId,
    valorCentavos: c.valorCentavos,
    vencimento: c.vencimento,
    observacoes: c.observacoes,
    parcela: c.parcela,
    parcelas: c.parcelas,
    daRecorrencia: c.daRecorrencia,
    aprovadoPorNome: c.aprovadoPorNome,
  }
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
  aoEditar,
}: {
  conta: Conta
  palavras: Palavras
  podeApagar: boolean
  pendente: boolean
  agir: (fn: () => Promise<{ ok: true; mensagem?: string } | { ok: false; motivo: string }>) => void
  aoEditar: () => void
}) {
  const pago = Boolean(conta.pagoEm)
  const vencida = !pago && new Date(conta.vencimento) < new Date()
  const semAprovacao = !pago && !conta.aprovadoEm
  const quem = conta.clienteNome ?? conta.contraparte

  /**
   * A ORDEM DA PÍLULA — do fato mais consequente para o menos.
   *
   * Pago encerra o assunto. Atrasado é o que custa juro hoje. "Sem aprovação"
   * explica por que uma conta parada continua parada, e por isso vem como
   * etiqueta ao lado, e não no lugar de "atrasado": as duas coisas acontecem
   * juntas o tempo todo, e trocar uma pela outra esconderia a urgência ou
   * esconderia o motivo.
   */
  const status = pago
    ? { texto: palavras.selo, classe: estilo.tagOk }
    : vencida
      ? { texto: 'atrasado', classe: estilo.tagAlerta }
      : { texto: 'pendente', classe: estilo.tagEspera }

  return (
    <tr className={vencida ? estilo.linhaVencida : undefined}>
      <td>
        <div className={estilo.caixaQuem}>
          <strong className={estilo.caixaQuemNome}>
            {quem ?? conta.descricao}
            {conta.parcelas > 1 ? (
              <span className={estilo.caixaParcela}>
                {conta.parcela}/{conta.parcelas}
              </span>
            ) : null}
          </strong>
          <span className={estilo.caixaRef}>
            {quem ? `${conta.descricao} · ` : ''}
            {pago ? `${palavras.selo} ${curto(conta.pagoEm!)}` : `Venc. ${longo(conta.vencimento)}`}
          </span>
          <span className={estilo.caixaChips}>
            {conta.categoria ? <span className={estilo.caixaCat}>{conta.categoria}</span> : null}
            {conta.daRecorrencia ? <span className={estilo.caixaCat}>recorrente</span> : null}
            {semAprovacao ? (
              <span className={`${estilo.caixaCat} ${estilo.caixaCatEspera}`}>aguarda aprovação</span>
            ) : null}
          </span>
        </div>
      </td>

      <td>
        <span className={`${estilo.tag} ${status.classe}`}>{status.texto}</span>
      </td>

      <td className={estilo.colDir}>
        <strong className={estilo.caixaCifra}>{formatarBRL(conta.valorCentavos)}</strong>
        {/* Divergência entre previsto e pago fica VISÍVEL: é desconto, juros ou
            pagamento a menor, e é a informação que alguém procura no mês
            seguinte quando a conta não bate. */}
        {pago && conta.valorPagoCentavos !== conta.valorCentavos ? (
          <span className={estilo.fraco}>pago {formatarBRL(conta.valorPagoCentavos)}</span>
        ) : null}
      </td>

      <td className={estilo.colDir}>
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
            <>
              <details className={estilo.caixaBaixa}>
                <summary className={estilo.btnPrimario}>{palavras.botaoBaixa}</summary>
                <FormularioBaixa conta={conta} palavras={palavras} />
              </details>

              <button
                type="button"
                className={estilo.iconeAcao}
                onClick={aoEditar}
                title="Editar lançamento"
                aria-label={`Editar ${conta.descricao}`}
              >
                {/* Ícone COM rótulo acessível. Um lápis sozinho não é lido por
                    ninguém que use leitor de tela, e "botão" é tudo o que se
                    ouviria numa linha com três deles. */}
                <LapisIcone />
              </button>

              {podeApagar ? (
                <>
                  <button
                    type="button"
                    className={`${estilo.iconeAcao} ${estilo.iconePerigo}`}
                    disabled={pendente}
                    title="Excluir lançamento"
                    aria-label={`Excluir ${conta.descricao}`}
                    onClick={() => {
                      if (confirm(`Apagar "${conta.descricao}"? Isso não deixa rastro na lista.`)) {
                        agir(() => excluirConta(conta.id, false))
                      }
                    }}
                  >
                    <LixeiraIcone />
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
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function LapisIcone() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  )
}

function LixeiraIcone() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * A baixa: valor, forma e data. Tudo já preenchido com o caso comum.
 *
 * EXPORTADO porque a aba "Dar baixa" usa o MESMO formulário. Duplicá-lo lá
 * criaria duas telas que dão baixa de jeitos ligeiramente diferentes — e a que
 * for corrigida primeiro deixaria a outra errada, num lugar onde o erro é
 * dinheiro.
 */
export function FormularioBaixa({ conta, palavras }: { conta: Conta; palavras: Palavras }) {
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
// O vocabulário das duas direções
// ---------------------------------------------------------------------------

export type Palavras = {
  botaoBaixa: string
  selo: string
  filtroPagas: string
  vazio: string
  rodape: string
  colunaQuem: string
  placeholderBusca: string
  baixaValor: string
  baixaData: string
}

/**
 * EXPORTADA porque a aba "Dar baixa" mostra contas dos DOIS tipos na mesma
 * lista, e cada linha precisa das palavras do tipo dela — "Pagar" numa conta a
 * pagar, "Receber" numa a receber.
 *
 * Recriar a tabela lá seria duas listas de palavras para manter em dia, e a
 * segunda envelheceria calada: alguém corrige um rótulo aqui e a outra tela
 * continua dizendo a frase antiga.
 */
export const PALAVRAS: { pagar: Palavras; receber: Palavras } = {
  pagar: {
    botaoBaixa: 'Pagar',
    selo: 'pago',
    filtroPagas: 'Pagas no mês',
    vazio: 'Nenhuma conta a pagar com esse filtro. Boa notícia, se o mês já estiver lançado.',
    rodape:
      'Ao pagar, a conta sai desta lista de abertas e vai para o filtro "Pagas no mês" — ela não é apagada. "Tudo do mês" mostra as duas juntas, que é a visão do fechamento.',
    colunaQuem: 'Fornecedor / referência',
    placeholderBusca: 'Descrição, fornecedor ou categoria',
    baixaValor: 'pago (R$)',
    baixaData: 'Saiu em',
  },
  receber: {
    botaoBaixa: 'Receber',
    selo: 'recebido',
    filtroPagas: 'Recebidas no mês',
    vazio:
      'Nada avulso a receber com esse filtro. A cobrança dos consertos fica na aba Faturas de serviço.',
    rodape:
      'Aqui fica o que NÃO nasceu de uma ordem: contrato mensal, locação, venda de peça no balcão. A cobrança do conserto continua na aba de faturas — e as duas somam no mesmo número lá em cima.',
    colunaQuem: 'Cliente / referência',
    placeholderBusca: 'Descrição, cliente ou categoria',
    baixaValor: 'recebido (R$)',
    baixaData: 'Entrou em',
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

function curto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  })
}

/** 15/09/2026 — com o ano, porque conta atrasada de ano passado existe. */
function longo(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
