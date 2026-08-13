import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, podeVer } from '@/server/auth/guarda'
import { aguardandoFatura, caixaDoMes, listarFaturas } from '@/server/consultas/listas'
import Faturas from './faturas'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Financeiro', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * Financeiro.
 *
 * Três números no topo que o ERP antigo não juntava numa tela só: o que está
 * em aberto, o que já venceu, e quanto a maquininha comeu no mês. O terceiro é
 * o que separa "recebi R$ 10 mil" de "entrou R$ 10 mil na conta" — duas frases
 * que parecem a mesma até o fechamento não bater.
 *
 * A conferência da gestão é uma coluna à parte de propósito. Pagar é
 * operacional; conferir é gerencial. Fundir as duas tira do dono a única
 * checagem que ele de fato controla, e é a etapa 16 da linha do tempo.
 */
export default async function Financeiro({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; busca?: string }>
}) {
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.FINANCEIRO)
  const q = await searchParams

  const [faturas, caixa, aFaturar] = await Promise.all([
    listarFaturas(ctx, { status: q.status ?? 'aberto', busca: q.busca }),
    caixaDoMes(ctx),
    aguardandoFatura(ctx),
  ])

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Financeiro</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Recebido no mês" valor={formatarBRL(caixa.recebidoNoMes)} nota="soma de todos os recebimentos" />
        <Indicador
          rotulo="Em aberto"
          valor={formatarBRL(caixa.abertoCentavos)}
          nota={
            caixa.vencidoCentavos > 0
              ? `${formatarBRL(caixa.vencidoCentavos)} já vencidos`
              : 'nada vencido'
          }
          alerta={caixa.vencidoCentavos > 0}
        />
        <Indicador
          rotulo="Taxas do mês"
          valor={formatarBRL(caixa.taxasNoMes)}
          nota="custo de maquininha e gateway"
        />
        <Indicador
          rotulo="Aguardando conferência"
          valor={String(caixa.aConferir)}
          nota={caixa.aConferir > 0 ? 'quitadas, esperando a gestão validar' : 'nada pendente'}
          alerta={caixa.aConferir > 0}
        />
      </div>

      {caixa.porForma.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Como entrou o dinheiro este mês</p>
          <div className={estilo.pares}>
            {caixa.porForma.map((f) => (
              <div key={f.forma} className={estilo.par}>
                <span className={estilo.parRot}>{rotuloForma(f.forma)}</span>
                <span className={estilo.parVal} style={{ fontWeight: 600 }}>
                  {formatarBRL(f.totalCentavos)}
                </span>
                <span className={estilo.fraco}>
                  {f.quantidade} {f.quantidade === 1 ? 'recebimento' : 'recebimentos'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={q.busca ?? ''}
            placeholder="Número da fatura ou cliente"
            aria-label="Buscar faturas"
          />
        </div>
        <select className={estilo.selecao} name="status" defaultValue={q.status ?? 'aberto'} aria-label="Situação">
          <option value="aberto">Em aberto e parciais</option>
          <option value="aconferir">Aguardando conferência</option>
          <option value="quitadas">Quitadas</option>
          <option value="todas">Todas</option>
        </select>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      <Faturas
          podeConferir={podeVer(sessao.papel, Papel.GESTOR)}
          pendentes={aFaturar.map((o) => ({
            ordemId: o.id,
            numero: o.numero,
            cliente: o.cliente.nome,
            equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
            totalCentavos: o.orcamentos[0]?.totalCentavos ?? 0,
          }))}
          faturas={faturas.map((f) => ({
            id: f.id,
            numero: f.numero,
            status: f.status,
            cliente: f.cliente.nome,
            ordemId: f.ordem.id,
            ordemNumero: f.ordem.numero,
            valorTotalCentavos: f.valorTotalCentavos,
            valorPagoCentavos: f.valorPagoCentavos,
            multaCentavos: f.multaCentavos,
            jurosCentavos: f.jurosCentavos,
            taxaCentavos: f.taxaCentavos,
            abertoCentavos: f.abertoCentavos,
            vencida: f.vencida,
            vencimento: f.vencimento?.toISOString() ?? null,
            conferido: f.conferido,
            conferidoPorNome: f.conferidoPorNome,
            pagamentos: f.pagamentos.map((p) => ({
              id: p.id,
              forma: p.forma,
              valorCentavos: p.valorCentavos,
              parcelas: p.parcelas,
              bandeira: p.bandeira,
              autorNome: p.autorNome,
              recebidoEm: p.recebidoEm.toISOString(),
              estornado: Boolean(p.estornadoEm),
            })),
          }))}
        />

      <p className={estilo.fraco} style={{ marginTop: 'var(--s5)' }}>
        Todo estorno mantém a linha no caixa, marcada — nada some.{' '}
        <Link href="/painel/ordens?situacao=todas">Ver as ordens</Link>
      </p>
    </>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

function rotuloForma(f: string): string {
  const m: Record<string, string> = {
    DINHEIRO: 'Dinheiro',
    PIX: 'Pix',
    CARTAO_CREDITO: 'Cartão de crédito',
    CARTAO_DEBITO: 'Cartão de débito',
    BOLETO: 'Boleto',
    TRANSFERENCIA: 'Transferência',
    CHEQUE: 'Cheque',
  }
  return m[f] ?? f
}
