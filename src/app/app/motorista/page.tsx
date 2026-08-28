import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { NIVEL, exigirSessao } from '@/server/auth/guarda'
import { rotaDoDia } from '@/server/consultas/campo'
import { Saida } from './saida'
import { Rastro } from './rastro'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Motorista() {
  const { sessao, ctx } = await exigirSessao()

  /**
   * QUEM ENTRA AQUI, E POR QUE ISSO MUDOU.
   *
   * Antes: só MOTORISTA e SUPER_ADMIN. Quem administra a empresa não conseguia
   * nem abrir a tela — e o efeito prático era que ninguém acima do motorista
   * sabia o que o aplicativo mostra. Não dava para conferir se a parada chegou,
   * nem para explicar por telefone o que ele está vendo, nem para descobrir que
   * o endereço saiu errado antes de o cliente reclamar.
   *
   * Agora quem gerencia entra em MODO GESTÃO: vê a rota da empresa inteira, com
   * o nome do motorista em cada parada, e não vê botão de ação nenhum. Abrir a
   * tela não abre a ação — a máquina de estados confere o dono da parada na hora
   * da assinatura, e continua conferindo.
   */
  const gerencia = NIVEL[sessao.papel] >= NIVEL[Papel.GESTOR]
  if (sessao.papel !== Papel.MOTORISTA && !gerencia) redirect('/painel')

  // Modo gestão vê a rota de TODOS; o motorista vê a dele.
  const paradas = await rotaDoDia(ctx, gerencia ? null : sessao.userId)
  const feitas = paradas.filter((p) => p.concluida).length
  const proxima = paradas.find((p) => !p.concluida)

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Rota de hoje</span>
        <h1>{gerencia ? (sessao.tenantNome ?? 'A rota do dia') : sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          <span>
            {paradas.length} {paradas.length === 1 ? 'parada' : 'paradas'} · {feitas} concluídas
          </span>
          <span className={estilo.mono}>{hoje()}</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        {/* A faixa que separa olhar de agir. Sem ela, quem gerencia acha que a
            tela não funciona quando o botão de "cheguei" não aparece. */}
        {gerencia ? (
          <p className={estilo.modoGestao}>
            <strong>Modo gestão.</strong> Você está vendo a rota de todos os motoristas, como eles
            veem. Registrar chegada e colher assinatura continua sendo de quem está na rua.
          </p>
        ) : null}

        {paradas.length === 0 ? (
          <p className={estilo.vazio}>
            {gerencia
              ? 'Nenhuma parada agendada para hoje na empresa. O que a central marcar aparece aqui.'
              : 'Nenhuma parada atribuída a você hoje. Quando a central agendar uma retirada ou entrega, ela aparece aqui.'}
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
                      {/* Marcar a saída dispara o aviso ao cliente. Quem
                          esquecer não fica travado: a coleta registra o trecho
                          sozinha, na hora de assinar. */}
                      {!p.emRota ? <Saida ordemId={p.ordemId} tipo={p.tipo} /> : null}
                      {/* O rastro só existe DEPOIS da saída, e some quando a
                          parada é concluída. Fora da rota o servidor recusa de
                          qualquer jeito — aqui a tela só não oferece o que ia
                          falhar. */}
                      {p.emRota ? <Rastro agendamentoId={p.id} /> : null}
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
