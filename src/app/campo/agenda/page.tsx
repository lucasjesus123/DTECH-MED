import Link from 'next/link'
import { redirect } from 'next/navigation'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { agendaDeCampo } from '@/server/consultas/campo'
import { Chip, EmptyState } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * AGENDA — o que vem pela frente.
 *
 * A aba TAREFAS responde "o que eu faço agora". Esta responde "o que me espera
 * esta semana" — e é a pergunta que a pessoa faz na sexta à tarde, planejando a
 * segunda.
 *
 * Agrupada por dia, e o dia vem do SERVIDOR. Contar dia no navegador usaria o
 * fuso da máquina de quem abriu: às 22h de Lajeado, um celular em UTC já está
 * em outro dia, e a agenda começaria em "amanhã" sem avisar ninguém.
 */
export default async function AgendaDeCampo() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const itens = await agendaDeCampo(contextoDe(sessao), sessao.papel, sessao.userId, 14)

  if (itens.length === 0) {
    return (
      <>
        <Cabecalho />
        <EmptyState
          titulo="Agenda livre ✓"
          apoio="Nada marcado para os próximos 14 dias. Quando a central agendar uma parada sua, ela aparece aqui."
        />
      </>
    )
  }

  // Agrupamento por dia, preservando a ordem em que a consulta devolveu.
  const dias: Array<{ dia: string; itens: typeof itens }> = []
  for (const i of itens) {
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.dia === i.dia) ultimo.itens.push(i)
    else dias.push({ dia: i.dia, itens: [i] })
  }

  return (
    <>
      <Cabecalho />
      {dias.map((d) => (
        <section key={d.dia} className={estilo.resto}>
          <h2 className="mono">{porExtenso(d.dia)}</h2>
          {d.itens.map((i) => (
            <Link key={i.id} href={`/sistema/ordens/${i.ordemId}`} className={estilo.restoItem}>
              <span className={estilo.restoHora}>{i.hora ?? '—'}</span>
              <span className={estilo.restoTxt}>
                <strong>{i.cliente}</strong>
                <span>
                  {i.equipamento} · {i.etapaRotulo}
                </span>
                {i.endereco ? <span>{i.endereco}</span> : null}
              </span>
              <span className={estilo.aDireita}>
                <Chip
                  tom={i.atrasado ? 'danger' : i.tipo === 'RETIRADA' ? 'warn' : i.tipo === 'ENTREGA' ? 'info' : 'pending'}
                >
                  {i.atrasado ? 'Atrasado' : rotuloTipo(i.tipo)}
                </Chip>
              </span>
            </Link>
          ))}
        </section>
      ))}
    </>
  )
}

function Cabecalho() {
  return (
    <header className={estilo.campoTopo}>
      <div className={estilo.campoTopoTxt}>
        <strong>Agenda</strong>
        <span>Os próximos 14 dias</span>
      </div>
    </header>
  )
}

function rotuloTipo(t: 'RETIRADA' | 'ENTREGA' | 'PRAZO'): string {
  if (t === 'RETIRADA') return 'Coleta'
  if (t === 'ENTREGA') return 'Entrega'
  return 'Prazo'
}

function porExtenso(dia: string): string {
  const d = new Date(`${dia}T12:00:00-03:00`)
  if (Number.isNaN(d.getTime())) return dia
  return d
    .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    .toUpperCase()
}
