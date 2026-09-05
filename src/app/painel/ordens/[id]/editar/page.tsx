import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { comEscopo } from '@/lib/db'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import FormEditar from './formulario'
import estilo from '../../../painel.module.css'

export const metadata: Metadata = { title: 'Editar O.S.', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * CORRIGIR O QUE FOI DIGITADO AO ABRIR A O.S.
 *
 * =============================================================================
 * ISTO NÃO EXISTIA, E A FALTA APARECIA COMO OUTRA COISA
 * =============================================================================
 * Não havia como corrigir uma ordem depois de aberta. Quem digitasse o defeito
 * errado, ou prometesse o prazo errado, convivia com o erro até a entrega — ou
 * abria OUTRA O.S., que é pior: duplica o aparelho no histórico, quebra a
 * contagem da esteira e deixa duas ordens vivas para o mesmo serviço.
 *
 * =============================================================================
 * O QUE ESTA TELA NÃO DEIXA MEXER
 * =============================================================================
 * Número, etapa, cliente e aparelho ficam de fora, e cada um por um motivo
 * próprio — estão escritos em `editarOrdem`, junto da ação que os recusa. O
 * resumo: número é identidade, etapa só anda pelo motor, e trocar o aparelho
 * depois que existem fotos e assinatura transforma prova de uma máquina em
 * prova de outra.
 *
 * Se o aparelho está errado, o caminho certo é CANCELAR com motivo e abrir a
 * ordem certa — o cancelamento fica na trilha, e a folha de rastreabilidade
 * conta a história inteira.
 */
export default async function EditarOrdem({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE)
  const { id } = await params

  const o = await comEscopo(ctx, async (tx) =>
    tx.ordem.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        etapa: true,
        defeitoRelatado: true,
        prioridade: true,
        prazoPrometido: true,
        viaCorreio: true,
        codigoRastreio: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
      },
    }),
  )
  if (!o) notFound()

  const encerrada = o.etapa === EtapaOrdem.FINALIZADO || o.etapa === EtapaOrdem.CANCELADO

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O.S. #{String(o.numero).padStart(4, '0')}</p>
          <h1 className={estilo.titulo}>Editar a ordem</h1>
          <p className={estilo.texto}>
            {o.equipamento.marca} {o.equipamento.modelo}
            {o.equipamento.numeroSerie ? ` · série ${o.equipamento.numeroSerie}` : ''} ·{' '}
            {o.cliente.nome} · {ROTULO_ETAPA[o.etapa]}
          </p>
        </div>
        <Link href={`/painel/ordens/${o.id}`} className={estilo.btnSec}>
          Voltar à ficha
        </Link>
      </div>

      {encerrada ? (
        <p className={estilo.vazio}>
          Esta ordem já foi encerrada. O que está escrito nela já saiu em documento para o
          cliente, e por isso não se reescreve aqui.
        </p>
      ) : (
        <FormEditar
          ordemId={o.id}
          defeito={o.defeitoRelatado}
          prioridade={o.prioridade === 'ALTA' ? 'ALTA' : 'NORMAL'}
          prazo={o.prazoPrometido ? o.prazoPrometido.toISOString().slice(0, 10) : ''}
          viaCorreio={o.viaCorreio}
          codigoRastreio={o.codigoRastreio ?? ''}
        />
      )}
    </>
  )
}
