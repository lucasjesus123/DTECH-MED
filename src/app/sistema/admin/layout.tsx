import estilo from '@/components/sistema/pecas.module.css'

/**
 * A ADMINISTRAÇÃO É SEMPRE ESCURA.
 *
 * =============================================================================
 * PADRÃO 8: HIERARQUIA POR LUMINOSIDADE
 * =============================================================================
 * As telas de OPERAÇÃO seguem o tema que a pessoa escolheu. As de CONSTRUÇÃO —
 * o gerador de modelos, os acessos, as integrações, a configuração do tenant —
 * são escuras mesmo para quem escolheu claro.
 *
 * O olho aprende em dois dias: *claro é onde eu opero, escuro é onde eu
 * configuro*. Isso funciona antes da leitura, o que nenhum rótulo consegue — e
 * é o que impede alguém de mexer numa configuração achando que está operando.
 *
 * =============================================================================
 * COMO A TRAVA FUNCIONA
 * =============================================================================
 * `data-obra="sim"` reaponta o `color-scheme` para escuro dentro deste ramo, e
 * é só isso. Não existe uma "paleta de admin" — são os MESMOS tokens, com a
 * outra metade de cada `light-dark()` valendo. Uma segunda paleta seria uma
 * segunda lista de cores para manter, e um dia ela divergiria.
 *
 * A escolha de tema da pessoa não é apagada: ela continua gravada no cookie e
 * volta a valer assim que ela sai daqui.
 */
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div data-obra="sim" className={estilo.obra}>
      {children}
    </div>
  )
}
