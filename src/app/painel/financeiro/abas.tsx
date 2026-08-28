import Link from 'next/link'
import estilo from '../painel.module.css'
import { mesPorExtenso, mesVizinho } from '@/server/consultas/caixa'

export type AbaCaixa = 'receber' | 'pagar' | 'faturas' | 'recorrencias' | 'relatorios'

/**
 * A BARRA DO FINANCEIRO — cinco perguntas sobre dinheiro, uma tela.
 *
 * =============================================================================
 * POR QUE ABA, E NÃO CINCO ITENS NO MENU
 * =============================================================================
 * A mesma regra que reduziu quatro entradas de rota a uma: **o que responde à
 * mesma pergunta vira aba, não item de menu.** Contas a pagar, contas a receber,
 * faturas de serviço, recorrências e relatórios são cinco recortes de UMA
 * pergunta — "como está o dinheiro". Trocar entre eles é um clique sem sair do
 * lugar, e os números do topo continuam valendo em todos.
 *
 * =============================================================================
 * O MÊS FICA NA BARRA, E NÃO DENTRO DE CADA ABA
 * =============================================================================
 * Porque ele vale para as cinco. Um seletor por aba faria a pessoa trocar de
 * aba e voltar para agosto sem perceber que estava vendo julho — e comparar dois
 * meses achando que são o mesmo é o erro mais caro que uma tela de dinheiro
 * consegue causar.
 *
 * As setas carregam a aba atual e a aba carrega o mês atual: qualquer caminho
 * pela tela preserva as duas escolhas.
 */
export default function AbasDoCaixa({ atual, mes }: { atual: AbaCaixa; mes: string }) {
  const href = (aba: AbaCaixa) => `/painel/financeiro?aba=${aba}&mes=${mes}`

  /**
   * A ORDEM É A DO DIA, E FATURAS VEM PRIMEIRO.
   *
   * A primeira versão abria em "A receber", porque as contas novas eram a
   * novidade. O teste das 18 etapas reprovou, e com razão: emitir a fatura e
   * registrar o pagamento são o trabalho que TRAVA a esteira — enquanto não
   * acontecem, o aparelho de um cliente fica parado na oficina. Empurrar isso
   * para a terceira aba fez o financeiro abrir a tela e não achar o botão.
   *
   * Contas a pagar e a receber são o dinheiro da EMPRESA: importantes, e feitas
   * em lote uma vez por dia. Faturas são o dinheiro do CLIENTE, e chegam uma a
   * uma, o dia inteiro. O que chega o dia inteiro fica na porta.
   */
  const abas: Array<[AbaCaixa, string]> = [
    ['faturas', 'Faturas de serviço'],
    ['receber', 'A receber'],
    ['pagar', 'A pagar'],
    ['recorrencias', 'Recorrências'],
    ['relatorios', 'Relatórios'],
  ]

  return (
    <div className={estilo.rotaBarra}>
      <nav className={estilo.abas} aria-label="Visões do financeiro">
        {abas.map(([chave, rotulo]) => (
          <Link
            key={chave}
            href={href(chave)}
            className={atual === chave ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={atual === chave ? 'page' : undefined}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {/* O mês. As setas são links de verdade — dá para abrir num mês em outra
          aba do navegador e comparar dois períodos lado a lado. */}
      <div className={estilo.mesTroca}>
        <Link
          href={`/painel/financeiro?aba=${atual}&mes=${mesVizinho(mes, -1)}`}
          className={estilo.mesSeta}
          aria-label="Mês anterior"
          rel="prev"
        >
          ‹
        </Link>
        <strong className={estilo.mesNome}>{mesPorExtenso(mes)}</strong>
        <Link
          href={`/painel/financeiro?aba=${atual}&mes=${mesVizinho(mes, 1)}`}
          className={estilo.mesSeta}
          aria-label="Mês seguinte"
          rel="next"
        >
          ›
        </Link>
      </div>
    </div>
  )
}
