import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { visitasAVencer, ROTULO_PERIODICIDADE } from '@/server/preventiva/servico'
import { ordensTravadasPorPeca } from '@/server/estoque/pendencia'
import NovoContrato, { type EquipamentoOpcao } from './novo-contrato'
import { EncerrarContrato, GerarOrdem } from './acoes'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Preventiva', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * PREVENTIVA — o trabalho que não depende de nada quebrar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA EXISTE
 * ---------------------------------------------------------------------------
 * Uma assistência que só conserta o que quebra vive de sobressalto: o mês bom
 * depende de o cliente ter um problema. A revisão periódica inverte isso.
 *
 * Mas contrato de manutenção morre de um jeito só: ele existe no papel e a
 * visita não acontece, porque ninguém lembra. Esta tela é o antídoto — ela
 * mostra o que VENCE, não o que existe. Uma lista de contratos ativos seria
 * cadastro; a lista de visitas a vencer é trabalho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A FALTA DE PEÇA APARECE AQUI TAMBÉM
 * ---------------------------------------------------------------------------
 * As duas listas respondem à mesma pergunta de gestão — "o que eu preciso fazer
 * esta semana que não vai me procurar sozinho". A visita atrasada não reclama;
 * a ordem parada esperando peça também não. As duas somem se ninguém for atrás.
 */
export default async function Preventiva() {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE, Papel.FINANCEIRO)

  const [visitas, travadas, contratos, equipamentos] = await Promise.all([
    visitasAVencer(ctx, 45),
    ordensTravadasPorPeca(ctx),
    comEscopo(ctx, (tx) =>
      tx.contratoManutencao.findMany({
        where: { ativo: true },
        orderBy: { numero: 'desc' },
        select: {
          id: true,
          numero: true,
          periodicidade: true,
          valorVisitaCentavos: true,
          cliente: { select: { nome: true } },
          equipamento: { select: { id: true, marca: true, modelo: true } },
          _count: { select: { visitas: true } },
        },
      }),
    ),
    comEscopo(ctx, (tx) =>
      tx.equipamento.findMany({
        orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
        take: 400,
        select: {
          id: true,
          marca: true,
          modelo: true,
          numeroSerie: true,
          cliente: { select: { nome: true } },
          contratos: { where: { ativo: true }, select: { id: true }, take: 1 },
        },
      }),
    ),
  ])

  const opcoes: EquipamentoOpcao[] = equipamentos.map((e) => ({
    id: e.id,
    rotulo: `${e.marca} ${e.modelo}${e.numeroSerie ? ` (${e.numeroSerie})` : ''}`,
    cliente: e.cliente.nome,
    jaTemContrato: e.contratos.length > 0,
  }))

  const agora = new Date()
  const atrasadas = visitas.filter((v) => v.previstaPara < agora)
  const receitaMes = contratos.reduce((s, c) => s + c.valorVisitaCentavos * fatorMensal(c.periodicidade), 0)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Preventiva</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O trabalho que não depende de nada quebrar — e o que está travado esperando peça.
          </p>
        </div>
        <NovoContrato equipamentos={opcoes} />
      </div>

      <div className={estilo.resumo}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Contratos ativos</span>
          <span className={estilo.indValor}>{contratos.length}</span>
          <span className={estilo.indNota}>equipamentos com revisão marcada</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Visitas atrasadas</span>
          <span className={atrasadas.length > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {atrasadas.length}
          </span>
          <span className={estilo.indNota}>
            {atrasadas.length > 0 ? 'já passaram da data' : 'nenhuma atrasada'}
          </span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Previsto por mês</span>
          <span className={estilo.indValor}>{formatarBRL(Math.round(receitaMes))}</span>
          <span className={estilo.indNota}>média dos contratos ativos</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Travadas por peça</span>
          <span className={travadas.length > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {travadas.length}
          </span>
          <span className={estilo.indNota}>serviço vendido esperando compra</span>
        </div>
      </div>

      <div className={estilo.duasColunas}>
        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Visitas a vencer</span>
              <span className={estilo.fraco}>próximos 45 dias</span>
            </p>

            {visitas.length === 0 ? (
              <p className={estilo.texto}>
                Nenhuma visita prevista para os próximos 45 dias. Se há contratos ativos, as visitas
                seguintes ainda estão longe.
              </p>
            ) : (
              <div className={estilo.rolaX}>
                <table className={estilo.tabela}>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Cliente</th>
                      <th>Equipamento</th>
                      <th className={estilo.dir}>Valor</th>
                      <th className={estilo.dir}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitas.map((v) => {
                      const atrasada = v.previstaPara < agora
                      const dias = Math.round((v.previstaPara.getTime() - agora.getTime()) / 86_400_000)
                      return (
                        <tr key={v.id}>
                          <td className={estilo.num}>
                            <span className={atrasada ? estilo.atrasado : undefined}>
                              {v.previstaPara.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </span>
                            <div className={estilo.fraco}>
                              {atrasada ? `${Math.abs(dias)} dias atrás` : `em ${dias} dias`}
                            </div>
                          </td>
                          <td>
                            <span className={estilo.forte}>{v.contrato.cliente.nome}</span>
                            <div className={estilo.fraco}>
                              contrato #{String(v.contrato.numero).padStart(4, '0')} ·{' '}
                              {ROTULO_PERIODICIDADE[v.contrato.periodicidade]}
                            </div>
                          </td>
                          <td>
                            <Link href={`/painel/equipamentos/${v.contrato.equipamento.id}`}>
                              {v.contrato.equipamento.marca} {v.contrato.equipamento.modelo}
                            </Link>
                            {v.contrato.equipamento.numeroSerie ? (
                              <div className={estilo.fraco}>{v.contrato.equipamento.numeroSerie}</div>
                            ) : null}
                          </td>
                          <td className={`${estilo.num} ${estilo.dir}`}>
                            {formatarBRL(v.contrato.valorVisitaCentavos)}
                          </td>
                          <td className={estilo.dir}>
                            <GerarOrdem visitaId={v.id} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Travadas esperando peça</span>
              <span className={estilo.fraco}>{travadas.length}</span>
            </p>
            {travadas.length === 0 ? (
              <p className={estilo.texto}>
                Nenhum serviço aprovado está parado por falta de peça.
              </p>
            ) : (
              <div className={estilo.lista}>
                {travadas.map((o) => (
                  <Link key={o.id} href={`/painel/ordens/${o.id}`} className={estilo.cardOrdem}>
                    <div className={estilo.cardTopo}>
                      <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                      <span className={`${estilo.selo} ${estilo.tagAlerta}`}>falta peça</span>
                    </div>
                    <div className={estilo.cardEq}>
                      {o.equipamento.marca} {o.equipamento.modelo}
                    </div>
                    <div className={estilo.cardCli}>{o.cliente.nome}</div>
                    <div className={estilo.cardRod} style={{ display: 'grid', gap: 2 }}>
                      {o.pendencia.itens.map((i) => (
                        <span key={i.sku}>
                          {i.sku} · precisa {i.precisa}, separado {i.reservado}, livre {i.livre}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Contratos ativos</span>
              <span className={estilo.fraco}>{contratos.length}</span>
            </p>
            {contratos.length === 0 ? (
              <p className={estilo.texto}>
                Nenhum contrato de preventiva ainda. É a receita que não depende de nada quebrar —
                autoclave e laser precisam de revisão periódica de qualquer jeito.
              </p>
            ) : (
              <ul className={estilo.linha}>
                {contratos.map((c) => (
                  <li key={c.id} className={estilo.evento}>
                    <div className={estilo.eventoTop}>
                      <span className={estilo.eventoTitulo}>{c.cliente.nome}</span>
                      <span className={estilo.eventoQuando}>
                        #{String(c.numero).padStart(4, '0')}
                      </span>
                    </div>
                    <div className={estilo.eventoQuem}>
                      <Link href={`/painel/equipamentos/${c.equipamento.id}`}>
                        {c.equipamento.marca} {c.equipamento.modelo}
                      </Link>
                      {' · '}
                      {ROTULO_PERIODICIDADE[c.periodicidade]} · {formatarBRL(c.valorVisitaCentavos)} por visita
                      {' · '}
                      {c._count.visitas} visita{c._count.visitas === 1 ? '' : 's'} previstas
                    </div>
                    <div style={{ marginTop: 'var(--s2)' }}>
                      <EncerrarContrato contratoId={c.id} numero={c.numero} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Quantas visitas por mês cada periodicidade representa.
 *
 * Serve para estimar a receita mensal dos contratos. É média, e a tela diz que
 * é: um contrato anual não rende um doze avos todo mês, mas para comparar o
 * peso da carteira de contratos a média é a conta certa.
 */
function fatorMensal(p: string): number {
  const m: Record<string, number> = {
    MENSAL: 1,
    BIMESTRAL: 1 / 2,
    TRIMESTRAL: 1 / 3,
    SEMESTRAL: 1 / 6,
    ANUAL: 1 / 12,
  }
  return m[p] ?? 0
}
