import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import type { FaixaDeIdade, FatiaCategoria, MesDoFluxo } from '@/server/consultas/caixa'
import GraficoFluxo from './grafico-fluxo'
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
  idade,
  mesExtenso,
}: {
  fluxo: MesDoFluxo[]
  saidas: FatiaCategoria[]
  entradas: FatiaCategoria[]
  formas: Array<{ forma: string; totalCentavos: number; quantidade: number }>
  devedores: Array<{ id: string; nome: string; totalCentavos: number; vencidoCentavos: number }>
  idade: FaixaDeIdade[]
  mesExtenso: string
}) {
  const temFluxo = fluxo.some((m) => m.entrouCentavos > 0 || m.saiuCentavos > 0)

  return (
    <>
      {/* AS BARRAS SUBIRAM PARA O TOPO DA TELA, e aqui ficou a tabela.
          O gráfico agora abre o Financeiro, acima da barra de abas — ou seja,
          ele já está desenhado nesta mesma página, algumas linhas acima.
          Repeti-lo aqui não acrescentaria leitura nenhuma e faria duvidar de
          que são os mesmos dados.
          O que esta aba ainda tem de exclusivo é o NÚMERO EXATO de cada mês, e
          é ele que fica. */}
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>
          <span>Entrou e saiu, mês a mês</span>
          <span className={estilo.fraco}>o gráfico está no alto da tela</span>
        </p>
        {temFluxo ? (
          <GraficoFluxo fluxo={fluxo} modo="tabela" />
        ) : (
          <p className={estilo.vazio}>
            Ainda não há caixa realizado para desenhar. O gráfico aparece assim que a primeira
            fatura for baixada ou a primeira conta for paga.
          </p>
        )}
      </div>

      {/* =====================================================================
          A IDADE DA DÍVIDA
          =====================================================================
          "R$ 18 mil a receber" e "R$ 18 mil a receber, sendo R$ 11 mil parados
          há mais de noventa dias" são duas empresas diferentes. O segundo
          número muda o que se faz na segunda-feira: dívida de noventa dias não
          se cobra por WhatsApp, e a de sete dias não se manda para protesto.

          O total daqui é MAIOR que o "a receber" de um mês só, de propósito:
          são todas as dívidas em aberto, de qualquer mês. Cobrança não tem
          competência mensal. */}
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Há quanto tempo o dinheiro está lá fora</p>
        <IdadeDaDivida faixas={idade} />
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

/**
 * A IDADE DA DÍVIDA, em faixas.
 *
 * A ordem vem da consulta e é cronológica — "A vencer" primeiro, "Mais de 90
 * dias" por último — e não por tamanho. Ordenar por valor faria a leitura
 * mudar de forma toda semana, e o que se quer aqui é justamente enxergar o
 * dinheiro DESCENDO a lista com o tempo.
 *
 * A faixa "Mais de 90 dias" é a única marcada em vermelho. Colorir as cinco
 * transformaria a lista num alarme constante, e alarme constante é ruído que se
 * aprende a ignorar — a mesma razão pela qual a linha vencida da tabela leva um
 * filete e não um fundo.
 */
function IdadeDaDivida({ faixas }: { faixas: FaixaDeIdade[] }) {
  if (faixas.length === 0) {
    return <p className={estilo.vazio}>Ninguém devendo. Nenhuma fatura nem cobrança em aberto.</p>
  }

  const total = faixas.reduce((s, f) => s + f.totalCentavos, 0)
  const maior = Math.max(...faixas.map((f) => f.totalCentavos), 1)
  const velha = faixas.find((f) => f.faixa === 'Mais de 90 dias')

  return (
    <>
      <ul className={estilo.grafBarras}>
        {faixas.map((f) => (
          <li key={f.faixa} className={estilo.grafBarraItem}>
            <span className={estilo.grafBarraNome}>{f.faixa}</span>
            <span className={estilo.grafBarraPista}>
              <span
                className={f.faixa === 'Mais de 90 dias' ? estilo.grafBarraSai : estilo.grafBarraEntra}
                style={{ width: `${Math.max(2, (f.totalCentavos / maior) * 100)}%` }}
              />
            </span>
            <span className={estilo.grafBarraValor}>
              {formatarBRL(f.totalCentavos)}
              <span className={estilo.fraco}>
                {' '}
                {Math.round((f.totalCentavos / total) * 100)}% · {f.quantidade}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className={estilo.dica}>
        {formatarBRL(total)} em aberto, somando fatura de serviço e cobrança avulsa — de qualquer
        mês, porque cobrança não tem competência mensal.
        {velha && velha.totalCentavos > 0
          ? ` ${formatarBRL(velha.totalCentavos)} está parado há mais de noventa dias: é o que raramente volta sozinho.`
          : ''}
      </p>
    </>
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
