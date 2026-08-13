import Link from 'next/link'
import type { Metadata } from 'next'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirSessao } from '@/server/auth/guarda'
import { listarOrdens, tecnicosDaEmpresa } from '@/server/consultas/listas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Ordens', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A lista completa de ordens.
 *
 * O painel do dia mostra onde a esteira travou; esta tela é para quando alguém
 * já sabe o que procura — o cliente ligou citando o número, ou o técnico quer
 * ver tudo que está com ele. Por isso o filtro é o elemento principal, e a
 * ordenação padrão é por movimento recente, não por data de abertura.
 */
export default async function Ordens({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etapa?: string; tecnico?: string; situacao?: string }>
}) {
  const { ctx } = await exigirSessao()
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

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Central</p>
          <h1 className={estilo.titulo}>Ordens</h1>
        </div>
        <Link href="/painel/ordens/nova" className={estilo.btnPrimario}>
          Abrir ordem de retirada
        </Link>
      </div>

      {/* Formulário GET: o filtro fica na URL, então o link pode ser mandado
          para outra pessoa e abre exatamente a mesma lista. */}
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

      {ordens.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma ordem com esses critérios. Tente limpar o filtro ou buscar só
          pelo número da O.S.
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>O.S.</th>
                <th>Equipamento</th>
                <th>Cliente</th>
                <th>Etapa</th>
                <th>Técnico</th>
                <th>Parada</th>
                <th className={estilo.dir}>Fatura</th>
              </tr>
            </thead>
            <tbody>
              {ordens.map((o) => (
                <tr key={o.id}>
                  <td className={estilo.num}>
                    <Link href={`/painel/ordens/${o.id}`}>#{String(o.numero).padStart(4, '0')}</Link>
                    {o.prioridade === 'ALTA' ? (
                      <>
                        {' '}
                        <span className={estilo.tagAlerta + ' ' + estilo.tag}>alta</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <span className={estilo.forte}>
                      {o.equipamento.marca} {o.equipamento.modelo}
                    </span>
                    {o.equipamento.numeroSerie ? (
                      <div className={estilo.fraco}>série {o.equipamento.numeroSerie}</div>
                    ) : null}
                  </td>
                  <td>{o.cliente.nome}</td>
                  <td>
                    <span className={estilo.tag}>{ROTULO_ETAPA[o.etapa]}</span>
                  </td>
                  <td>{o.tecnico?.nome ?? <span className={estilo.fraco}>sem técnico</span>}</td>
                  <td className={estilo.num}>
                    <span className={o.atrasada ? estilo.atrasado : undefined}>
                      {o.diasParado === 0 ? 'hoje' : `${o.diasParado}d`}
                    </span>
                    {o.atrasada ? <div className={estilo.fraco}>prazo vencido</div> : null}
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>
                    {o.fatura ? (
                      <>
                        {formatarBRL(o.fatura.valorTotalCentavos)}
                        <div className={estilo.fraco}>{o.fatura.status.toLowerCase()}</div>
                      </>
                    ) : (
                      <span className={estilo.fraco}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ordens.length >= 60 ? (
        <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
          Mostrando as 60 ordens de movimento mais recente. Refine a busca para
          encontrar as demais.
        </p>
      ) : null}
    </>
  )
}
