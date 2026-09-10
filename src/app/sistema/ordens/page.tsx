import Link from 'next/link'
import { acaoDaVez, estadoDaEtapa } from '@/lib/esteira'
import { listarOrdens, tecnicosDaEmpresa } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import {
  KanbanBoard,
  ListView,
  ViewToggle,
  type OrdemNaVista,
} from '@/components/sistema/vistas-ordens'
import { CabecalhoTela, EmptyState, StatCardRow, type Stat } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * ORDENS DE SERVIÇO — a esteira inteira.
 *
 * =============================================================================
 * O ESQUELETO ÚNICO DE TELA-LISTA
 * =============================================================================
 * Quatro cartões de número, busca, filtro, toggle Lista/Kanban, e as linhas com
 * chip de estado e o botão-da-vez. É o mesmo esqueleto de Clientes, Bancada,
 * Conferência e Financeiro — de propósito. Quem aprendeu a operar esta tela
 * aprendeu a operar as outras cinco, e o custo de aprender o sistema deixa de
 * ser proporcional ao número de telas.
 *
 * =============================================================================
 * OS FILTROS SÃO UM FORMULÁRIO GET, E NÃO ESTADO NO NAVEGADOR
 * =============================================================================
 * A busca, o técnico, a situação e o formato vivem na URL. Custa uma navegação
 * e devolve o "voltar" funcionando, o link colável no WhatsApp do colega
 * ("olha as atrasadas do João") e a página que sobrevive a um F5. Nenhuma linha
 * de JavaScript é gasta para isso.
 */

export default async function TelaOrdens({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    etapa?: string
    tecnico?: string
    situacao?: string
    vista?: string
    filtro?: string
  }>
}) {
  const { ctx, sessao } = await exigirTela('ordens')
  const q = await searchParams

  // `?filtro=atrasadas` é o atalho que vem dos cartões do Painel. Ele é
  // traduzido para o vocabulário da consulta antiga em vez de virar um segundo
  // parâmetro com o mesmo significado.
  const situacao = q.filtro === 'atrasadas' ? 'atrasadas' : (q.situacao ?? 'abertas')
  const vista = q.vista === 'quadro' ? 'quadro' : 'lista'

  const [ordens, tecnicos] = await Promise.all([
    listarOrdens(ctx, {
      busca: q.busca,
      etapa: q.etapa,
      tecnicoId: q.tecnico,
      situacao,
    }),
    tecnicosDaEmpresa(ctx),
  ])

  const linhas: OrdemNaVista[] = ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    etapa: o.etapa,
    estado: estadoDaEtapa(o.etapa),
    // O botão de cada linha é resolvido para O PAPEL de quem está olhando. A
    // mesma tela, aberta por um técnico e por uma gestora, oferece botões
    // diferentes na mesma ordem — e nenhum dos dois vê um botão que o motor
    // recusaria.
    acao: acaoDaVez(o.etapa, sessao.papel),
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    serie: o.equipamento.numeroSerie,
    tecnico: o.tecnico?.nome ?? null,
    diasParado: o.diasParado,
    atrasada: o.atrasada,
    urgente: o.prioridade === 'ALTA',
  }))

  const meuTurno = linhas.filter((l) => l.acao !== null).length
  const atrasadas = linhas.filter((l) => l.atrasada).length
  const paradas = linhas.filter((l) => l.diasParado >= 10).length

  const stats: Stat[] = [
    { rotulo: 'Nesta vista', valor: linhas.length, apoio: rotuloSituacao(situacao), icone: 'ordens' },
    {
      rotulo: 'Esperando você',
      valor: meuTurno,
      apoio: meuTurno === 0 ? 'nada com você' : 'com botão para agir',
      tom: meuTurno > 0 ? 'info' : 'neutro',
      icone: 'painel',
    },
    {
      rotulo: 'Prazo vencido',
      valor: atrasadas,
      tom: atrasadas > 0 ? 'danger' : 'ok',
      icone: 'conferencia',
    },
    {
      rotulo: 'Paradas +10 dias',
      valor: paradas,
      apoio: 'sem andar na esteira',
      tom: paradas > 0 ? 'warn' : 'ok',
      icone: 'preventiva',
    },
  ]

  // A base de parâmetros que o toggle preserva — trocar de formato não pode
  // apagar o filtro que a pessoa acabou de montar.
  const base = new URLSearchParams()
  if (q.busca) base.set('busca', q.busca)
  if (q.tecnico) base.set('tecnico', q.tecnico)
  if (situacao !== 'abertas') base.set('situacao', situacao)

  return (
    <>
      <CabecalhoTela
        titulo="Ordens de Serviço"
        apoio="A esteira inteira, do primeiro telefonema à baixa final."
        acao={
          <Link href="/sistema/ordens/nova" className={estilo.acao}>
            Abrir O.S.
          </Link>
        }
      />

      <StatCardRow stats={stats} />

      <form className={estilo.barraLista} method="get">
        <input
          className={estilo.campoBusca}
          type="search"
          name="busca"
          defaultValue={q.busca ?? ''}
          placeholder="Número, cliente, marca ou série"
          aria-label="Buscar ordens"
        />
        <select
          className={estilo.filtro}
          name="situacao"
          defaultValue={situacao}
          aria-label="Situação"
        >
          <option value="abertas">Abertas</option>
          <option value="atrasadas">Com prazo vencido</option>
          <option value="encerradas">Encerradas</option>
          <option value="todas">Todas</option>
        </select>
        <select
          className={estilo.filtro}
          name="tecnico"
          defaultValue={q.tecnico ?? ''}
          aria-label="Técnico"
        >
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        {/* O formato viaja escondido no formulário para não ser perdido quando
            alguém filtra estando no quadro. */}
        <input type="hidden" name="vista" value={vista} />
        <button type="submit" className={estilo.acaoLinha}>
          Filtrar
        </button>
        <ViewToggle vista={vista} base={base.toString()} />
      </form>

      {linhas.length === 0 ? (
        <EmptyState
          titulo={q.busca ? 'Nada com esse termo' : 'Nenhuma ordem por aqui'}
          bom={!q.busca}
          apoio={
            q.busca
              ? 'Tente o número da O.S., o nome do cliente ou o número de série do aparelho.'
              : 'Quando o telefone tocar, é aqui que a O.S. nasce.'
          }
          acao={
            <Link href="/sistema/ordens/nova" className={estilo.acao}>
              Abrir O.S.
            </Link>
          }
        />
      ) : vista === 'quadro' ? (
        <KanbanBoard ordens={linhas} />
      ) : (
        <ListView ordens={linhas} />
      )}
    </>
  )
}

function rotuloSituacao(s: string): string {
  if (s === 'atrasadas') return 'com prazo vencido'
  if (s === 'encerradas') return 'já encerradas'
  if (s === 'todas') return 'todas as situações'
  return 'ainda na esteira'
}
