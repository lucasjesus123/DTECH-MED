import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { agendaDoPeriodo, motoristasDaEmpresa, semAgendamento } from '@/server/consultas/listas'
import Agendador from './agendador'
import AbasDaRota from './abas'
import AbasOS from '../os-abas'
import { enderecoDaColeta } from '@/lib/endereco'
import estilo from '../painel.module.css'
import { amanha, diaLocal, hoje } from '@/lib/datas'

export const metadata: Metadata = { title: 'Rota', robots: { index: false } }
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
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('rota')

  const [paradas, pendentes, motoristas] = await Promise.all([
    agendaDoPeriodo(ctx, 10),
    semAgendamento(ctx),
    motoristasDaEmpresa(ctx),
  ])

  const porDia = paradas.reduce<Record<string, typeof paradas>>((acc, p) => {
    const chave = diaLocal(p.previstoPara)
    ;(acc[chave] ??= []).push(p)
    return acc
  }, {})

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O.S.</p>
          <h1 className={estilo.titulo}>Rota</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O que está marcado para os próximos dias, e o que ninguém marcou ainda.
          </p>
        </div>
      </div>

      <AbasOS atual="rota" papel={sessao.papel} telas={sessao.telas} />

      <AbasDaRota atual="planejada" />

      <Agendador
        pendentes={pendentes.map((o) => ({
          ordemId: o.id,
          numero: o.numero,
          // Só a primeira etapa da lista é ida. As outras duas — o consertado
          // e o recusado — são o aparelho voltando para a casa do cliente.
          tipo:
            o.etapa === 'ORDEM_RETIRADA_GERADA' ? ('RETIRADA' as const) : ('ENTREGA' as const),
          cliente: o.cliente.nome,
          equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
          // O ENDEREÇO DA COLETA, e não o do cadastro.
          //
          // São a mesma coisa na maioria dos clientes, e diferentes justamente
          // nos que mais doem: a clínica com sala noutro endereço, o hospital
          // que recebe pela doca dos fundos, o consultório que manda buscar no
          // galpão do sócio. Nesses, o endereço do cadastro é onde vai a NOTA.
          //
          // O campo continua editável na hora de marcar — isto é só o que ele
          // vem preenchido, e vir preenchido com o lugar errado é pior do que
          // vir vazio: ninguém confere o que já parece certo.
          endereco: enderecoDaColeta(o.cliente),
          contatoNome: o.cliente.contatoNome ?? '',
          contatoTelefone: o.cliente.telefone ?? '',
          // O que o motorista precisa saber antes de sair. Ele vai junto para o
          // campo de observações da parada, que o aplicativo dele mostra.
          observacoes: o.cliente.coletaMesmoEndereco ? '' : (o.cliente.coletaObservacao ?? ''),
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

/**
 * "Hoje", "Amanhã" ou a data por extenso.
 *
 * A comparação é entre TEXTOS de dia (`AAAA-MM-DD`) vindos de `@/lib/datas`, e
 * não entre objetos `Date`. Era `toDateString()`, que segue o fuso do processo:
 * na VPS, com `TZ=America/Sao_Paulo`, dava certo; em qualquer máquina em UTC,
 * a entrega das 22h aparecia sob "Amanhã". O porquê inteiro está em
 * `src/lib/datas.ts`.
 */
function diaPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  const diaDeHoje = hoje()
  const diaDeAmanha = amanha()
  const texto = d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  })
  if (iso === diaDeHoje) return `Hoje · ${texto}`
  if (iso === diaDeAmanha) return `Amanhã · ${texto}`
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
