import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { carregarOrdemPublica } from '@/server/acoes/portal'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { Aprovacao } from './aprovacao'
import estilo from './portal.module.css'

export const metadata: Metadata = {
  title: 'Acompanhe seu equipamento',
  // Página com dado de cliente não entra em buscador, mesmo com link opaco.
  robots: { index: false, follow: false, nocache: true },
}
export const dynamic = 'force-dynamic'

export default async function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ordem = await carregarOrdemPublica(token)
  if (!ordem) notFound()

  const orcamento = ordem.orcamentos[0]
  const aguardandoResposta = ordem.etapa === EtapaOrdem.ORCAMENTO_ENVIADO && !!orcamento
  const equipamento = `${ordem.equipamento.marca} ${ordem.equipamento.modelo}`.trim()

  return (
    <main className={estilo.palco}>
      <header className={estilo.topo}>
        <span className={estilo.marcaD}>D</span>
        <span className={estilo.marcaTxt}>{ordem.tenant.nome}</span>
      </header>

      <div className={estilo.miolo}>
        <p className={estilo.grav}>Ordem #{String(ordem.numero).padStart(4, '0')}</p>
        <h1 className={estilo.titulo}>{equipamento}</h1>
        <p className={estilo.sub}>
          {ordem.cliente.nome}
          {ordem.equipamento.numeroSerie ? ` · série ${ordem.equipamento.numeroSerie}` : ''}
        </p>

        <div className={estilo.etapaAtual}>
          <span className={estilo.pulso} aria-hidden="true" />
          <div>
            <span className={estilo.gravClara}>Situação agora</span>
            <strong>{ROTULO_ETAPA[ordem.etapa]}</strong>
          </div>
        </div>

        {/* ---- Aprovação do orçamento ---- */}
        {aguardandoResposta ? (
          <section className={estilo.caixaOrcamento}>
            <p className={estilo.grav}>Orçamento para aprovação</p>
            <p className={estilo.total}>{formatarBRL(orcamento.totalCentavos)}</p>
            <p className={estilo.condicoes}>
              Prazo de {orcamento.prazoExecucaoDias} dias úteis · garantia de{' '}
              {orcamento.garantiaDias} dias
            </p>

            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={estilo.num}>Qtd</th>
                  <th className={estilo.num}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {orcamento.itens.map((i) => (
                  <tr key={i.id}>
                    <td>{i.descricao}</td>
                    <td className={estilo.num}>{Number(i.quantidade)}</td>
                    <td className={estilo.num}>{formatarBRL(i.valorTotalCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {orcamento.laudoTecnico ? (
              <div className={estilo.laudo}>
                <span className={estilo.grav}>O que o técnico encontrou</span>
                <p>{orcamento.laudoTecnico}</p>
              </div>
            ) : null}

            <Aprovacao token={token} total={formatarBRL(orcamento.totalCentavos)} />
          </section>
        ) : null}

        {ordem.etapa === EtapaOrdem.ORCAMENTO_APROVADO || orcamento?.status === 'APROVADO' ? (
          <p className={estilo.avisoOk}>
            Orçamento aprovado{orcamento?.aprovadoPorNome ? ` por ${orcamento.aprovadoPorNome}` : ''}.
            O serviço já está na fila.
          </p>
        ) : null}

        {/* ---- Linha do tempo ---- */}
        <section className={estilo.secao}>
          <p className={estilo.grav}>O que já aconteceu</p>
          <ol className={estilo.linha}>
            {ordem.eventos.map((e, i) => (
              <li key={e.id} className={i === 0 ? estilo.evAtual : undefined}>
                <span className={estilo.ponto} aria-hidden="true" />
                <div className={estilo.evTxt}>
                  <strong>{e.titulo}</strong>
                  {e.descricao ? <p>{e.descricao}</p> : null}
                  <span className={estilo.evQuem}>
                    {e.autorNome} ·{' '}
                    {e.criadoEm.toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {ordem.documentos.length > 0 ? (
          <section className={estilo.secao}>
            <p className={estilo.grav}>Documentos</p>
            <ul className={estilo.docs}>
              {ordem.documentos.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documento/${d.tokenAcesso}`} className={estilo.doc}>
                    <span className={estilo.docIc}>PDF</span>
                    <span>
                      <strong>{d.numero}</strong>
                      <small>
                        {d.geradoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className={estilo.rodape}>
          <p>
            Dúvida sobre esta ordem? Chame a {ordem.tenant.nome}
            {ordem.tenant.telefone ? ` no ${formatarTelefone(ordem.tenant.telefone)}` : ''}.
          </p>
        </footer>
      </div>
    </main>
  )
}

function formatarTelefone(n: string): string {
  const d = n.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return n
}
