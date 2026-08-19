import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { formatarBRL } from '@/lib/dinheiro'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao, podeVer } from '@/server/auth/guarda'
import { prontuario } from '@/server/consultas/painel'
import { listarPecas, motoristasDaEmpresa, tecnicosDaEmpresa } from '@/server/consultas/listas'
import { proximosPassos, ROTULO_DOCUMENTO, ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { verificarIntegridade } from '@/server/ordem/motor'
import { env } from '@/lib/env'
import BotoesEtapa from './botoes-etapa'
import Diagnostico from './diagnostico'
import Responsavel from './responsavel'
import Orcamento from './orcamento'
import estilo from '../../painel.module.css'
import { diaLocal } from '@/lib/datas'
import { montarTrilha } from '@/server/ordem/trilha'
import { TrilhaDoEquipamento } from './trilha'

export const metadata: Metadata = { title: 'Prontuário da ordem', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O prontuário do equipamento.
 *
 * É a tela que justifica o sistema inteiro. No ERP antigo, para responder
 * "o que está acontecendo com o aparelho da clínica tal", alguém precisava
 * abrir O.S., depois Financeiro, depois Produtos, depois procurar a foto no
 * WhatsApp de quem retirou. Aqui é uma página: a história do aparelho, quem
 * encostou nele, quanto custou, o que já saiu do estoque e o que o cliente viu.
 *
 * A linha do tempo mostra o hash de cada evento e verifica a corrente inteira
 * ao abrir. Se alguém tiver mexido no banco por fora, aparece aqui — e é isso
 * que faz o histórico ter valor de prova, e não só de anotação.
 */
export default async function Prontuario({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, sessao } = await exigirSessao()
  const { id } = await params

  const o = await prontuario(ctx, id)
  // Ordem de outra franquia não devolve linha nenhuma pelo RLS. Para quem
  // tentar o id por sorte, a resposta é indistinguível de "não existe" — e é
  // exatamente essa indistinção que evita confirmar a existência do registro.
  if (!o) notFound()

  const [integridade, tecnicos, motoristas, pecas] = await Promise.all([
    verificarIntegridade(ctx, id),
    tecnicosDaEmpresa(ctx),
    motoristasDaEmpresa(ctx),
    listarPecas(ctx),
  ])

  const passos = proximosPassos(o.etapa, sessao.papel)
  const orcamentoAtual = o.orcamentos[0] ?? null
  const linkPortal = `${env.APP_URL}/os/${o.tokenPublico}`

  const fotosPorCategoria = o.fotos.reduce<Record<string, typeof o.fotos>>((acc, f) => {
    ;(acc[f.categoria] ??= []).push(f)
    return acc
  }, {})

  /* A trilha lê a etapa atual e os eventos: onde a peça está, e quando ela
     passou por cada ponto. O cálculo mora em `@/server/ordem/trilha` porque a
     mesma régua aparece no portal do cliente. */
  const trilha = montarTrilha(
    o.etapa,
    o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
  )

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>
            O.S. #{String(o.numero).padStart(4, '0')} · aberta em {dataCurta(o.abertaEm)}
          </p>
          <h1 className={estilo.titulo}>
            {o.equipamento.marca} {o.equipamento.modelo}
          </h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            {o.cliente.nome}
            {o.cliente.cidade ? ` · ${o.cliente.cidade}${o.cliente.uf ? `/${o.cliente.uf}` : ''}` : ''}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 'var(--s2)', justifyItems: 'end' }}>
          <span className={estilo.tag} style={{ fontSize: 11, padding: '6px 12px' }}>
            {ROTULO_ETAPA[o.etapa]}
          </span>
          {o.prazoPrometido ? (
            <span
              className={estilo.fraco}
              style={o.prazoPrometido < new Date() ? { color: 'var(--alerta)' } : undefined}
            >
              prazo {dataCurta(o.prazoPrometido)}
            </span>
          ) : null}
        </div>
      </div>

      {/* --- A TRILHA, largura inteira, antes de tudo -------------------
          A primeira pergunta de quem abre uma ficha é sempre a mesma: onde
          está o aparelho. Ela vem antes das ações porque responder é mais
          rápido que decidir. */}
      <TrilhaDoEquipamento trilha={trilha} />

      <div className={estilo.duasColunas}>
        {/* ===== Coluna principal ========================================== */}
        <div>
          {/* --- Os próximos passos, no topo: é o que a pessoa veio fazer --- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>O que dá para fazer agora</span>
              {integridade.integra ? (
                <span className={`${estilo.tag} ${estilo.tagOk}`}>histórico íntegro</span>
              ) : (
                <span className={`${estilo.tag} ${estilo.tagAlerta}`}>
                  histórico alterado na sequência {integridade.quebrouNaSequencia}
                </span>
              )}
            </p>

            {passos.length === 0 ? (
              <p className={estilo.texto}>
                {o.etapa === 'ORCAMENTO_ENVIADO'
                  ? 'A bola está com o cliente. Ele responde pelo link que recebeu no WhatsApp — ninguém aqui dentro aprova no lugar dele.'
                  : 'Nenhum passo disponível para o seu perfil nesta etapa.'}
              </p>
            ) : (
              <BotoesEtapa ordemId={o.id} passos={passos.map((p) => ({ para: p.para, titulo: p.titulo, avisaCliente: p.avisaCliente }))} />
            )}

            <div className={estilo.passos}>
              <a href={linkPortal} target="_blank" rel="noreferrer" className={estilo.btnSec}>
                Abrir o portal como o cliente vê
              </a>
            </div>
          </div>

          {/* --- Relato, diagnóstico, execução ---------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>O aparelho</p>
            <div className={estilo.pares}>
              <Par rot="Marca e modelo" val={`${o.equipamento.marca} ${o.equipamento.modelo}`} />
              <Par rot="Número de série" val={o.equipamento.numeroSerie ?? '—'} />
              <Par rot="Categoria" val={o.equipamento.categoria ?? '—'} />
              <Par rot="Acessórios que vieram" val={o.equipamento.acessorios ?? 'nenhum registrado'} />
            </div>

            <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
              O que o cliente relatou
            </p>
            <p className={estilo.texto}>{o.defeitoRelatado}</p>

            {o.diagnostico ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  O que o técnico encontrou
                </p>
                <p className={estilo.texto}>{o.diagnostico}</p>
              </>
            ) : null}

            {o.parecerTecnico ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  Parecer para a gestão
                </p>
                <p className={estilo.texto}>{o.parecerTecnico}</p>
              </>
            ) : null}

            {o.servicoExecutado ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  O que foi executado
                </p>
                <p className={estilo.texto}>{o.servicoExecutado}</p>
              </>
            ) : null}

            {o.testesFinais ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  Testes finais
                </p>
                <p className={estilo.texto}>{o.testesFinais}</p>
              </>
            ) : null}

            {podeVer(sessao.papel, Papel.TECNICO) ? (
              <div style={{ marginTop: 'var(--s5)' }}>
                <Diagnostico
                  ordemId={o.id}
                  diagnostico={o.diagnostico ?? ''}
                  parecerTecnico={o.parecerTecnico ?? ''}
                  servicoExecutado={o.servicoExecutado ?? ''}
                  testesFinais={o.testesFinais ?? ''}
                />
              </div>
            ) : null}
          </div>

          {/* --- Orçamento ------------------------------------------------ */}
          <Orcamento
            ordemId={o.id}
            etapa={o.etapa}
            papel={sessao.papel}
            pecas={pecas.map((p) => ({
              id: p.id,
              sku: p.sku,
              nome: p.nome,
              precoVendaCentavos: p.precoVendaCentavos,
              livre: p.livre,
            }))}
            orcamentos={o.orcamentos.map((orc) => ({
              id: orc.id,
              numero: orc.numero,
              versao: orc.versao,
              status: orc.status,
              totalCentavos: orc.totalCentavos,
              subtotalPecas: orc.subtotalPecas,
              subtotalServicos: orc.subtotalServicos,
              descontoCentavos: orc.descontoCentavos,
              acrescimoCentavos: orc.acrescimoCentavos,
              garantiaDias: orc.garantiaDias,
              prazoExecucaoDias: orc.prazoExecucaoDias,
              validoAte: orc.validoAte?.toISOString() ?? null,
              enviadoEm: orc.enviadoEm?.toISOString() ?? null,
              respondidoEm: orc.respondidoEm?.toISOString() ?? null,
              aprovadoPorNome: orc.aprovadoPorNome,
              motivoReprovacao: orc.motivoReprovacao,
              itens: orc.itens.map((i) => ({
                id: i.id,
                tipo: i.tipo,
                descricao: i.descricao,
                quantidade: Number(i.quantidade),
                valorUnitCentavos: i.valorUnitCentavos,
                valorTotalCentavos: i.valorTotalCentavos,
              })),
            }))}
          />

          {/* --- Fotos ---------------------------------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Fotos</span>
              <span className={estilo.fraco}>{o.fotos.length} no total</span>
            </p>
            {o.fotos.length === 0 ? (
              <p className={estilo.texto}>
                Nenhuma foto ainda. O recebimento na oficina exige no mínimo seis —
                é o que registra o estado em que o aparelho chegou.
              </p>
            ) : (
              Object.entries(fotosPorCategoria).map(([categoria, fotos]) => (
                <div key={categoria} style={{ marginBottom: 'var(--s4)' }}>
                  <p className={estilo.parRot} style={{ marginBottom: 'var(--s2)' }}>
                    {rotuloCategoria(categoria)} · {fotos.length}
                  </p>
                  <div className={estilo.galeria}>
                    {fotos.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/foto/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={estilo.foto}
                        title={`Enviada por ${f.autorNome} em ${dataHora(f.criadoEm)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/foto/${f.id}?t=1`} alt={f.legenda ?? 'Foto do equipamento'} loading="lazy" />
                        <span className={estilo.fotoRot}>{primeiroNome(f.autorNome)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* --- Peças e estoque ------------------------------------------ */}
          {o.movimentos.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Peças desta ordem</p>
              <div className={estilo.rolaX}>
                <table className={estilo.tabela}>
                  <thead>
                    <tr>
                      <th>Peça</th>
                      <th>Movimento</th>
                      <th className={estilo.dir}>Qtd.</th>
                      <th>Quem</th>
                      <th>Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.movimentos.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className={estilo.forte}>{m.peca.nome}</span>
                          <div className={estilo.fraco}>{m.peca.sku}</div>
                        </td>
                        <td>
                          <span className={estilo.tag}>{m.tipo.toLowerCase()}</span>
                        </td>
                        <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.quantidade)}</td>
                        <td>{m.autorNome}</td>
                        <td className={estilo.num}>{dataCurta(m.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        {/* ===== Coluna lateral ============================================ */}
        <div>
          <Responsavel
            ordemId={o.id}
            tecnicoAtualId={o.tecnicoId}
            prazoPrometido={o.prazoPrometido ? diaLocal(o.prazoPrometido) : ''}
            prioridade={o.prioridade === 'ALTA' ? 'ALTA' : 'NORMAL'}
            tecnicos={tecnicos}
          />

          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>Cliente</p>
            <div className={estilo.pares}>
              <Par rot="Nome" val={o.cliente.nome} />
              <Par rot="Documento" val={mascarar(o.cliente.documento)} />
              <Par rot="Contato" val={o.cliente.contatoNome ?? '—'} />
              <Par rot="WhatsApp" val={o.cliente.whatsapp ? telefone(o.cliente.whatsapp) : '—'} />
              <Par
                rot="Endereço"
                val={
                  [o.cliente.logradouro, o.cliente.numero, o.cliente.bairro, o.cliente.cidade]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
            </div>
          </div>

          {o.fatura ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>
                <span>Fatura #{o.fatura.numero}</span>
                <span
                  className={`${estilo.tag} ${o.fatura.status === 'QUITADA' ? estilo.tagOk : estilo.tagEspera}`}
                >
                  {o.fatura.status.toLowerCase()}
                </span>
              </p>
              <div className={estilo.pares}>
                <Par rot="Total" val={formatarBRL(o.fatura.valorTotalCentavos)} />
                <Par rot="Recebido" val={formatarBRL(o.fatura.valorPagoCentavos)} />
                <Par
                  rot="Em aberto"
                  val={formatarBRL(
                    Math.max(
                      0,
                      o.fatura.valorTotalCentavos +
                        o.fatura.multaCentavos +
                        o.fatura.jurosCentavos -
                        o.fatura.valorPagoCentavos,
                    ),
                  )}
                />
                <Par rot="Conferida" val={o.fatura.conferido ? `sim, por ${o.fatura.conferidoPorNome}` : 'ainda não'} />
              </div>
              {o.fatura.pagamentos.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--s4) 0 0' }}>
                  {o.fatura.pagamentos.map((p) => (
                    <li key={p.id} className={estilo.fraco} style={{ marginBottom: 4 }}>
                      {formatarBRL(p.valorCentavos)} em {p.forma.toLowerCase().replace('_', ' ')}
                      {p.parcelas > 1 ? ` em ${p.parcelas}x` : ''} · {dataCurta(p.recebidoEm)}
                      {p.estornadoEm ? ' · ESTORNADO' : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={estilo.passos}>
                <Link href="/painel/financeiro" className={estilo.btnSec}>
                  Ir para o financeiro
                </Link>
              </div>
            </div>
          ) : null}

          {o.assinaturas.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Assinaturas</p>
              {o.assinaturas.map((s) => (
                <div key={s.id} style={{ marginBottom: 'var(--s3)' }}>
                  <p className={estilo.parVal}>
                    <strong>{rotuloAssinatura(s.tipo)}</strong> — {s.assinanteNome}
                  </p>
                  <p className={estilo.fraco}>
                    {dataHora(s.criadoEm)}
                    {s.latitude != null ? ` · ${s.latitude.toFixed(5)}, ${s.longitude?.toFixed(5)}` : ' · sem coordenada'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {o.documentos.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Documentos</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s2)' }}>
                {o.documentos.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/api/documento/${d.tokenAcesso}`}
                      target="_blank"
                      rel="noreferrer"
                      className={estilo.parVal}
                      style={{ color: 'var(--vio-claro)', textDecoration: 'none' }}
                    >
                      {ROTULO_DOCUMENTO[d.tipo] ?? d.tipo} nº {d.numero.split('-').pop()?.replace(/^0+/, '')}
                    </a>
                    <div className={estilo.fraco}>{dataCurta(d.geradoEm)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {o.agendamentos.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Rota</p>
              {o.agendamentos.map((ag) => (
                <div key={ag.id} style={{ marginBottom: 'var(--s3)' }}>
                  <p className={estilo.parVal}>
                    <strong>{ag.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'}</strong> ·{' '}
                    {dataHora(ag.previstoPara)}
                  </p>
                  <p className={estilo.fraco}>
                    {ag.motorista?.nome ?? 'sem motorista'} · {ag.status.toLowerCase()}
                  </p>
                  <p className={estilo.fraco}>{ag.enderecoSnapshot}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* --- A linha do tempo ----------------------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Linha do tempo</span>
              <span className={estilo.fraco}>{integridade.total} eventos</span>
            </p>
            <ul className={estilo.linha}>
              {o.eventos.map((e, i) => (
                <li key={e.id} className={`${estilo.evento} ${i === 0 ? estilo.eventoAtual : ''}`}>
                  <div className={estilo.eventoTop}>
                    <span className={estilo.eventoTitulo}>{e.titulo}</span>
                    <span className={estilo.eventoQuando}>{dataHora(e.criadoEm)}</span>
                  </div>
                  <p className={estilo.eventoQuem}>
                    {e.autorNome ?? 'sistema'}
                    {e.autorPapel ? ` · ${e.autorPapel.toLowerCase().replace('_', ' ')}` : ''}
                    {e.visivelCliente ? ' · o cliente viu' : ''}
                  </p>
                  {e.descricao ? <p className={estilo.fraco}>{e.descricao}</p> : null}
                  {/* O hash não é enfeite: é o que permite conferir, meses
                      depois, que este evento não foi reescrito. */}
                  <p className={estilo.eventoHash}>#{e.sequencia} · {e.hash.slice(0, 16)}…</p>
                </li>
              ))}
            </ul>
          </div>

          {motoristas.length === 0 ? (
            <p className={estilo.fraco}>
              Nenhum motorista cadastrado ainda — sem ele a retirada não pode ser
              atribuída.
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Par({ rot, val }: { rot: string; val: string }) {
  return (
    <div className={estilo.par}>
      <span className={estilo.parRot}>{rot}</span>
      <span className={estilo.parVal}>{val}</span>
    </div>
  )
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

const dataCurta = (d: Date) => fmtData.format(d)
const dataHora = (d: Date) => fmtDataHora.format(d)
const primeiroNome = (n: string) => n.split(' ')[0] ?? n

/** Mostra só os últimos dígitos: a tela não precisa exibir o documento inteiro. */
function mascarar(d: string): string {
  if (d.length === 11) return `•••.•••.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `••.•••.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

function telefone(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

function rotuloCategoria(c: string): string {
  const m: Record<string, string> = {
    RECEBIMENTO: 'Como chegou',
    ANALISE: 'Análise',
    EXECUCAO: 'Durante o conserto',
    PECA_SUBSTITUIDA: 'Peça substituída',
    TESTE_FINAL: 'Teste final',
    ENTREGA: 'Entrega',
  }
  return m[c] ?? c
}

function rotuloAssinatura(t: string): string {
  const m: Record<string, string> = {
    RETIRADA: 'Retirada',
    APROVACAO_ORCAMENTO: 'Aprovação do orçamento',
    ENTREGA: 'Entrega',
  }
  return m[t] ?? t
}

