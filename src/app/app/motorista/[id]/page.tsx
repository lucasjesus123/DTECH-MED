import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao } from '@/server/auth/guarda'
import { paradaDoMotorista } from '@/server/consultas/campo'
import { FormularioAssinatura } from './formulario'
import estilo from '../../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Assinar({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, ctx } = await exigirSessao()
  if (sessao.papel !== Papel.MOTORISTA && sessao.papel !== Papel.SUPER_ADMIN) redirect('/painel')

  const { id } = await params
  // Devolve nulo tanto para ordem inexistente quanto para ordem de outro
  // motorista — quem tenta o id alheio não descobre nem que ele existe.
  const parada = await paradaDoMotorista(ctx, sessao.userId, id)
  if (!parada) notFound()

  const o = parada.ordem
  const tipo = parada.tipo === 'ENTREGA' ? 'ENTREGA' : 'RETIRADA'
  const jaAssinou = o.assinaturas.some((a) => a.tipo === tipo)

  return (
    <>
      <header className={estilo.cabecalho}>
        <Link href="/app/motorista" className={estilo.voltar}>
          ← Rota de hoje
        </Link>
        <span className={estilo.grav}>
          {tipo === 'RETIRADA' ? 'Ordem de retirada' : 'Comprovante de entrega'} · #
          {String(o.numero).padStart(4, '0')}
        </span>
        <h1>{`${o.equipamento.marca} ${o.equipamento.modelo}`.trim()}</h1>
        <div className={estilo.cabLinha}>
          <span>{o.cliente.nome}</span>
          {o.equipamento.numeroSerie ? (
            <span className={estilo.mono}>NS {o.equipamento.numeroSerie}</span>
          ) : null}
        </div>
      </header>

      <main className={estilo.corpo}>
        {jaAssinou ? (
          <p className={estilo.feitoGrande}>
            Esta parada já foi assinada. Volte para a rota e siga para a próxima.
          </p>
        ) : (
          <FormularioAssinatura
            ordemId={o.id}
            tipo={tipo}
            contatoSugerido={o.cliente.contatoNome ?? ''}
            endereco={parada.enderecoSnapshot}
          />
        )}
      </main>
    </>
  )
}
