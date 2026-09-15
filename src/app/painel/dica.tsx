import estilo from './painel.module.css'

/**
 * A DICA QUE DEVOLVE A PALAVRA AO DESENHO.
 *
 * =============================================================================
 * POR QUE ELA EXISTE
 * =============================================================================
 * Ícone sozinho economiza a coluna e PERDE o nome. A dica devolve o nome sem
 * devolver a largura: ela só ocupa espaço no instante em que alguém pergunta.
 *
 * `focus-within` e não só `hover`, no CSS: quem atravessa a tabela com Tab
 * nunca passa o mouse, e sem isso o teclado ficaria com os ícones mudos.
 *
 * =============================================================================
 * ELA NÃO É O NOME ACESSÍVEL — É UM SEGUNDO
 * =============================================================================
 * O nome de verdade vem do `aria-label` de quem está dentro, porque a dica não
 * existe onde não há mouse nem foco: celular e tablet. Por isso o `aria-hidden`
 * do texto — sem ele o leitor de tela leria duas vezes, "Editar, Editar o
 * cadastro de Lucas", e a repetição atrapalha justamente quem depende dele.
 *
 * =============================================================================
 * POR QUE MORA AQUI, E NÃO DENTRO DE CADA TELA
 * =============================================================================
 * Ela nasceu nas ações do cliente e a segunda cópia ia nascer no estoque. Duas
 * cópias divergem na primeira correção feita só de um lado — e o lado esquecido
 * é sempre o que alguém usa.
 */
export default function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <span className={estilo.comDica} data-dica={texto} aria-hidden={false}>
      {children}
    </span>
  )
}
