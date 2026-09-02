import { formatarBRL } from '@/lib/dinheiro'
import type { LeituraDoMes, Panorama } from '@/server/consultas/caixa'
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
 */
export default function Leitura({
  panorama,
  leitura,
  mesExtenso,
  mesAnteriorExtenso,
}: {
  panorama: Panorama
  leitura: LeituraDoMes
  mesExtenso: string
  mesAnteriorExtenso: string
}) {
  const sobrouAnterior = leitura.entrouAnteriorCentavos - leitura.saiuAnteriorCentavos
  const variacao = comparar(panorama.entrouCentavos, leitura.entrouAnteriorCentavos)

  return (
    <section className={estilo.leitura} aria-label={`Leitura de ${mesExtenso}`}>
      <div className={estilo.leituraBloco}>
        <p className={estilo.leituraTitulo}>O caixa de {mesExtenso.toLowerCase()}</p>
        <p className={estilo.leituraLinha}>
          Entrou <strong className={estilo.indOk}>{formatarBRL(panorama.entrouCentavos)}</strong>,
          saiu <strong>{formatarBRL(panorama.saiuCentavos)}</strong>, sobrou{' '}
          <strong className={panorama.sobrouCentavos < 0 ? estilo.indAlerta : estilo.indOk}>
            {formatarBRL(panorama.sobrouCentavos)}
          </strong>
          .
        </p>
        <p className={estilo.leituraNota}>
          {panorama.entrouDeAvulso > 0
            ? `${formatarBRL(panorama.entrouDeServico)} de serviço e ${formatarBRL(panorama.entrouDeAvulso)} avulso. `
            : ''}
          Em {mesAnteriorExtenso.toLowerCase()} entraram {formatarBRL(leitura.entrouAnteriorCentavos)}{' '}
          e sobraram {formatarBRL(sobrouAnterior)}
          {variacao ? ` — ${variacao}` : ''}.
        </p>
      </div>

      <div className={estilo.leituraBloco}>
        <p className={estilo.leituraTitulo}>Se tudo do mês for pago</p>
        <p className={estilo.leituraLinha}>
          O mês fecha em{' '}
          <strong className={leitura.projetadoCentavos < 0 ? estilo.indAlerta : estilo.indOk}>
            {formatarBRL(leitura.projetadoCentavos)}
          </strong>
          .
        </p>
        <p className={estilo.leituraNota}>
          {formatarBRL(leitura.receberDoMesCentavos)} a receber contra{' '}
          {formatarBRL(leitura.pagarDoMesCentavos)} a pagar, tudo que vence em{' '}
          {mesExtenso.toLowerCase()} — pago ou não.{' '}
          {leitura.projetadoCentavos < 0
            ? 'Vence mais do que entra: falta cobrir a diferença ou adiar alguma saída.'
            : ''}
        </p>
      </div>

      <div className={estilo.leituraBloco}>
        <p className={estilo.leituraTitulo}>Próximos 7 dias</p>
        <p className={estilo.leituraLinha}>
          Sai <strong>{formatarBRL(leitura.pagar7Centavos)}</strong>, entra{' '}
          <strong>{formatarBRL(leitura.receber7Centavos)}</strong>.
        </p>
        <p className={estilo.leituraNota}>
          {leitura.pagar7Quantas + leitura.receber7Quantas === 0
            ? 'Nada vence nesta semana.'
            : `${leitura.pagar7Quantas} ${leitura.pagar7Quantas === 1 ? 'conta a pagar' : 'contas a pagar'} e ${leitura.receber7Quantas} a receber vencem até lá. A semana atravessa a virada do mês.`}
        </p>
      </div>
    </section>
  )
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
