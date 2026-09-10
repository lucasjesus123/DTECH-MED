import Link from 'next/link'
import { agoraNoServidor } from '@/lib/datas'
import { formatarBRL } from '@/lib/dinheiro'
import { ordensTravadasPorPeca } from '@/server/estoque/pendencia'
import { visitasAVencer } from '@/server/preventiva/servico'
import { exigirTela } from '@/server/sistema/guarda'
import {
  Alerta,
  CabecalhoTela,
  Chip,
  EmptyState,
  Secao,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * PREVENTIVA — o trabalho que não vai procurar você.
 *
 * =============================================================================
 * ELA MOSTRA O QUE VENCE, NÃO O QUE EXISTE
 * =============================================================================
 * Uma lista de contratos ativos é cadastro. A lista de visitas A VENCER é
 * trabalho — e é assim que contrato de manutenção morre na prática: ele existe
 * no papel e a visita não acontece, porque ninguém lembra.
 *
 * =============================================================================
 * A ORDEM TRAVADA POR PEÇA MORA AQUI TAMBÉM
 * =============================================================================
 * As duas listas respondem à mesma pergunta de gestão: *"o que eu preciso fazer
 * esta semana que não vai me procurar sozinho"*. A visita atrasada não reclama;
 * a ordem parada esperando peça também não. As duas somem se ninguém for atrás.
 */
export default async function Preventiva() {
  const { ctx } = await exigirTela('preventiva')

  const [visitas, travadas] = await Promise.all([
    visitasAVencer(ctx, 45),
    ordensTravadasPorPeca(ctx),
  ])

  const agora = agoraNoServidor().getTime()
  const vencidas = visitas.filter((v) => v.previstaPara.getTime() < agora)
  const naSemana = visitas.filter((v) => {
    const t = v.previstaPara.getTime()
    return t >= agora && t <= agora + 7 * 86_400_000
  })
  const receita = visitas.reduce((s, v) => s + (v.contrato.valorVisitaCentavos ?? 0), 0)

  const stats: Stat[] = [
    {
      rotulo: 'Visitas vencidas',
      valor: vencidas.length,
      apoio: vencidas.length === 0 ? 'nenhuma atrasada' : 'passaram da data',
      tom: vencidas.length > 0 ? 'danger' : 'ok',
      icone: 'preventiva',
    },
    {
      rotulo: 'Nos próximos 7 dias',
      valor: naSemana.length,
      apoio: 'para agendar agora',
      tom: naSemana.length > 0 ? 'warn' : 'ok',
      icone: 'agenda',
    },
    {
      rotulo: 'Em 45 dias',
      valor: visitas.length,
      apoio: 'total previsto',
      icone: 'relatorios',
    },
    {
      rotulo: 'Receita prevista',
      valor: formatarBRL(receita),
      apoio: 'se todas acontecerem',
      tom: 'info',
      icone: 'financeiro',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Preventiva"
        apoio="O que vence, o que trava, e o que ninguém vai lembrar sozinho."
      />

      {vencidas.length > 0 ? (
        <Alerta
          titulo={`${vencidas.length} ${vencidas.length === 1 ? 'visita venceu' : 'visitas venceram'} e não aconteceram`}
          apoio="Cada uma é uma promessa de contrato não cumprida — e o cliente não vai ligar para cobrar."
        />
      ) : null}

      <StatCardRow stats={stats} />

      <Secao titulo="Visitas // a vencer">
        {visitas.length === 0 ? (
          <EmptyState
            titulo="Nada vencendo ✓"
            apoio="Nenhuma visita preventiva prevista para os próximos 45 dias."
          />
        ) : (
          <div className={estilo.radar}>
            {visitas.map((v) => {
              const atrasada = v.previstaPara.getTime() < agora
              const zap = v.contrato.cliente.whatsapp?.replace(/\D/g, '')
              return (
                <div key={v.id} className={estilo.linha}>
                  <div className={estilo.linhaTxt}>
                    <div className={estilo.linhaTopo}>
                      <span className={estilo.linhaNumero}>
                        Contrato {String(v.contrato.numero).padStart(4, '0')}
                      </span>
                      <Chip tom={atrasada ? 'danger' : 'warn'}>
                        {v.previstaPara.toLocaleDateString('pt-BR')}
                      </Chip>
                      {atrasada ? <Chip tom="danger">Vencida</Chip> : null}
                    </div>
                    <span className={estilo.linhaTitulo}>
                      {`${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}`.trim()}
                    </span>
                    <div className={estilo.linhaApoio}>
                      <span>{v.contrato.cliente.nome}</span>
                      {v.contrato.valorVisitaCentavos ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="num">
                            {formatarBRL(v.contrato.valorVisitaCentavos)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className={estilo.linhaAcao}>
                    {/* A ação-da-vez aqui é FALAR COM O CLIENTE. A visita vira
                        O.S. depois que ele confirmar o dia — abrir a ordem antes
                        disso enche a esteira de trabalho que ninguém marcou. */}
                    {zap ? (
                      <a
                        className={estilo.acao}
                        href={`https://wa.me/55${zap}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Combinar a visita
                      </a>
                    ) : (
                      <Link
                        href={`/sistema/clientes/${v.contrato.cliente.id}`}
                        className={estilo.acaoLinha}
                      >
                        Ver o cliente
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Secao>

      <Secao titulo="Esteira // travada por peça">
        {travadas.length === 0 ? (
          <EmptyState
            titulo="Nenhuma ordem travada ✓"
            apoio="Nenhum serviço aprovado está parado esperando peça chegar."
          />
        ) : (
          <div className={estilo.radar}>
            {travadas.map((o) => (
              <div key={o.id} className={estilo.linha}>
                <div className={estilo.linhaTxt}>
                  <div className={estilo.linhaTopo}>
                    <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaNumero}>
                      O.S. {String(o.numero).padStart(5, '0')}
                    </Link>
                    <Chip tom="warn">Esperando peça</Chip>
                  </div>
                  <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaTitulo}>
                    {`${o.equipamento.marca} ${o.equipamento.modelo}`.trim()}
                  </Link>
                  <div className={estilo.linhaApoio}>
                    <span>{o.cliente.nome}</span>
                    {/* A frase já vem pronta da consulta: ela sabe quanto falta
                        de cada peça, e repetir essa conta aqui seria a segunda
                        versão de um cálculo que só pode ter uma. */}
                    {o.pendencia.aviso ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{o.pendencia.aviso}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className={estilo.linhaAcao}>
                  <Link href="/painel/estoque" className={estilo.acaoLinha}>
                    Ver no estoque
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </>
  )
}
