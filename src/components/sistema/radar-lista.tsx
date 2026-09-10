import Link from 'next/link'
import type { LinhaRadar } from '@/server/sistema/radar'
import BotaoDaVez from './botao-da-vez'
import { Chip } from './pecas'
import estilo from './pecas.module.css'

/**
 * O <RadarList> — a lista de ações pendentes.
 *
 * =============================================================================
 * NAVEGAR É EXCEÇÃO; AGIR É A REGRA
 * =============================================================================
 * A diferença entre esta lista e uma lista comum está na última coluna. Numa
 * lista comum, clicar numa linha abre a ficha, e é de dentro da ficha que se
 * age — dois cliques e uma tela de contexto entre a pessoa e o trabalho dela.
 *
 * Aqui o botão está NA LINHA. Quem tem dez aparelhos para receber na bancada
 * dá dez cliques, sem sair da tela. A ficha continua a um clique de distância,
 * para quem precisa olhar antes de agir — mas ela deixou de ser obrigatória.
 *
 * =============================================================================
 * O QUE CADA LINHA DIZ, E POR QUE NESSA ORDEM
 * =============================================================================
 * Número da O.S. · aparelho · cliente · há quanto tempo parado · o botão.
 *
 * O "há quanto tempo" é o dado que quase nenhum sistema mostra e é o que muda
 * decisão: cinco aparelhos esperando análise são cinco linhas iguais até
 * alguém dizer que um deles está parado há onze dias. Ele só ganha cor quando
 * dói — abaixo de três dias é operação normal, e pintar tudo de laranja
 * ensinaria a ignorar o laranja.
 */

function tempoParado(dias: number): { texto: string; classe: string | undefined } {
  if (dias <= 0) return { texto: 'hoje', classe: '' }
  if (dias === 1) return { texto: 'ontem', classe: '' }
  if (dias < 4) return { texto: `há ${dias} dias`, classe: '' }
  if (dias < 10) return { texto: `parado há ${dias} dias`, classe: estilo.parado }
  return { texto: `parado há ${dias} dias`, classe: estilo.paradoMuito }
}

export function RadarRow({ linha }: { linha: LinhaRadar }) {
  const t = tempoParado(linha.diasParado)

  return (
    <div className={estilo.linha}>
      <div className={estilo.linhaTxt}>
        <div className={estilo.linhaTopo}>
          <Link href={`/sistema/ordens/${linha.id}`} className={estilo.linhaNumero}>
            O.S. {String(linha.numero).padStart(5, '0')}
          </Link>
          <Chip tom={linha.estado.tom}>{linha.estado.rotulo}</Chip>
          {linha.urgente ? <Chip tom="danger">Prioridade alta</Chip> : null}
          {linha.atrasada ? <Chip tom="danger">Prazo vencido</Chip> : null}
        </div>

        <Link href={`/sistema/ordens/${linha.id}`} className={estilo.linhaTitulo}>
          {linha.equipamento}
        </Link>

        <div className={estilo.linhaApoio}>
          <span>{linha.cliente}</span>
          <span aria-hidden="true">·</span>
          <span className={t.classe}>{t.texto}</span>
          {linha.tecnico ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{linha.tecnico}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className={estilo.linhaAcao}>
        {linha.acao ? (
          <BotaoDaVez ordemId={linha.id} acao={linha.acao} />
        ) : (
          // Linha sem ação para esta pessoa aparece assim mesmo, dizendo de
          // quem é a bola. Sumir com ela responderia "não é seu problema"
          // quando a pergunta era "onde está meu aparelho".
          <Chip tom="pending">Com {linha.estado.quemAge}</Chip>
        )}
      </div>
    </div>
  )
}

export default function RadarList({
  titulo,
  linhas,
  vazio,
}: {
  titulo: string
  linhas: LinhaRadar[]
  /** O que mostrar quando a fila acabou. Nunca uma tela crua. */
  vazio: React.ReactNode
}) {
  if (linhas.length === 0) return <>{vazio}</>

  return (
    <div className={estilo.radar}>
      <div className={estilo.radarTopo}>
        <h2 className={estilo.radarTitulo}>{titulo}</h2>
        <span className={estilo.radarQuantos}>
          {linhas.length} {linhas.length === 1 ? 'ITEM' : 'ITENS'}
        </span>
      </div>
      {linhas.map((l) => (
        <RadarRow key={l.id} linha={l} />
      ))}
    </div>
  )
}
