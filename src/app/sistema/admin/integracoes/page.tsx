import Link from 'next/link'
import { rotuloDoWhatsapp, whatsappNoAr } from '@/lib/whatsapp-estado'
import { painelWhatsapp } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import {
  Alerta,
  Bloco,
  CabecalhoTela,
  Chip,
  EmptyState,
  Secao,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * WHATSAPP / INTEGRAÇÕES — o cano por onde o sistema fala com o cliente.
 *
 * =============================================================================
 * A FALHA MAIS SILENCIOSA DO SISTEMA MORA AQUI
 * =============================================================================
 * Quando o número cai, nada na tela muda: o orçamento salva, a ordem anda, o
 * gestor aprova. O que para é o aviso ao cliente — e ele para sem erro, sem
 * alerta, engordando uma fila que ninguém tem motivo para abrir. Quem descobre
 * é o cliente, ligando dias depois para perguntar por que ninguém avisou.
 *
 * Por isso o selo da barra existe em toda tela do sistema, e por isso esta tela
 * abre pelo ESTADO e pela FILA, e não pelo histórico de mensagens.
 *
 * =============================================================================
 * O TOKEN NÃO PASSA POR AQUI
 * =============================================================================
 * A consulta não carrega o token cifrado da instância. Ele não tem por que sair
 * do servidor, e o jeito de garantir isso é não selecioná-lo — não escondê-lo
 * depois.
 */
export default async function Integracoes() {
  const { ctx } = await exigirTela('integracoes')

  const { instancia, mensagens, fila } = await painelWhatsapp(ctx)

  const conectado = whatsappNoAr(instancia?.status)
  const naFila = (fila.PENDENTE ?? 0) + (fila.PROCESSANDO ?? 0)
  const falhados = fila.FALHOU ?? 0
  // Entregue e lida também saíram — contar só ENVIADA subestimaria justamente
  // as que deram mais certo.
  const enviadas = mensagens.filter((m) => m.enviadaEm !== null).length
  const comErro = mensagens.filter((m) => m.erro !== null).length

  const stats: Stat[] = [
    {
      rotulo: 'Conexão',
      valor: conectado ? 'No ar' : instancia ? 'Fora do ar' : 'Sem número',
      apoio: instancia?.numero ?? 'nenhum número conectado',
      tom: conectado ? 'ok' : 'danger',
      icone: 'integracoes',
    },
    {
      rotulo: 'Na fila',
      valor: naFila,
      apoio: naFila === 0 ? 'nada esperando' : 'avisos aguardando saída',
      tom: naFila > 10 ? 'warn' : 'neutro',
      icone: 'ordens',
    },
    {
      rotulo: 'Falharam',
      valor: falhados,
      apoio: falhados === 0 ? 'nenhum' : 'não chegaram ao cliente',
      tom: falhados > 0 ? 'danger' : 'ok',
      icone: 'conferencia',
    },
    {
      rotulo: 'Últimas 40',
      valor: `${enviadas}/${mensagens.length}`,
      apoio: comErro > 0 ? `${comErro} com erro` : 'entregues',
      tom: comErro > 0 ? 'warn' : 'ok',
      icone: 'relatorios',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="WhatsApp / Integrações"
        apoio="O cano por onde o cliente é avisado. Quando ele entope, nada mais na tela muda."
        acao={
          <Link href="/painel/whatsapp" className={estilo.acao}>
            Conectar ou trocar o número
          </Link>
        }
      />

      {!conectado ? (
        <Alerta
          titulo={instancia ? 'O número está fora do ar' : 'Nenhum número conectado'}
          apoio="Enquanto isso, todo aviso ao cliente fica parado na fila — sem erro na tela de ninguém."
        />
      ) : null}

      <StatCardRow stats={stats} />

      <div className={estilo.split}>
        <div className={estilo.blocos}>
          <Secao titulo="Últimas mensagens">
            {mensagens.length === 0 ? (
              <EmptyState
                titulo="Nenhuma mensagem ainda"
                bom={false}
                apoio="Os avisos saem sozinhos quando uma O.S. muda de etapa."
              />
            ) : (
              <div className={estilo.radar}>
                {mensagens.map((m) => (
                  <div key={m.id} className={estilo.linha}>
                    <div className={estilo.linhaTxt}>
                      <div className={estilo.linhaTopo}>
                        <span className={estilo.linhaNumero}>{m.numero}</span>
                        <Chip tom={m.erro ? 'danger' : m.enviadaEm ? 'ok' : 'warn'}>
                          {m.erro ? 'Falhou' : m.enviadaEm ? 'Entregue' : 'Na fila'}
                        </Chip>
                        {m.ordem ? (
                          <Link
                            href={`/sistema/ordens/${m.ordem.id}`}
                            className={estilo.linhaNumero}
                          >
                            O.S. {String(m.ordem.numero).padStart(5, '0')}
                          </Link>
                        ) : null}
                      </div>
                      <span className={estilo.linhaApoio}>
                        {m.erro ?? m.corpo.slice(0, 140)}
                      </span>
                      <span className={estilo.linhaApoio}>
                        {m.template} ·{' '}
                        {(m.enviadaEm ?? m.criadoEm).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>
        </div>

        <aside className={estilo.blocos}>
          <Bloco titulo="A conexão">
            <div className={estilo.dinheiro}>
              <p className={estilo.dinheiroLinha}>
                <span>Estado</span>
                <strong>
                  <Chip tom={conectado ? 'ok' : 'danger'}>
                    {rotuloDoWhatsapp(instancia?.status)}
                  </Chip>
                </strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Número</span>
                <strong>{instancia?.numero ?? '—'}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Perfil</span>
                <strong>{instancia?.profileName ?? '—'}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Última notícia</span>
                <strong>
                  {instancia?.ultimoStatusEm
                    ? instancia.ultimoStatusEm.toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })
                    : '—'}
                </strong>
              </p>
            </div>
            <p className={estilo.campoDica}>
              O token da instância nunca sai do servidor — ele não é carregado
              nem para esta tela.
            </p>
          </Bloco>

          <Bloco titulo="A fila de saída">
            <div className={estilo.dinheiro}>
              {Object.entries(fila).length === 0 ? (
                <p className={estilo.campoDica}>Fila vazia.</p>
              ) : (
                Object.entries(fila).map(([status, n]) => (
                  <p key={status} className={estilo.dinheiroLinha}>
                    <span>{status.toLowerCase()}</span>
                    <strong>{n}</strong>
                  </p>
                ))
              )}
            </div>
            <p className={estilo.campoDica}>
              Job nasce na mesma transação da mudança de etapa: ou os dois
              acontecem, ou nada acontece. Fila crescendo quer dizer cano
              entupido, nunca aviso perdido.
            </p>
          </Bloco>
        </aside>
      </div>
    </>
  )
}
