import Link from 'next/link'
import estilo from './painel.module.css'

/**
 * A ASSINATURA DO CONSOLE — quatro peças, e é delas que vem a "vida".
 *
 * =============================================================================
 * O QUE ESTAS QUATRO RESOLVEM
 * =============================================================================
 * O painel tinha escala média em tudo: título de 22px, número de 28px, rótulo
 * de 13px. Tudo perto de tudo. É isso — e não a falta de efeito — que deixa uma
 * tela morna: quando nada é muito maior que nada, o olho não tem para onde ir
 * primeiro e lê a tela como um parágrafo.
 *
 * O salto é o instrumento: um número de 56px ao lado de um rótulo de 10px em
 * caixa alta espaçada. A distância entre os dois é a hierarquia.
 *
 * =============================================================================
 * CAIXA ALTA É DESENHO, NÃO CONTEÚDO
 * =============================================================================
 * Todo texto aqui é escrito em caixa NORMAL e virado em caixa alta pelo CSS.
 *
 * Não é preciosismo: leitor de tela lê "RECEITA" letra por letra em vários
 * motores — "erre, é, cê, e, i, tê, a" — e o mesmo vale para as siglas que a
 * tela inventa. Escrevendo "Receita" no HTML, quem enxerga vê RECEITA e quem
 * ouve ouve "receita".
 *
 * Pelo mesmo motivo o pip, as barras `//` e as setas `›››` são decoração
 * declarada: eles separam visualmente e não acrescentam nada a quem ouve.
 */

// ---------------------------------------------------------------------------
// TERM — o cabeçalho de tudo
// ---------------------------------------------------------------------------

export type TomTerm = 'marca' | 'ia' | 'alerta' | 'quieto'

/**
 * `● › RECEITA // MTD`
 *
 * Substitui todo título solto de painel. A promessa é que o cabeçalho diga
 * sempre duas coisas: O QUE é o painel, e em que ESTADO ele está — o mês, a
 * contagem, "ao vivo", "parado". Título que diz só o nome obriga a pessoa a
 * procurar o estado dentro do conteúdo.
 *
 * O TOM `ia` NÃO É DECORATIVO. Teal neste sistema é tinta exclusiva de
 * inferência da máquina: quem vê um `Term` teal sabe, antes de ler, que o que
 * vem abaixo é conclusão do sistema e não dado registrado. Usar teal num painel
 * comum apagaria a única diferença que o operador tem para distinguir os dois.
 */
export function Term({
  nome,
  estado,
  tom = 'marca',
  className,
}: {
  nome: string
  /** O estado. Opcional: nem todo painel tem um. */
  estado?: string
  tom?: TomTerm
  className?: string
}) {
  const cor = {
    marca: estilo.termMarca,
    ia: estilo.termIa,
    alerta: estilo.termAlerta,
    quieto: estilo.termQuieto,
  }[tom]

  return (
    <p className={[estilo.term, cor, className].filter(Boolean).join(' ')}>
      <i className={estilo.termPip} aria-hidden="true" />
      <span className={estilo.termSeta} aria-hidden="true">
        {tom === 'ia' ? '⌁' : '›'}
      </span>
      <span className={estilo.termNome}>{nome}</span>
      {estado ? (
        <>
          {/* As barras são o separador do desenho, não texto. Entre chaves
              porque `//` solto em JSX é lido como início de comentário. */}
          <span className={estilo.termBarra} aria-hidden="true">
            {'//'}
          </span>
          <span className={estilo.termEstado}>{estado}</span>
        </>
      ) : null}
    </p>
  )
}

// ---------------------------------------------------------------------------
// EXEC — a ação, em linguagem de terminal
// ---------------------------------------------------------------------------

/**
 * `EXEC ››› DETALHES ↗`
 *
 * A pílula de ação secundária do console. Ela existe para o canto do painel —
 * "e se eu quiser ver isto por inteiro?" —, e por isso é discreta: não compete
 * com o botão primário da tela, que continua sendo o botão de sempre.
 *
 * Vira `<a>` quando tem destino e `<button>` quando tem ação. Um `<div>` com
 * `onClick` seria invisível para o teclado, e este componente vai aparecer em
 * dezenas de painéis.
 */
export function Exec({
  children,
  href,
  onClick,
  tom = 'marca',
}: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  tom?: 'marca' | 'ia'
}) {
  const classe = [estilo.exec, tom === 'ia' ? estilo.execIa : ''].filter(Boolean).join(' ')
  const conteudo = (
    <>
      <span className={estilo.execRotulo} aria-hidden="true">
        exec
      </span>
      <span className={estilo.execSetas} aria-hidden="true">
        ›››
      </span>
      <span className={estilo.execTexto}>{children}</span>
      <span className={estilo.execSaida} aria-hidden="true">
        ↗
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classe}>
        {conteudo}
      </Link>
    )
  }
  return (
    <button type="button" className={classe} onClick={onClick}>
      {conteudo}
    </button>
  )
}

// ---------------------------------------------------------------------------
// DELTA — a variação
// ---------------------------------------------------------------------------

/**
 * `↗ +12%` · `↘ −18%` · `⌁ 82%`
 *
 * =============================================================================
 * A SETA VEM DO SINAL. A COR VEM DE QUEM CHAMA. E ISSO É O PONTO.
 * =============================================================================
 * A direção que originou este componente dizia: subiu é verde, desceu é
 * vermelho. Nesta operação isso pinta errado na metade dos casos.
 *
 * "+3 ordens atrasadas" subiu, e é a pior notícia do dia — sairia verde.
 * "−18% no tempo de bancada" desceu, e é a melhor — sairia vermelho.
 *
 * Subir não é bom; subir é subir. Quem sabe se aquilo é bom é a tela que está
 * mostrando o número, e por isso o `tom` é obrigatório: não há valor padrão que
 * acerte, e um padrão que erra metade das vezes é pior que perguntar.
 */
export function Delta({
  valor,
  tom,
  sufixo = '%',
}: {
  /** O número com sinal. Zero é legítimo e sai sem seta. */
  valor: number
  /** `bom` verde · `ruim` vermelho · `atencao` âmbar · `ia` teal · `neutro` */
  tom: 'bom' | 'ruim' | 'atencao' | 'ia' | 'neutro'
  sufixo?: string
}) {
  const cor = {
    bom: estilo.deltaBom,
    ruim: estilo.deltaRuim,
    atencao: estilo.deltaAtencao,
    ia: estilo.deltaIa,
    neutro: estilo.deltaNeutro,
  }[tom]

  // O menos é o SINAL DE MENOS (U+2212), e não o hífen. Na mono do sistema o
  // hífen fica curto e alto, e "−18" com hífen parece um traço de separação.
  const texto =
    valor === 0
      ? `0${sufixo}`
      : `${valor > 0 ? '+' : '−'}${Math.abs(valor).toLocaleString('pt-BR')}${sufixo}`

  return (
    <span className={[estilo.delta, cor].filter(Boolean).join(' ')}>
      <span className={estilo.deltaSeta} aria-hidden="true">
        {tom === 'ia' ? '⌁' : valor > 0 ? '↗' : valor < 0 ? '↘' : '·'}
      </span>
      {texto}
    </span>
  )
}

// ---------------------------------------------------------------------------
// BIGNUMBER — o número-herói
// ---------------------------------------------------------------------------

/**
 * O número grande, com brilho.
 *
 * =============================================================================
 * UM POR TELA. O SEGUNDO MATA O PRIMEIRO.
 * =============================================================================
 * Ele funciona por ser o único: é o que o olho encontra antes de ler qualquer
 * coisa, e é assim que a tela responde a pergunta principal em um relance. Dois
 * números-herói na mesma tela são dois candidatos a "o mais importante", e o
 * olho, sem conseguir escolher, volta a varrer tudo — que é exatamente o
 * estado anterior, com fonte maior.
 *
 * Isto não é imposto por código: nada impede alguém de pôr dois. É regra de
 * revisão, e está escrita aqui porque é aqui que ela será lida.
 *
 * O `sufixo` fica menor e colado, para "90 dias" e "R$ 12,4 mil" não roubarem
 * a escala do número. O brilho só existe no tema escuro — sobre branco, halo
 * vira borrão.
 */
export function BigNumber({
  valor,
  sufixo,
  tom = 'marca',
  rotulo,
}: {
  valor: string
  sufixo?: string
  tom?: 'marca' | 'ia' | 'alerta'
  /** Lido por leitor de tela junto com o número — sem ele, "12" não diz nada. */
  rotulo?: string
}) {
  const cor = {
    marca: estilo.bigMarca,
    ia: estilo.bigIa,
    alerta: estilo.bigAlerta,
  }[tom]

  return (
    <strong className={[estilo.big, cor].filter(Boolean).join(' ')}>
      {rotulo ? <span className={estilo.soLeitor}>{rotulo}: </span> : null}
      {/* O VALOR TEM ELEMENTO PRÓPRIO, e não é filho solto do `strong`.
          Sem ele, quem lê a tela de fora — teste, extensão, leitor — recebe o
          rótulo e o número grudados: "Ordens abertas em 12 meses: 24" vira
          "1224" para qualquer coisa que extraia só os dígitos. */}
      <span className={estilo.bigValor}>{valor}</span>
      {sufixo ? <span className={estilo.bigSufixo}>{sufixo}</span> : null}
    </strong>
  )
}
