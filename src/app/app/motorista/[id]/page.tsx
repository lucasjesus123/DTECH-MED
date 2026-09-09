import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao } from '@/server/auth/guarda'
import { paradaDoMotorista } from '@/server/consultas/campo'
import { FormularioAssinatura } from './formulario'
import { FotosDeCampo } from './fotos-campo'
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
        {/* ONDE ELE ESTÁ E COM QUEM FALAR — que esta tela não dizia.
            Ela abria direto nas fotos e na assinatura, e o endereço só aparecia
            lá embaixo, em letra miúda, depois do quadro de assinar. Quem chega
            num prédio com três portas precisa da referência e do nome de quem
            procurar ANTES de guardar o celular, não depois.

            O recado da central entra aqui pelo mesmo motivo que entra na rota:
            ele era gravado e nenhuma tela do aplicativo o lia. */}
        <section className={estilo.chegada}>
          <p className={estilo.chegadaEnd}>{parada.enderecoSnapshot}</p>
          {parada.pontoReferencia ? (
            <p className={estilo.chegadaRef}>Referência: {parada.pontoReferencia}</p>
          ) : null}
          {parada.contatoNome ? (
            <p className={estilo.chegadaRef}>Procurar por {parada.contatoNome}</p>
          ) : null}
          {parada.observacoes ? (
            <p className={estilo.paRecado}>
              <span className={estilo.paRecadoRot}>Recado da central</span>
              {parada.observacoes}
            </p>
          ) : null}
        </section>

        {jaAssinou ? (
          <p className={estilo.feitoGrande}>
            Esta parada já foi assinada. Volte para a rota e siga para a próxima.
          </p>
        ) : (
          <>
            {/* As fotos vêm ANTES da assinatura de propósito: assinou, a tela
                sai do ar e a parada está fechada. Quem chega aqui fotografa
                enquanto ainda está diante do aparelho. */}
            <FotosDeCampo
              ordemId={o.id}
              tipo={tipo}
              jaEnviadas={o.fotos.filter((f) => f.categoria === tipo).length}
            />
            <FormularioAssinatura
              ordemId={o.id}
              tipo={tipo}
              contatoSugerido={o.cliente.contatoNome ?? ''}
              endereco={parada.enderecoSnapshot}
            />
          </>
        )}
      </main>
    </>
  )
}
