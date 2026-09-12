import Link from 'next/link'
import type { Metadata } from 'next'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { exigirSessao, exigirAba } from '@/server/auth/guarda'
import { listarOrdens, tecnicosDaEmpresa } from '@/server/consultas/listas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { TOTAL_DE_PASSOS, faseDaEtapa, passoDaEtapa } from '@/server/ordem/roteiro'
import AbasOS from '../os-abas'
import AbrirOS from './abrir-os'
import TabelaDeOrdens, { type LinhaDeOrdem } from './tabela'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Ordens', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A CENTRAL DE O.S.
 *
 * =============================================================================
 * A TELA É A LISTA; O TRABALHO ACONTECE NA JANELA
 * =============================================================================
 * Esta página faz três coisas e só três: filtra, lista, e abre a janela. Ela
 * não tem mais nenhuma porta que leve para longe — nem o número levando à
 * ficha, nem o lápis levando à correção.
 *
 * O motivo é a frase de quem usa: *"estou achando essa aba um pouco bagunçada,
 * precisa ser de forma fácil, tipo um passo a passo... tudo em uma janela tipo
 * popup"*. A bagunça não estava nas colunas — estava em ter que sair da lista
 * para fazer qualquer coisa, e voltar pelo botão do navegador com o filtro
 * perdido.
 *
 * A ficha completa não deixou de existir: ela é o histórico, e a janela leva
 * até lá em um clique, para quem quer ver as fotos, o orçamento e a linha do
 * tempo inteira.
 *
 * O FILTRO CONTINUA NA URL. Um formulário GET faz o link da lista filtrada ser
 * um link de verdade, que dá para mandar para outra pessoa — e ela abre
 * exatamente a mesma tela.
 */
export default async function Ordens({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etapa?: string; tecnico?: string; situacao?: string }>
}) {
  const { ctx, sessao } = await exigirSessao()
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('ordens')
  const q = await searchParams

  const [ordens, tecnicos] = await Promise.all([
    listarOrdens(ctx, {
      busca: q.busca,
      etapa: q.etapa,
      tecnicoId: q.tecnico,
      situacao: q.situacao,
    }),
    tecnicosDaEmpresa(ctx),
  ])

  /**
   * A lista vira dado puro antes de chegar ao componente de cliente.
   *
   * O que atravessa essa fronteira é serializado e vai no HTML. Mandar o objeto
   * do Prisma inteiro levaria junto campo que a tela não usa — e um dia levaria
   * um que ela não devia ver. Aqui a forma é declarada, e é ela que manda.
   */
  const linhas: LinhaDeOrdem[] = ordens.map((o) => {
    /**
     * A FASE VEM DA ETAPA, e não de montar o roteiro de cada linha.
     *
     * Montar as fases de verdade custa a linha do tempo inteira da ordem —
     * sessenta viagens de banco para desenhar sessenta linhas de tabela. A
     * lista não precisa de tanto: ela só responde "em que fase esta está", e
     * isso a etapa sozinha já diz.
     */
    const fase = faseDaEtapa(o.etapa)
    return {
      id: o.id,
      numero: o.numero,
      prioridade: o.prioridade,
      etapaRotulo: ROTULO_ETAPA[o.etapa],
      passo: passoDaEtapa(o.etapa),
      totalPassos: TOTAL_DE_PASSOS,
      fase: fase ? { n: fase.n, nome: fase.nome } : null,
      encerrada: o.etapa === EtapaOrdem.FINALIZADO,
      equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
      serie: o.equipamento.numeroSerie,
      cliente: o.cliente.nome,
      tecnico: o.tecnico?.nome ?? null,
      diasParado: o.diasParado,
      atrasada: o.atrasada,
      faturaCentavos: o.fatura?.valorTotalCentavos ?? null,
      faturaStatus: o.fatura?.status ?? null,
    }
  })

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Central</p>
          <h1 className={estilo.titulo}>O.S.</h1>
        </div>
        <AbrirOS />
      </div>

      <AbasOS atual="ordens" papel={sessao.papel} telas={sessao.telas} />

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={q.busca ?? ''}
            placeholder="Número da O.S., cliente, CNPJ, marca, modelo ou série"
            aria-label="Buscar ordens"
          />
        </div>

        <select className={estilo.selecao} name="situacao" defaultValue={q.situacao ?? 'abertas'} aria-label="Situação">
          <option value="abertas">Em andamento</option>
          <option value="atrasadas">Com prazo vencido</option>
          <option value="encerradas">Encerradas</option>
          <option value="todas">Todas</option>
        </select>

        <select className={estilo.selecao} name="etapa" defaultValue={q.etapa ?? ''} aria-label="Etapa">
          <option value="">Qualquer etapa</option>
          {Object.values(EtapaOrdem).map((e) => (
            <option key={e} value={e}>
              {ROTULO_ETAPA[e]}
            </option>
          ))}
        </select>

        <select className={estilo.selecao} name="tecnico" defaultValue={q.tecnico ?? ''} aria-label="Técnico">
          <option value="">Qualquer técnico</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>

        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
        <Link href="/painel/ordens" className={estilo.btnSec}>
          Limpar
        </Link>
      </form>

      {linhas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma ordem com esses critérios. Tente limpar o filtro ou buscar só
          pelo número da O.S.
        </p>
      ) : (
        <TabelaDeOrdens ordens={linhas} />
      )}

      {linhas.length >= 60 ? (
        <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
          Mostrando as 60 ordens de movimento mais recente. Refine a busca para
          encontrar as demais.
        </p>
      ) : null}
    </>
  )
}
