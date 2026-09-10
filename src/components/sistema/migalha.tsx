'use client'

import { usePathname } from 'next/navigation'
import estilo from './shell.module.css'

/**
 * A MIGALHA — `● SYS // ONLINE · OPERAÇÃO DIÁRIA // ORDENS DE SERVIÇO`
 *
 * =============================================================================
 * ELA NÃO É ENFEITE, E ESSA É A PARTE QUE PRECISA SER DEFENDIDA
 * =============================================================================
 * Um rótulo em monoespaçada no topo da tela dá "cara de sistema de verdade" —
 * é o que a direção pede. Mas cara sem função vira decoração, e a regra desta
 * casa é que nada entra na tela sem comunicar estado.
 *
 * Então ela carrega duas informações reais:
 *
 *   1. ONDE VOCÊ ESTÁ — o grupo e a tela, no vocabulário do menu. Quem chegou
 *      por um link da busca, do WhatsApp ou do painel de outra pessoa não
 *      passou pelo menu e não tem de onde deduzir.
 *
 *   2. SE A MÁQUINA ESTÁ DE PÉ — o ponto. Verde e pulsando é tudo no ar; parado
 *      e vermelho é o WhatsApp caído, que é a falha mais silenciosa do sistema:
 *      quando o número cai, nada na tela muda e os avisos ao cliente
 *      simplesmente param de sair.
 *
 * O ponto PARA de pulsar no estado ruim de propósito. Um indicador que se mexe
 * sempre deixa de ser indicador — o olho aprende a ignorá-lo, e no dia em que
 * mudar de cor ninguém repara.
 *
 * A tela é descoberta pelo caminho, e não passada por cada página, porque a
 * alternativa é catorze páginas lembrando de declarar onde estão — e uma delas
 * esquecendo.
 */

export type ItemMigalha = { href: string; grupo: string; rotulo: string }

export default function Migalha({
  telas,
  saudavel,
  motivo,
}: {
  telas: ItemMigalha[]
  /** Tudo no ar? Hoje isso quer dizer: o WhatsApp da empresa está conectado. */
  saudavel: boolean
  /** O que está errado, para quem passar o mouse. */
  motivo?: string
}) {
  const caminho = usePathname()

  // A mais ESPECÍFICA que casa. Sem o desempate por tamanho, `/sistema` casaria
  // com tudo e a migalha diria "Painel" em toda tela do sistema.
  const atual = telas
    .filter((t) => (t.href === '/sistema' ? caminho === '/sistema' : caminho.startsWith(t.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]

  return (
    <p className={estilo.migalha}>
      <i
        className={saudavel ? estilo.pulso : `${estilo.pulso} ${estilo.pulsoRuim}`}
        title={saudavel ? 'Tudo no ar' : motivo}
        aria-hidden="true"
      />
      <span>SYS // {saudavel ? 'ONLINE' : 'ATENÇÃO'}</span>
      {atual ? (
        <>
          <span className={estilo.migalhaSep}>·</span>
          <span>{atual.grupo}</span>
          {/* Entre chaves: solto no JSX, `//` é lido como início de comentário. */}
          <span className={estilo.migalhaSep}>{'//'}</span>
          <span className={estilo.migalhaAqui}>{atual.rotulo}</span>
        </>
      ) : null}
    </p>
  )
}
