import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { carregarOrdemPublica } from '@/server/acoes/portal'
import { ROTULO_DOCUMENTO, ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { Aprovacao } from './aprovacao'
import estilo from './portal.module.css'
import { Credito } from '@/app/credito'
import { Simbolo } from '@/app/marca'
import { montarTrilha } from '@/server/ordem/trilha'

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

  /* A MESMA função que o painel usa. Se cada lado calculasse por conta, um dia
     eles discordariam — e a que estaria errada seria a do cliente, que é a
     única que ele vê. Os eventos aqui já vêm filtrados por `visivelCliente`;
     a régua marca o ponto pelo que ele tem direito de saber. */
  const trilha = montarTrilha(
    ordem.etapa,
    ordem.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
  )

  return (
    <main className={estilo.palco}>
      <header className={estilo.topo}>
        {/* O nome que aparece aqui é o da FRANQUIA dona da ordem, não o da
            plataforma: quem abre este link é cliente dela. O símbolo do
            sistema fica pequeno, ao lado, sem disputar. */}
        <Simbolo larguraPx={26} />
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

        {/* A régua: quanto falta para o aparelho voltar. É a primeira coisa
            que o cliente procura, e antes ela não existia — ele tinha de
            deduzir isso lendo a lista de eventos. */}
        <div className={estilo.trilhaCliente} aria-label={`Andamento: ${trilha.agora}`}>
          <div className={estilo.trilhaFio}>
            <span
              className={trilha.desvio ? estilo.trilhaParado : estilo.trilhaCheio}
              style={{ width: `${trilha.porcento}%` }}
            />
          </div>
          <div className={estilo.trilhaFases}>
            {trilha.fases.map((f) => {
              const temAgora = f.nos.some((n) => n.estado === 'agora')
              const toda = f.nos.every((n) => n.estado === 'cumprido')
              return (
                <span
                  key={f.nome}
                  className={[
                    estilo.trilhaFaseNome,
                    toda ? estilo.trilhaFaseFeita : '',
                    temAgora && !trilha.desvio ? estilo.trilhaFaseAgora : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {f.nome}
                </span>
              )
            })}
          </div>
          <p className={estilo.trilhaConta}>
            {trilha.desvio
              ? 'esta ordem saiu do caminho normal'
              : `etapa ${trilha.cumpridos} de ${trilha.total}`}
          </p>
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
                      <strong>
                        {ROTULO_DOCUMENTO[d.tipo] ?? d.tipo} nº{' '}
                        {d.numero.split('-').pop()?.replace(/^0+/, '') ?? d.numero}
                      </strong>
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
          <p>
            <Credito />
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
