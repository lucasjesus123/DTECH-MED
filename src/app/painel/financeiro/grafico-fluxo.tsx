import { formatarBRL, formatarBRLCurto } from '@/lib/dinheiro'
import type { MesDoFluxo } from '@/server/consultas/caixa'
import estilo from '../painel.module.css'

/**
 * ENTROU E SAIU, MÊS A MÊS — o gráfico que morava escondido.
 *
 * =============================================================================
 * POR QUE ELE SAIU DE DENTRO DE "RELATÓRIOS"
 * =============================================================================
 * Ele vivia na sétima aba do Financeiro. É o desenho que responde, sem ler
 * nenhum número, a única pergunta que todo dono faz sobre o próprio caixa:
 * **está entrando mais do que sai, ou não?** — e estava a dois cliques de
 * distância, atrás de uma aba chamada "Relatórios", que é o nome do lugar aonde
 * se vai quando sobra tempo.
 *
 * Agora ele abre a tela, ao lado dos números do mês. A aba de relatórios
 * continua mostrando o MESMO componente, e não uma cópia — duas cópias
 * divergiriam na primeira correção feita só de um lado.
 *
 * =============================================================================
 * POR QUE O PAR DE CORES NÃO É VERDE E VERMELHO
 * =============================================================================
 * Ver o cabeçalho de `relatorios.tsx`: o defeito de verde contra vermelho não é
 * de matiz, é de LUMINÂNCIA — os dois têm praticamente o mesmo brilho, e em
 * escala de cinza, impresso ou com sol na tela as barras viram o mesmo tom.
 * Aqui a cor nunca é o único canal: a posição (entrou à esquerda, saiu à
 * direita) e a tabela abaixo dizem a mesma coisa sem ela.
 */
/**
 * Os três jeitos de mostrar a mesma coisa.
 *
 *   compacto  as barras, baixas, sem a tabela. É o topo do Financeiro: ali o
 *             gráfico divide a linha com os números do mês e responde de
 *             relance; quem quiser o valor exato clica em Relatórios.
 *   tabela    só os números. É o que sobra para Relatórios DEPOIS de o gráfico
 *             ter subido para o topo — desenhar as mesmas barras duas vezes na
 *             mesma tela não acrescenta nada e faz duvidar de que sejam os
 *             mesmos dados.
 *   completo  os dois. Ninguém usa hoje, e ele fica porque é o que a função
 *             faz por inteiro: um modo que existe sozinho é um modo que alguém
 *             vai querer quando a tela mudar de novo.
 */
export type ModoDoFluxo = 'completo' | 'compacto' | 'tabela'

export default function GraficoFluxo({
  fluxo,
  modo = 'completo',
}: {
  fluxo: MesDoFluxo[]
  modo?: ModoDoFluxo
}) {
  const compacto = modo === 'compacto'
  const L = 760
  const A = compacto ? 170 : 250
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
      {modo === 'tabela' ? null : (
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
                  {formatarBRLCurto(teto * f)}
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
      </>
      )}

      {/* A TABELA NÃO É REDUNDÂNCIA: é a única forma de ler o número exato, e
          a única que um leitor de tela consegue percorrer — um gráfico sozinho
          é uma imagem, bonita para quem vê e muda para quem não vê.

          No topo da tela ela fica de fora: lá o gráfico é um relance, e quem
          quer o número exato clica em Relatórios, onde ela está inteira. */}
      {compacto ? null : (
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
      )}
    </>
  )
}

/**
 * A escala sobe até um número REDONDO acima do maior valor — ver o corpo.
 */
function arredondarParaCima(centavos: number): number {
  const ordem = 10 ** Math.floor(Math.log10(centavos))
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (centavos <= ordem * passo) return ordem * passo
  }
  return ordem * 10
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${ano!.slice(2)}`
}
