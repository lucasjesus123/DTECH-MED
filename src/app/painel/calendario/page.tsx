import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba, podeVer } from '@/server/auth/guarda'
import {
  contagemPorDia,
  eventosNoPeriodo,
  type Evento,
  type TipoEvento,
} from '@/server/consultas/calendario'
import {
  gradeDoAno,
  gradeDoMes,
  hojeEmLajeado,
  resolverPeriodo,
  semanaDe,
  visaoValida,
  VISOES,
  type Periodo,
  type Visao,
} from '@/server/consultas/periodo'
import { pessoasDaEmpresa } from '@/server/consultas/listas'
import LancarNoDia from './lancar'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Calendário', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O CALENDÁRIO — o que vem por aí, em cinco visões.
 *
 * =============================================================================
 * POR QUE ELE É O ÚNICO ITEM DE MENU NOVO
 * =============================================================================
 * A regra da casa manda transformar tela nova em aba sempre que ela responde à
 * mesma pergunta de uma tela existente. Este não responde: ele atravessa SEIS
 * assuntos — rota, preventiva, contas a pagar, contas a receber, contratos e
 * compromissos — e a pergunta que faz, *"o que vem por aí"*, não é feita de
 * dentro de nenhum deles.
 *
 * =============================================================================
 * CINCO VISÕES, PORQUE A MESMA AGENDA É LIDA DE CINCO DISTÂNCIAS
 * =============================================================================
 *   DIA      o que tem HOJE, hora a hora, e onde se marca uma coisa nova
 *   SEMANA   a carga da semana — é aqui que se vê a terça sobrecarregada
 *   MÊS      o panorama, que é como se decide em que semana encaixar algo
 *   ANO      onde estão os picos do ano; serve para planejar férias e compra
 *   LISTA    a agenda corrida, para imprimir ou ler no celular
 *
 * Uma grade de mês sozinha obriga a fazer as outras quatro leituras na cabeça.
 * A de semana e a de dia mostram o dia inteiro sem o "+N mais" que a célula do
 * mês precisa ter — quem abre a semana quer justamente o que não coube.
 *
 * =============================================================================
 * O DIA EM FOCO ATRAVESSA AS VISÕES
 * =============================================================================
 * Uma âncora só, na URL: `dia`. Trocar de visão nunca perde o lugar — quem
 * estava em 15 de setembro no Dia e clica em Ano cai em 2026, e não em janeiro.
 * Ver `resolverPeriodo`.
 *
 * O endereço antigo (`?mes=AAAA-MM`) continua valendo como entrada: ele vira
 * foco no primeiro dia do mês, ou em hoje quando hoje cai nele. Links já
 * mandados por mensagem não podem quebrar porque a tela ganhou visões.
 *
 * =============================================================================
 * A COR SEPARA O QUE O SISTEMA DESCOBRIU DO QUE UMA PESSOA ESCREVEU
 * =============================================================================
 * Parada, preventiva e contrato terminando são consequência de outra coisa —
 * uma O.S., um contrato — e usam o violeta do trabalho. O compromisso é o que
 * alguém anotou à mão para aquele dia, e por isso tem cor própria: distinguir
 * "o que eu marquei" de "o que caiu na minha agenda" é o que faz alguém confiar
 * na grade.
 */
export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; so?: string; dia?: string; ver?: string }>
}) {
  const { ctx, sessao } = await exigirNivel(Papel.MOTORISTA)
  await exigirAba('calendario')
  const q = await searchParams

  const visao = visaoValida(q.ver)
  const hoje = hojeEmLajeado()

  const diaUrl = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? '') ? q.dia! : null
  const mesUrl = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes ?? '') ? q.mes! : null

  /**
   * O DIA EM FOCO — uma âncora só para as cinco visões.
   *
   * A ordem de preferência importa: o `dia` explícito manda; depois o `mes` do
   * endereço antigo, que aponta para hoje quando hoje cai nele (abrir "este
   * mês" e cair no dia 1 seria estranho) e para o dia 1 quando não cai.
   */
  const foco = diaUrl ?? (mesUrl ? (hoje.startsWith(mesUrl) ? hoje : `${mesUrl}-01`) : hoje)
  const periodo = resolverPeriodo(visao, foco)

  /**
   * NÃO HÁ MAIS CORTE DE DINHEIRO AQUI, porque não há mais dinheiro aqui.
   *
   * O calendário mostrava conta a pagar e a receber, e por isso precisava saber
   * quem pode ver dinheiro — sem esse corte, o motorista lia salário, aluguel e
   * quanto cada cliente deve. Retiradas as duas fontes, a trava some junto com
   * o motivo dela: nenhuma visão nova pode esquecer um corte que não existe.
   *
   * Vencimento se responde no FINANCEIRO, que tem o mês, o atraso, a idade da
   * dívida e o botão de dar baixa.
   */
  const so = FILTROS.some((f) => f.chave === q.so) ? (q.so as TipoEvento) : null

  /**
   * O PAINEL DE MARCAR abre quando o dia veio no endereço — e SEMPRE na visão
   * de dia, porque ali ele não é um extra: a visão de dia existe para olhar e
   * mexer num dia só.
   *
   * No ANO ele não abre. A visão do ano é de PANORAMA — olhar doze meses e
   * achar o pico. Um formulário de "marcar em 5 de setembro" pendurado embaixo
   * dela oferece uma ação de escala errada, e ainda empurra os doze meses para
   * cima da dobra em tela de notebook.
   */
  const diaAberto = visao === 'ano' ? null : visao === 'dia' ? periodo.dia : diaUrl

  /**
   * A visão de ANO pede CONTAGEM, não eventos.
   *
   * Ela desenha 365 quadradinhos e não usa título, detalhe nem valor de nada.
   * Buscar o ano inteiro em eventos completos traria milhares de linhas com
   * seis junções cada para pintar pontos — e bateria nos tetos por fonte, que
   * existem para a grade do mês: o ano apareceria truncado sem nada avisar.
   */
  const [eventos, contagem, pessoas] = await Promise.all([
    visao === 'ano'
      ? Promise.resolve([] as Evento[])
      : eventosNoPeriodo(ctx, periodo.inicio, periodo.fim),
    visao === 'ano'
      ? contagemPorDia(ctx, periodo.inicio, periodo.fim)
      : Promise.resolve(new Map<string, number>()),
    // Só quando há dia aberto: a lista da equipe não é usada na grade, e
    // buscá-la sempre seria uma consulta por carregamento de tela para nada.
    diaAberto ? pessoasDaEmpresa(ctx) : Promise.resolve([]),
  ])

  const filtrados = so ? eventos.filter((e) => e.tipo === so) : eventos

  const porDia = new Map<string, Evento[]>()
  for (const e of filtrados) {
    const lista = porDia.get(e.dia)
    if (lista) lista.push(e)
    else porDia.set(e.dia, [e])
  }

  const atrasados = filtrados.filter((e) => e.atrasado).length
  const naRua = filtrados.filter((e) => e.tipo === 'parada' || e.tipo === 'preventiva').length

  /** Monta um endereço desta tela mantendo o que não mudou. */
  const url = (troca: { ver?: Visao; dia?: string; so?: TipoEvento | null }) => {
    const v = troca.ver ?? visao
    const d = troca.dia ?? periodo.dia
    const s = troca.so === undefined ? so : troca.so
    return `/painel/calendario?ver=${v}&dia=${d}${s ? `&so=${s}` : ''}`
  }

  /**
   * "+ Novo evento" leva ao DIA, onde o painel de marcar já está aberto.
   *
   * O dia escolhido é HOJE quando hoje cai no período olhado, e o primeiro dia
   * do período quando não cai. Clicar em "novo evento" olhando dezembro e cair
   * em hoje seria perder o lugar; cair no dia 1 de dezembro é o que a pessoa
   * quis dizer.
   */
  const diaDoBotao = dentroDoPeriodo(hoje, periodo) ? hoje : primeiroDoPeriodo(periodo)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Hoje</p>
          <h1 className={estilo.titulo}>Calendário</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O que a equipe tem pela frente: paradas de rota, visitas preventivas, contratos
            terminando e o que alguém marcou no dia. Conta a pagar e a receber ficam no{' '}
            <Link href="/painel/financeiro">Financeiro</Link>.
          </p>
        </div>
        <Link className={estilo.btnPrimario} href={url({ ver: 'dia', dia: diaDoBotao })}>
          + Novo evento
        </Link>
      </div>

      <div className={estilo.resumo}>
        <Indicador
          rotulo={visao === 'ano' ? 'No ano' : 'No período'}
          valor={visao === 'ano' ? String(somar(contagem)) : String(filtrados.length)}
          nota="tudo que tem data"
        />
        <Indicador rotulo="Saídas de rua" valor={visao === 'ano' ? '—' : String(naRua)} nota="paradas e preventivas" />
        <Indicador
          rotulo="Contratos terminando"
          valor={visao === 'ano' ? '—' : String(filtrados.filter((e) => e.tipo === 'contrato').length)}
          nota="precisam de renovação"
        />
        <Indicador
          rotulo="Passou da data"
          valor={visao === 'ano' ? '—' : String(atrasados)}
          nota={visao === 'ano' ? 'abra um mês para ver' : atrasados > 0 ? 'ainda em aberto' : 'nada atrasado'}
          alerta={atrasados > 0}
        />
      </div>

      {/* A barra: as cinco visões à esquerda, a navegação do período à direita. */}
      <div className={estilo.rotaBarra}>
        <nav className={estilo.abas} aria-label="Como olhar o calendário">
          {VISOES.map(([v, rotulo]) => (
            <Link
              key={v}
              href={url({ ver: v })}
              className={visao === v ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
              aria-current={visao === v ? 'page' : undefined}
            >
              {rotulo}
            </Link>
          ))}
        </nav>

        <div className={estilo.mesTroca}>
          {/* O rótulo diz a UNIDADE que a seta anda, e não "período".
              Quem navega por leitor de tela ouve só o rótulo: "período
              anterior" não responde se o clique vai recuar um dia ou um ano, e
              é justamente essa a informação que a seta carrega. */}
          <Link
            href={url({ dia: periodo.anteriorDia })}
            className={estilo.mesSeta}
            aria-label={`${UNIDADE[visao]} anterior`}
            rel="prev"
          >
            ‹
          </Link>
          <strong className={estilo.mesNome}>{periodo.titulo}</strong>
          <Link
            href={url({ dia: periodo.proximoDia })}
            className={estilo.mesSeta}
            aria-label={`${UNIDADE[visao]} seguinte`}
            rel="next"
          >
            ›
          </Link>
          {/* "Hoje" só aparece quando não se está nele: um botão que não faz
              nada ensina que o botão não faz nada. */}
          {!dentroDoPeriodo(hoje, periodo) ? (
            <Link href={url({ dia: hoje })} className={estilo.btnSec}>
              Hoje
            </Link>
          ) : null}
        </div>
      </div>

      {/* O filtro por tipo não vale no ano: lá a leitura é de volume, e um ano
          filtrado por "só contratos" seria uma folha quase toda em branco. */}
      {visao !== 'ano' ? (
        <nav className={estilo.abas} aria-label="Filtrar por tipo" style={{ marginBottom: 'var(--s4)' }}>
          <Link
            href={url({ so: null })}
            className={so === null ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={so === null ? 'page' : undefined}
          >
            Tudo
          </Link>
          {FILTROS.map((f) => (
            <Link
              key={f.chave}
              href={url({ so: f.chave })}
              className={so === f.chave ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
              aria-current={so === f.chave ? 'page' : undefined}
            >
              {f.rotulo}
            </Link>
          ))}
        </nav>
      ) : null}

      {visao === 'mes' ? (
        <Grade
          semanas={gradeDoMes(periodo.mes)}
          porDia={porDia}
          hoje={hoje}
          teto={NO_DIA}
          legenda={`Compromissos de ${periodo.titulo}, por dia`}
          url={url}
        />
      ) : null}

      {visao === 'semana' ? (
        <Grade
          semanas={[semanaDe(periodo.dia).map((d) => ({ dia: d, doMes: true }))]}
          porDia={porDia}
          hoje={hoje}
          // Na semana não há corte: quem abre a semana quer justamente o que
          // não coube na célula do mês. Sete células numa linha só têm altura
          // de sobra para isso.
          teto={99}
          rolarCelula
          legenda={`Compromissos da semana de ${periodo.titulo}`}
          url={url}
        />
      ) : null}

      {visao === 'dia' ? <VisaoDia eventos={filtrados} titulo={periodo.titulo} /> : null}

      {visao === 'lista' ? <VisaoLista porDia={porDia} hoje={hoje} url={url} /> : null}

      {visao === 'ano' ? <VisaoAno ano={periodo.dia.slice(0, 4)} contagem={contagem} hoje={hoje} /> : null}

      {diaAberto ? (
        <LancarNoDia
          dia={diaAberto}
          mes={diaAberto.slice(0, 7)}
          pessoas={pessoas}
          podeMarcarParada={podeVer(sessao.papel, Papel.ATENDENTE)}
        />
      ) : null}

      {visao !== 'ano' && filtrados.length === 0 ? (
        <p className={estilo.vazio}>
          {so
            ? 'Nada deste tipo neste período.'
            : 'Nada marcado neste período. Paradas de rota, preventivas e contratos terminando aparecem aqui assim que existirem.'}
        </p>
      ) : null}

      <p className={estilo.calLegenda}>
        <span>
          <i className={`${estilo.calPonto} ${estilo.calPontoRua}`} aria-hidden="true" /> rua e bancada
        </span>
        <span>
          <i className={`${estilo.calPonto} ${estilo.calPontoNota}`} aria-hidden="true" /> marcado por
          alguém
        </span>
        <span className={estilo.fraco}>
          Riscado embaixo em vermelho: passou da data e continua em aberto.
        </span>
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// A GRADE — serve ao mês e à semana, com um teto diferente por célula
// ---------------------------------------------------------------------------

type Url = (troca: { ver?: Visao; dia?: string; so?: TipoEvento | null }) => string

/**
 * `<table>` e não `<div>` com grid: um calendário É uma tabela — dias da semana
 * em colunas, semanas em linhas. O leitor de tela anuncia "sábado, 15" porque o
 * cabeçalho da coluna está ligado à célula; numa grade de divs ele leria só
 * "15", e a informação que importa some.
 *
 * A mesma tabela desenha o mês (seis linhas, teto de quatro por dia) e a semana
 * (uma linha, sem teto). Duas implementações do mesmo desenho divergiriam no
 * primeiro conserto — e o conserto costuma ser justamente no dia cheio.
 */
function Grade({
  semanas,
  porDia,
  hoje,
  teto,
  legenda,
  url,
  rolarCelula,
}: {
  semanas: Array<Array<{ dia: string; doMes: boolean }>>
  porDia: Map<string, Evento[]>
  hoje: string
  teto: number
  legenda: string
  url: Url
  /**
   * A célula rola por dentro em vez de esticar a página.
   *
   * Vale para a SEMANA, que não corta nada: sem teto, um dia com trinta e três
   * paradas faz uma coluna de dois metros e leva as outras seis para fora da
   * tela — a semana deixa de ser comparável, que é a única coisa que ela faz
   * melhor que o mês.
   */
  rolarCelula?: boolean
}) {
  return (
    <div className={estilo.rolaX}>
      <table className={estilo.calGrade}>
        <caption className={estilo.soLeitor}>{legenda}</caption>
        <thead>
          <tr>
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d) => (
              <th key={d} scope="col">
                <span aria-hidden="true">{d.slice(0, 3)}</span>
                <span className={estilo.soLeitor}>{d}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana) => (
            <tr key={semana[0]!.dia}>
              {semana.map((d) => {
                const doDia = porDia.get(d.dia) ?? []
                const ehHoje = d.dia === hoje
                return (
                  <td
                    key={d.dia}
                    className={[
                      estilo.calDia,
                      rolarCelula ? estilo.calDiaRola : '',
                      d.doMes ? '' : estilo.calForaDoMes,
                      ehHoje ? estilo.calHoje : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {/* O NÚMERO DO DIA VIRA O BOTÃO DE MARCAR.
                        Sem um botão a mais na célula: a grade tem 42 células, e
                        um "+" em cada uma seria 42 alvos disputando atenção com
                        o conteúdo. O número já é o lugar onde o olho vai quando
                        a pessoa escolhe um dia. */}
                    <Link
                      href={url({ dia: d.dia })}
                      className={estilo.calNumero}
                      aria-label={`Marcar algo no dia ${Number(d.dia.slice(8))}`}
                    >
                      {Number(d.dia.slice(8))}
                      {ehHoje ? <span className={estilo.soLeitor}> (hoje)</span> : null}
                    </Link>
                    {doDia.slice(0, teto).map((e) => (
                      <Compromisso key={e.id} e={e} />
                    ))}
                    {/* O DIA CHEIO NÃO PODE ESTICAR A GRADE.
                        Um dia com trinta e duas paradas empurrava a linha
                        inteira para fora da tela e transformava o calendário
                        numa lista — perdendo justamente o que ele tem de melhor,
                        que é mostrar o mês de uma olhada. O resto continua
                        ALCANÇÁVEL, atrás de um clique, e `<details>` faz isso
                        sem rota nova e sem JavaScript. */}
                    {doDia.length > teto ? (
                      <details className={estilo.calMais}>
                        <summary>+{doDia.length - teto} mais</summary>
                        {doDia.slice(teto).map((e) => (
                          <Compromisso key={e.id} e={e} />
                        ))}
                      </details>
                    ) : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VISÃO DE DIA
// ---------------------------------------------------------------------------

/**
 * O dia inteiro, em ordem, sem corte.
 *
 * Não é uma grade de horas: das quatro fontes, só duas têm hora (a parada com
 * janela combinada e o compromisso). Desenhar 24 faixas para preencher duas
 * seria dar à tela a forma de uma agenda médica que este trabalho não tem — a
 * visita e o fim de contrato são do dia, e não da hora.
 */
function VisaoDia({ eventos, titulo }: { eventos: Evento[]; titulo: string }) {
  if (eventos.length === 0) {
    return (
      <p className={estilo.vazio}>
        Nada marcado em {titulo.toLowerCase()}. Use o painel abaixo para marcar.
      </p>
    )
  }
  return (
    <ul className={estilo.calDiaLista}>
      {eventos.map((e) => (
        <li key={e.id}>
          <Link
            href={e.href}
            className={`${estilo.calDiaItem} ${COR[e.tipo]} ${e.atrasado ? estilo.calAtrasado : ''}`}
          >
            <span className={estilo.calDiaTipo}>{ROTULO_TIPO[e.tipo]}</span>
            <span className={estilo.calDiaTitulo}>
              {e.titulo}
              {e.detalhe ? <span className={estilo.fraco}> · {e.detalhe}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// VISÃO DE LISTA
// ---------------------------------------------------------------------------

/**
 * A agenda corrida — só os dias que têm alguma coisa.
 *
 * É a visão que serve para imprimir e para ler no celular, onde uma grade de
 * sete colunas vira sete colunas de dois centímetros. Dia vazio não entra: numa
 * lista, o vazio é ruído; na grade ele é informação, porque desenha a forma da
 * semana.
 */
function VisaoLista({
  porDia,
  hoje,
  url,
}: {
  porDia: Map<string, Evento[]>
  hoje: string
  url: Url
}) {
  const dias = [...porDia.keys()].sort()
  if (dias.length === 0) return null

  return (
    <div className={estilo.calLista}>
      {dias.map((d) => (
        <section key={d} className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>
            <Link href={url({ ver: 'dia', dia: d })}>
              {porExtenso(d)}
              {d === hoje ? ' · hoje' : ''}
            </Link>
            <span className={estilo.fraco}>
              {porDia.get(d)!.length} {porDia.get(d)!.length === 1 ? 'compromisso' : 'compromissos'}
            </span>
          </p>
          <ul className={estilo.calDiaLista}>
            {porDia.get(d)!.map((e) => (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className={`${estilo.calDiaItem} ${COR[e.tipo]} ${e.atrasado ? estilo.calAtrasado : ''}`}
                >
                  <span className={estilo.calDiaTipo}>{ROTULO_TIPO[e.tipo]}</span>
                  <span className={estilo.calDiaTitulo}>
                    {e.titulo}
                    {e.detalhe ? <span className={estilo.fraco}> · {e.detalhe}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VISÃO DE ANO
// ---------------------------------------------------------------------------

/**
 * Os doze meses, e a densidade de cada dia.
 *
 * A pergunta do ano não é "o que acontece no dia 12 de março" — para isso
 * existem as outras quatro visões. É **onde estão os picos**: o mês em que a
 * preventiva se acumula, a semana que já está cheia antes de alguém marcar
 * férias, o vazio de janeiro.
 *
 * Por isso cada dia é um quadrado com três intensidades, e não um número.
 * Escrever a contagem em 365 células faria uma parede de dígitos que ninguém
 * lê; a mancha se enxerga de longe, que é a distância certa para esta visão.
 */
function VisaoAno({
  ano,
  contagem,
  hoje,
}: {
  ano: string
  contagem: Map<string, number>
  hoje: string
}) {
  return (
    <div className={estilo.calAno}>
      {gradeDoAno(ano).map((m) => {
        const total = m.semanas
          .flat()
          .filter((d) => d.doMes)
          .reduce((s, d) => s + (contagem.get(d.dia) ?? 0), 0)
        return (
          <section key={m.mes} className={estilo.calAnoMes}>
            <p className={estilo.calAnoNome}>
              <Link href={`/painel/calendario?ver=mes&dia=${m.mes}-01`}>{m.nome}</Link>
              <span className={estilo.fraco}>{total}</span>
            </p>
            <div className={estilo.calMini} role="list" aria-label={`${m.nome} de ${ano}`}>
              {m.semanas.flat().map((d) => {
                const n = d.doMes ? (contagem.get(d.dia) ?? 0) : 0
                return (
                  <Link
                    key={d.dia}
                    href={`/painel/calendario?ver=dia&dia=${d.dia}`}
                    role="listitem"
                    aria-label={`${d.dia}: ${n} ${n === 1 ? 'compromisso' : 'compromissos'}`}
                    title={`${Number(d.dia.slice(8))} — ${n} ${n === 1 ? 'compromisso' : 'compromissos'}`}
                    className={[
                      estilo.calMiniDia,
                      d.doMes ? '' : estilo.calMiniFora,
                      // O anel de hoje só no mês DELE: a semana que completa
                      // agosto contém 3 de setembro, e um anel ali faria
                      // "hoje" aparecer duas vezes no ano, em dois cartões.
                      d.doMes && d.dia === hoje ? estilo.calMiniHoje : '',
                      n === 0 ? '' : n <= 2 ? estilo.calMiniPouco : n <= 5 ? estilo.calMiniMedio : estilo.calMiniMuito,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={estilo.soLeitor}>{Number(d.dia.slice(8))}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Está hoje dentro do que a tela está olhando? */
function dentroDoPeriodo(dia: string, p: Periodo): boolean {
  const inicio = p.inicio.toISOString()
  const fim = p.fim.toISOString()
  const instante = new Date(`${dia}T12:00:00-03:00`).toISOString()
  return instante >= inicio && instante < fim
}

/** O primeiro dia do período olhado — para onde "+ Novo evento" leva. */
function primeiroDoPeriodo(p: Periodo): string {
  switch (p.visao) {
    case 'dia':
      return p.dia
    case 'semana':
      return semanaDe(p.dia)[0]!
    case 'ano':
      return `${p.dia.slice(0, 4)}-01-01`
    default:
      return `${p.mes}-01`
  }
}

const somar = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0)

const POR_EXTENSO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
})
function porExtenso(dia: string): string {
  const bruto = POR_EXTENSO.format(new Date(`${dia}T12:00:00-03:00`))
  return bruto.charAt(0).toUpperCase() + bruto.slice(1)
}

/**
 * Quantos compromissos aparecem abertos num dia da grade do MÊS.
 *
 * Quatro cabem na altura de uma célula sem esticar a linha. O quinto e os
 * seguintes ficam atrás de "+N mais" — porque um dia com trinta e duas paradas
 * empurraria a linha inteira e o calendário deixaria de mostrar o mês de uma
 * olhada, que é a única coisa que ele faz melhor que uma lista.
 */
const NO_DIA = 4

function Compromisso({ e }: { e: Evento }) {
  return (
    <Link
      href={e.href}
      className={`${estilo.calEvento} ${COR[e.tipo]} ${e.atrasado ? estilo.calAtrasado : ''}`}
      title={[e.titulo, e.detalhe].filter(Boolean).join(' — ')}
    >
      <span className={estilo.calEventoTitulo}>{e.titulo}</span>
    </Link>
  )
}

/**
 * A unidade que cada visão anda, para o rótulo das setas.
 *
 * A LISTA anda de mês porque é a janela que ela olha — o desenho é outro, o
 * período é o mesmo.
 */
const UNIDADE: Record<Visao, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  lista: 'Mês',
}

const FILTROS: Array<{ chave: TipoEvento; rotulo: string }> = [
  { chave: 'parada', rotulo: 'Rota' },
  { chave: 'preventiva', rotulo: 'Preventiva' },
  { chave: 'contrato', rotulo: 'Contratos' },
  { chave: 'compromisso', rotulo: 'Compromissos' },
]

/** O nome do tipo, para as visões que têm largura para escrevê-lo. */
const ROTULO_TIPO: Record<TipoEvento, string> = {
  parada: 'Rota',
  preventiva: 'Preventiva',
  contrato: 'Contrato',
  compromisso: 'Compromisso',
}

/**
 * A cor por tipo, num mapa explícito.
 *
 * DUAS CORES, e não quatro: tudo que é consequência da esteira — rota,
 * preventiva, contrato terminando — usa o violeta do trabalho. Quatro cores
 * diferentes numa grade de trinta e um dias viram confete, e uma grade que
 * parece confete não é lida, é olhada.
 */
const COR: Record<TipoEvento, string> = {
  // O COMPROMISSO ganha a SEGUNDA cor porque ele é de outra natureza: as outras
  // três o sistema descobriu sozinho, esta uma pessoa escreveu. Distinguir "o
  // que eu marquei" de "o que caiu na minha agenda" é a diferença que faz
  // alguém confiar na grade.
  compromisso: estilo.calNota!,
  parada: estilo.calRua!,
  preventiva: estilo.calRua!,
  contrato: estilo.calRua!,
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
