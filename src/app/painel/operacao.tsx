import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import type {
  FilaDaEtapa,
  LinhaDeAparelho,
  LinhaDeCliente,
  MesDeDinheiro,
  MesDeMovimento,
  MesDePrazo,
} from '@/server/consultas/operacao'
import { BigNumber, Delta, Exec, Term } from './console'
import estilo from './painel.module.css'

/**
 * A OPERAÇÃO EM GRÁFICOS.
 *
 * =============================================================================
 * POR QUE ISTO É ABA, E NÃO MAIS COISA EMPILHADA NO DASHBOARD
 * =============================================================================
 * O Dashboard responde "onde a esteira está AGORA", e é para isso que alguém o
 * abre de manhã. Empilhar seis gráficos em cima ou embaixo da esteira empurraria
 * a fila do dia — a informação que a pessoa veio ver — para a terceira dobra.
 *
 * São duas perguntas de horizontes diferentes, feitas em momentos diferentes:
 *
 *     HOJE      o que está parado, e o que fazer nas próximas horas
 *     OPERAÇÃO  como o mês está indo, e o que decidir para o próximo
 *
 * É a mesma regra que já separou as visões da O.S., do Financeiro, do Comercial
 * e do Calendário.
 *
 * =============================================================================
 * CADA GRÁFICO VEM COM OS NÚMEROS
 * =============================================================================
 * Barra sem número obriga a estimar, e estimativa não entra em conversa de
 * decisão — ninguém compra peça com "parece que subiu". Todo gráfico aqui tem a
 * base embaixo ou o valor escrito no topo da barra.
 *
 * É também o que faz a tela funcionar para quem usa leitor de tela: o SVG
 * carrega `role="img"` com o resumo, e a base é uma tabela de verdade.
 */

const L = 760 // largura do desenho, em unidades do viewBox
const A = 230 // altura
const EIXO = 46 // gutter da esquerda, onde ficam os valores da escala
const PE = 26 // faixa dos meses, embaixo
const TOPO = 14
const UTIL = A - PE - TOPO

export default function Operacao({
  movimento,
  prazo,
  filas,
  aparelhos,
  clientes,
  dinheiro,
  comDinheiro,
}: {
  movimento: MesDeMovimento[]
  prazo: MesDePrazo[]
  filas: FilaDaEtapa[]
  aparelhos: LinhaDeAparelho[]
  clientes: LinhaDeCliente[]
  dinheiro: MesDeDinheiro[]
  comDinheiro: boolean
}) {
  const abertas12 = movimento.reduce((s, m) => s + m.abertas, 0)
  const entregues12 = movimento.reduce((s, m) => s + m.entregues, 0)
  const acumulo = abertas12 - entregues12
  const emFila = filas.reduce((s, f) => s + f.n, 0)
  const comPrazo = prazo.filter((p) => p.dias !== null)
  const prazoTipico = comPrazo.length
    ? Math.round((comPrazo.reduce((s, p) => s + (p.dias ?? 0), 0) / comPrazo.length) * 10) / 10
    : null

  return (
    <>
      {/* =====================================================================
          O CARTÃO-HERÓI
          =====================================================================
          Quatro indicadores do mesmo tamanho é o que deixava esta tela morna:
          nada era muito maior que nada, e o olho lia a fileira como um
          parágrafo em vez de encontrar a resposta.

          O VOLUME DE 12 MESES vira o número-herói — é ele que dá a escala de
          tudo que vem abaixo, e é a pergunta que traz alguém a esta aba. O
          ACÚMULO fica colado nele como variação, porque acúmulo só significa
          alguma coisa em relação ao volume: "+12" é grave numa casa de 22
          ordens e irrelevante numa de 900.

          Os outros dois continuam indicadores comuns. Um por tela é regra: o
          segundo número-herói mata o primeiro. */}
      <div className={estilo.heroi}>
        <div className={estilo.heroiEsq}>
          <Term nome="Volume" estado="12 meses" />
          <BigNumber valor={String(abertas12)} rotulo="Ordens abertas no período" />
          <p className={estilo.heroiNota}>
            {entregues12} entregues no mesmo período
          </p>
        </div>
        <div className={estilo.heroiDir}>
          {/* O `tom` é escolhido AQUI, e não deduzido do sinal: acumular é
              ruim mesmo subindo, e vazar a fila é bom mesmo descendo. */}
          <Delta
            valor={acumulo}
            tom={acumulo > 0 ? 'ruim' : acumulo === 0 ? 'neutro' : 'bom'}
            sufixo=""
          />
          <p className={estilo.heroiNota}>
            {acumulo > 0
              ? 'entrou mais do que saiu — a fila cresce'
              : acumulo === 0
                ? 'entrou e saiu na mesma medida'
                : 'saiu mais do que entrou — a fila encolheu'}
          </p>
          <Exec href="/painel/ordens">Ver as ordens</Exec>
        </div>
      </div>

      <div className={estilo.resumo3 ? `${estilo.resumo} ${estilo.resumo3}` : estilo.resumo}>
        <Indicador
          rotulo="Do balcão à entrega"
          valor={prazoTipico === null ? '—' : `${prazoTipico} dias`}
          nota="mediana dos meses com entrega"
        />
        <Indicador
          rotulo="Na casa agora"
          valor={String(emFila)}
          nota={filas.length > 0 ? `em ${filas.length} etapas diferentes` : 'nada em aberto'}
        />
        <Indicador
          rotulo="Entregues em 12 meses"
          valor={String(entregues12)}
          nota="o que de fato saiu pela porta"
        />
      </div>

      {/* ===================================================================
          1. ENTROU × SAIU
          =================================================================== */}
      <div className={estilo.bloco}>
        <Term nome="Entrou e saiu" estado="mês a mês" />
        <p className={estilo.texto} style={{ maxWidth: '70ch' }}>
          A pergunta que sustenta tudo: <strong>está entrando mais do que sai?</strong> Uma oficina
          que abre doze e entrega oito por mês acumula quatro — e em seis meses tem vinte e quatro
          aparelhos na prateleira que ninguém consegue explicar.
        </p>
        <BarrasDuplas
          dados={movimento.map((m) => ({ mes: m.mes, a: m.abertas, b: m.entregues }))}
          titulo="Ordens abertas e entregues em cada um dos últimos meses"
          rotuloA="abertas"
          rotuloB="entregues"
          formatar={(n) => String(n)}
        />
        <Base
          cabecalho={['Mês', 'Abertas', 'Entregues', 'Saldo']}
          linhas={movimento.map((m) => [
            rotuloMes(m.mes),
            String(m.abertas),
            String(m.entregues),
            `${m.abertas - m.entregues >= 0 ? '+' : ''}${m.abertas - m.entregues}`,
          ])}
        />
      </div>

      {/* ===================================================================
          2. QUANTO TEMPO LEVA
          =================================================================== */}
      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <Term nome="Quanto tempo leva" estado="do balcão à entrega" />
        <p className={estilo.texto} style={{ maxWidth: '70ch' }}>
          É a <strong>mediana</strong>, não a média. Um aparelho parado 210 dias esperando peça
          importada não descreve o serviço da casa — descreve um caso; na média, ele levanta o mês
          inteiro e o número mente na direção mais desanimadora possível.
        </p>
        {/* `dias` continua NULO quando o mês não teve entrega — e é isso que
            separa "ainda não entregamos nada em março" de "em março entregamos
            no mesmo dia". Achatar os dois em zero desenhava a mesma coisa para
            os dois, e o mês com dez entregas ficava idêntico a um mês vazio. */}
        <BarrasSimples
          dados={prazo.map((p) => ({ mes: p.mes, v: p.dias }))}
          titulo="Dias entre abrir e entregar, por mês"
          sufixo=" d"
          formatar={(n) => `${Math.round(n * 10) / 10}`}
          vazio="Nenhuma entrega registrada nos últimos 12 meses — o prazo aparece aqui assim que a primeira ordem for entregue."
        />
        <Base
          cabecalho={['Mês', 'Dias (mediana)', 'Entregues']}
          linhas={prazo.map((p) => [
            rotuloMes(p.mes),
            p.dias === null ? '—' : String(p.dias),
            String(p.entregues),
          ])}
        />
      </div>

      {/* ===================================================================
          3. ONDE O TRABALHO ESTÁ PARADO
          =================================================================== */}
      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <Term nome="Onde está parado" estado="agora" />
        <p className={estilo.texto} style={{ maxWidth: '70ch' }}>
          &ldquo;Sete em análise&rdquo; não diz nada sozinho. <strong>Sete de dezenove</strong> diz
          que mais de um terço da casa espera diagnóstico — e é isso que decide se o gargalo é a
          bancada ou a rua. O número de dias é o da <strong>mais antiga</strong> da fila: sete com a
          mais velha de dois dias é fluxo normal; a mesma fila com uma de quarenta tem um aparelho
          esquecido dentro dela.
        </p>

        {filas.length === 0 ? (
          <p className={estilo.vazio}>Nenhuma ordem em aberto. A casa está limpa.</p>
        ) : (
          <ul className={estilo.grafBarras} style={{ marginTop: 'var(--s4)' }}>
            {filas.map((f) => (
              <li key={f.etapa} className={estilo.grafBarraItem}>
                <span className={estilo.grafBarraNome}>{f.rotulo}</span>
                <span className={estilo.grafBarraPista} aria-hidden="true">
                  {/* A COR VAI NA BARRA, e não na pista. Sem a classe, a barra
                      é um bloco transparente dentro do trilho cinza: a linha
                      continua dizendo "3 · 25%" e o desenho — a única parte que
                      se lê de relance — some. */}
                  <span
                    className={estilo.grafBarraEntra}
                    style={{ width: `${Math.round((f.n / emFila) * 100)}%` }}
                  />
                </span>
                <span className={estilo.grafBarraValor}>
                  {f.n}
                  <span className={estilo.fraco}> · {Math.round((f.n / emFila) * 100)}%</span>
                  {/* A mais antiga só a partir de uma semana: "há 0 dias" em
                      toda etapa é ruído, e ruído some da leitura junto com o
                      sinal. */}
                  {f.maisAntiga >= 7 ? (
                    <span className={f.maisAntiga >= 30 ? estilo.indAlerta : estilo.fraco}>
                      {' '}
                      · mais antiga há {f.maisAntiga} d
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===================================================================
          4 e 5. O QUE QUEBRA, E QUEM TRAZ
          =================================================================== */}
      <div className={estilo.duasColunas} style={{ marginTop: 'var(--s5)' }}>
        <div className={estilo.bloco}>
          <Term nome="O que mais quebra" estado="12 meses" />
          <p className={estilo.dica}>
            Últimos 12 meses. Decide que peça vale ter em prateleira e em que aparelho treinar o
            técnico novo.
          </p>
          {aparelhos.length === 0 ? (
            <p className={estilo.vazio}>Sem ordens no período.</p>
          ) : (
            <div className={estilo.rolaX}>
              <table className={estilo.tabela}>
                <thead>
                  <tr>
                    <th>Aparelho</th>
                    <th className={estilo.dir}>O.S.</th>
                    <th className={estilo.dir}>Máquinas</th>
                  </tr>
                </thead>
                <tbody>
                  {aparelhos.map((a) => (
                    <tr key={`${a.marca}-${a.modelo}`}>
                      <td>
                        <span className={estilo.forte}>{a.marca}</span> {a.modelo}
                      </td>
                      <td className={`${estilo.num} ${estilo.dir}`}>{a.n}</td>
                      {/* MÁQUINAS DISTINTAS separa duas situações que se parecem
                          no total: dez ordens de dez máquinas é um modelo
                          popular; dez ordens de duas é um modelo que VOLTA — e a
                          segunda merece conversa sobre trocar. */}
                      <td className={`${estilo.num} ${estilo.dir}`}>
                        <span className={a.n >= a.aparelhos * 2 ? estilo.indAlerta : undefined}>
                          {a.aparelhos}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
            Quando as O.S. são o dobro das máquinas, o modelo está voltando.
          </p>
        </div>

        <div className={estilo.bloco}>
          <Term nome="Quem traz o trabalho" estado="12 meses" />
          <p className={estilo.dica}>
            Últimos 12 meses. Costuma-se descobrir tarde que metade vem de três clientes.
          </p>
          {clientes.length === 0 ? (
            <p className={estilo.vazio}>Sem ordens no período.</p>
          ) : (
            <div className={estilo.rolaX}>
              <table className={estilo.tabela}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className={estilo.dir}>O.S.</th>
                    {comDinheiro ? <th className={estilo.dir}>Faturado</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/painel/clientes/${c.id}`} className={estilo.forte}>
                          {c.nome}
                        </Link>
                      </td>
                      <td className={`${estilo.num} ${estilo.dir}`}>{c.ordens}</td>
                      {comDinheiro ? (
                        <td className={`${estilo.num} ${estilo.dir}`}>
                          {formatarBRL(c.faturadoCentavos)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================
          6. O DINHEIRO
          =================================================================== */}
      {comDinheiro ? (
        <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
          <Term nome="Faturado e recebido" estado="mês a mês" />
          <p className={estilo.texto} style={{ maxWidth: '70ch' }}>
            São coisas diferentes, e a diferença entre elas é o buraco do caixa: faturar trinta mil
            e receber dezoito significa <strong>doze mil na rua</strong>. O gráfico do Financeiro
            mostra o que entrou e saiu do caixa; este mostra o que foi vendido contra o que foi
            pago.
          </p>
          <BarrasDuplas
            dados={dinheiro.map((m) => ({
              mes: m.mes,
              a: m.faturadoCentavos,
              b: m.recebidoCentavos,
            }))}
            titulo="Faturado e recebido em cada um dos últimos meses"
            rotuloA="faturado"
            rotuloB="recebido"
            formatar={curtoBRL}
          />
          <Base
            cabecalho={['Mês', 'Faturado', 'Recebido', 'Diferença']}
            linhas={dinheiro.map((m) => [
              rotuloMes(m.mes),
              formatarBRL(m.faturadoCentavos),
              formatarBRL(m.recebidoCentavos),
              formatarBRL(m.faturadoCentavos - m.recebidoCentavos),
            ])}
          />
        </div>
      ) : null}

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        Todos os números vêm do banco no instante em que a tela abriu. Nada aqui é estimativa: as
        bases embaixo de cada gráfico são as mesmas linhas que o desenho usa.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// OS DESENHOS
// ---------------------------------------------------------------------------

/**
 * Duas séries, barras lado a lado.
 *
 * O par de cores é o mesmo do resto do sistema — violeta para o TRABALHO, âmbar
 * para o que sai/entra em contraponto. Elas se separam também por luminosidade,
 * e não só por matiz: quem não distingue as duas cores continua vendo qual
 * barra é mais clara.
 */
function BarrasDuplas({
  dados,
  titulo,
  rotuloA,
  rotuloB,
  formatar,
}: {
  dados: Array<{ mes: string; a: number; b: number }>
  titulo: string
  rotuloA: string
  rotuloB: string
  formatar: (n: number) => string
}) {
  const maior = Math.max(...dados.flatMap((d) => [d.a, d.b]), 1)
  const teto = arredondarParaCima(maior)
  const largura = (L - EIXO) / Math.max(dados.length, 1)
  const barra = Math.min(26, (largura - 14) / 2)

  return (
    <>
      <div className={estilo.grafico}>
        <svg viewBox={`0 0 ${L} ${A}`} className={estilo.grafSvg} role="img" aria-label={titulo}>
          <title>{titulo}</title>

          {/* Três linhas só. Mais que isso vira gaiola e compete com as barras,
              que são o dado. A de baixo é a linha de base: sem ela, um mês sem
              movimento fica idêntico a um mês que não existe. */}
          {[0, 0.5, 1].map((f) => {
            const y = TOPO + UTIL * (1 - f)
            return (
              <g key={f}>
                <line x1={EIXO} x2={L} y1={y} y2={y} className={estilo.grafGrade} />
                <text x={EIXO - 6} y={y + 4} textAnchor="end" className={estilo.grafEscala}>
                  {formatar(teto * f)}
                </text>
              </g>
            )
          })}

          {dados.map((d, i) => {
            const meio = EIXO + i * largura + largura / 2
            const hA = Math.round((d.a / teto) * UTIL)
            const hB = Math.round((d.b / teto) * UTIL)
            return (
              <g key={d.mes}>
                <rect
                  x={meio - barra - 2}
                  y={TOPO + UTIL - hA}
                  width={barra}
                  height={Math.max(hA, d.a > 0 ? 2 : 0)}
                  rx={3}
                  className={estilo.grafEntra}
                />
                <rect
                  x={meio + 2}
                  y={TOPO + UTIL - hB}
                  width={barra}
                  height={Math.max(hB, d.b > 0 ? 2 : 0)}
                  rx={3}
                  className={estilo.grafSai}
                />
                <text x={meio} y={A - 8} textAnchor="middle" className={estilo.grafRotulo}>
                  {rotuloMes(d.mes)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <p className={estilo.grafLegenda}>
        <span>
          <i className={`${estilo.grafPonto} ${estilo.grafPontoEntra}`} aria-hidden="true" />{' '}
          {rotuloA}
        </span>
        <span>
          <i className={`${estilo.grafPonto} ${estilo.grafPontoSai}`} aria-hidden="true" /> {rotuloB}
        </span>
      </p>
    </>
  )
}

/**
 * Uma série só, com o valor escrito no topo de cada barra.
 *
 * `v` é NULO no mês que não teve o fato — e nulo não é zero. Zero é um valor
 * medido ("entregamos no mesmo dia"); nulo é a ausência de medida ("não houve
 * entrega"). O mês nulo não ganha barra nenhuma; o mês zerado ganha um traço
 * mínimo com o número em cima, porque ele aconteceu.
 */
function BarrasSimples({
  dados,
  titulo,
  sufixo,
  formatar,
  vazio,
}: {
  dados: Array<{ mes: string; v: number | null }>
  titulo: string
  sufixo: string
  formatar: (n: number) => string
  vazio: string
}) {
  const medidos = dados.filter((d) => d.v !== null)
  // Grade sem nenhuma barra é pior que texto: ela parece um gráfico quebrado.
  if (medidos.length === 0) return <p className={estilo.vazio}>{vazio}</p>

  const maior = Math.max(...medidos.map((d) => d.v ?? 0), 1)
  const teto = arredondarParaCima(maior)
  const largura = (L - EIXO) / Math.max(dados.length, 1)
  const barra = Math.min(34, largura - 14)

  return (
    <div className={estilo.grafico}>
      <svg viewBox={`0 0 ${L} ${A}`} className={estilo.grafSvg} role="img" aria-label={titulo}>
        <title>{titulo}</title>

        {[0, 0.5, 1].map((f) => {
          const y = TOPO + UTIL * (1 - f)
          return (
            <g key={f}>
              <line x1={EIXO} x2={L} y1={y} y2={y} className={estilo.grafGrade} />
              <text x={EIXO - 6} y={y + 4} textAnchor="end" className={estilo.grafEscala}>
                {formatar(teto * f)}
                {sufixo}
              </text>
            </g>
          )
        })}

        {dados.map((d, i) => {
          const meio = EIXO + i * largura + largura / 2
          const h = d.v === null ? 0 : Math.round((d.v / teto) * UTIL)
          return (
            <g key={d.mes}>
              {d.v === null ? null : (
                <>
                  <rect
                    x={meio - barra / 2}
                    y={TOPO + UTIL - h}
                    width={barra}
                    // O traço mínimo do mês zerado: ele foi medido, e some se
                    // a altura for a que a proporção manda.
                    height={Math.max(h, 2)}
                    rx={3}
                    className={estilo.grafEntra}
                  />
                  {/* O NÚMERO NO TOPO. Barra sem número obriga a estimar, e
                      estimativa não entra em conversa de decisão. */}
                  <text
                    x={meio}
                    y={TOPO + UTIL - h - 4}
                    textAnchor="middle"
                    className={estilo.grafValor}
                  >
                    {formatar(d.v)}
                  </text>
                </>
              )}
              <text x={meio} y={A - 8} textAnchor="middle" className={estilo.grafRotulo}>
                {rotuloMes(d.mes)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * A BASE do gráfico — os mesmos números, em tabela.
 *
 * Não é redundância: é o que permite conferir, copiar para uma mensagem e ler
 * com leitor de tela. Um gráfico sem base é uma afirmação sem fonte.
 */
function Base({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <details className={estilo.baseNumeros}>
      <summary>Ver os números</summary>
      <div className={estilo.rolaX}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              {cabecalho.map((c, i) => (
                <th key={c} className={i > 0 ? estilo.dir : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l[0]}>
                {l.map((v, i) => (
                  <td key={`${l[0]}-${i}`} className={i > 0 ? `${estilo.num} ${estilo.dir}` : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

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

/**
 * A escala sobe até um número REDONDO acima do maior valor.
 *
 * Encostar o topo no maior valor faz a barra mais alta tocar a borda, e barra
 * que toca a borda parece cortada. Rótulo redondo também é o que permite
 * estimar as barras do meio sem medir nenhuma.
 */
function arredondarParaCima(n: number): number {
  if (n <= 0) return 1
  const casa = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / casa) * casa
}

/** 'set' — três letras, que é o que cabe embaixo de uma barra. */
function rotuloMes(mes: string): string {
  const d = new Date(`${mes}-15T12:00:00-03:00`)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' })
    .format(d)
    .replace('.', '')
}

/** 'R$ 12,4 mil' — na escala, o valor cheio não cabe. */
function curtoBRL(centavos: number): string {
  const reais = centavos / 100
  if (reais >= 1000) return `${Math.round(reais / 100) / 10} mil`
  return String(Math.round(reais))
}
