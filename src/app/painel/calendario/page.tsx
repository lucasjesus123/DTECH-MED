import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirNivel, exigirAba, podeVer } from '@/server/auth/guarda'
import { mesPorExtenso, mesValido, mesVizinho } from '@/server/consultas/caixa'
import { eventosDoMes, gradeDoMes, type Evento, type TipoEvento } from '@/server/consultas/calendario'
import { pessoasDaEmpresa } from '@/server/consultas/listas'
import LancarNoDia from './lancar'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Calendário', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O CALENDÁRIO — o que vem por aí.
 *
 * =============================================================================
 * POR QUE ELE É O ÚNICO ITEM DE MENU NOVO
 * =============================================================================
 * A regra da casa manda transformar tela nova em aba sempre que ela responde à
 * mesma pergunta de uma tela existente. Este não responde: ele atravessa CINCO
 * assuntos — rota, preventiva, contas a pagar, contas a receber e contratos — e
 * a pergunta que faz, *"o que vem por aí"*, não é feita de dentro de nenhum
 * deles.
 *
 * Fica em **Hoje**, ao lado do Painel do dia: um mostra o agora, o outro mostra
 * o depois.
 *
 * =============================================================================
 * O QUE ELE EVITA
 * =============================================================================
 * Cinco calendários mentais, e ninguém conseguindo dizer se a quinta-feira que
 * vem está cheia. O custo é concreto: marca-se entrega para o mesmo dia em que
 * três preventivas vencem, e o motorista descobre na hora.
 *
 * =============================================================================
 * A COR SEPARA O QUE DISPUTA A MESMA HORA DO QUE NÃO DISPUTA
 * =============================================================================
 * Rua e bancada têm pessoa alocada e hora marcada; vencimento é do dia inteiro e
 * se resolve entre uma coisa e outra. Por isso os dois primeiros são violeta
 * (a cor do trabalho, no sistema inteiro) e o dinheiro é âmbar — o mesmo par
 * validado nos gráficos do Financeiro, que separa também por luminosidade e não
 * só por matiz.
 */
export default async function Calendario({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; so?: string; dia?: string }>
}) {
  const { ctx, sessao } = await exigirNivel(Papel.MOTORISTA)
  await exigirAba('calendario')
  const q = await searchParams

  const mes = mesValido(q.mes)
  // QUEM VÊ DINHEIRO NESTE CALENDÁRIO é quem já vê dinheiro no sistema. O
  // motorista entra aqui para ver as PARADAS da semana; salário, aluguel e
  // quanto cada cliente deve não são dele. O corte é feito na CONSULTA — filtrar
  // só na tela mandaria os valores pelo fio até o navegador dele, onde qualquer
  // um lê no inspetor.
  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)
  const so = FILTROS.filter((f) => comDinheiro || (f.chave !== 'pagar' && f.chave !== 'receber'))
    .some((f) => f.chave === q.so)
    ? (q.so as TipoEvento)
    : null

  /**
   * O DIA CLICADO.
   *
   * Ele vem pela URL, e não por estado de componente, para que o painel de
   * lançar sobreviva a um recarregar e possa ser mandado por mensagem: "abre
   * este link e marca a visita aí". Uma tela de agenda que perde o dia ao
   * atualizar obriga a pessoa a caçar o dia de novo toda vez.
   */
  const diaAberto = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? '') && (q.dia ?? '').startsWith(mes)
    ? q.dia!
    : null

  const [todos, pessoas] = await Promise.all([
    eventosDoMes(ctx, mes, { comDinheiro }),
    // Só quando há dia aberto: a lista da equipe não é usada na grade, e
    // buscá-la sempre seria uma consulta por carregamento de tela para nada.
    diaAberto ? pessoasDaEmpresa(ctx) : Promise.resolve([]),
  ])
  const eventos = so ? todos.filter((e) => e.tipo === so) : todos
  const semanas = gradeDoMes(mes)

  const porDia = new Map<string, Evento[]>()
  for (const e of eventos) {
    const lista = porDia.get(e.dia)
    if (lista) lista.push(e)
    else porDia.set(e.dia, [e])
  }

  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const atrasados = eventos.filter((e) => e.atrasado).length
  const aReceber = eventos.filter((e) => e.tipo === 'receber').reduce((s, e) => s + (e.valorCentavos ?? 0), 0)
  const aPagar = eventos.filter((e) => e.tipo === 'pagar').reduce((s, e) => s + (e.valorCentavos ?? 0), 0)
  const naRua = eventos.filter((e) => e.tipo === 'parada' || e.tipo === 'preventiva').length

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Hoje</p>
          <h1 className={estilo.titulo}>Calendário</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            Tudo que tem data e ainda vai acontecer: paradas de rota, preventivas, vencimentos e
            contratos terminando.
          </p>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Compromissos no mês" valor={String(eventos.length)} nota="tudo que tem data" />
        <Indicador rotulo="Saídas de rua" valor={String(naRua)} nota="paradas e preventivas" />
        {comDinheiro ? (
          <Indicador
            rotulo="A receber no mês"
            valor={formatarBRL(aReceber)}
            nota="faturas e avulsos vencendo"
          />
        ) : (
          <Indicador
            rotulo="Contratos terminando"
            valor={String(eventos.filter((e) => e.tipo === 'contrato').length)}
            nota="precisam de renovação"
          />
        )}
        <Indicador
          rotulo="Passou da data"
          valor={String(atrasados)}
          nota={atrasados > 0 ? 'ainda em aberto' : 'nada atrasado'}
          alerta={atrasados > 0}
        />
      </div>

      {/* A barra: o mês à esquerda, o filtro por tipo à direita. */}
      <div className={estilo.rotaBarra}>
        <nav className={estilo.abas} aria-label="Filtrar por tipo">
          <Link
            href={`/painel/calendario?mes=${mes}`}
            className={so === null ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={so === null ? 'page' : undefined}
          >
            Tudo
          </Link>
          {FILTROS.filter((f) => comDinheiro || (f.chave !== 'pagar' && f.chave !== 'receber')).map((f) => (
            <Link
              key={f.chave}
              href={`/painel/calendario?mes=${mes}&so=${f.chave}`}
              className={so === f.chave ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
              aria-current={so === f.chave ? 'page' : undefined}
            >
              {f.rotulo}
            </Link>
          ))}
        </nav>

        <div className={estilo.mesTroca}>
          <Link
            href={`/painel/calendario?mes=${mesVizinho(mes, -1)}${so ? `&so=${so}` : ''}`}
            className={estilo.mesSeta}
            aria-label="Mês anterior"
            rel="prev"
          >
            ‹
          </Link>
          <strong className={estilo.mesNome}>{mesPorExtenso(mes)}</strong>
          <Link
            href={`/painel/calendario?mes=${mesVizinho(mes, 1)}${so ? `&so=${so}` : ''}`}
            className={estilo.mesSeta}
            aria-label="Mês seguinte"
            rel="next"
          >
            ›
          </Link>
        </div>
      </div>

      {comDinheiro && (aPagar > 0 || aReceber > 0) ? (
        <p className={estilo.dica}>
          Este mês vencem {formatarBRL(aReceber)} a receber e {formatarBRL(aPagar)} a pagar.{' '}
          <Link href={`/painel/financeiro?mes=${mes}`}>Ver no Financeiro</Link>
        </p>
      ) : null}

      {/* =====================================================================
          A GRADE
          =====================================================================
          `<table>` e não `<div>` com grid: um calendário É uma tabela — dias da
          semana em colunas, semanas em linhas. O leitor de tela anuncia "sábado,
          15" porque o cabeçalho da coluna está ligado à célula; numa grade de
          divs ele leria só "15", e a informação que importa some.
          ===================================================================== */}
      <div className={estilo.rolaX}>
        <table className={estilo.calGrade}>
          <caption className={estilo.soLeitor}>
            Compromissos de {mesPorExtenso(mes)}, por dia
          </caption>
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
                        d.doMes ? '' : estilo.calForaDoMes,
                        ehHoje ? estilo.calHoje : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {/* O NÚMERO DO DIA VIRA O BOTÃO DE MARCAR.
                          Sem um botão a mais na célula: a grade tem 42 células,
                          e um "+" em cada uma seria 42 alvos disputando atenção
                          com o conteúdo. O número já é o lugar onde o olho vai
                          quando a pessoa escolhe um dia. */}
                      <Link
                        href={`/painel/calendario?mes=${mes}${so ? `&so=${so}` : ''}&dia=${d.dia}`}
                        className={estilo.calNumero}
                        aria-label={`Marcar algo no dia ${Number(d.dia.slice(8))}`}
                      >
                        {Number(d.dia.slice(8))}
                        {ehHoje ? <span className={estilo.soLeitor}> (hoje)</span> : null}
                      </Link>
                      {doDia.slice(0, NO_DIA).map((e) => (
                        <Compromisso key={e.id} e={e} />
                      ))}
                      {/* O DIA CHEIO NÃO PODE ESTICAR A GRADE.
                          Um dia com trinta e duas paradas empurrava a linha
                          inteira para fora da tela e transformava o calendário
                          numa lista — perdendo justamente o que ele tem de
                          melhor, que é mostrar o mês de uma olhada.
                          O resto continua ALCANÇÁVEL, atrás de um clique, e
                          `<details>` faz isso sem rota nova e sem JavaScript. */}
                      {doDia.length > NO_DIA ? (
                        <details className={estilo.calMais}>
                          <summary>+{doDia.length - NO_DIA} mais</summary>
                          {doDia.slice(NO_DIA).map((e) => (
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

      {diaAberto ? (
        <LancarNoDia
          dia={diaAberto}
          mes={mes}
          pessoas={pessoas}
          comDinheiro={comDinheiro}
          podeMarcarParada={podeVer(sessao.papel, Papel.ATENDENTE)}
        />
      ) : null}

      {eventos.length === 0 ? (
        <p className={estilo.vazio}>
          {so
            ? 'Nada deste tipo neste mês.'
            : 'Nenhum compromisso neste mês. Paradas de rota, preventivas e vencimentos aparecem aqui assim que existirem.'}
        </p>
      ) : null}

      <p className={estilo.calLegenda}>
        <span>
          <i className={`${estilo.calPonto} ${estilo.calPontoRua}`} aria-hidden="true" /> rua e bancada
        </span>
        {comDinheiro ? (
          <span>
            <i className={`${estilo.calPonto} ${estilo.calPontoDinheiro}`} aria-hidden="true" /> dinheiro
          </span>
        ) : null}
        <span className={estilo.fraco}>
          Riscado embaixo em vermelho: passou da data e continua em aberto.
        </span>
      </p>
    </>
  )
}

/**
 * Quantos compromissos aparecem abertos num dia.
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
      {e.valorCentavos != null ? (
        <span className={estilo.calEventoValor}>{formatarBRL(e.valorCentavos)}</span>
      ) : null}
    </Link>
  )
}

const FILTROS: Array<{ chave: TipoEvento; rotulo: string }> = [
  { chave: 'parada', rotulo: 'Rota' },
  { chave: 'preventiva', rotulo: 'Preventiva' },
  { chave: 'receber', rotulo: 'A receber' },
  { chave: 'pagar', rotulo: 'A pagar' },
  { chave: 'contrato', rotulo: 'Contratos' },
]

/**
 * A cor por tipo, num mapa explícito.
 *
 * Duas famílias, e não cinco cores: o que exige SAIR (rota, preventiva,
 * contrato terminando) usa o violeta do trabalho; o que é dinheiro usa o âmbar.
 * Cinco cores diferentes numa grade de trinta e um dias viram confete — e uma
 * grade que parece confete não é lida, é olhada.
 */
const COR: Record<TipoEvento, string> = {
  // O COMPROMISSO ganha a TERCEIRA cor, e é a única exceção à regra das duas
  // famílias — porque ele é de outra natureza: as outras cinco o sistema
  // descobriu sozinho, esta uma pessoa escreveu. Distinguir "o que eu marquei"
  // de "o que caiu na minha agenda" é a diferença que faz alguém confiar na
  // grade.
  compromisso: estilo.calNota!,
  parada: estilo.calRua!,
  preventiva: estilo.calRua!,
  contrato: estilo.calRua!,
  receber: estilo.calDinheiro!,
  pagar: estilo.calDinheiro!,
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
