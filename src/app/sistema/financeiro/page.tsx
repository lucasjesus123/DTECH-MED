import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import { aguardandoFatura, caixaDoMes } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import { ETAPAS_DE_COBRANCA, filaDeEtapas } from '@/server/sistema/radar'
import RadarList from '@/components/sistema/radar-lista'
import { Alerta, CabecalhoTela, EmptyState, Secao, StatCardRow, type Stat } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * FINANCEIRO — o que falta receber, e o que falta cobrar.
 *
 * =============================================================================
 * A DIFERENÇA ENTRE AS DUAS FILAS, E POR QUE ELAS SÃO SEPARADAS
 * =============================================================================
 * "Esperando pagamento" é a O.S. com fatura emitida, esperando o dinheiro
 * entrar. "Sem fatura emitida" é a O.S. que a gestão liberou e que ninguém
 * chegou a cobrar.
 *
 * A segunda é a mais cara das duas e a que some. Um serviço liberado e nunca
 * faturado não gera erro em lugar nenhum: ele só não aparece no caixa, e alguém
 * descobre no fechamento do mês — se descobrir. Por isso ela tem bloco próprio,
 * com o valor do orçamento aprovado ao lado de cada linha.
 *
 * =============================================================================
 * O CARTÃO DA TAXA É UM CARTÃO DE VERDADE
 * =============================================================================
 * "Recebi R$ 10 mil" e "entrou R$ 10 mil na conta" não são a mesma frase quando
 * existe maquininha no meio. A taxa aparece em coluna própria por isso.
 */
export default async function Financeiro() {
  const { ctx, sessao } = await exigirTela('financeiro')

  const [linhas, caixa, semFatura] = await Promise.all([
    filaDeEtapas(ctx, sessao.papel, ETAPAS_DE_COBRANCA),
    caixaDoMes(ctx),
    aguardandoFatura(ctx),
  ])

  const semFaturaCentavos = semFatura.reduce(
    (s, o) => s + (o.orcamentos[0]?.totalCentavos ?? 0),
    0,
  )

  const stats: Stat[] = [
    {
      rotulo: 'Recebido no mês',
      valor: formatarBRL(caixa.recebidoNoMes),
      apoio:
        caixa.taxasNoMes > 0
          ? `taxas de maquininha: ${formatarBRL(caixa.taxasNoMes)}`
          : 'sem taxa de maquininha',
      tom: 'ok',
      icone: 'financeiro',
    },
    {
      rotulo: 'A receber',
      valor: formatarBRL(caixa.abertoCentavos),
      apoio: 'faturas em aberto',
      tom: 'info',
      icone: 'relatorios',
    },
    {
      rotulo: 'Vencido',
      valor: formatarBRL(caixa.vencidoCentavos),
      apoio: caixa.vencidoCentavos === 0 ? 'nada vencido' : 'passou do vencimento',
      tom: caixa.vencidoCentavos > 0 ? 'danger' : 'ok',
      icone: 'preventiva',
    },
    {
      rotulo: 'Sem cobrança',
      valor: semFatura.length,
      apoio: semFatura.length === 0 ? 'tudo faturado' : formatarBRL(semFaturaCentavos),
      tom: semFatura.length > 0 ? 'warn' : 'ok',
      icone: 'conferencia',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Financeiro"
        apoio="O que já pode ser cobrado, o que já foi cobrado e o que ainda não entrou."
      />

      {/* O alerta que o AE tem e que aqui vale ainda mais: serviço entregue sem
          cobrança é dinheiro que ninguém vai atrás porque ninguém sabe que
          existe. */}
      {semFatura.length > 0 ? (
        <Alerta
          titulo={`${semFatura.length} ${semFatura.length === 1 ? 'O.S. liberada sem cobrança' : 'O.S. liberadas sem cobrança'} — ${formatarBRL(semFaturaCentavos)}`}
          apoio="A gestão já aprovou o serviço e nenhuma fatura foi emitida. Este dinheiro não aparece em nenhum relatório enquanto isso."
        />
      ) : null}

      <StatCardRow stats={stats} />

      <Secao titulo="Esperando pagamento">
        <RadarList
          titulo="Financeiro // cobrança"
          linhas={linhas}
          vazio={
            <EmptyState
              titulo="Nada esperando pagamento ✓"
              apoio="Quando a gestão liberar uma O.S., ela cai aqui com o botão de confirmar o pagamento."
            />
          }
        />
      </Secao>

      {semFatura.length > 0 ? (
        <Secao titulo="Liberadas sem fatura emitida">
          <div className={estilo.radar}>
            {semFatura.map((o) => (
              <div key={o.id} className={estilo.linha}>
                <div className={estilo.linhaTxt}>
                  <div className={estilo.linhaTopo}>
                    <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaNumero}>
                      O.S. {String(o.numero).padStart(5, '0')}
                    </Link>
                  </div>
                  <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaTitulo}>
                    {`${o.equipamento.marca} ${o.equipamento.modelo}`.trim()}
                  </Link>
                  <div className={estilo.linhaApoio}>
                    <span>{o.cliente.nome}</span>
                    <span aria-hidden="true">·</span>
                    <span className="num">
                      {o.orcamentos[0]
                        ? formatarBRL(o.orcamentos[0].totalCentavos)
                        : 'sem orçamento aprovado'}
                    </span>
                  </div>
                </div>
                <div className={estilo.linhaAcao}>
                  {/* Emitir a fatura é o passo que falta, e ele mora na folha de
                      pagamento da própria O.S. — o mesmo lugar em que se dá a
                      baixa depois. Duas telas para dois momentos do mesmo ato
                      seria a bagunça que este redesenho veio desfazer. */}
                  <Link href={`/sistema/ordens/${o.id}?fluxo=pagamento`} className={estilo.acao}>
                    Emitir cobrança
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Secao>
      ) : null}
    </>
  )
}
