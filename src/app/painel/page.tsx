import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirSessao } from '@/server/auth/guarda'
import { esteira, filaDoDegrau, resumoDoDia } from '@/server/consultas/painel'
import { leadsNovos } from '@/server/consultas/listas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import estilo from './painel.module.css'

export const metadata: Metadata = { title: 'Painel do dia', robots: { index: false } }
// Painel mostra o estado de agora; cache aqui só serviria para mostrar o
// passado com cara de presente.
export const dynamic = 'force-dynamic'

export default async function PainelDoDia({
  searchParams,
}: {
  searchParams: Promise<{ degrau?: string }>
}) {
  const { ctx, sessao } = await exigirSessao()

  // O super admin cai aqui ao entrar, mas "onde a esteira está agora" é a
  // pergunta de quem opera uma franquia — e fora de uma empresa ele não tem
  // esteira. Sem este desvio ele aterrissava numa tela de números vazios que o
  // menu dele nem oferece, e precisava de dois cliques para chegar onde de fato
  // trabalha.
  //
  // `!visitando` é a metade que faltava: DENTRO de uma franquia ele tem esteira
  // sim, e é justamente esta tela que ele foi ver. Sem essa condição, clicar em
  // "Entrar" devolvia a pessoa para a lista de empresas — de onde ela tinha
  // acabado de sair — e a visita parecia não ter funcionado.
  if (sessao.papel === Papel.SUPER_ADMIN && !sessao.visitando) redirect('/painel/empresas')

  const { degrau = 'manut' } = await searchParams

  const [degraus, resumo, fila, leads] = await Promise.all([
    esteira(ctx),
    resumoDoDia(ctx),
    filaDoDegrau(ctx, degrau),
    leadsNovos(ctx),
  ])

  const selecionado = degraus.find((d) => d.chave === degrau) ?? degraus[0]!

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{saudacao()}, {primeiroNome(sessao.nome)}</p>
          <h1 className={estilo.titulo}>Onde a esteira está agora</h1>
        </div>
        <Link href="/painel/ordens/nova" className={estilo.btnPrimario}>
          Abrir ordem de retirada
        </Link>
      </div>

      {/* Os números que mudam a decisão do dia. Nada de contar por contar. */}
      <div className={estilo.resumo}>
        <Indicador
          rotulo="A receber"
          valor={formatarBRL(resumo.aReceber)}
          nota={`${formatarBRL(resumo.recebidoNoMes)} recebidos no mês`}
        />
        <Indicador
          rotulo="Ordens abertas"
          valor={String(resumo.ordensAbertas)}
          nota={resumo.atrasadas > 0 ? `${resumo.atrasadas} com prazo vencido` : 'nenhuma atrasada'}
          alerta={resumo.atrasadas > 0}
        />
        <Indicador
          rotulo="Estoque baixo"
          valor={String(resumo.pecasAbaixoDoMinimo)}
          nota={resumo.pecasAbaixoDoMinimo > 0 ? 'peças no mínimo ou abaixo' : 'tudo acima do mínimo'}
          alerta={resumo.pecasAbaixoDoMinimo > 0}
        />
        <Indicador
          rotulo="Avisos ao cliente"
          valor={String(resumo.avisosNaFila)}
          nota={
            resumo.avisosFalhados > 0
              ? `${resumo.avisosFalhados} não saíram — verifique o WhatsApp`
              : 'na fila para enviar'
          }
          alerta={resumo.avisosFalhados > 0}
        />
      </div>

      {/* Chegou pelo site e ainda não virou ordem. Fica ANTES da esteira: é
          gente esperando resposta, e esperar é o que faz perder o serviço. */}
      {leads.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>
            <span>Chamaram pelo site</span>
            <span className={estilo.fraco}>
              {leads.length} {leads.length === 1 ? 'aguardando' : 'aguardando'}
            </span>
          </p>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Equipamento</th>
                  <th>O que contaram</th>
                  {/* A coluna do botão. Rótulo invisível na tela, presente
                      para quem navega a tabela por leitor de tela. */}
                  <th>
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className={estilo.num}>{haQuanto(l.criadoEm)}</td>
                    <td>
                      <span className={estilo.forte}>{l.nome}</span>
                      <div className={estilo.fraco}>
                        {l.empresa ? `${l.empresa} · ` : ''}
                        {l.cidade ?? ''}
                      </div>
                      <a href={`https://wa.me/55${l.telefone}`} className={estilo.fraco}>
                        {l.telefone}
                      </a>
                    </td>
                    <td>{l.equipamento ?? <span className={estilo.fraco}>não informou</span>}</td>
                    <td className={estilo.texto} style={{ maxWidth: 420 }}>
                      {l.mensagem}
                    </td>
                    <td className={estilo.dir}>
                      <Link href={`/painel/ordens/nova?lead=${l.id}`} className={estilo.btnSec}>
                        Abrir ordem
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* A ESTEIRA. Cada degrau diz quantos estão parados e há quanto tempo —
          é o número que faz alguém agir, e é o que o ERP antigo escondia. */}
      <nav className={estilo.esteira} aria-label="Etapas da esteira">
        {degraus.map((d, i) => {
          const ativo = d.chave === degrau
          return (
            <Link
              key={d.chave}
              href={`/painel?degrau=${d.chave}`}
              className={[estilo.degrau, ativo ? estilo.degrauAtivo : '', d.travadas > 0 ? estilo.degrauGrita : '']
                .filter(Boolean)
                .join(' ')}
              aria-current={ativo ? 'page' : undefined}
              /**
               * A POSIÇÃO NA ESTEIRA, entregue ao CSS.
               *
               * Com ela o degrau sabe onde está no percurso, e o desenho passa a
               * carregar informação em vez de enfeite: a faixa de cima esquenta
               * da chegada (frio, violeta) para a saída (quente, verde), e a
               * entrada dos oito acontece em cascata, da esquerda para a
               * direita — o mesmo sentido em que o trabalho anda.
               *
               * Vem daqui e não de oito classes no CSS porque a esteira pode
               * mudar de tamanho: acrescentar um degrau amanhã não deve exigir
               * lembrar de acrescentar uma cor.
               */
              style={{ '--passo': i } as CSSProperties}
            >
              <span className={estilo.degrauRot}>{d.rotulo}</span>
              <span className={estilo.degrauNum}>{d.total}</span>
              <span className={estilo.degrauNota}>
                {d.travadas > 0
                  ? `${d.travadas} há mais de 5 dias`
                  : d.diasDaMaisAntiga != null && d.total > 0
                    ? `mais antiga há ${d.diasDaMaisAntiga}d`
                    : '—'}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className={estilo.filaCab}>
        <h2 className={estilo.filaTitulo}>{selecionado.rotulo}</h2>
        <span className={estilo.grav}>
          {fila.length === 0
            ? 'nada parado aqui'
            : `${fila.length} ${fila.length === 1 ? 'ordem' : 'ordens'} · mais parada primeiro`}
        </span>
      </div>

      {fila.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum equipamento parado nesta etapa. Clique em outro degrau da esteira
          para ver onde o trabalho está.
        </p>
      ) : (
        <ul className={estilo.lista}>
          {fila.map((o) => (
            <li key={o.id}>
              <Link href={`/painel/ordens/${o.id}`} className={estilo.cardOrdem}>
                <div className={estilo.cardTopo}>
                  <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                  <span className={estilo.selo}>{ROTULO_ETAPA[o.etapa]}</span>
                </div>
                <p className={estilo.cardEq}>{o.equipamento}</p>
                <p className={estilo.cardCli}>{o.cliente}</p>
                <div className={estilo.cardRod}>
                  <span>{o.tecnico ? o.tecnico.toUpperCase() : 'SEM TÉCNICO'}</span>
                  <span className={o.atrasada ? estilo.atrasado : undefined}>
                    {o.diasParado === 0 ? 'movida hoje' : `parada há ${o.diasParado}d`}
                    {o.atrasada ? ' · prazo vencido' : ''}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
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

function saudacao(): string {
  const h = Number(
    new Date().toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }),
  )
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const primeiroNome = (n: string) => n.split(' ')[0] ?? n

/** "há 2h", "há 3d" — o que importa num contato é quanto tempo ele espera. */
function haQuanto(d: Date): string {
  const min = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
