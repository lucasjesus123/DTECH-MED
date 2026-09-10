import Link from 'next/link'
import estilo from '../painel.module.css'

export type AbaComercial = 'contatos' | 'orcamentos' | 'laudo'

/**
 * AS DUAS ABAS DO COMERCIAL.
 *
 * =============================================================================
 * POR QUE ABA, E NÃO DOIS ITENS DE MENU
 * =============================================================================
 * Contato do site e orçamento são o MESMO funil em dois tempos:
 *
 *     alguém pergunta  →  a gente responde com preço  →  vira ordem
 *          (lead)              (orçamento)               (serviço)
 *
 * Quem abre uma está fazendo a mesma coisa que quem abre a outra: procurando o
 * que ainda pode virar trabalho. É a mesma regra que juntou quatro entradas de
 * rota numa só — o que responde à mesma pergunta vira aba.
 *
 * O ganho no menu é concreto: o funil de orçamentos entrou no sistema sem
 * acrescentar linha nenhuma à lista lateral.
 */
export default function AbasComercial({ atual }: { atual: AbaComercial }) {
  /**
   * TRÊS ABAS, E O NOME DE CADA UMA É O MOMENTO DO PROCESSO.
   *
   * Existem DOIS orçamentos no sistema, e eles se chamam a mesma coisa na boca
   * de quem trabalha:
   *
   *   ORÇAMENTO (passo 1)   o preço que se manda para alguém que ainda está
   *                         decidindo se traz o aparelho
   *   DEPOIS DO LAUDO (7)   o preço de um aparelho que já está na oficina, com
   *                         defeito diagnosticado
   *
   * Chamar os dois de "Orçamentos" faria a pessoa acertar a aba por sorte.
   * Nomear pelo MOMENTO — "Orçamentos" para o que vem antes, "Depois do laudo"
   * para o que vem depois — é o que faz acertar de primeira.
   */
  const abas: Array<[AbaComercial, string, string]> = [
    ['contatos', 'Contatos do site', '/painel/contatos'],
    ['orcamentos', 'Orçamentos', '/painel/contatos?aba=orcamentos'],
    ['laudo', 'Depois do laudo', '/painel/contatos?aba=laudo'],
  ]

  return (
    <div className={estilo.rotaBarra}>
      <nav className={estilo.abas} aria-label="Visões do comercial">
        {abas.map(([chave, rotulo, href]) => (
          <Link
            key={chave}
            href={href}
            className={atual === chave ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={atual === chave ? 'page' : undefined}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
    </div>
  )
}
