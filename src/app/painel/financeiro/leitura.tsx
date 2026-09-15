import { formatarBRL } from '@/lib/dinheiro'
import type { LeituraDoMes, MesDoFluxo, Panorama } from '@/server/consultas/caixa'
import GraficoFluxo from './grafico-fluxo'
import estilo from '../painel.module.css'

/**
 * A LEITURA DO MÊS — o que o sistema sabia e não estava dizendo.
 *
 * =============================================================================
 * TRÊS PERGUNTAS, TRÊS RESPOSTAS, NENHUMA CONTA FEITA DE CABEÇA
 * =============================================================================
 * O topo da tela responde o que o mês DEVE (os quatro cartões). Esta faixa
 * responde o resto, e cada pedaço existe porque alguém fazia a conta na mão:
 *
 * O CAIXA — entrou, saiu, sobrou. É o extrato: dinheiro que passou pela conta
 * bancária dentro do mês, venha de fatura de serviço ou de recebimento avulso.
 * Vem com a comparação com o mês anterior, porque "entrou R$ 42 mil" só quer
 * dizer alguma coisa ao lado de "e no mês passado foram R$ 51 mil".
 *
 * O FECHAMENTO PROJETADO — se tudo que vence este mês for pago, o mês fecha em
 * quanto. No dia 3 o extrato ainda não diz nada (dois dias de movimento não
 * contam um mês), e essa é justamente a pergunta que se faz no dia 3. O sistema
 * tinha todos os números para respondê-la e nunca tinha feito a conta.
 *
 * OS PRÓXIMOS SETE DIAS — o que aperta o caixa desta semana. A janela atravessa
 * a virada do mês de propósito: no dia 28, o que preocupa é o aluguel do dia 5,
 * e ele não está no mês da tela. Uma janela que parasse no dia 31 esconderia
 * justamente a semana que importa, todo fim de mês.
 *
 * =============================================================================
 * PROJETADO NÃO SOMA COM REALIZADO
 * =============================================================================
 * O projetado é competência pura: a receber do mês menos a pagar do mês.
 * Somá-lo ao "sobrou" contaria duas vezes tudo que já foi pago dentro do próprio
 * mês — e produziria um número maior que a realidade, que é exatamente o tipo
 * de otimismo que faz alguém contratar em maio o salário que só teria em julho.
 *
 * =============================================================================
 * O GRÁFICO ENTROU AQUI, E AS TRÊS FRASES VIRARAM NÚMEROS
 * =============================================================================
 * Eram três blocos de texto corrido lado a lado — "Entrou R$ 23.335,00, saiu
 * R$ 0,00, sobrou R$ 23.335,00." — e texto corrido se LÊ, não se olha. Quem
 * abre o Financeiro de manhã com o telefone tocando não lê três parágrafos:
 * ele procura um número e uma direção.
 *
 * Agora a esquerda é o desenho de seis meses (estou entrando mais do que sai?)
 * e a direita são os três números empilhados, cada um com o rótulo em cima e a
 * explicação embaixo, em letra miúda, para quem precisar. A frase não sumiu —
 * ela desceu para onde frase deve estar.
 *
 * O gráfico é o MESMO componente da aba Relatórios, na versão compacta. Ele
 * respondia a pergunta mais básica sobre o caixa e estava a dois cliques de
 * distância, atrás de uma aba que é o nome do lugar aonde se vai quando sobra
 * tempo.
 */
export default function Leitura({
  panorama,
  leitura,
  fluxo,
  mesExtenso,
  mesAnteriorExtenso,
}: {
  panorama: Panorama
  leitura: LeituraDoMes
  fluxo: MesDoFluxo[]
  mesExtenso: string
  mesAnteriorExtenso: string
}) {
  const sobrouAnterior = leitura.entrouAnteriorCentavos - leitura.saiuAnteriorCentavos
  const variacao = comparar(panorama.entrouCentavos, leitura.entrouAnteriorCentavos)
  const temFluxo = fluxo.some((m) => m.entrouCentavos > 0 || m.saiuCentavos > 0)
  const seteDias = leitura.receber7Centavos - leitura.pagar7Centavos

  return (
    <section className={estilo.caixaTopo} aria-label={`Leitura de ${mesExtenso}`}>
      <div className={estilo.caixaGrafico}>
        <p className={estilo.blocoTitulo}>
          <span>Entrou e saiu, mês a mês</span>
          <span className={estilo.fraco}>o que passou pela conta</span>
        </p>
        {temFluxo ? (
          <GraficoFluxo fluxo={fluxo} modo="compacto" />
        ) : (
          <p className={estilo.vazio}>
            Ainda não há caixa realizado para desenhar. O gráfico aparece assim que a primeira
            fatura for baixada ou a primeira conta for paga.
          </p>
        )}
      </div>

      <div className={estilo.caixaNumeros}>
        {/* O CAIXA REALIZADO. É o extrato: dinheiro que passou pela conta
            bancária dentro do mês, venha de fatura ou de recebimento avulso. */}
        <div className={estilo.fechoLinha}>
          <span className={estilo.grav}>O caixa de {mesExtenso.toLowerCase()}</span>
          <strong className={`${estilo.fechoValor} ${tom(panorama.sobrouCentavos)}`}>
            {formatarBRL(panorama.sobrouCentavos)}
          </strong>
          <span className={estilo.fechoConta}>
            <span className={estilo.indOk}>+{formatarBRL(panorama.entrouCentavos)}</span> entrou ·{' '}
            <span>−{formatarBRL(panorama.saiuCentavos)}</span> saiu
          </span>
          <span className={estilo.fechoNota}>
            {panorama.entrouDeAvulso > 0
              ? `${formatarBRL(panorama.entrouDeServico)} de serviço e ${formatarBRL(panorama.entrouDeAvulso)} avulso. `
              : ''}
            Em {mesAnteriorExtenso.toLowerCase()} sobraram {formatarBRL(sobrouAnterior)}
            {variacao ? ` — ${variacao} de entrada` : ''}.
          </span>
        </div>

        {/* O FECHAMENTO PROJETADO. No dia 3 o extrato ainda não diz nada — dois
            dias de movimento não contam um mês —, e é justamente no dia 3 que
            se faz esta pergunta. */}
        <div className={estilo.fechoLinha}>
          <span className={estilo.grav}>Se tudo do mês for pago</span>
          <strong className={`${estilo.fechoValor} ${tom(leitura.projetadoCentavos)}`}>
            {formatarBRL(leitura.projetadoCentavos)}
          </strong>
          <span className={estilo.fechoConta}>
            <span className={estilo.indOk}>+{formatarBRL(leitura.receberDoMesCentavos)}</span> a
            receber · <span>−{formatarBRL(leitura.pagarDoMesCentavos)}</span> a pagar
          </span>
          <span className={estilo.fechoNota}>
            Tudo que vence em {mesExtenso.toLowerCase()} — pago ou não.{' '}
            {leitura.projetadoCentavos < 0
              ? 'Vence mais do que entra: falta cobrir a diferença ou adiar alguma saída.'
              : ''}
          </span>
        </div>

        {/* OS PRÓXIMOS SETE DIAS. A janela atravessa a virada do mês de
            propósito: no dia 28 o que preocupa é o aluguel do dia 5, e ele não
            está no mês da tela. */}
        <div className={estilo.fechoLinha}>
          <span className={estilo.grav}>Próximos 7 dias</span>
          <strong className={`${estilo.fechoValor} ${tom(seteDias)}`}>
            {formatarBRL(seteDias)}
          </strong>
          <span className={estilo.fechoConta}>
            <span className={estilo.indOk}>+{formatarBRL(leitura.receber7Centavos)}</span> entra ·{' '}
            <span>−{formatarBRL(leitura.pagar7Centavos)}</span> sai
          </span>
          <span className={estilo.fechoNota}>
            {leitura.pagar7Quantas + leitura.receber7Quantas === 0
              ? 'Nada vence nesta semana.'
              : `${leitura.pagar7Quantas} ${leitura.pagar7Quantas === 1 ? 'conta a pagar' : 'contas a pagar'} e ${leitura.receber7Quantas} a receber vencem até lá — a semana atravessa a virada do mês.`}
          </span>
        </div>
      </div>
    </section>
  )
}

/**
 * A COR DO NÚMERO — e por que zero não é verde.
 *
 * A primeira versão pintava de verde tudo que não fosse negativo, e a tela de
 * uma empresa sem movimento nenhum saía com três "R$ 0,00" em verde-sinal,
 * como se fosse boa notícia. Zero não é bom nem ruim: é a ausência do fato.
 * Verde ali gasta o único sinal que a tela tem para dizer "sobrou dinheiro".
 */
function tom(centavos: number): string {
  if (centavos < 0) return estilo.indAlerta!
  if (centavos > 0) return estilo.indOk!
  return ''
}

/**
 * "23% mais que no mês passado" — ou nada, quando a comparação mentiria.
 *
 * Com base zero não existe porcentagem: a variação de 0 para 4.000 é infinita,
 * e escrever "400000% a mais" é ruído com cara de informação. Nesse caso a
 * função devolve string vazia e a frase simplesmente não tem a comparação.
 */
function comparar(agora: number, antes: number): string {
  if (antes <= 0) return ''
  const pct = Math.round(((agora - antes) / antes) * 100)
  if (pct === 0) return 'praticamente igual'
  return pct > 0 ? `${pct}% a mais` : `${Math.abs(pct)}% a menos`
}
