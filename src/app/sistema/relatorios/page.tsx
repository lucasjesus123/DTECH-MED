import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import { fluxoDosMeses, idadeDaDivida, maioresDevedores } from '@/server/consultas/caixa'
import { resumoDoDia } from '@/server/consultas/painel'
import { exigirTela } from '@/server/sistema/guarda'
import {
  Bloco,
  CabecalhoTela,
  Chip,
  EmptyState,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * RELATÓRIOS — os números que mudam uma decisão.
 *
 * =============================================================================
 * A RÉGUA PARA O QUE ENTRA NESTA TELA
 * =============================================================================
 * Um relatório que ninguém age sobre é um relatório que ninguém abre duas
 * vezes. Então cada bloco aqui precisa responder a uma pergunta que muda o que
 * se faz na segunda-feira:
 *
 *   · O caixa dos últimos meses está subindo ou caindo?
 *   · Quem deve, e há quanto tempo? — porque dívida de noventa dias não se
 *     cobra por WhatsApp, e a de sete dias não se manda para protesto.
 *
 * O que ficou de fora: gráfico de pizza de "ordens por status" (o Kanban já
 * mostra isso e ele é acionável), e "atendimentos por técnico" (vira placar
 * entre colegas e não muda decisão nenhuma).
 *
 * =============================================================================
 * AS BARRAS SÃO CSS, E NÃO UMA BIBLIOTECA DE GRÁFICO
 * =============================================================================
 * Seis barras horizontais não valem um pacote de gráfico no navegador de quem
 * abre a tela uma vez por mês. Elas são divs com largura proporcional, leem em
 * qualquer tema e não dependem de JavaScript para aparecer.
 */
export default async function Relatorios() {
  const { ctx } = await exigirTela('relatorios')

  const [fluxo, devedores, idade, resumo] = await Promise.all([
    fluxoDosMeses(ctx, 6),
    maioresDevedores(ctx, 8),
    idadeDaDivida(ctx),
    resumoDoDia(ctx, { comDinheiro: true }),
  ])

  const ultimo = fluxo[fluxo.length - 1]
  const penultimo = fluxo[fluxo.length - 2]
  const variacao =
    ultimo && penultimo && penultimo.entrouCentavos > 0
      ? Math.round(
          ((ultimo.entrouCentavos - penultimo.entrouCentavos) / penultimo.entrouCentavos) * 100,
        )
      : null

  const teto = Math.max(...fluxo.map((m) => Math.max(m.entrouCentavos, m.saiuCentavos)), 1)
  const vencidoVelho = idade
    .filter((f) => f.faixa.includes('90') || f.faixa.includes('+'))
    .reduce((s, f) => s + f.totalCentavos, 0)

  const stats: Stat[] = [
    {
      rotulo: 'Entrou no mês',
      valor: formatarBRL(ultimo?.entrouCentavos ?? 0),
      apoio:
        variacao === null
          ? 'sem mês anterior para comparar'
          : `${variacao >= 0 ? '+' : ''}${variacao}% contra o mês passado`,
      tom: variacao !== null && variacao < 0 ? 'warn' : 'ok',
      icone: 'financeiro',
    },
    {
      rotulo: 'Saiu no mês',
      valor: formatarBRL(ultimo?.saiuCentavos ?? 0),
      apoio: 'contas pagas',
      icone: 'relatorios',
    },
    {
      rotulo: 'A receber',
      valor: formatarBRL(resumo.aReceber ?? 0),
      apoio: 'faturas em aberto',
      tom: 'info',
      icone: 'conferencia',
    },
    {
      rotulo: 'Parado +90 dias',
      valor: formatarBRL(vencidoVelho),
      apoio: vencidoVelho === 0 ? 'nada envelhecendo' : 'dívida velha',
      tom: vencidoVelho > 0 ? 'danger' : 'ok',
      icone: 'preventiva',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Relatórios"
        apoio="Os números que mudam o que você faz na segunda-feira."
      />

      <StatCardRow stats={stats} />

      <div className={estilo.split}>
        <div className={estilo.blocos}>
          <Bloco titulo="Caixa // últimos 6 meses">
            {fluxo.length === 0 ? (
              <p className={estilo.campoDica}>Ainda não há movimento registrado.</p>
            ) : (
              <div className={estilo.barras}>
                {fluxo.map((m) => (
                  <div key={m.mes} className={estilo.barraLinha}>
                    <span className={estilo.barraRotulo}>{mesCurto(m.mes)}</span>
                    <span className={estilo.barraTrilho}>
                      <span
                        className={estilo.barraEntrou}
                        style={{ width: `${(m.entrouCentavos / teto) * 100}%` }}
                        title={`Entrou ${formatarBRL(m.entrouCentavos)}`}
                      />
                      <span
                        className={estilo.barraSaiu}
                        style={{ width: `${(m.saiuCentavos / teto) * 100}%` }}
                        title={`Saiu ${formatarBRL(m.saiuCentavos)}`}
                      />
                    </span>
                    <span className={estilo.barraValor}>{formatarBRL(m.entrouCentavos)}</span>
                  </div>
                ))}
                <p className={estilo.campoDica}>
                  Barra de cima: o que entrou. Barra de baixo: o que saiu.
                </p>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Idade da dívida">
            {idade.length === 0 ? (
              <p className={estilo.campoDica}>Nada em aberto.</p>
            ) : (
              <div className={estilo.dinheiro}>
                {idade.map((f) => (
                  <p key={f.faixa} className={estilo.dinheiroLinha}>
                    <span>
                      {f.faixa} · {f.quantidade}{' '}
                      {f.quantidade === 1 ? 'cobrança' : 'cobranças'}
                    </span>
                    <strong>{formatarBRL(f.totalCentavos)}</strong>
                  </p>
                ))}
              </div>
            )}
            <p className={estilo.campoDica}>
              &quot;R$ 18 mil a receber&quot; e &quot;R$ 18 mil a receber, sendo R$ 11 mil parados
              há mais de noventa dias&quot; são duas empresas diferentes.
            </p>
          </Bloco>
        </div>

        <aside className={estilo.blocos}>
          <Bloco titulo="Quem deve mais">
            {devedores.length === 0 ? (
              <EmptyState titulo="Ninguém devendo ✓" apoio="Nenhuma cobrança em aberto." />
            ) : (
              <div className={estilo.dinheiro}>
                {devedores.map((d) => (
                  <p key={d.id} className={estilo.dinheiroLinha}>
                    <span>
                      <Link href={`/sistema/clientes/${d.id}`}>{d.nome}</Link>
                      {d.vencidoCentavos > 0 ? (
                        <>
                          {' '}
                          <Chip tom="danger">vencido</Chip>
                        </>
                      ) : null}
                    </span>
                    <strong>{formatarBRL(d.totalCentavos)}</strong>
                  </p>
                ))}
              </div>
            )}
          </Bloco>

          <Bloco titulo="Operação">
            <div className={estilo.dinheiro}>
              <p className={estilo.dinheiroLinha}>
                <span>O.S. abertas</span>
                <strong>{resumo.ordensAbertas}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Com prazo vencido</span>
                <strong>{resumo.atrasadas}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Peças abaixo do mínimo</span>
                <strong>{resumo.pecasAbaixoDoMinimo}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Avisos que falharam</span>
                <strong>{resumo.avisosFalhados}</strong>
              </p>
            </div>
          </Bloco>
        </aside>
      </div>
    </>
  )
}

function mesCurto(mes: string): string {
  // A consulta devolve 'AAAA-MM'. Montar a data no dia 15 evita a virada de mês
  // por fuso — dia 1 às 00:00 em UTC é o mês anterior em Lajeado.
  const d = new Date(`${mes}-15T12:00:00-03:00`)
  if (Number.isNaN(d.getTime())) return mes
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()
}
