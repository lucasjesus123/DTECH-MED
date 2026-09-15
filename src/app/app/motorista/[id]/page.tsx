import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao } from '@/server/auth/guarda'
import { paradaDaGestao, paradaDoMotorista } from '@/server/consultas/campo'
import { FormularioAssinatura } from './formulario'
import { FotosDeCampo } from './fotos-campo'
import estilo from '../../app.module.css'

export const dynamic = 'force-dynamic'

export default async function Assinar({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, ctx } = await exigirSessao()

  /**
   * QUEM ADMINISTRA ENTRA — E NÃO É JOGADO PARA O PAINEL.
   *
   * A queixa do dono, com o aplicativo aberto no celular: *"quando clica aqui
   * joga pro sistema (não poderia, esse é o APP)"*.
   *
   * O caminho até aqui tinha sido construído pela metade. A agenda do
   * aplicativo ganhou MODO GESTÃO — quem administra abre e vê a rua inteira,
   * as paradas de todos os motoristas — e foi decisão escrita lá: "a resposta
   * certa não era mandar embora, era responder". Mas o cartão dessa agenda
   * leva a ESTA página, e ela continuava com a linha antiga:
   *
   *     if (papel !== MOTORISTA && papel !== SUPER_ADMIN) redirect('/painel')
   *
   * Um toque no cartão e o administrador era cuspido do aplicativo para dentro
   * do painel, no meio do celular, sem aviso nenhum. A tela que ele abriu para
   * conferir uma parada respondia trocando de sistema.
   *
   * Agora ele entra e LÊ. O que ele não encontra é o que não é dele: as fotos
   * e a assinatura são do motorista, feitas diante do aparelho, e não existe
   * versão de escritório dessas duas coisas — a prova do recebimento é o traço
   * de quem estava lá. A tela diz isso em vez de esconder.
   */
  const gerencia =
    sessao.papel === Papel.ADMIN_EMPRESA ||
    sessao.papel === Papel.GESTOR ||
    sessao.papel === Papel.ATENDENTE
  if (sessao.papel !== Papel.MOTORISTA && sessao.papel !== Papel.SUPER_ADMIN && !gerencia) {
    redirect('/painel')
  }

  const { id } = await params
  // Para o MOTORISTA a busca filtra por ele: quem tenta o id alheio não
  // descobre sequer que a parada existe. Para quem administra, a rua inteira —
  // que é o trabalho dela. O RLS continua barrando o que é de outra empresa.
  /* As duas consultas devolvem formas diferentes — só a da gestão traz o
     motorista junto —, e o nome é colhido DENTRO do ramo em vez de depois, com
     `in` ou `as`. Assim o TypeScript sabe qual das duas está na mão em cada
     caminho, e ninguém precisa afirmar nada que o compilador não veja. */
  let deQuem: string | null = null
  let parada
  if (gerencia) {
    const daGestao = await paradaDaGestao(ctx, id)
    deQuem = daGestao?.motorista?.nome ?? null
    parada = daGestao
  } else {
    parada = await paradaDoMotorista(ctx, sessao.userId, id)
  }
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
        ) : gerencia ? (
          /* A tela de quem administra PARA aqui, e diz por quê. Oferecer o
             quadro de assinar ao escritório seria oferecer um jeito de forjar
             a prova do recebimento — o traço tem de ser de quem estava com o
             aparelho na mão. */
          <p className={estilo.paSoDele}>
            {deQuem
              ? `Esta parada é de ${deQuem}. As fotos e a assinatura são registradas por ele, no aplicativo dele, diante do aparelho.`
              : 'Parada sem motorista designado. Escolha alguém na central para ela poder ser aceita e registrada.'}
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
