import Link from 'next/link'
import estilo from '../painel.module.css'

/**
 * A BARRA DA ROTA — e por que quatro entradas de menu viraram uma.
 *
 * =============================================================================
 * O QUE ESTAVA ERRADO
 * =============================================================================
 * O menu oferecia quatro caminhos para a mesma pergunta — "cadê o motorista e o
 * que ele tem para hoje":
 *
 *   Agenda de rota   · o que está marcado
 *   Ao vivo          · onde ele está agora
 *   App do motorista · o que ele está vendo na mão
 *   App do técnico   · o que chegou na bancada
 *
 * Quatro itens numa lista de treze, todos sobre a mesma coisa, cada um exigindo
 * que a pessoa lembre qual dos quatro responde o que ela quer saber. Menu não é
 * índice de manual: ele existe para responder "onde eu clico", e quatro portas
 * para uma sala fazem exatamente o contrário.
 *
 * =============================================================================
 * A REGRA QUE ORGANIZOU ISTO
 * =============================================================================
 * **O que responde à mesma pergunta vira ABA, não item de menu.**
 *
 * Planejada e Ao vivo são o mesmo assunto em dois tempos — o que vai acontecer
 * e o que está acontecendo. Ficam lado a lado, e trocar entre eles é um clique
 * sem sair do lugar.
 *
 * =============================================================================
 * OS APLICATIVOS SAÍRAM DAQUI — E ESTA BARRA ERA O ESCONDERIJO DELES
 * =============================================================================
 * Eles eram dois botões à direita, e o comentário que estava aqui defendia
 * isso: "não são abas, são OUTRA superfície, feita para o celular de quem está
 * na rua". A frase é verdadeira; a conclusão estava errada.
 *
 * O resultado prático era: menu **O.S.** → aba **Rota** → botão. Três cliques,
 * e o dono do sistema foi procurar os aplicativos e não achou. Ser outra
 * superfície é justamente o motivo de precisarem de porta visível.
 *
 * Agora existe **Aplicativos** no menu, ao lado de O.S., e a tela de lá faz o
 * que dois botões nunca fariam: mostra o endereço para copiar, manda no
 * WhatsApp de quem está na rua, e ensina a instalar na tela inicial.
 *
 * O link daqui para lá continua, porque quem está olhando a agenda e quer
 * conferir o que o motorista vê na mão está a um clique do assunto certo. O que
 * mudou é que ele deixou de ser o ÚNICO caminho.
 */
export default function AbasDaRota({ atual }: { atual: 'planejada' | 'aoVivo' }) {
  /**
   * A ABA SE CHAMA "AGENDA", E NÃO "PLANEJADA".
   *
   * "Planejada / Ao vivo" faz um par bonito, e foi o primeiro nome. O teste
   * guiado pelo diagrama reprovou — e estava certo: o diagrama do sistema chama
   * aquilo de AGENDA, a equipe chama de agenda, e o endereço antigo era
   * `/painel/agenda`.
   *
   * Renomear o que a casa já sabe chamar não é organizar, é obrigar todo mundo
   * a reaprender uma palavra para ganhar simetria numa barra de duas abas. A
   * palavra da casa ganha.
   */
  return (
    <div className={estilo.rotaBarra}>
      <nav className={estilo.abas} aria-label="Visões da rota">
        <Link
          href="/painel/rota"
          className={atual === 'planejada' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
          aria-current={atual === 'planejada' ? 'page' : undefined}
        >
          Agenda
        </Link>
        <Link
          href="/painel/rota/ao-vivo"
          className={atual === 'aoVivo' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
          aria-current={atual === 'aoVivo' ? 'page' : undefined}
        >
          Ao vivo
        </Link>
      </nav>

      {/* Um link, e não dois botões de abrir. Quem está na agenda e quer
          conferir o que a equipe vê na mão continua a um clique — mas o assunto
          "aplicativos de campo" agora tem lugar próprio no menu, com o endereço
          para mandar a quem está na rua. Ver o cabeçalho deste arquivo. */}
      <div className={estilo.rotaApps}>
        <Link href="/painel/aplicativos" className={estilo.btnSec}>
          Aplicativos de campo
        </Link>
      </div>
    </div>
  )
}
