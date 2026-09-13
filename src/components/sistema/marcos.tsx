import { marcosDaOrdem, type SituacaoDoMarco } from '@/lib/esteira'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import estilo from './pecas.module.css'

/**
 * OS TRÊS MARCOS DA O.S. (`<Marcos>`) — coleta, serviço, devolução.
 *
 * =============================================================================
 * O QUE ELE RESPONDE, E EM QUANTO TEMPO
 * =============================================================================
 * "Onde está o meu aparelho?" é a pergunta que o cliente faz ao telefone e que
 * a atendente respondia lendo treze nomes de etapa. Três marcos respondem em um
 * olhar: o aparelho está sendo buscado, está na bancada, ou está voltando.
 *
 * Os treze degraus continuam existindo e continuam sendo o que move a esteira.
 * Isto é uma régua por cima deles, não um substituto.
 *
 * =============================================================================
 * NÃO É CANCELA — e a diferença aparece no HTML
 * =============================================================================
 * Nenhum marco aqui é clicável para "avançar", porque avançar não é decisão
 * dele. Quem move a O.S. é o botão-da-vez, que sabe o que o motor exige. Um
 * marco que parecesse um botão convidaria a pessoa a tentar pular a fila e
 * receber um "não" — o defeito que o redesenho veio tirar.
 *
 * Por isso são `<li>`, e não `<button>`. A forma do elemento conta a verdade
 * sobre o que ele faz antes de qualquer texto explicar.
 *
 * =============================================================================
 * COR NÃO É O ÚNICO SINAL, E ISSO NÃO É DETALHE
 * =============================================================================
 * A especificação pedia verde/laranja/vermelho neon. Duas coisas impediram:
 *
 *   · CONTRASTE. Verde neon sobre fundo claro fica em torno de 1,8:1 — o
 *     mínimo legível é 4,5:1. Quem tem baixa visão não lê, e quem enxerga bem
 *     cansa em meia hora de tela.
 *   · DALTONISMO. Cerca de 8% dos homens não distingue verde de vermelho. Uma
 *     régua de progresso que informa SÓ por cor não informa nada para eles.
 *
 * Aqui o estado é dito três vezes: pela cor (tokens já validados em AA), pela
 * FORMA (✓ preenchido, ponto vazado) e pela PALAVRA ("concluída", "agora",
 * "a fazer"). Tire a cor da tela e a informação continua de pé.
 */
export default function Marcos({ etapa }: { etapa: EtapaOrdem }) {
  const marcos = marcosDaOrdem(etapa)
  // Desvio — recusa, devolução sem reparo, cancelamento. A régua desaparece em
  // vez de mostrar três marcos apagados: uma O.S. que saiu do caminho não tem
  // progresso a exibir, e fingir que tem é a tela mentindo com cor.
  if (marcos.every((m) => m.situacao === 'adiante')) return null

  return (
    <ol className={estilo.marcos} aria-label="Andamento da ordem de serviço">
      {marcos.map((m) => (
        <li
          key={m.chave}
          className={`${estilo.marco} ${CLASSE[m.situacao]}`}
          aria-current={m.situacao === 'agora' ? 'step' : undefined}
        >
          <span className={estilo.marcoSelo} aria-hidden="true">
            {m.situacao === 'concluido' ? '✓' : m.numero}
          </span>
          <span className={estilo.marcoTxt}>
            <strong>{m.rotulo}</strong>
            {/* A palavra que sobrevive à falta de cor. */}
            <span className={estilo.marcoSituacao}>{PALAVRA[m.situacao]}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

const CLASSE: Record<SituacaoDoMarco, string> = {
  concluido: estilo.marcoFeito ?? '',
  agora: estilo.marcoAgora ?? '',
  adiante: '',
}

const PALAVRA: Record<SituacaoDoMarco, string> = {
  concluido: 'concluída',
  agora: 'agora',
  adiante: 'a fazer',
}
