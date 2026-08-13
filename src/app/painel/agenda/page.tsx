import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { agendaDoPeriodo, motoristasDaEmpresa, semAgendamento } from '@/server/consultas/listas'
import Agendador from './agendador'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Agenda de rota', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A rota dos próximos dias.
 *
 * A tela abre pelo que está PENDENTE de agendamento, não pelo calendário. O
 * calendário mostra o que já foi resolvido; a lista de pendências mostra o que
 * vai furar. Era exatamente essa inversão que faltava no sistema antigo — dava
 * para ver a agenda cheia e não perceber as seis retiradas que ninguém marcou.
 */
export default async function Agenda() {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE)

  const [paradas, pendentes, motoristas] = await Promise.all([
    agendaDoPeriodo(ctx, 10),
    semAgendamento(ctx),
    motoristasDaEmpresa(ctx),
  ])

  const porDia = paradas.reduce<Record<string, typeof paradas>>((acc, p) => {
    const chave = p.previstoPara.toISOString().slice(0, 10)
    ;(acc[chave] ??= []).push(p)
    return acc
  }, {})

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>A esteira</p>
          <h1 className={estilo.titulo}>Agenda de rota</h1>
        </div>
      </div>

      <Agendador
        pendentes={pendentes.map((o) => ({
          ordemId: o.id,
          numero: o.numero,
          tipo: o.etapa === 'FATURADO' ? ('ENTREGA' as const) : ('RETIRADA' as const),
          cliente: o.cliente.nome,
          equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
          endereco:
            [o.cliente.logradouro, o.cliente.numero, o.cliente.bairro, o.cliente.cidade, o.cliente.uf]
              .filter(Boolean)
              .join(', ') || '',
          contatoNome: o.cliente.contatoNome ?? '',
          contatoTelefone: o.cliente.telefone ?? '',
        }))}
        motoristas={motoristas}
      />

      <h2 className={estilo.filaTitulo} style={{ marginBottom: 'var(--s4)' }}>
        Próximos dias
      </h2>

      {paradas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma parada marcada para os próximos dias. Se há ordens esperando
          retirada, elas aparecem na lista acima.
        </p>
      ) : (
        Object.entries(porDia).map(([dia, lista]) => (
          <div key={dia} className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>{diaPorExtenso(dia)}</span>
              <span className={estilo.fraco}>
                {lista.length} {lista.length === 1 ? 'parada' : 'paradas'}
              </span>
            </p>
            <div className={estilo.rolaX}>
              <table className={estilo.tabela}>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>O.S.</th>
                    <th>Cliente</th>
                    <th>Endereço</th>
                    <th>Motorista</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id}>
                      <td className={estilo.num}>
                        {hora(p.previstoPara)}
                        {p.janelaFim ? <div className={estilo.fraco}>até {hora(p.janelaFim)}</div> : null}
                      </td>
                      <td>
                        <span className={`${estilo.tag} ${p.tipo === 'RETIRADA' ? estilo.tag : estilo.tagOk}`}>
                          {p.tipo === 'RETIRADA' ? 'retirada' : 'entrega'}
                        </span>
                      </td>
                      <td className={estilo.num}>
                        <Link href={`/painel/ordens/${p.ordem.id}`}>#{String(p.ordem.numero).padStart(4, '0')}</Link>
                      </td>
                      <td>
                        <span className={estilo.forte}>{p.ordem.cliente.nome}</span>
                        <div className={estilo.fraco}>
                          {p.ordem.equipamento.marca} {p.ordem.equipamento.modelo}
                        </div>
                      </td>
                      <td className={estilo.fraco}>
                        {p.enderecoSnapshot}
                        {p.contatoNome ? <div>falar com {p.contatoNome}</div> : null}
                      </td>
                      <td>{p.motorista?.nome ?? <span className={estilo.fraco}>sem motorista</span>}</td>
                      <td>
                        <span className={`${estilo.tag} ${corStatus(p.status)}`}>{rotuloStatus(p.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {motoristas.length === 0 ? (
        <p className={estilo.fraco}>
          Nenhum motorista cadastrado. Sem ele, a parada até é marcada, mas
          ninguém recebe a rota no celular.
        </p>
      ) : null}
    </>
  )
}

function diaPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  const amanha = new Date(hoje.getTime() + 86_400_000).toDateString() === d.toDateString()
  const texto = d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  })
  if (mesmoDia) return `Hoje · ${texto}`
  if (amanha) return `Amanhã · ${texto}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const hora = (d: Date) => fmtHora.format(d)

function rotuloStatus(s: string): string {
  const m: Record<string, string> = {
    PENDENTE: 'sem motorista',
    ATRIBUIDO: 'atribuída',
    EM_ROTA: 'em rota',
    CONCLUIDO: 'concluída',
    FALHOU: 'falhou',
    CANCELADO: 'cancelada',
  }
  return m[s] ?? s.toLowerCase()
}

function corStatus(s: string): string {
  if (s === 'CONCLUIDO') return estilo.tagOk!
  if (s === 'FALHOU' || s === 'CANCELADO') return estilo.tagAlerta!
  if (s === 'PENDENTE') return estilo.tagEspera!
  return estilo.tagNeutra!
}
