import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { exigirSessao } from '@/server/auth/guarda'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { Recebimento } from './recebimento'
import estilo from '../../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Entrada({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, ctx } = await exigirSessao()
  if (sessao.papel !== Papel.TECNICO && sessao.papel !== Papel.SUPER_ADMIN) redirect('/painel')

  const { id } = await params
  const ordem = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id },
      include: {
        cliente: { select: { nome: true } },
        equipamento: true,
        fotos: {
          where: { categoria: 'RECEBIMENTO' },
          orderBy: { criadoEm: 'asc' },
          select: { id: true, legenda: true, autorNome: true },
        },
      },
    }),
  )
  if (!ordem) notFound()

  return (
    <>
      <header className={estilo.cabecalho}>
        <Link href="/app/tecnico" className={estilo.voltar}>
          ← Oficina
        </Link>
        <span className={estilo.grav}>
          Dar entrada · #{String(ordem.numero).padStart(4, '0')}
        </span>
        <h1>{`${ordem.equipamento.marca} ${ordem.equipamento.modelo}`.trim()}</h1>
        <div className={estilo.cabLinha}>
          <span>{ordem.cliente.nome}</span>
          {ordem.equipamento.numeroSerie ? (
            <span className={estilo.mono}>NS {ordem.equipamento.numeroSerie}</span>
          ) : null}
        </div>
      </header>

      <main className={estilo.corpo}>
        <section className={estilo.blocoRelato}>
          <span className={estilo.grav}>O que o cliente contou</span>
          <p>{ordem.defeitoRelatado}</p>
        </section>

        <Recebimento
          ordemId={ordem.id}
          etapa={ordem.etapa}
          etapaRotulo={ROTULO_ETAPA[ordem.etapa]}
          fotos={ordem.fotos}
        />
      </main>
    </>
  )
}
