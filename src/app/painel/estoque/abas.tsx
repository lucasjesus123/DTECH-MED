import Link from 'next/link'
import estilo from '../painel.module.css'

export type AbaEstoque = 'itens' | 'ferramentas' | 'compras' | 'movimentos'

/**
 * AS QUATRO ABAS DO ESTOQUE.
 *
 * =============================================================================
 * POR QUE ELAS EXISTEM
 * =============================================================================
 * A tela era uma só e respondia uma pergunta só: "o que tem". Empilhar as
 * outras três embaixo dela faria a página crescer para três dobras de rolagem,
 * e as duas informações mais acionáveis do estoque — o que comprar e com quem
 * está a ferramenta — ficariam no rodapé, onde ninguém chega.
 *
 * São quatro perguntas diferentes, feitas por pessoas diferentes, em momentos
 * diferentes do dia:
 *
 *   ITENS       o que tem, e quanto dá para prometer   (técnico, no orçamento)
 *   FERRAMENTAS com quem está cada uma                 (quem abre a oficina)
 *   COMPRAS     o que vai faltar, e o que encalhou     (quem paga a conta)
 *   MOVIMENTOS  por que o saldo é este                 (quem confere)
 *
 * =============================================================================
 * A ABA NÃO É PERMISSÃO
 * =============================================================================
 * As quatro vivem sob a mesma chave `estoque` do catálogo de telas, porque são
 * a mesma informação em quatro desenhos. Quem alcança o estoque alcança as
 * quatro. Uma chave por aba obrigaria todo mundo a voltar em "Pessoas e
 * acessos" para marcar três caixas novas, sem nenhum ganho de controle — e o
 * que de fato trava (cadastrar, movimentar, emprestar) é o PAPEL, conferido
 * dentro de cada ação do servidor.
 */
const ABAS: Array<[AbaEstoque, string]> = [
  ['itens', 'Itens'],
  ['ferramentas', 'Ferramentas'],
  ['compras', 'Compras'],
  ['movimentos', 'Movimentos'],
]

export default function AbasEstoque({ atual }: { atual: AbaEstoque }) {
  return (
    <div className={estilo.rotaBarra}>
      <nav className={estilo.abas} aria-label="Visões do estoque">
        {ABAS.map(([chave, rotulo]) => (
          <Link
            key={chave}
            href={chave === 'itens' ? '/painel/estoque' : `/painel/estoque?ver=${chave}`}
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
