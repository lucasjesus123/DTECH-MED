import Link from 'next/link'
import { estadoDaEtapa } from '@/lib/esteira'
import { listarEquipamentos } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import {
  CabecalhoTela,
  Chip,
  EmptyState,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * EQUIPAMENTOS — o prontuário do aparelho.
 *
 * =============================================================================
 * A PERGUNTA DESTA TELA É "JÁ MEXEMOS NESTE?"
 * =============================================================================
 * Um aparelho que volta pela terceira vez com o mesmo defeito é uma informação
 * cara, e ela só existe se o aparelho tiver identidade própria — não "uma O.S.
 * de um cliente", mas ESTE aparelho, com este número de série.
 *
 * Por isso cada linha mostra quantas ordens já passaram por ele e em que pé
 * está a última. É a mesma promessa do site: *"seu equipamento tem
 * prontuário"*.
 *
 * A folha de rastreabilidade de cada um continua morando na ficha, e é ela que
 * responde ao cliente, ao fabricante e à vigilância sanitária quantas provas
 * existem e de que dia são.
 */
export default async function Equipamentos({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  const { ctx } = await exigirTela('equipamentos')
  const q = await searchParams

  const aparelhos = await listarEquipamentos(ctx, q.busca)

  const semSerie = aparelhos.filter((e) => !e.numeroSerie).length
  const reincidentes = aparelhos.filter((e) => e._count.ordens >= 3).length
  const naCasa = aparelhos.filter((e) => {
    const ultima = e.ordens[0]
    if (!ultima) return false
    const estado = estadoDaEtapa(ultima.etapa)
    return !estado.desvio && (estado.passo ?? 0) >= 4 && (estado.passo ?? 0) <= 11
  }).length

  const stats: Stat[] = [
    { rotulo: 'Nesta lista', valor: aparelhos.length, icone: 'equipamentos' },
    {
      rotulo: 'Aqui dentro agora',
      valor: naCasa,
      apoio: 'entre a coleta e a entrega',
      tom: 'info',
      icone: 'bancada',
    },
    {
      rotulo: 'Voltaram 3+ vezes',
      valor: reincidentes,
      apoio: reincidentes === 0 ? 'nenhum reincidente' : 'vale olhar o histórico',
      tom: reincidentes > 0 ? 'warn' : 'ok',
      icone: 'relatorios',
    },
    {
      rotulo: 'Sem número de série',
      valor: semSerie,
      apoio: semSerie === 0 ? 'todos identificados' : 'difícil de rastrear',
      tom: semSerie > 0 ? 'warn' : 'ok',
      icone: 'conferencia',
    },
  ]

  return (
    <>
      <CabecalhoTela titulo="Equipamentos" apoio="Cada aparelho, com a história dele." />

      <StatCardRow stats={stats} />

      <form className={estilo.barraLista} method="get">
        <input
          className={estilo.campoBusca}
          type="search"
          name="busca"
          defaultValue={q.busca ?? ''}
          placeholder="Marca, modelo, série, categoria ou cliente"
          aria-label="Buscar equipamentos"
        />
        <button type="submit" className={estilo.acaoLinha}>
          Filtrar
        </button>
      </form>

      {aparelhos.length === 0 ? (
        <EmptyState
          titulo={q.busca ? 'Nada com esse termo' : 'Nenhum aparelho ainda'}
          bom={!q.busca}
          apoio={
            q.busca
              ? 'Tente a marca, o modelo ou o número de série.'
              : 'Os aparelhos entram no cadastro quando a primeira O.S. deles é aberta.'
          }
        />
      ) : (
        <div className={estilo.radar}>
          {aparelhos.map((e) => {
            const ultima = e.ordens[0]
            const estado = ultima ? estadoDaEtapa(ultima.etapa) : null
            return (
              <div key={e.id} className={estilo.linha}>
                <div className={estilo.linhaTxt}>
                  <div className={estilo.linhaTopo}>
                    <span className={estilo.linhaTitulo}>
                      {`${e.marca} ${e.modelo}`.trim()}
                    </span>
                    {estado ? <Chip tom={estado.tom}>{estado.rotulo}</Chip> : null}
                    {e._count.ordens >= 3 ? (
                      <Chip tom="warn">{e._count.ordens} passagens</Chip>
                    ) : null}
                  </div>
                  <div className={estilo.linhaApoio}>
                    {/* Aparelho de catálogo ainda não tem dono: ele existe antes de
                        alguém mandar consertar. */}
                    <span>{e.cliente?.nome ?? 'sem dono no cadastro'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="num">{e.numeroSerie ?? 'sem série'}</span>
                    {e.categoria ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{e.categoria}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className={estilo.linhaAcao}>
                  {ultima ? (
                    <Link href={`/sistema/ordens/${ultima.id}`} className={estilo.acao}>
                      Ver a última O.S.
                    </Link>
                  ) : (
                    <Link
                      href={`/sistema/ordens/nova?equipamento=${e.id}`}
                      className={estilo.acao}
                    >
                      Abrir O.S.
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
