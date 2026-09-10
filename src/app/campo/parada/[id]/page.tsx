import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { acaoDaVez } from '@/lib/esteira'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { prontuario } from '@/server/consultas/painel'
import CaptureFlow from '@/components/sistema/captura'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * "CHEGUEI" — a captura guiada, na tela do motorista.
 *
 * =============================================================================
 * É A MESMA FOLHA DO SISTEMA, E ISSO É DE PROPÓSITO
 * =============================================================================
 * O `<CaptureFlow>` é um componente só, usado aqui e na ficha da O.S. Não
 * existe uma "captura do celular" e uma "captura do computador": existe UMA
 * captura, e as duas telas a chamam.
 *
 * O ganho não é de código. É que a regra do que a prova precisa ter — fotos,
 * nome, documento, assinatura — mora num lugar só. Duas versões dessa regra
 * viveriam alguns meses em paz e depois divergiriam justamente na etapa que
 * ninguém testa.
 *
 * =============================================================================
 * O TIPO VEM DA URL E É CONFERIDO CONTRA A ETAPA
 * =============================================================================
 * `?tipo=coleta` é pedido, não permissão. Quem decide o que esta O.S. aceita
 * agora é `acaoDaVez` — a mesma função que desenhou o botão que trouxe a pessoa
 * até aqui. Um tipo que não bate com a etapa devolve para as tarefas.
 */
export default async function ParadaNoCampo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const { id } = await params
  const { tipo } = await searchParams

  const o = await prontuario(contextoDe(sessao), id)
  if (!o) notFound()

  const acao = acaoDaVez(o.etapa, sessao.papel)

  // Sem ação nesta etapa, ou ação que não é captura: a pessoa chegou aqui por
  // um link velho. Devolver para as tarefas é mais honesto que uma tela de erro.
  if (!acao || (acao.fluxo !== 'captura-coleta' && acao.fluxo !== 'captura-entrega')) {
    redirect('/campo')
  }

  const modo = acao.fluxo === 'captura-coleta' ? 'coleta' : 'entrega'
  // O `?tipo=` só é usado para conferir a intenção: se ele discorda da etapa,
  // quem manda é a etapa.
  const esperado = tipo === 'entrega' ? 'entrega' : 'coleta'

  return (
    <>
      <p className="mono">
        <Link href="/campo">← Voltar para as tarefas</Link>
      </p>

      <div className={estilo.campoTopo}>
        <div className={estilo.campoTopoTxt}>
          <strong>{o.cliente.nome}</strong>
          <span>
            O.S. {String(o.numero).padStart(5, '0')} ·{' '}
            {`${o.equipamento.marca} ${o.equipamento.modelo}`.trim()}
          </span>
        </div>
      </div>

      {esperado !== modo ? (
        <p className={estilo.semGps}>
          Esta parada é de {modo === 'coleta' ? 'coleta' : 'entrega'} — o link
          dizia outra coisa, e a etapa da O.S. é quem manda.
        </p>
      ) : null}

      <CaptureFlow
        ordemId={o.id}
        modo={modo}
        /* Uma foto é o piso na rua. Seis é o que o motor exige na entrada da
           bancada, e ali quem fotografa está com o aparelho na mesa, com luz.
           Exigir seis na porta do cliente, na chuva, seria transformar prova em
           obstáculo — e obstáculo em campo vira foto de qualquer coisa. */
        minimoFotos={1}
        passos={acao.passos}
        titulo={modo === 'coleta' ? 'Cheguei para a coleta' : 'Cheguei para a entrega'}
        aoTerminar="/campo"
      />
    </>
  )
}
