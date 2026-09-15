import Link from 'next/link'
import Dica from '../dica'
import estilo from '../painel.module.css'

/**
 * O QUE SE FAZ COM UM ITEM, NA PRÓPRIA LINHA.
 *
 * =============================================================================
 * ERAM DUAS PALAVRAS, E UMA PORTA FECHADA
 * =============================================================================
 * A última coluna trazia "ficha · editar" escritos por extenso, em minúscula,
 * no fim de uma tabela de onze colunas. Duas palavras repetidas duzentas vezes
 * fazem barulho sem dizer nada — e quem corre o olho pela lista procurando uma
 * peça tropeça nelas em toda linha.
 *
 * Viraram desenho, com o mesmo vocabulário dos clientes: `.btnIcone` para o
 * botão, a dica para devolver a palavra, e o `aria-label` dizendo o nome do
 * item — porque onde não há mouse a dica não existe, e sem o rótulo o leitor
 * de tela anuncia "link" sem dizer de qual peça.
 *
 * =============================================================================
 * POR QUE NÃO HÁ UM ÍCONE DE "FICHA"
 * =============================================================================
 * Porque já há duas portas para ela na mesma linha: o nome do item e a foto.
 * Um terceiro link para o mesmo lugar não dá nenhuma saída nova — e cobra de
 * quem usa leitor de tela, que ouviria "Abrir a ficha de Fonte chaveada 24V"
 * três vezes seguidas antes de chegar ao que muda.
 *
 * =============================================================================
 * A SEGUNDA PORTA JÁ EXISTIA NO SERVIDOR E NÃO TINHA MAÇANETA
 * =============================================================================
 * A aba Movimentos sempre aceitou `?peca=<id>` e sabia filtrar o livro-razão de
 * um item só. Nenhuma tela linkava para lá: para ver o extrato de uma peça era
 * preciso saber que o parâmetro existia e digitá-lo na barra do navegador.
 *
 * É a pergunta que aparece exatamente aqui — "por que o saldo desta é 3?" — e
 * agora ela tem resposta a um clique de distância.
 */
export default function AcoesDoItem({ id, nome }: { id: string; nome: string }) {
  return (
    <span className={estilo.acoesLinha}>
      <Dica texto="Editar">
        <Link
          href={`/painel/estoque/${id}?editar=1`}
          className={estilo.btnIcone}
          aria-label={`Corrigir o cadastro de ${nome}`}
        >
          <IconeLapis />
        </Link>
      </Dica>

      <Dica texto="Movimentos deste item">
        <Link
          href={`/painel/estoque?ver=movimentos&peca=${id}`}
          className={estilo.btnIcone}
          aria-label={`Ver os movimentos de ${nome}`}
        >
          <IconeExtrato />
        </Link>
      </Dica>
    </span>
  )
}

/* Dois caminhos de SVG desenhados aqui, pelo mesmo motivo dos clientes: uma
   dependência inteira para dois traços é peso que o navegador baixa sem
   precisar. `currentColor` faz cada um herdar a cor do botão. */

const svg = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconeLapis() {
  return (
    <svg {...svg}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconeExtrato() {
  return (
    <svg {...svg}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3.5-4 3 2.5L18 8" />
    </svg>
  )
}
