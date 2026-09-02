import { formatarBRL } from '@/lib/dinheiro'
import type { ResumoDoMes } from '@/server/consultas/caixa'
import estilo from '../painel.module.css'

/**
 * OS QUATRO CARTÕES — e a igualdade que os torna uma leitura.
 *
 * =============================================================================
 * TOTAL = PAGO + PENDENTE + ATRASADO
 * =============================================================================
 * Os quatro números fecham. Isso não é detalhe de apresentação: é o que permite
 * a quem bate o olho conferir a conta de cabeça, e é o que faz a tela avisar
 * sozinha no dia em que algo estiver errado. Quatro números que não se
 * relacionam são quatro fatos soltos; quatro que somam são uma leitura.
 *
 * A consulta garante a igualdade usando o valor PREVISTO nos quatro, inclusive
 * nas contas já pagas. Quando o que entrou de fato foi diferente — desconto,
 * juro, pagamento a menor — a diferença aparece como nota do cartão PAGO, que é
 * informação, e não um furo na soma.
 *
 * =============================================================================
 * O RECORTE É O VENCIMENTO, E A TELA DIZ ISSO
 * =============================================================================
 * Uma conta de agosto paga em setembro conta aqui em AGOSTO, e no caixa do mês
 * ("entrou/saiu", na faixa de baixo) em SETEMBRO. Os dois estão certos e
 * respondem perguntas diferentes: este diz o que o mês DEVIA, aquele diz o que
 * a conta bancária viu. Confundir os dois é o erro clássico de tela de
 * financeiro — então a tela escreve a distinção em vez de deixar quem lê
 * descobrir sozinho.
 *
 * =============================================================================
 * QUEM TROCA A DIREÇÃO É A BARRA DE ABAS — E SÓ ELA
 * =============================================================================
 * A primeira versão punha aqui um seletor "A receber | A pagar". A tela ficou
 * com DOIS links de mesmo nome apontando para o mesmo lugar, porque a barra de
 * abas logo abaixo já tem os dois — em TODA aba, não só nas duas de contas. A
 * bateria pegou contando os rótulos.
 *
 * Minha primeira correção foi errada e vale registrar por quê: escondi o
 * seletor apenas nas abas "A receber" e "A pagar", achando que a duplicação só
 * acontecia lá. Não: a barra carrega os dois rótulos o tempo todo, então a
 * duplicação existia em todas as outras abas também — e a bateria reprovou de
 * novo, na aba Faturas.
 *
 * Um controle a menos, e nada se perde: clicar em "A pagar" na barra leva à
 * aba onde os cartões já falam de a pagar. Era exatamente o que o seletor
 * fazia, com um segundo botão para a mesma intenção.
 *
 * O título diz de qual direção os cartões estão falando ("Contas a receber ·
 * Setembro de 2026"), que é o que o seletor de fato informava.
 */
export default function QuatroCartoes({
  resumo,
  tipo,
  mesExtenso,
}: {
  resumo: ResumoDoMes
  tipo: 'PAGAR' | 'RECEBER'
  mesExtenso: string
}) {
  const p = tipo === 'PAGAR' ? PALAVRAS.pagar : PALAVRAS.receber
  const diferenca = resumo.liquidadoCentavos - resumo.pagoCentavos

  return (
    <section className={estilo.cartoesBloco} aria-label={`${p.titulo} em ${mesExtenso}`}>
      <div className={estilo.cartoesCab}>
        <p className={estilo.cartoesTitulo}>
          {p.titulo} <span className={estilo.fraco}>· {mesExtenso}</span>
        </p>
        {/* Ver o cabeçalho do arquivo: a troca de direção é da barra de abas, e
            repeti-la aqui punha dois links de mesmo nome na mesma tela. */}
      </div>

      <div className={`${estilo.resumo} ${estilo.resumo4}`}>
        <Cartao
          rotulo="Total do mês"
          valor={formatarBRL(resumo.totalCentavos)}
          nota={
            resumo.quantas === 0
              ? 'nada lançado neste mês'
              : resumo.quantasArrastadas > 0
                ? `${resumo.quantas} contas: as de ${mesExtenso.toLowerCase()} mais ${resumo.quantasArrastadas} atrasada${resumo.quantasArrastadas > 1 ? 's' : ''} de antes`
                : `${resumo.quantas} ${resumo.quantas === 1 ? 'conta' : 'contas'} com vencimento em ${mesExtenso.toLowerCase()}`
          }
        />
        <Cartao
          tom="ok"
          rotulo={p.pago}
          valor={formatarBRL(resumo.pagoCentavos)}
          nota={
            resumo.quantasPagas === 0
              ? p.nenhumaPaga
              : diferenca === 0
                ? `${resumo.quantasPagas} de ${resumo.quantas}`
                : // A diferença entre previsto e realizado é dita por extenso.
                  // Escondê-la faria a soma dos quatro cartões parecer errada
                  // para quem confere com o extrato do banco.
                  `${resumo.quantasPagas} de ${resumo.quantas} · ${p.entrou} ${formatarBRL(resumo.liquidadoCentavos)}${
                    diferenca < 0 ? ' (a menos)' : ' (a mais)'
                  }`
          }
        />
        <Cartao
          tom="espera"
          rotulo="Pendente"
          valor={formatarBRL(resumo.pendenteCentavos)}
          nota={
            resumo.quantasPendentes === 0
              ? 'nada por vencer'
              : `${resumo.quantasPendentes} ${resumo.quantasPendentes === 1 ? 'conta ainda vai vencer' : 'contas ainda vão vencer'}`
          }
        />
        <Cartao
          tom={resumo.atrasadoCentavos > 0 ? 'alerta' : undefined}
          rotulo="Atrasado"
          valor={formatarBRL(resumo.atrasadoCentavos)}
          nota={
            resumo.quantasAtrasadas === 0
              ? 'nada vencido em aberto'
              : resumo.quantasArrastadas > 0
                ? // Dívida velha e dívida do mês pedem cobranças diferentes: a
                  // de sete dias não se manda para protesto, e a de noventa não
                  // volta por WhatsApp. Por isso a nota separa as duas.
                  `${resumo.quantasAtrasadas} vencidas, de qualquer mês — ${formatarBRL(resumo.arrastadoCentavos)} arrastado de antes de ${mesExtenso.toLowerCase()}`
                : `${resumo.quantasAtrasadas} ${resumo.quantasAtrasadas === 1 ? 'conta venceu' : 'contas venceram'} e não ${resumo.quantasAtrasadas === 1 ? 'foi paga' : 'foram pagas'}`
          }
        />
      </div>

      <p className={estilo.dica}>
        Os quatro fecham: total = pago + pendente + atrasado. O recorte é o{' '}
        <strong>vencimento</strong> — pago e pendente são de {mesExtenso.toLowerCase()}, e atrasado é
        tudo que já venceu e continua em aberto, de qualquer mês. Quanto de fato passou pela conta
        bancária está logo abaixo, em &ldquo;entrou&rdquo; e &ldquo;saiu&rdquo;.
      </p>
    </section>
  )
}

const PALAVRAS = {
  pagar: {
    titulo: 'Contas a pagar',
    pago: 'Pago',
    entrou: 'saiu',
    nenhumaPaga: 'nada pago ainda',
  },
  receber: {
    titulo: 'Contas a receber',
    pago: 'Recebido',
    entrou: 'entrou',
    nenhumaPaga: 'nada recebido ainda',
  },
}

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string
  valor: string
  nota: string
  tom?: 'ok' | 'espera' | 'alerta'
}) {
  const classe =
    tom === 'ok'
      ? estilo.indOk
      : tom === 'espera'
        ? estilo.indEspera
        : tom === 'alerta'
          ? estilo.indAlerta
          : ''
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={`${estilo.indValor} ${classe}`.trim()}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
