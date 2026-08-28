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
 * Os aplicativos de campo não são abas: eles são OUTRA superfície, feita para o
 * celular de quem está na rua. Viram botões, à direita, com o verbo "abrir" —
 * que é o que descreve o que acontece.
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

      {/* Os aplicativos de campo. Abrem em ABA NOVA de propósito: quem clica
          aqui está conferindo, e vai querer voltar para onde estava sem perder
          o filtro e a rolagem da agenda. */}
      <div className={estilo.rotaApps}>
        <a href="/app/motorista" target="_blank" rel="noreferrer" className={estilo.btnSec}>
          Abrir app do motorista
        </a>
        <a href="/app/tecnico" target="_blank" rel="noreferrer" className={estilo.btnSec}>
          Abrir app do técnico
        </a>
      </div>
    </div>
  )
}
