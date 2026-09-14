import estilo from '../../painel.module.css'

/**
 * A O.S. EM PDF — um link, e não um botão com lógica.
 *
 * ---------------------------------------------------------------------------
 * A PRIMEIRA VERSÃO ERA UM BOTÃO, E NÃO FUNCIONAVA
 * ---------------------------------------------------------------------------
 * Ela abria uma aba em branco no clique, pedia o PDF ao servidor e, com o
 * endereço na mão, mandava a aba para lá. Funcionava no papel. Na tela, a aba
 * ficava em branco e nada explicava por quê — sem erro no console, sem alerta,
 * sem pista. O navegador dá pouca margem para uma janela aberta num clique e
 * apontada só depois.
 *
 * O conserto não foi insistir: foi tirar o passo. O endereço é fixo
 * (`os.pdf` ao lado da ficha), então isto pode ser um `<a>` comum — o navegador
 * abre como abre qualquer link, e quem recebe o pedido monta o PDF e devolve.
 *
 * Também não precisa ser componente de cliente: não há estado, não há clique
 * para tratar. Menos peças, e as que sobraram são as que o navegador já sabe
 * operar sozinho.
 */
export default function OsEmPdf({ ordemId }: { ordemId: string }) {
  return (
    <a
      href={`/painel/ordens/${ordemId}/os.pdf`}
      target="_blank"
      rel="noreferrer"
      className={estilo.btnPrimario}
    >
      O.S. em PDF
    </a>
  )
}
