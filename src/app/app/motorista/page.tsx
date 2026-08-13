import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao } from '@/server/auth/guarda'
import { rotaDoDia } from '@/server/consultas/campo'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Motorista() {
  const { sessao, ctx } = await exigirSessao()
  if (sessao.papel !== Papel.MOTORISTA && sessao.papel !== Papel.SUPER_ADMIN) redirect('/painel')

  const paradas = await rotaDoDia(ctx, sessao.userId)
  const feitas = paradas.filter((p) => p.concluida).length
  const proxima = paradas.find((p) => !p.concluida)

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Rota de hoje</span>
        <h1>{sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          <span>
            {paradas.length} {paradas.length === 1 ? 'parada' : 'paradas'} · {feitas} concluídas
          </span>
          <span className={estilo.mono}>{hoje()}</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        {paradas.length === 0 ? (
          <p className={estilo.vazio}>
            Nenhuma parada atribuída a você hoje. Quando a central agendar uma retirada
            ou entrega, ela aparece aqui.
          </p>
        ) : (
          paradas.map((p) => {
            const agora = p.id === proxima?.id
            return (
              <article
                key={p.id}
                className={[estilo.parada, agora ? estilo.paradaAgora : '', p.concluida ? estilo.paradaFeita : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={agora ? estilo.paTopoDestaque : estilo.paTopo}>
                  <span className={estilo.mono}>
                    {p.tipo === 'RETIRADA' ? 'RETIRADA' : 'ENTREGA'}
                  </span>
                  <span className={estilo.mono}>#{String(p.numero).padStart(4, '0')}</span>
                </div>
                <div className={estilo.paCorpo}>
                  <h2>{p.cliente}</h2>
                  <p className={estilo.paEq}>{p.equipamento}</p>
                  <p className={estilo.paEnd}>
                    {p.endereco}
                    {p.referencia ? <span className={estilo.paRef}>Referência: {p.referencia}</span> : null}
                  </p>

                  {p.concluida ? (
                    <p className={estilo.feito}>Concluída</p>
                  ) : (
                    <>
                      <div className={estilo.paAcoes}>
                        <a
                          className={estilo.miniBtn}
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir no mapa
                        </a>
                        {p.telefone ? (
                          <a className={estilo.miniBtn} href={`tel:${p.telefone}`}>
                            Ligar
                          </a>
                        ) : null}
                      </div>
                      <Link href={`/app/motorista/${p.ordemId}`} className={estilo.btnGrande}>
                        Cheguei · coletar assinatura
                      </Link>
                    </>
                  )}
                </div>
              </article>
            )
          })
        )}
      </main>
    </>
  )
}

const hoje = () =>
  new Date()
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })
    .replace('.', '')
    .toUpperCase()
