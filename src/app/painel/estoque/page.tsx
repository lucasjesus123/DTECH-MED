import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { listarPecas, ultimosMovimentos } from '@/server/consultas/listas'
import {
  dinheiroParado,
  ferramentasEmCampo,
  giroDoEstoque,
  resumoDoEstoque,
} from '@/server/consultas/estoque'
import FotoCatalogo from '../foto-catalogo'
import Painel from './painel-estoque'
import AbasEstoque, { type AbaEstoque } from './abas'
import Ferramentas from './ferramentas'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Estoque', robots: { index: false } }
export const dynamic = 'force-dynamic'

const TIPOS = ['PECA', 'INSUMO', 'FERRAMENTA'] as const
type TipoItem = (typeof TIPOS)[number]

const NOME_DO_TIPO: Record<TipoItem, string> = {
  PECA: 'Peça',
  INSUMO: 'Insumo',
  FERRAMENTA: 'Ferramenta',
}

/**
 * O ESTOQUE.
 *
 * =============================================================================
 * A COLUNA QUE DECIDE SE A O.S. ANDA É "DISPONÍVEL", E NÃO SALDO
 * =============================================================================
 * O saldo cheio inclui peça já comprometida com uma ordem aprovada (reservada)
 * e ferramenta que está na mão de alguém (emprestada). Mostrar só o saldo faria
 * o técnico prometer material que já tem dono, e a descoberta viria na hora de
 * abrir o aparelho.
 *
 *     disponível = saldo − reservado − emprestado
 *
 * =============================================================================
 * QUATRO ABAS, PORQUE SÃO QUATRO PERGUNTAS
 * =============================================================================
 * Empilhar tudo numa página faria as duas informações mais acionáveis — o que
 * comprar e com quem está a ferramenta — cair no rodapé, onde ninguém chega.
 * Ver `abas.tsx`.
 */
export default async function Estoque({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    criticas?: string
    peca?: string
    ver?: string
    tipo?: string
  }>
}) {
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO)
  // Quem chega aqui já passou pelo guarda acima, e os três papéis que ele
  // aceita são exatamente os que mexem no catálogo.
  const podeMexer = true
  await exigirAba('estoque')
  const q = await searchParams

  const ver: AbaEstoque =
    q.ver === 'ferramentas' || q.ver === 'compras' || q.ver === 'movimentos' ? q.ver : 'itens'
  const tipo = TIPOS.find((t) => t === q.tipo)

  /**
   * Só o que a aba mostrada precisa.
   *
   * Buscar as quatro visões em toda abertura faria a aba Itens pagar o preço do
   * giro e do dinheiro parado — duas varreduras do livro-razão — para desenhar
   * uma tabela que não usa nenhuma das duas.
   */
  const [resumo, itens] = await Promise.all([
    resumoDoEstoque(ctx),
    listarPecas(ctx, q.busca, q.criticas === '1', tipo),
  ])

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Estoque</h1>
        </div>
      </div>

      {/* ===================================================================
          OS NÚMEROS DO TOPO, SEPARADOS POR TIPO
          ===================================================================
          "42 itens cadastrados" juntava peça, insumo e ferramenta num número
          que não decide nada: peça em falta trava uma O.S., ferramenta em
          falta trava o técnico, insumo em falta é uma ida ao mercado. Três
          problemas, três donos. */}
      <div className={estilo.resumo}>
        <Indicador
          rotulo="No catálogo"
          valor={String(resumo.pecas + resumo.insumos + resumo.ferramentas)}
          nota={[
            plural(resumo.pecas, 'peça', 'peças'),
            plural(resumo.insumos, 'insumo', 'insumos'),
            plural(resumo.ferramentas, 'ferramenta', 'ferramentas'),
          ].join(' · ')}
        />
        <Indicador
          rotulo="No mínimo ou abaixo"
          valor={String(resumo.criticos)}
          nota={resumo.criticos > 0 ? 'reponha antes de travar uma O.S.' : 'tudo acima do mínimo'}
          alerta={resumo.criticos > 0}
        />
        <Indicador
          rotulo="Ferramenta em campo"
          valor={String(resumo.emCampo)}
          nota={
            resumo.atrasadas > 0
              ? `${resumo.atrasadas} passou da data de volta`
              : 'nenhuma passou da data prometida'
          }
          alerta={resumo.atrasadas > 0}
        />
        <Indicador
          rotulo="Valor em prateleira"
          valor={formatarBRL(resumo.valorCentavos)}
          nota={
            resumo.paradoCentavos > 0
              ? `${formatarBRL(resumo.paradoCentavos)} parados há meses`
              : 'pelo custo médio de compra'
          }
        />
      </div>

      <AbasEstoque atual={ver} />

      {ver === 'itens' ? (
        <AbaItens
          itens={itens}
          busca={q.busca ?? ''}
          criticas={q.criticas === '1'}
          tipo={tipo}
          podeMexer={podeMexer}
        />
      ) : null}

      {ver === 'ferramentas' ? <AbaFerramentas ctx={ctx} podeMexer={podeMexer} /> : null}

      {ver === 'compras' ? <AbaCompras ctx={ctx} /> : null}

      {ver === 'movimentos' ? <AbaMovimentos ctx={ctx} peca={q.peca} papel={sessao.papel} /> : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// ABA 1 · ITENS — o que tem, e quanto dá para prometer
// ---------------------------------------------------------------------------

type Item = Awaited<ReturnType<typeof listarPecas>>[number]

function AbaItens({
  itens,
  busca,
  criticas,
  tipo,
  podeMexer,
}: {
  itens: Item[]
  busca: string
  criticas: boolean
  tipo: TipoItem | undefined
  podeMexer: boolean
}) {
  return (
    <>
      <Painel
        pecas={itens.map((p) => ({
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          saldo: p.saldo,
          unidade: p.unidade,
        }))}
        podeMexer={podeMexer}
      />

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Código, nome, categoria, aplicação ou patrimônio"
            aria-label="Buscar no estoque"
          />
        </div>
        {/* O filtro de tipo é do BANCO, não da tela: uma casa com quatrocentos
            itens não pode trazer os quatrocentos para escolher trinta no
            navegador. */}
        <label className={estilo.rotulo} style={{ maxWidth: 200 }}>
          <span className={estilo.soLeitor}>Tipo de item</span>
          <select className={estilo.selecao} name="tipo" defaultValue={tipo ?? ''}>
            <option value="">Peças, insumos e ferramentas</option>
            <option value="PECA">Só peças</option>
            <option value="INSUMO">Só insumos</option>
            <option value="FERRAMENTA">Só ferramentas</option>
          </select>
        </label>
        <label className={estilo.rotulo} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" name="criticas" value="1" defaultChecked={criticas} />
          só as críticas
        </label>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      {itens.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum item encontrado. Cadastre o que você mais usa — as peças aparecem no orçamento e a
          reserva acontece sozinha na aprovação; as ferramentas passam a ter dono e data de volta.
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                {/* A foto abre a linha porque é por ela que o olho encontra:
                    quem procura na prateleira reconhece a imagem antes de ler
                    o código. */}
                <th>
                  <span className={estilo.soLeitor}>Foto</span>
                </th>
                <th>Código</th>
                <th>Item</th>
                <th>Onde está</th>
                <th className={estilo.dir}>Saldo</th>
                <th className={estilo.dir}>Reservado</th>
                <th className={estilo.dir}>Em campo</th>
                <th className={estilo.dir}>Disponível</th>
                <th className={estilo.dir}>Mínimo</th>
                <th className={estilo.dir}>Venda</th>
                <th>
                  <span className={estilo.soLeitor}>Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((p) => (
                <tr key={p.id}>
                  <td>
                    <FotoCatalogo tipo="peca" id={p.id} nome={p.nome} tem={p.temFoto} podeMexer={podeMexer} />
                  </td>
                  <td className={estilo.num}>{p.sku}</td>
                  <td>
                    <Link href={`/painel/estoque/${p.id}`} className={estilo.forte}>
                      {p.nome}
                    </Link>
                    <div className={estilo.fraco}>
                      {/* O tipo aparece na linha porque ele muda o que os
                          números querem dizer: "em campo" só existe para
                          ferramenta, e ferramenta não tem preço de venda. */}
                      <span className={`${estilo.tag} ${corDoTipo(p.tipo)}`}>
                        {NOME_DO_TIPO[p.tipo as TipoItem] ?? p.tipo}
                      </span>
                      {p.categoria ? ` ${p.categoria}` : ''}
                      {p.patrimonio ? ` · patr. ${p.patrimonio}` : ''}
                    </div>
                  </td>
                  <td>{p.localizacao ?? <span className={estilo.fraco}>—</span>}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>
                    {p.saldo} {p.unidade}
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{p.reservado || '—'}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{p.emprestado || '—'}</td>
                  <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                    <span className={p.critica ? estilo.atrasado : undefined}>{p.livre}</span>
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{p.minimo}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>
                    {p.tipo === 'FERRAMENTA' ? (
                      <span className={estilo.fraco}>—</span>
                    ) : (
                      formatarBRL(p.precoVendaCentavos)
                    )}
                  </td>
                  <td>
                    <Link href={`/painel/estoque/${p.id}`} className={estilo.fraco}>
                      ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ABA 2 · FERRAMENTAS — com quem está cada uma
// ---------------------------------------------------------------------------

async function AbaFerramentas({
  ctx,
  podeMexer,
}: {
  ctx: Parameters<typeof ferramentasEmCampo>[0]
  podeMexer: boolean
}) {
  const [emCampo, ferramentas, pessoas] = await Promise.all([
    ferramentasEmCampo(ctx),
    listarPecas(ctx, undefined, false, 'FERRAMENTA'),
    // A equipe da própria empresa, para dizer quem levou. `comEscopo` já
    // limita à empresa de quem pergunta.
    comEscopo(ctx, (tx) =>
      tx.user.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, papel: true },
      }),
    ),
  ])

  return (
    <Ferramentas
      podeMexer={podeMexer}
      emCampo={emCampo.map((e) => ({
        ...e,
        retiradoEm: dia(e.retiradoEm),
        previstoPara: e.previstoPara ? dia(e.previstoPara) : null,
      }))}
      disponiveis={ferramentas
        // Só o que dá para sair. Oferecer a que já está toda na rua faria a
        // pessoa escolher e levar uma recusa do servidor.
        .filter((f) => f.livre > 0)
        .map((f) => ({
          id: f.id,
          sku: f.sku,
          nome: f.nome,
          patrimonio: f.patrimonio,
          livre: f.livre,
          unidade: f.unidade,
        }))}
      pessoas={pessoas}
    />
  )
}

// ---------------------------------------------------------------------------
// ABA 3 · COMPRAS — o que vai faltar, e o que encalhou
// ---------------------------------------------------------------------------

async function AbaCompras({ ctx }: { ctx: Parameters<typeof giroDoEstoque>[0] }) {
  const [giro, parados] = await Promise.all([giroDoEstoque(ctx), dinheiroParado(ctx)])

  /**
   * A LISTA DE COMPRA É ORDENADA POR URGÊNCIA REAL, e não pelo mínimo.
   *
   * "Abaixo do mínimo" é um alarme binário e chega tarde: quando dispara, já
   * falta. A COBERTURA — para quantos dias ainda dá o que está na prateleira,
   * ao ritmo dos últimos noventa dias — é o número que permite comprar antes.
   *
   * Item sem consumo nenhum fica de fora daqui: ele não vai faltar, e o
   * problema dele é o oposto — está encalhado, e aparece na segunda lista.
   */
  const comprar = giro
    .filter((g) => g.cobertura !== null && g.cobertura <= 30)
    .sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0))

  const giram = giro.filter((g) => g.consumo > 0).slice(0, 15)

  return (
    <>
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>O que comprar, e por quê</p>
        <p className={estilo.texto} style={{ maxWidth: '68ch' }}>
          A conta é o consumo dos últimos <strong>90 dias</strong> aplicado ao que está na
          prateleira. &ldquo;Abaixo do mínimo&rdquo; avisa quando já faltou;{' '}
          <strong>cobertura</strong> avisa antes — e é ela que ordena esta lista.
        </p>

        {comprar.length === 0 ? (
          <p className={estilo.texto}>
            Nada com menos de 30 dias de cobertura. Ou o estoque está folgado, ou ainda não há
            consumo registrado para calcular o ritmo.
          </p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={estilo.dir}>Em prateleira</th>
                  <th className={estilo.dir}>Saiu em 90 dias</th>
                  <th className={estilo.dir}>Por dia</th>
                  <th className={estilo.dir}>Cobertura</th>
                  <th className={estilo.dir}>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {comprar.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link href={`/painel/estoque/${g.id}`} className={estilo.forte}>
                        {g.nome}
                      </Link>
                      <div className={estilo.fraco}>{g.sku}</div>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>
                      {g.saldo} {g.unidade}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{g.consumo}</td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{g.porDia.toFixed(2)}</td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      <span className={(g.cobertura ?? 0) <= 7 ? estilo.atrasado : undefined}>
                        {g.cobertura} dias
                      </span>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{g.minimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <p className={estilo.blocoTitulo}>Dinheiro parado</p>
        <p className={estilo.texto} style={{ maxWidth: '68ch' }}>
          Peça comprada que não sai há três meses. Ela some de todos os outros indicadores — não
          está abaixo do mínimo, não aparece no giro — e ainda engorda o &ldquo;valor em
          prateleira&rdquo;, fazendo o número parecer bom. A ordem é por{' '}
          <strong>dinheiro</strong>: seis meses parados num anel de oito reais não é problema; seis
          meses numa placa de mil e duzentos, são.
        </p>

        {parados.length === 0 ? (
          <p className={estilo.texto}>
            Nada encalhado. Tudo o que está em prateleira teve saída nos últimos três meses.
          </p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={estilo.dir}>Em prateleira</th>
                  <th className={estilo.dir}>Custo médio</th>
                  <th className={estilo.dir}>Parado</th>
                  <th>Última saída</th>
                </tr>
              </thead>
              <tbody>
                {parados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/painel/estoque/${p.id}`} className={estilo.forte}>
                        {p.nome}
                      </Link>
                      <div className={estilo.fraco}>{p.sku}</div>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>
                      {p.saldo} {p.unidade}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>
                      {formatarBRL(p.custoMedioCentavos)}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(p.paradoCentavos)}
                    </td>
                    <td className={estilo.fraco}>
                      {p.ultimaSaida ? dia(p.ultimaSaida) : 'nunca saiu'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <p className={estilo.blocoTitulo}>O que mais gira</p>
        {giram.length === 0 ? (
          <p className={estilo.texto}>
            Nenhuma saída registrada nos últimos 90 dias — sem consumo não há giro para medir.
          </p>
        ) : (
          <ul className={estilo.colunaLista}>
            {giram.map((g) => {
              const maior = giram[0]?.consumo || 1
              return (
                <li key={g.id} className={estilo.giroLinha}>
                  <Link href={`/painel/estoque/${g.id}`} className={estilo.giroNome}>
                    {g.nome}
                  </Link>
                  {/* A barra é proporção, não enfeite: ela responde "quanto
                      este item pesa em relação ao que mais sai" numa olhada,
                      que é o que uma coluna de números não faz. */}
                  <span className={estilo.giroBarra} aria-hidden="true">
                    <span style={{ width: `${Math.round((g.consumo / maior) * 100)}%` }} />
                  </span>
                  <span className={estilo.giroNumero}>
                    {g.consumo} {g.unidade}
                    <span className={estilo.fraco}>
                      {g.cobertura !== null ? ` · ${g.cobertura} dias` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// ABA 4 · MOVIMENTOS — o livro-razão
// ---------------------------------------------------------------------------

async function AbaMovimentos({
  ctx,
  peca,
  papel,
}: {
  ctx: Parameters<typeof ultimosMovimentos>[0]
  peca: string | undefined
  papel: Papel
}) {
  const movimentos = await ultimosMovimentos(ctx, peca)

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>Últimos movimentos{peca ? ' deste item' : ''}</span>
        {peca ? (
          <Link href="/painel/estoque?ver=movimentos" className={estilo.fraco}>
            ver de todos
          </Link>
        ) : null}
      </p>
      {movimentos.length === 0 ? (
        <p className={estilo.texto}>Nenhum movimento registrado ainda.</p>
      ) : (
        <div className={estilo.rolaX}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Item</th>
                <th>Movimento</th>
                <th className={estilo.dir}>Qtd.</th>
                <th className={estilo.dir}>Saldo depois</th>
                <th>Ordem</th>
                <th>Quem</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td className={estilo.num}>{dataHora(m.criadoEm)}</td>
                  <td>{m.peca.nome}</td>
                  <td>
                    <span className={`${estilo.tag} ${corDoMovimento(m.tipo)}`}>
                      {rotuloDoMovimento(m.tipo)}
                    </span>
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.quantidade)}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.saldoPosterior)}</td>
                  <td className={estilo.num}>
                    {m.ordem ? (
                      <Link href={`/painel/ordens/${m.ordem.id}`}>
                        #{String(m.ordem.numero).padStart(4, '0')}
                      </Link>
                    ) : (
                      <span className={estilo.fraco}>—</span>
                    )}
                  </td>
                  <td>{m.autorNome}</td>
                  <td className={estilo.fraco}>{m.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
        Este é o livro-razão do estoque: o saldo de cada item é a soma destes movimentos, nunca um
        número digitado. {papel === Papel.TECNICO ? '' : 'Nem o administrador edita saldo direto.'}{' '}
        Empréstimo e devolução aparecem aqui e <strong>não mexem no saldo</strong> — a ferramenta
        emprestada continua sendo da empresa, só mudou de lugar.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

/** "1 ferramentas" é o tipo de descuido que faz a tela inteira parecer tosca. */
function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`
}

function corDoTipo(t: string): string {
  if (t === 'FERRAMENTA') return estilo.tagEspera!
  if (t === 'INSUMO') return estilo.tagNeutra!
  return estilo.tagOk!
}

function corDoMovimento(t: string): string {
  if (t === 'ENTRADA' || t === 'DEVOLUCAO') return estilo.tagOk!
  if (t === 'SAIDA' || t === 'PERDA') return estilo.tagAlerta!
  if (t === 'RESERVA' || t === 'EMPRESTIMO') return estilo.tagEspera!
  return estilo.tagNeutra!
}

/** O nome que a casa usa, e não o do enum. "Emprestimo" não tem acento no banco. */
function rotuloDoMovimento(t: string): string {
  const nomes: Record<string, string> = {
    ENTRADA: 'entrada',
    SAIDA: 'saída',
    AJUSTE: 'ajuste',
    RESERVA: 'reserva',
    LIBERACAO: 'liberação',
    PERDA: 'perda',
    EMPRESTIMO: 'saiu com alguém',
    DEVOLUCAO: 'devolvida',
  }
  return nomes[t] ?? t.toLowerCase()
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dataHora = (d: Date) => fmt.format(d)

const fmtDia = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dia = (d: Date) => fmtDia.format(d)
