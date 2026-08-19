'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import { dossieDaOrdem, type Dossie } from '@/server/acoes/acompanhar'
import { Despachar } from './despachar'
import estilo from '../painel.module.css'

/**
 * A TELINHA — tudo do cliente, sem sair da lista.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA JANELA, E NÃO ABRIR A FICHA
 * ---------------------------------------------------------------------------
 * O cliente liga perguntando do aparelho. Quem atende precisa de quatro coisas
 * em segundos: onde está, quanto é, quanto falta pagar e que prova existe.
 * Abrir a ficha inteira resolve — e custa a lista: sai da tela, perde a busca
 * que acabou de digitar, perde a posição da rolagem, e volta com o botão do
 * navegador. Com três clientes ligando seguido, isso é a tarde inteira.
 *
 * A janela devolve o contexto no fechar. A ficha continua a um clique, para
 * quem vai TRABALHAR na ordem — aqui é para RESPONDER.
 *
 * ---------------------------------------------------------------------------
 * O QUE PRECISA FUNCIONAR NUMA JANELA E QUASE NUNCA FUNCIONA
 * ---------------------------------------------------------------------------
 *  • Esc fecha, e clicar fora fecha. As duas, porque as duas são esperadas.
 *  • O foco entra na janela ao abrir e VOLTA para o cartão ao fechar. Sem isso
 *    quem usa teclado é largado no topo da página a cada consulta.
 *  • O foco não escapa para a lista atrás enquanto ela está aberta.
 *  • A página de trás não rola junto quando se rola a janela.
 *
 * O dossiê é buscado NO CLIQUE, e não junto com a lista: sessenta cartões com
 * fotos, pagamentos e assinaturas embutidos deixariam lenta justamente a tela
 * que existe para ser rápida.
 */
export function Telinha({
  ordemId,
  motoristas,
  aoFechar,
}: {
  ordemId: string
  motoristas: Array<{ id: string; nome: string }>
  aoFechar: () => void
}) {
  const [d, setD] = useState<Dossie | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    let vivo = true
    dossieDaOrdem(ordemId).then((r) => {
      if (!vivo) return
      if (r.ok) setD(r.dossie)
      else setErro(r.motivo)
    })
    return () => {
      vivo = false
    }
  }, [ordemId])

  /** Esc fecha; Tab circula dentro da janela. */
  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        aoFechar()
        return
      }
      if (e.key !== 'Tab' || !caixa.current) return
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    },
    [aoFechar],
  )

  useEffect(() => {
    document.addEventListener('keydown', aoTeclar)
    // A página de trás para de rolar. Sem isto, rolar dentro da janela empurra
    // a lista, e ao fechar a pessoa não está mais onde estava.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caixa.current?.focus()
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [aoTeclar])

  return (
    <div
      className={estilo.telaFundo}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <div
        ref={caixa}
        className={estilo.telaCaixa}
        role="dialog"
        aria-modal="true"
        aria-label={d ? `Ordem ${String(d.numero).padStart(4, '0')} de ${d.cliente.nome}` : 'Carregando a ordem'}
        tabIndex={-1}
      >
        <div className={estilo.telaTopo}>
          <div>
            {d ? (
              <>
                <p className={estilo.grav}>
                  O.S. #{String(d.numero).padStart(4, '0')} · aberta em {dia(d.abertaEm)}
                </p>
                <h2 className={estilo.telaTitulo}>{d.cliente.nome}</h2>
                <p className={estilo.fraco}>
                  {d.equipamento.marca} {d.equipamento.modelo}
                  {d.equipamento.numeroSerie ? ` · ${d.equipamento.numeroSerie}` : ''}
                  {d.cliente.cidade ? ` · ${d.cliente.cidade}${d.cliente.uf ? `/${d.cliente.uf}` : ''}` : ''}
                </p>
              </>
            ) : (
              <h2 className={estilo.telaTitulo}>{erro ?? 'Abrindo…'}</h2>
            )}
          </div>
          <button type="button" className={estilo.telaFechar} onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {!d ? (
          <p className={estilo.texto} style={{ padding: 'var(--s5)' }}>
            {erro ?? 'Buscando tudo desta ordem…'}
          </p>
        ) : (
          <div className={estilo.telaCorpo}>
            {/* --- Selos que mudam a conversa antes de qualquer número ----- */}
            <div className={estilo.telaSelos}>
              <span className={`${estilo.tag} ${d.atrasada ? estilo.tagAlerta : estilo.tagNeutra}`}>
                {d.trilha.agora}
              </span>
              {d.atrasada ? (
                <span className={`${estilo.tag} ${estilo.tagAlerta}`}>
                  passou do prazo {d.prazoPrometido ? `· ${dia(d.prazoPrometido)}` : ''}
                </span>
              ) : null}
              {d.emGarantia ? (
                <span className={`${estilo.tag} ${estilo.tagEspera}`}>retorno em garantia</span>
              ) : null}
              {d.tecnico ? <span className={estilo.fraco}>técnico: {d.tecnico}</span> : null}
            </div>

            {d.faltaPeca ? <p className={estilo.erro}>{d.faltaPeca}</p> : null}

            {/* --- A LINHA DO TEMPO, que é o motivo da tela existir --------- */}
            <section className={estilo.telaBloco}>
              <p className={estilo.blocoTitulo}>
                <span>Linha do tempo</span>
                <span className={estilo.fraco}>
                  {d.trilha.cumpridos} de {d.trilha.total}
                </span>
              </p>
              <div className={estilo.telaFio}>
                <span
                  className={d.trilha.desvio ? estilo.trilhaMiniParado : estilo.trilhaMiniCheio}
                  style={{ width: `${d.trilha.porcento}%` }}
                />
              </div>
              {/* O estado da FASE sai dos nós dela, e não de um campo próprio:
                  a fase é onde o aparelho está se algum nó dela é o "agora", e
                  está concluída quando todos os nós já passaram. Guardar isso
                  duas vezes seria a chance de as duas discordarem. */}
              <ol className={estilo.telaFases}>
                {d.trilha.fases.map((f) => {
                  const aqui = f.nos.some((n) => n.estado === 'agora')
                  const feita = f.nos.every((n) => n.estado === 'cumprido')
                  const feitos = f.nos.filter((n) => n.estado === 'cumprido').length
                  return (
                    <li key={f.nome} className={aqui ? estilo.telaFaseAgora : estilo.telaFase}>
                      <strong>{f.nome}</strong>
                      <span className={estilo.fraco}>{f.quem}</span>
                      <span className={estilo.fraco}>
                        {aqui ? 'aqui agora' : feita ? 'concluída' : `${feitos}/${f.nos.length}`}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>

            <div className={estilo.telaDuas}>
              {/* --- Contrato e valor --------------------------------------- */}
              <section className={estilo.telaBloco}>
                <p className={estilo.blocoTitulo}>Contrato e valor</p>
                {!d.orcamento ? (
                  <p className={estilo.texto}>Ainda não há orçamento montado.</p>
                ) : (
                  <>
                    <div className={estilo.telaValor}>{formatarBRL(d.orcamento.totalCentavos)}</div>
                    <p className={estilo.fraco}>
                      Orçamento #{String(d.orcamento.numero).padStart(4, '0')} · versão {d.orcamento.versao} ·{' '}
                      {rotuloStatus(d.orcamento.status)}
                      {d.orcamento.garantiaDias > 0 ? ` · ${d.orcamento.garantiaDias} dias de garantia` : ''}
                    </p>
                    {d.orcamento.aprovadoPorNome ? (
                      <p className={estilo.fraco}>
                        Aceito por {d.orcamento.aprovadoPorNome}
                        {d.orcamento.respondidoEm ? ` em ${dataHora(d.orcamento.respondidoEm)}` : ''}
                      </p>
                    ) : null}
                    <ul className={estilo.telaItens}>
                      {d.orcamento.itens.map((i, n) => (
                        <li key={n}>
                          <span>
                            {i.quantidade > 1 ? `${i.quantidade}× ` : ''}
                            {i.descricao}
                          </span>
                          <span className={estilo.num}>{formatarBRL(i.totalCentavos)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* --- Financeiro -------------------------------------------- */}
              <section className={estilo.telaBloco}>
                <p className={estilo.blocoTitulo}>Financeiro</p>
                {!d.fatura ? (
                  <p className={estilo.texto}>Ainda não foi faturado.</p>
                ) : (
                  <>
                    <div className={estilo.telaValor}>{formatarBRL(d.fatura.valorTotalCentavos)}</div>
                    <p className={estilo.fraco}>
                      Fatura #{String(d.fatura.numero).padStart(4, '0')} · {rotuloStatus(d.fatura.status)}
                    </p>
                    {/* O saldo só aparece quando existe. Repetir "quitada"
                        logo abaixo do status que já diz "quitada" é ruído no
                        lugar onde se procura número. */}
                    {d.fatura.emAbertoCentavos > 0 ? (
                      <p className={estilo.telaAberto}>
                        {formatarBRL(d.fatura.emAbertoCentavos)} em aberto
                      </p>
                    ) : null}
                    <ul className={estilo.telaItens}>
                      {d.fatura.pagamentos.map((pg) => (
                        <li key={pg.id}>
                          <span>
                            {pg.forma} · {dia(pg.recebidoEm)}
                          </span>
                          <span className={estilo.num}>{formatarBRL(pg.valorCentavos)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>

            {/* --- AS ASSINATURAS: a base de tudo -------------------------- */}
            <section className={estilo.telaBloco}>
              <p className={estilo.blocoTitulo}>
                <span>Assinaturas</span>
                <span className={estilo.fraco}>{d.assinaturas.length}</span>
              </p>
              {d.assinaturas.length === 0 ? (
                <p className={estilo.texto}>Nenhuma ainda. A primeira vem na retirada.</p>
              ) : (
                <div className={estilo.telaAssinaturas}>
                  {d.assinaturas.map((s) => (
                    <div key={s.id} className={estilo.assinatura}>
                      <img
                        className={estilo.assinaturaTraco}
                        src={`/api/assinatura/${s.id}`}
                        alt={`Assinatura de ${s.nome}`}
                        loading="lazy"
                      />
                      <p className={estilo.parVal}>
                        <strong>{rotuloAssinatura(s.tipo)}</strong> — {s.nome}
                      </p>
                      {s.documento ? <p className={estilo.fraco}>CPF {s.documento}</p> : null}
                      <p className={estilo.fraco}>
                        {dataHora(s.quando)}
                        {s.coordenada ? ` · ${s.coordenada}` : ' · sem coordenada'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* --- As fotos ----------------------------------------------- */}
            <section className={estilo.telaBloco}>
              <p className={estilo.blocoTitulo}>
                <span>Fotos</span>
                <span className={estilo.fraco}>{d.fotos.length}</span>
              </p>
              {d.fotos.length === 0 ? (
                <p className={estilo.texto}>Nenhuma foto registrada ainda.</p>
              ) : (
                <div className={estilo.telaFotos}>
                  {d.fotos.map((f) => (
                    <a key={f.id} href={`/api/foto/${f.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/foto/${f.id}?t=1`} alt={f.legenda ?? f.categoria} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* --- A rua --------------------------------------------------- */}
            {d.agendamentos.length > 0 ? (
              <section className={estilo.telaBloco}>
                <p className={estilo.blocoTitulo}>Rota</p>
                <ul className={estilo.telaItens}>
                  {d.agendamentos.map((a) => (
                    <li key={a.id}>
                      <span>
                        {a.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'} · {dataHora(a.previstoPara)}
                        {a.motorista ? ` · ${a.motorista}` : ' · sem motorista'}
                      </span>
                      <span className={estilo.fraco}>{rotuloStatus(a.status)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}

        {d ? (
          <div className={estilo.telaPe}>
            {d.despacho ? (
              <Despachar
                ordemId={d.id}
                tipo={d.despacho}
                enderecoSugerido={
                  [d.cliente.endereco, d.cliente.cidade].filter(Boolean).join(', ') || ''
                }
                contatoNome={d.cliente.nome}
                contatoTelefone={d.cliente.whatsapp ?? ''}
                motoristas={motoristas}
                aoDespachar={() => {
                  router.refresh()
                  aoFechar()
                }}
              />
            ) : null}
            <Link href={`/painel/ordens/${d.id}`} className={estilo.btnSec}>
              Abrir a ficha completa
            </Link>
            <Link href={`/painel/equipamentos/${d.equipamento.id}`} className={estilo.btnSec}>
              Prontuário do aparelho
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const dia = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const dataHora = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

/** Estados do banco em português de gente. */
function rotuloStatus(s: string): string {
  const m: Record<string, string> = {
    RASCUNHO: 'rascunho',
    ENVIADO: 'enviado ao cliente',
    APROVADO: 'aceito',
    REPROVADO: 'recusado',
    EXPIRADO: 'vencido',
    ABERTA: 'em aberto',
    PARCIAL: 'parcialmente paga',
    QUITADA: 'quitada',
    CANCELADA: 'cancelada',
    PENDENTE: 'sem motorista',
    ATRIBUIDO: 'motorista definido',
    EM_ROTA: 'na rua',
    CONCLUIDO: 'concluído',
  }
  return m[s] ?? s.toLowerCase().replace(/_/g, ' ')
}

function rotuloAssinatura(t: string): string {
  const m: Record<string, string> = {
    RETIRADA: 'Na retirada',
    ENTREGA: 'No recebimento',
    APROVACAO_ORCAMENTO: 'No aceite do orçamento',
  }
  return m[t] ?? t
}
