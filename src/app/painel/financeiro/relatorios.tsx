import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import type { FatiaCategoria, MesDoFluxo } from '@/server/consultas/caixa'
import estilo from '../painel.module.css'

/**
 * RELATÓRIOS — os gráficos.
 *
 * =============================================================================
 * POR QUE O PAR DE CORES NÃO É VERDE E VERMELHO
 * =============================================================================
 * Não é pelo motivo que se costuma dar. Medi os dois pares simulando
 * deuteranopia, protanopia e tritanopia, e verde contra vermelho SEPARA por
 * matiz: `#0F6B4F` contra `#A8203C` dá ΔE 72 em deuteranopia, bem acima do
 * limiar. O argumento fácil do "daltônico não distingue" simplesmente não se
 * confirma nesse par.
 *
 * O defeito real é outro, e é de LUMINÂNCIA. Verde 0,112 contra vermelho 0,097
 * — praticamente o mesmo brilho. Em escala de cinza, impresso, num projetor
 * ruim ou com sol na tela, as duas barras viram o mesmo tom e o gráfico deixa
 * de dizer qual é qual. Cor não pode ser o ÚNICO canal, e ali ela é.
 *
 * O par daqui usa os tokens da casa: VIOLETA (`--vio`) para o que entra, ÂMBAR
 * (`--espera`) para o que sai. No tema escuro a distância de luminância é 0,198
 * contra 0,579 — as barras continuam distinguíveis sem cor nenhuma. E são cores
 * que já existem no sistema: verde não é token deste projeto, e introduzi-lo só
 * para um gráfico criaria um significado novo que nenhuma outra tela ensina.
 *
 * =============================================================================
 * SVG ESCRITO À MÃO, SEM BIBLIOTECA
 * =============================================================================
 * São três gráficos com geometria de uma linha cada. Uma biblioteca de gráficos
 * custaria mais de rede do que a tela inteira pesa hoje, e traria consigo o
 * primeiro `<script>` externo do painel — que é exatamente o que a política de
 * segurança de conteúdo existe para impedir.
 *
 * Cada gráfico tem `<title>` e uma tabela equivalente em texto logo abaixo. Um
 * gráfico sozinho não é acessível a leitor de tela, e "está no gráfico" não é
 * resposta para quem precisa do número exato.
 */

export default function Relatorios({
  fluxo,
  saidas,
  entradas,
  formas,
  devedores,
  mesExtenso,
}: {
  fluxo: MesDoFluxo[]
  saidas: FatiaCategoria[]
  entradas: FatiaCategoria[]
  formas: Array<{ forma: string; totalCentavos: number; quantidade: number }>
  devedores: Array<{ id: string; nome: string; totalCentavos: number; vencidoCentavos: number }>
  mesExtenso: string
}) {
  const temFluxo = fluxo.some((m) => m.entrouCentavos > 0 || m.saiuCentavos > 0)

  return (
    <>
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Entrou e saiu, mês a mês</p>
        {temFluxo ? (
          <GraficoFluxo fluxo={fluxo} />
        ) : (
          <p className={estilo.vazio}>
            Ainda não há caixa realizado para desenhar. O gráfico aparece assim que a primeira
            fatura for baixada ou a primeira conta for paga.
          </p>
        )}
      </div>

      <div className={estilo.duasColunas}>
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Para onde foi o dinheiro em {mesExtenso}</p>
          <Barras fatias={saidas} tom="sai" vazio="Nenhuma conta paga neste mês." />
        </div>

        <div className={estilo.bloco}>
          {/* O par do bloco ao lado. "Fora as ordens" era enxuto demais: quem
              lê precisa saber que este quadro conta o dinheiro que NÃO nasceu
              de um conserto — contrato, locação, peça no balcão. */}
          <p className={estilo.blocoTitulo}>De onde veio o dinheiro avulso</p>
          <Barras
            fatias={entradas}
            tom="entra"
            vazio="Nenhum recebimento avulso neste mês. O que entrou de serviço está no gráfico acima."
          />
        </div>
      </div>

      <div className={estilo.duasColunas}>
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Como o dinheiro entrou em {mesExtenso}</p>
          {formas.length === 0 ? (
            <p className={estilo.vazio}>Nada recebido neste mês.</p>
          ) : (
            <div className={estilo.pares}>
              {formas.map((f) => (
                <div key={f.forma} className={estilo.par}>
                  <span className={estilo.parRot}>{rotuloForma(f.forma)}</span>
                  <span className={estilo.parVal} style={{ fontWeight: 600 }}>
                    {formatarBRL(f.totalCentavos)}
                  </span>
                  <span className={estilo.fraco}>
                    {f.quantidade} {f.quantidade === 1 ? 'recebimento' : 'recebimentos'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Quem está segurando o caixa</p>
          {/* Junta a fatura do conserto com o lançamento avulso do MESMO cliente.
              Vê-las em duas telas é o que faz alguém cobrar R$ 400 de quem já
              deve R$ 6.000. */}
          {devedores.length === 0 ? (
            <p className={estilo.vazio}>Ninguém devendo. Aproveite.</p>
          ) : (
            <ul className={estilo.caixaLista}>
              {devedores.map((d) => (
                <li key={d.id} className={estilo.caixaItem}>
                  <div className={estilo.caixaMeio}>
                    <strong className={estilo.caixaDesc}>
                      <Link href={`/painel/clientes/${d.id}`}>{d.nome}</Link>
                    </strong>
                    {d.vencidoCentavos > 0 ? (
                      <p className={estilo.caixaDetalhe}>
                        <span className={`${estilo.tag} ${estilo.tagAlerta}`}>
                          {formatarBRL(d.vencidoCentavos)} vencidos
                        </span>
                      </p>
                    ) : (
                      <p className={estilo.fraco}>tudo dentro do prazo</p>
                    )}
                  </div>
                  <div className={estilo.caixaValor}>
                    <strong>{formatarBRL(d.totalCentavos)}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        Os gráficos mostram o REALIZADO — o que de fato passou pelo caixa, com data de pagamento. O
        previsto está nos números do topo e nas abas A receber e A pagar. Somar os dois num número
        só produziria um faturamento que não bate nem com o banco nem com a previsão.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// O gráfico de barras dos meses
// ---------------------------------------------------------------------------

function GraficoFluxo({ fluxo }: { fluxo: MesDoFluxo[] }) {
  const L = 760
  const A = 250
  const EIXO = 62 // gutter da esquerda, onde ficam os valores da escala
  const PE = 26 // faixa dos meses, embaixo
  const TOPO = 10
  const alturaUtil = A - PE - TOPO
  const pista = L - EIXO

  /**
   * A escala sobe até um número REDONDO acima do maior valor.
   *
   * Encostar o topo no maior valor faz a barra mais alta tocar a borda, e uma
   * barra que toca a borda parece cortada — parece que o gráfico não coube.
   * Arredondar para cima também dá rótulos que se leem ("R$ 30.000,00" em vez
   * de "R$ 23.335,00"), e rótulo redondo é o que permite estimar as barras do
   * meio sem medir nenhuma.
   */
  const maior = Math.max(...fluxo.flatMap((m) => [m.entrouCentavos, m.saiuCentavos]), 1)
  const teto = arredondarParaCima(maior)

  const largura = pista / fluxo.length
  const barra = Math.min(30, (largura - 20) / 2)
  const linhas = [0, 0.5, 1]

  return (
    <>
      <div className={estilo.grafico}>
        <svg
          viewBox={`0 0 ${L} ${A}`}
          className={estilo.grafSvg}
          role="img"
          aria-label="Barras do que entrou e do que saiu em cada um dos últimos meses"
        >
          <title>Entrou e saiu, mês a mês</title>

          {/* Três linhas só. Mais que isso vira gaiola e compete com as barras,
              que são o dado. A de baixo é a linha de base: sem ela, um mês sem
              movimento nenhum fica idêntico a um mês que não existe. */}
          {linhas.map((f) => {
            const y = TOPO + alturaUtil * (1 - f)
            return (
              <g key={f}>
                <line x1={EIXO} x2={L} y1={y} y2={y} className={estilo.grafGrade} />
                <text x={EIXO - 8} y={y + 4} textAnchor="end" className={estilo.grafEscala}>
                  {curtoBRL(teto * f)}
                </text>
              </g>
            )
          })}

          {fluxo.map((m, i) => {
            const meio = EIXO + i * largura + largura / 2
            const hE = Math.round((m.entrouCentavos / teto) * alturaUtil)
            const hS = Math.round((m.saiuCentavos / teto) * alturaUtil)
            return (
              <g key={m.mes}>
                <rect
                  x={meio - barra - 2}
                  y={TOPO + alturaUtil - hE}
                  width={barra}
                  height={Math.max(hE, m.entrouCentavos > 0 ? 2 : 0)}
                  rx={3}
                  className={estilo.grafEntra}
                />
                <rect
                  x={meio + 2}
                  y={TOPO + alturaUtil - hS}
                  width={barra}
                  height={Math.max(hS, m.saiuCentavos > 0 ? 2 : 0)}
                  rx={3}
                  className={estilo.grafSai}
                />
                <text x={meio} y={A - 8} textAnchor="middle" className={estilo.grafRotulo}>
                  {rotuloMes(m.mes)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <p className={estilo.grafLegenda}>
        <span>
          <i className={`${estilo.grafPonto} ${estilo.grafPontoEntra}`} aria-hidden="true" /> entrou
        </span>
        <span>
          <i className={`${estilo.grafPonto} ${estilo.grafPontoSai}`} aria-hidden="true" /> saiu
        </span>
      </p>

      {/* A tabela não é redundância: é a única forma de ler o número exato, e a
          única que um leitor de tela consegue percorrer. */}
      <div className={estilo.rolaX}>
        <table className={estilo.tabela}>
          <caption className={estilo.grav}>Os mesmos números do gráfico</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Entrou</th>
              <th scope="col">Saiu</th>
              <th scope="col">Sobrou</th>
            </tr>
          </thead>
          <tbody>
            {fluxo.map((m) => {
              const sobrou = m.entrouCentavos - m.saiuCentavos
              return (
                <tr key={m.mes}>
                  <th scope="row">{rotuloMes(m.mes)}</th>
                  <td className={estilo.num}>{formatarBRL(m.entrouCentavos)}</td>
                  <td className={estilo.num}>{formatarBRL(m.saiuCentavos)}</td>
                  <td className={sobrou < 0 ? `${estilo.num} ${estilo.indAlerta}` : estilo.num}>
                    {formatarBRL(sobrou)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Barras horizontais por categoria
// ---------------------------------------------------------------------------

function Barras({
  fatias,
  tom,
  vazio,
}: {
  fatias: FatiaCategoria[]
  tom: 'entra' | 'sai'
  vazio: string
}) {
  if (fatias.length === 0) return <p className={estilo.vazio}>{vazio}</p>

  const total = fatias.reduce((s, f) => s + f.totalCentavos, 0)
  const maior = Math.max(...fatias.map((f) => f.totalCentavos), 1)

  return (
    <ul className={estilo.grafBarras}>
      {fatias.map((f) => {
        const parte = Math.round((f.totalCentavos / total) * 100)
        return (
          <li key={f.categoria} className={estilo.grafBarraItem}>
            <span className={estilo.grafBarraNome}>{f.categoria}</span>
            <span className={estilo.grafBarraPista}>
              <span
                className={tom === 'entra' ? estilo.grafBarraEntra : estilo.grafBarraSai}
                style={{ width: `${Math.max(2, (f.totalCentavos / maior) * 100)}%` }}
              />
            </span>
            <span className={estilo.grafBarraValor}>
              {formatarBRL(f.totalCentavos)}
              {/* A porcentagem responde "isso é muito?" — o valor sozinho não. */}
              <span className={estilo.fraco}> {parte}%</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------

/**
 * O próximo número redondo acima — 1, 2, 2,5 ou 5 vezes uma potência de dez.
 *
 * É a mesma família de passos que uma régua usa, e não é estética: são os
 * únicos múltiplos que a pessoa divide de cabeça enquanto olha. Um topo de
 * "R$ 23.335,00" obriga a fazer conta para estimar a barra do meio; um topo de
 * "R$ 30 mil" faz a metade ser quinze mil sem esforço nenhum.
 */
function arredondarParaCima(centavos: number): number {
  const ordem = 10 ** Math.floor(Math.log10(centavos))
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (centavos <= ordem * passo) return ordem * passo
  }
  return ordem * 10
}

/** 'R$ 30 mil' — a escala do eixo, curta o bastante para caber no gutter. */
function curtoBRL(centavos: number): string {
  const reais = centavos / 100
  if (reais === 0) return 'R$ 0'
  if (reais >= 1_000_000) return `R$ ${(reais / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (reais >= 1000) return `R$ ${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${ano!.slice(2)}`
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
