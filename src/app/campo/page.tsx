import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { redirect } from 'next/navigation'
import { bancada, rotaDoDia, type Parada } from '@/server/consultas/campo'
import { acaoDaVez, estadoDaEtapa } from '@/lib/esteira'
import { pelaGestao } from '@/server/campo/autonomia'
import AoVivo from '@/components/sistema/ao-vivo'
import JobDaVez from '@/components/sistema/job-da-vez'
import BotaoDaVez from '@/components/sistema/botao-da-vez'
import { Chip, EmptyState } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * TAREFAS — a home do app de campo, em Modo Foco.
 *
 * =============================================================================
 * UMA TAREFA POR TELA
 * =============================================================================
 * O primeiro cartão é grande e ocupa a tela: cliente, endereço, com quem falar,
 * o recado da central, o stepper e UM botão. O resto do dia fica embaixo, numa
 * lista curta e discreta — saber quantas faltam é útil, escolher qual fazer não
 * é: quem despachou já ordenou a rota.
 *
 * =============================================================================
 * A MESMA TELA SERVE COLETA E ENTREGA
 * =============================================================================
 * Muda o rótulo, não o desenho. São o mesmo trabalho do ponto de vista de quem
 * dirige: ir até um endereço, falar com alguém, pegar ou deixar um aparelho,
 * fotografar e colher assinatura.
 *
 * =============================================================================
 * O TÉCNICO VÊ OUTRA COISA AQUI
 * =============================================================================
 * A fila da bancada dele, com o botão-da-vez de cada aparelho. É a mesma
 * pergunta — "o que eu faço agora?" — e ela tem outra resposta quando o
 * trabalho acontece parado, numa mesa.
 */
export default async function Tarefas() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  const ctx = contextoDe(sessao)

  if (sessao.papel === Papel.TECNICO) return <FilaDoTecnico />

  // Gestão entra em modo leitura: `null` traz as paradas de TODA a empresa, e
  // cada uma diz de quem é.
  const souMotorista = sessao.papel === Papel.MOTORISTA
  // Quem conduz a rua a partir do painel — hoje ADMIN_EMPRESA e SUPER_ADMIN.
  // A lista e o porquê estão em `@/server/campo/autonomia`.
  const viaGestao = pelaGestao(sessao.papel)
  const paradas = await rotaDoDia(ctx, souMotorista ? sessao.userId : null)

  const abertas = paradas.filter((p) => !p.concluida)
  const [agora, ...resto] = abertas

  if (!agora) {
    return (
      <>
        <Cabecalho nome={sessao.nome} apoio="Rota do dia" />
        <EmptyState
          titulo="Rota concluída ✓"
          apoio={
            paradas.length === 0
              ? 'Nenhuma parada marcada para hoje. Confira a Agenda para ver o que vem pela frente.'
              : `As ${paradas.length} paradas de hoje estão fechadas. Bom trabalho.`
          }
        />
      </>
    )
  }

  return (
    <>
      <Cabecalho
        nome={sessao.nome}
        apoio={`${abertas.length} ${abertas.length === 1 ? 'parada' : 'paradas'} para hoje`}
      />

      {/* A TELA DE QUEM ACOMPANHA SE ATUALIZA SOZINHA.
          Para o motorista não faz sentido: ele É a fonte do que muda, e cada
          sondagem seria bateria e 4G gastos para lhe contar o que ele acabou de
          fazer. Quem precisa disto é a mesa que olha a rua de longe. */}
      {!souMotorista ? <AoVivo rotulo="rota ao vivo" /> : null}

      <FocoDaParada
        parada={agora}
        souMotorista={souMotorista}
        viaGestao={viaGestao}
        meuId={sessao.userId}
      />

      {resto.length > 0 ? (
        <section className={estilo.resto}>
          <h2 className="mono">Depois desta</h2>
          {resto.map((p) => (
            <Link key={p.id} href={`/sistema/ordens/${p.ordemId}`} className={estilo.restoItem}>
              <span className={estilo.restoHora}>
                {p.previstoPara.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo',
                })}
              </span>
              <span className={estilo.restoTxt}>
                <strong>{p.cliente}</strong>
                <span>
                  {p.tipo === 'RETIRADA' ? 'Coleta' : 'Entrega'} · {p.equipamento}
                </span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  )
}

function Cabecalho({ nome, apoio }: { nome: string; apoio: string }) {
  const primeiro = nome.split(' ')[0] ?? nome
  return (
    <header className={estilo.campoTopo}>
      <div className={estilo.campoTopoTxt}>
        <strong>Oi, {primeiro}</strong>
        <span>{apoio}</span>
      </div>
    </header>
  )
}

/**
 * O cartão do job da vez.
 *
 * O RECADO DA CENTRAL fica em destaque, com moldura. Ele era gravado no banco e
 * nenhuma tela do aplicativo lia: quem escrevia "levar carrinho, estacionar nos
 * fundos" achava que estava avisando, e quem precisava do aviso descobria o
 * carrinho na hora de carregar.
 */
function FocoDaParada({
  parada,
  souMotorista,
  viaGestao,
  meuId,
}: {
  parada: Parada
  souMotorista: boolean
  viaGestao: boolean
  meuId: string
}) {
  const contato = parada.contatoDaParada ?? parada.contato
  const telefone = parada.telefoneDaParada ?? parada.telefone
  const zap = telefone?.replace(/\D/g, '')
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parada.endereco)}`

  return (
    <article className={estilo.foco}>
      <div className={estilo.focoTopo}>
        <Chip tom={parada.tipo === 'RETIRADA' ? 'warn' : 'info'}>
          {parada.tipo === 'RETIRADA' ? 'Coletar' : 'Entregar'}
        </Chip>
        {/* O NÚMERO DA O.S. LEVA À FICHA, para quem alcança a ficha.
            O motorista não: a ordem dele o devolveria ao app de campo, e um
            link que volta para onde já se está é uma porta pintada na parede. */}
        {souMotorista ? (
          <span className="mono">O.S. {String(parada.numero).padStart(5, '0')}</span>
        ) : (
          <Link href={`/sistema/ordens/${parada.ordemId}`} className={`mono ${estilo.focoLink}`}>
            O.S. {String(parada.numero).padStart(5, '0')}
          </Link>
        )}
        {parada.atrasada ? <Chip tom="danger">Atrasada</Chip> : null}
        {parada.motorista && !souMotorista ? (
          <Chip tom="pending">{parada.motorista}</Chip>
        ) : null}
      </div>

      <div>
        {souMotorista ? (
          <p className={estilo.focoCliente}>{parada.cliente}</p>
        ) : (
          <Link href={`/sistema/clientes/${parada.clienteId}`} className={estilo.focoClienteLink}>
            {parada.cliente}
          </Link>
        )}
        <p className={estilo.focoEndereco}>{parada.endereco}</p>
        {parada.referencia ? (
          <p className={estilo.campoDica}>Referência: {parada.referencia}</p>
        ) : null}
      </div>

      {parada.observacoes ? <p className={estilo.recado}>{parada.observacoes}</p> : null}

      <dl className={estilo.focoDado}>
        <dt>Aparelho</dt>
        <dd>{parada.equipamento}</dd>
      </dl>

      {contato ? (
        <dl className={estilo.focoDado}>
          <dt>Falar com</dt>
          <dd>{contato}</dd>
        </dl>
      ) : null}

      {/* Waze, Maps, WhatsApp e telefone. Quatro atalhos que evitam quatro
          trocas de aplicativo com o celular no colo. */}
      <div className={estilo.atalhos}>
        <a className={estilo.acaoLinha} href={mapa} target="_blank" rel="noreferrer">
          Maps
        </a>
        <a
          className={estilo.acaoLinha}
          href={`https://waze.com/ul?q=${encodeURIComponent(parada.endereco)}`}
          target="_blank"
          rel="noreferrer"
        >
          Waze
        </a>
        {zap ? (
          <a
            className={estilo.acaoLinha}
            href={`https://wa.me/55${zap}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        ) : null}
        {telefone ? (
          <a className={estilo.acaoLinha} href={`tel:${telefone.replace(/\D/g, '')}`}>
            Ligar
          </a>
        ) : null}
      </div>

      <JobDaVez
        job={{
          agendamentoId: parada.id,
          ordemId: parada.ordemId,
          tipo: parada.tipo,
          aceito: parada.aceitoEm !== null,
          emRota: parada.emRota,
          // O endereço da parada é texto; a coordenada só existe quando alguém
          // registrou. Sem ela, a chegada segue e a ausência fica anotada.
          temGps: false,
          minha: souMotorista && parada.motoristaId === meuId,
          viaGestao,
          motoristaNome: parada.motorista,
        }}
      />
    </article>
  )
}

/** A bancada do técnico, no celular. */
async function FilaDoTecnico() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  const ctx = contextoDe(sessao)
  const fila = await bancada(ctx, sessao.userId)

  if (fila.length === 0) {
    return (
      <>
        <Cabecalho nome={sessao.nome} apoio="Sua bancada" />
        <EmptyState
          titulo="Bancada limpa ✓"
          apoio="Quando um aparelho chegar, ele aparece aqui com o botão do próximo passo."
        />
      </>
    )
  }

  const [primeiro, ...resto] = fila

  return (
    <>
      <Cabecalho
        nome={sessao.nome}
        apoio={`${fila.length} ${fila.length === 1 ? 'aparelho' : 'aparelhos'} na sua bancada`}
      />

      {primeiro ? (
        <article className={estilo.foco}>
          <div className={estilo.focoTopo}>
            <Chip tom={estadoDaEtapa(primeiro.etapa).tom}>
              {estadoDaEtapa(primeiro.etapa).rotulo}
            </Chip>
            <span className="mono">O.S. {String(primeiro.numero).padStart(5, '0')}</span>
          </div>

          <div>
            <p className={estilo.focoCliente}>{primeiro.equipamento}</p>
            <p className={estilo.focoEndereco}>{primeiro.cliente}</p>
          </div>

          <dl className={estilo.focoDado}>
            <dt>O que o cliente relatou</dt>
            <dd>{primeiro.defeito}</dd>
          </dl>

          <dl className={estilo.focoDado}>
            <dt>Fotos de recebimento</dt>
            <dd>
              {primeiro.fotosRecebimento} de 6
              {primeiro.fotosRecebimento < 6 ? ' — faltam para dar entrada' : ''}
            </dd>
          </dl>

          {(() => {
            const acao = acaoDaVez(primeiro.etapa, sessao.papel)
            return acao ? <BotaoDaVez ordemId={primeiro.ordemId} acao={acao} largo /> : null
          })()}
        </article>
      ) : null}

      {resto.length > 0 ? (
        <section className={estilo.resto}>
          <h2 className="mono">Depois deste</h2>
          {resto.map((b) => (
            <Link key={b.ordemId} href={`/sistema/ordens/${b.ordemId}`} className={estilo.restoItem}>
              <span className={estilo.restoTxt}>
                <strong>{b.equipamento}</strong>
                <span>
                  {b.cliente} · {estadoDaEtapa(b.etapa).rotulo}
                </span>
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  )
}
