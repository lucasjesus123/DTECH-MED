import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirSessao } from '@/server/auth/guarda'
import { esteira, filaDoDegrau, resumoDoDia } from '@/server/consultas/painel'
import { contatosNovosContagem, leadsNovos } from '@/server/consultas/listas'
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

  const [degraus, resumo, fila, leads, contatosNovos] = await Promise.all([
    esteira(ctx),
    resumoDoDia(ctx),
    filaDoDegrau(ctx, degrau),
    // A tira traz três; a contagem diz quantos são de verdade. Sem ela, "3
    // pessoas chamaram" seria mentira num dia de trinta.
    leadsNovos(ctx),
    contatosNovosContagem(ctx),
  ])

  const selecionado = degraus.find((d) => d.chave === degrau) ?? degraus[0]!

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{saudacao()}, {primeiroNome(sessao.nome)}</p>
          <h1 className={estilo.titulo}>Onde a esteira está agora</h1>
        </div>
        <Link href="/painel/ordens/nova" className={estilo.btnOS}>
          Abrir O.S.
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

      {/* A ESTEIRA. Cada degrau diz quantos estão parados e há quanto tempo —
          é o número que faz alguém agir, e é o que o ERP antigo escondia.

          ELA VEM PRIMEIRO, e isto foi corrigido: os contatos do site ficavam
          acima dela, com a mensagem inteira de cada um numa célula de tabela.
          Bastou chegar UMA prospecção em massa — vinte linhas, em inglês, com
          assinatura completa — para a esteira sair do primeiro olhar. Quem
          abria o sistema para saber onde o trabalho está via um e-mail de
          propaganda ocupando a tela.

          O erro não foi o spam ter passado pela armadilha: foi a tela supor que
          texto vindo de fora seria curto. Texto de terceiro não tem tamanho. */}
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

      {/* A TIRA DOS CONTATOS DO SITE.
          Depois da esteira, no máximo três, uma linha cada, com a mensagem já
          cortada pelo servidor. É um AVISO de que tem gente esperando, não o
          lugar de ler o que ela escreveu — isso é a tela de Contatos do site,
          que este bloco linka. */}
      {leads.length > 0 ? (
        <section className={estilo.recados} aria-label="Contatos do site aguardando resposta">
          <div className={estilo.recadosCab}>
            <p className={estilo.recadosTitulo}>
              <span className={estilo.recadosPulso} aria-hidden="true" />
              {contatosNovos === 1
                ? '1 pessoa chamou pelo site e ainda não teve resposta'
                : `${contatosNovos} pessoas chamaram pelo site e ainda não tiveram resposta`}
            </p>
            <Link href="/painel/contatos" className={estilo.recadosTodos}>
              Ver todos
            </Link>
          </div>

          <ul className={estilo.recadosLista}>
            {leads.map((l) => (
              <li key={l.id} className={estilo.recado}>
                <span className={estilo.recadoQuando}>{haQuanto(l.criadoEm)}</span>
                <span className={estilo.recadoQuem}>
                  <strong>{l.nome}</strong>
                  {l.cidade ? <span className={estilo.fraco}> · {l.cidade}</span> : null}
                </span>
                {/* Uma linha só, e o que não couber é cortado com reticências.
                    O texto já chega curto do servidor; isto é o cinto do
                    suspensório, para o nome de uma empresa comprida não
                    empurrar a linha. */}
                <span className={estilo.recadoTrecho}>{l.mensagem || 'sem mensagem'}</span>
                <Link href="/painel/contatos" className={estilo.recadoAbrir}>
                  Responder
                </Link>
              </li>
            ))}
          </ul>

          {contatosNovos > leads.length ? (
            <p className={estilo.recadosResto}>
              e mais {contatosNovos - leads.length}{' '}
              {contatosNovos - leads.length === 1 ? 'contato' : 'contatos'} em Contatos do site
            </p>
          ) : null}
        </section>
      ) : null}

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
