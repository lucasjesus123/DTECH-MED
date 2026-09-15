import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { visitasAVencer, visitasDoMes, ROTULO_PERIODICIDADE } from '@/server/preventiva/servico'
import { hojeEmLajeado } from '@/server/consultas/periodo'
import { pessoasDaEmpresa } from '@/server/consultas/listas'
import { ordensTravadasPorPeca } from '@/server/estoque/pendencia'
import NovoContrato, { type EquipamentoOpcao } from './novo-contrato'
import { EncerrarContrato } from './acoes'
import AgendaPreventiva, { type VisitaDaAgenda } from './agenda-preventiva'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Preventiva', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * PREVENTIVA — o trabalho que não depende de nada quebrar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA EXISTE
 * ---------------------------------------------------------------------------
 * Uma assistência que só conserta o que quebra vive de sobressalto: o mês bom
 * depende de o cliente ter um problema. A revisão periódica inverte isso.
 *
 * Mas contrato de manutenção morre de um jeito só: ele existe no papel e a
 * visita não acontece, porque ninguém lembra. Esta tela é o antídoto — ela
 * mostra o que VENCE, não o que existe. Uma lista de contratos ativos seria
 * cadastro; a lista de visitas a vencer é trabalho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A FALTA DE PEÇA APARECE AQUI TAMBÉM
 * ---------------------------------------------------------------------------
 * As duas listas respondem à mesma pergunta de gestão — "o que eu preciso fazer
 * esta semana que não vai me procurar sozinho". A visita atrasada não reclama;
 * a ordem parada esperando peça também não. As duas somem se ninguém for atrás.
 */
export default async function Preventiva() {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE, Papel.FINANCEIRO)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('preventiva')

  /**
   * A JANELA DO CALENDARINHO: dois meses para trás, quatro para a frente.
   *
   * Para trás porque a pergunta "a revisão de março aconteceu?" é feita em
   * abril. Para a frente porque contrato trimestral encaixa a próxima daqui a
   * três meses, e quem está marcando quer ver onde ela cai.
   *
   * Fora dessa faixa o calendarinho não mente: ele diz que o mês está fora do
   * carregado e manda para o Calendário da casa, que busca qualquer período.
   */
  const hoje = hojeEmLajeado()
  const de = new Date(`${hoje.slice(0, 7)}-01T00:00:00`)
  de.setMonth(de.getMonth() - 2)
  const ate = new Date(`${hoje.slice(0, 7)}-01T00:00:00`)
  ate.setMonth(ate.getMonth() + 5)

  const [visitas, doMes, pessoas, travadas, contratos, equipamentos] = await Promise.all([
    visitasAVencer(ctx, 45),
    visitasDoMes(ctx, de, ate),
    pessoasDaEmpresa(ctx),
    ordensTravadasPorPeca(ctx),
    comEscopo(ctx, (tx) =>
      tx.contratoManutencao.findMany({
        where: { ativo: true },
        orderBy: { numero: 'desc' },
        select: {
          id: true,
          numero: true,
          periodicidade: true,
          valorVisitaCentavos: true,
          cliente: { select: { nome: true } },
          equipamento: { select: { id: true, marca: true, modelo: true } },
          _count: { select: { visitas: true } },
        },
      }),
    ),
    comEscopo(ctx, (tx) =>
      tx.equipamento.findMany({
        orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
        take: 400,
        select: {
          id: true,
          marca: true,
          modelo: true,
          numeroSerie: true,
          cliente: { select: { nome: true } },
          contratos: { where: { ativo: true }, select: { id: true }, take: 1 },
        },
      }),
    ),
  ])

  /**
   * Só aparelho COM DONO entra na lista do contrato.
   *
   * Contrato de preventiva é acordo com alguém: tem valor de visita e um
   * cliente que paga. Aparelho de catálogo — cadastrado, mas ainda não amarrado
   * a ninguém — não tem a outra ponta. A ação do servidor recusa de novo, com o
   * mesmo motivo; aqui é só para não oferecer o que vai ser negado.
   */
  const opcoes: EquipamentoOpcao[] = equipamentos
    .filter((e) => e.cliente !== null)
    .map((e) => ({
      id: e.id,
      rotulo: `${e.marca} ${e.modelo}${e.numeroSerie ? ` (${e.numeroSerie})` : ''}`,
      cliente: e.cliente!.nome,
      jaTemContrato: e.contratos.length > 0,
    }))

  const agora = new Date()
  const atrasadas = visitas.filter(
    (v) => v.status === 'PREVISTA' && v.previstaPara < agora,
  )
  const marcadas = visitas.filter((v) => v.status === 'AGENDADA').length

  /**
   * AS VISITAS COMO A TELA PRECISA DELAS — dia em texto, valor formatado.
   *
   * A conversão acontece AQUI, no servidor, e não no navegador: o fuso de
   * Lajeado é conhecido de um lado só. Mandar `Date` para o componente faria
   * cada navegador desenhar a grade no fuso do próprio aparelho — e a visita
   * do dia 1º às 21h em Lajeado apareceria no dia 2 para quem estivesse em
   * outro fuso, ou com o relógio do celular errado.
   */
  const paraAgenda: VisitaDaAgenda[] = doMes.map((v) => ({
    id: v.id,
    dia: diaEmLajeado(v.agendadaPara ?? v.previstaPara),
    previstaPara: diaEmLajeado(v.previstaPara),
    hora: v.hora,
    status: v.status as 'PREVISTA' | 'AGENDADA' | 'REALIZADA',
    cliente: v.contrato.cliente.nome,
    equipamento: `${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}`,
    responsavel: v.responsavel?.nome ?? null,
    responsavelId: null,
    contrato: v.contrato.numero,
    ordemId: v.ordemId,
    valor: '',
    periodicidade: '',
    clienteTemZap: false,
    serie: null,
    observacao: null,
    avisadoEm: null,
    avisoErro: null,
  }))

  /**
   * As visitas a vencer trazem o que o formulário precisa e a grade não:
   * valor, periodicidade, número de série, se o cliente tem WhatsApp. Elas
   * SUBSTITUEM a versão magra vinda do calendário, pelo id.
   *
   * Duas consultas em vez de uma porque as perguntas são diferentes: a grade
   * quer sete meses e só o suficiente para desenhar um selo; o formulário quer
   * os próximos 45 dias e tudo sobre eles. Uma consulta só pagaria o preço da
   * segunda multiplicado pelo alcance da primeira.
   */
  const detalhe = new Map(visitas.map((v) => [v.id, v]))
  for (const linha of paraAgenda) {
    const v = detalhe.get(linha.id)
    if (!v) continue
    linha.valor = formatarBRL(v.contrato.valorVisitaCentavos)
    linha.periodicidade = ROTULO_PERIODICIDADE[v.contrato.periodicidade]
    linha.clienteTemZap = Boolean(v.contrato.cliente.whatsapp)
    linha.serie = v.contrato.equipamento.numeroSerie
    linha.observacao = v.observacao
    linha.responsavelId = v.responsavel?.id ?? null
    linha.avisadoEm = v.avisadoEm
      ? v.avisadoEm.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        })
      : null
    linha.avisoErro = v.avisoErro
  }
  const receitaMes = contratos.reduce((s, c) => s + c.valorVisitaCentavos * fatorMensal(c.periodicidade), 0)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Preventiva</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O trabalho que não depende de nada quebrar — e o que está travado esperando peça.
          </p>
        </div>
        <NovoContrato equipamentos={opcoes} />
      </div>

      <div className={estilo.resumo}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Contratos ativos</span>
          <span className={estilo.indValor}>{contratos.length}</span>
          <span className={estilo.indNota}>equipamentos com revisão marcada</span>
        </div>
        {/* O CARTÃO MUDOU DE PERGUNTA: não é mais "quantas atrasaram", é
            "quantas ainda não foram combinadas com o cliente". Uma visita
            marcada para daqui a duas semanas não é problema; uma prevista
            para ontem que ninguém ligou é. */}
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Falta combinar</span>
          <span className={atrasadas.length > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {atrasadas.length}
          </span>
          <span className={estilo.indNota}>
            {atrasadas.length > 0
              ? 'venceram sem data marcada'
              : marcadas > 0
                ? `${marcadas} já marcada${marcadas === 1 ? '' : 's'} com o cliente`
                : 'nada vencido'}
          </span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Previsto por mês</span>
          <span className={estilo.indValor}>{formatarBRL(Math.round(receitaMes))}</span>
          <span className={estilo.indNota}>média dos contratos ativos</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Travadas por peça</span>
          <span className={travadas.length > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {travadas.length}
          </span>
          <span className={estilo.indNota}>serviço vendido esperando compra</span>
        </div>
      </div>

      {/* =====================================================================
          A AGENDA — calendário à esquerda, o que fazer à direita
          =====================================================================
          Era uma tabela de cinco colunas com um botão "Gerar ordem" no fim.
          Ela respondia "o que vence primeiro" e não respondia a pergunta que
          se faz ANTES de qualquer coisa: onde cabe? Marcar o horário com a
          clínica acontecia por WhatsApp, fora do sistema — e o calendário da
          casa mostrava a data do CONTRATO, não a combinada.

          Ver `agenda-preventiva.tsx` para os três passos do fluxo. */}
      <AgendaPreventiva
        visitas={paraAgenda}
        pessoas={pessoas}
        hoje={hoje}
        mesInicial={hoje.slice(0, 7)}
        janela={[mesDe(de), mesDe(ate)]}
      />

      <div className={estilo.duasColunas} style={{ marginTop: 'var(--s6)' }}>
        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Travadas esperando peça</span>
              <span className={estilo.fraco}>{travadas.length}</span>
            </p>
            {travadas.length === 0 ? (
              <p className={estilo.texto}>
                Nenhum serviço aprovado está parado por falta de peça.
              </p>
            ) : (
              <div className={estilo.lista}>
                {travadas.map((o) => (
                  <Link key={o.id} href={`/painel/ordens/${o.id}`} className={estilo.cardOrdem}>
                    <div className={estilo.cardTopo}>
                      <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                      <span className={`${estilo.selo} ${estilo.tagAlerta}`}>falta peça</span>
                    </div>
                    <div className={estilo.cardEq}>
                      {o.equipamento.marca} {o.equipamento.modelo}
                    </div>
                    <div className={estilo.cardCli}>{o.cliente.nome}</div>
                    <div className={estilo.cardRod} style={{ display: 'grid', gap: 2 }}>
                      {o.pendencia.itens.map((i) => (
                        <span key={i.sku}>
                          {i.sku} · precisa {i.precisa}, separado {i.reservado}, livre {i.livre}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Contratos ativos</span>
              <span className={estilo.fraco}>{contratos.length}</span>
            </p>
            {contratos.length === 0 ? (
              <p className={estilo.texto}>
                Nenhum contrato de preventiva ainda. É a receita que não depende de nada quebrar —
                autoclave e laser precisam de revisão periódica de qualquer jeito.
              </p>
            ) : (
              <ul className={estilo.linha}>
                {contratos.map((c) => (
                  <li key={c.id} className={estilo.evento}>
                    <div className={estilo.eventoTop}>
                      <span className={estilo.eventoTitulo}>{c.cliente.nome}</span>
                      <span className={estilo.eventoQuando}>
                        #{String(c.numero).padStart(4, '0')}
                      </span>
                    </div>
                    <div className={estilo.eventoQuem}>
                      <Link href={`/painel/equipamentos/${c.equipamento.id}`}>
                        {c.equipamento.marca} {c.equipamento.modelo}
                      </Link>
                      {' · '}
                      {ROTULO_PERIODICIDADE[c.periodicidade]} · {formatarBRL(c.valorVisitaCentavos)} por visita
                      {' · '}
                      {c._count.visitas} visita{c._count.visitas === 1 ? '' : 's'} previstas
                    </div>
                    <div style={{ marginTop: 'var(--s2)' }}>
                      <EncerrarContrato contratoId={c.id} numero={c.numero} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Quantas visitas por mês cada periodicidade representa.
 *
 * Serve para estimar a receita mensal dos contratos. É média, e a tela diz que
 * é: um contrato anual não rende um doze avos todo mês, mas para comparar o
 * peso da carteira de contratos a média é a conta certa.
 */
function fatorMensal(p: string): number {
  const m: Record<string, number> = {
    MENSAL: 1,
    BIMESTRAL: 1 / 2,
    TRIMESTRAL: 1 / 3,
    SEMESTRAL: 1 / 6,
    ANUAL: 1 / 12,
  }
  return m[p] ?? 0
}

/**
 * O DIA de um instante, no fuso de Lajeado.
 *
 * A conversão acontece no servidor, onde o fuso é conhecido de um lado só.
 * Mandar `Date` para o navegador faria cada aparelho desenhar a grade no
 * próprio fuso — e a visita do dia 1º às 21h em Lajeado apareceria no dia 2
 * para quem estivesse com o relógio do celular em outro lugar.
 */
const FMT_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const diaEmLajeado = (d: Date) => FMT_DIA.format(d)

/** 'AAAA-MM' de uma data — os limites da janela que o calendarinho recebeu. */
const mesDe = (d: Date) => diaEmLajeado(d).slice(0, 7)
