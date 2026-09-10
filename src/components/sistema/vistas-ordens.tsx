import Link from 'next/link'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { COLUNAS_ESTEIRA, type AcaoDaVez, type EstadoEsteira } from '@/lib/esteira'
import BotaoDaVez from './botao-da-vez'
import { Chip } from './pecas'
import estilo from './pecas.module.css'

/**
 * A MESMA COLEÇÃO EM DOIS FORMATOS — `<ListView>` e `<KanbanBoard>`.
 *
 * =============================================================================
 * POR QUE DOIS, E NÃO UM
 * =============================================================================
 * São duas perguntas diferentes sobre as mesmas ordens:
 *
 *   LISTA  — "o que eu faço agora?". Densa, ordenada pelo que está parado há
 *            mais tempo, com o botão-da-vez em cada linha.
 *   QUADRO — "como está a esteira?". A forma da fila fica visível: onze
 *            aparelhos empilhados em "Em análise" e nenhum em "Aprovado" conta
 *            uma história que nenhuma lista conta.
 *
 * =============================================================================
 * O TOGGLE É UM LINK, E NÃO UM BOTÃO DE JAVASCRIPT
 * =============================================================================
 * A escolha vive na URL. Isso custa uma navegação e devolve três coisas: o
 * botão "voltar" funciona, dá para guardar nos favoritos o quadro filtrado por
 * técnico, e a preferência sobrevive a um recarregamento — sem uma linha de
 * estado no navegador.
 */

export type OrdemNaVista = {
  id: string
  numero: number
  etapa: EtapaOrdem
  estado: EstadoEsteira
  acao: AcaoDaVez | null
  cliente: string
  equipamento: string
  serie: string | null
  tecnico: string | null
  diasParado: number
  atrasada: boolean
  urgente: boolean
}

// ===========================================================================
// <ViewToggle>
// ===========================================================================

export function ViewToggle({ vista, base }: { vista: 'lista' | 'quadro'; base: string }) {
  const url = (v: string) => {
    const p = new URLSearchParams(base)
    p.set('vista', v)
    return `?${p.toString()}`
  }
  return (
    <div className={estilo.toggle} role="group" aria-label="Formato da lista">
      <Link
        href={url('lista')}
        className={vista === 'lista' ? estilo.toggleOpcaoAtiva : estilo.toggleOpcao}
        aria-current={vista === 'lista' ? 'true' : undefined}
      >
        Lista
      </Link>
      <Link
        href={url('quadro')}
        className={vista === 'quadro' ? estilo.toggleOpcaoAtiva : estilo.toggleOpcao}
        aria-current={vista === 'quadro' ? 'true' : undefined}
      >
        Kanban
      </Link>
    </div>
  )
}

// ===========================================================================
// <ListView>
// ===========================================================================

function tempo(dias: number): { texto: string; classe: string | undefined } {
  if (dias <= 0) return { texto: 'hoje', classe: undefined }
  if (dias === 1) return { texto: 'ontem', classe: undefined }
  if (dias < 4) return { texto: `há ${dias} dias`, classe: undefined }
  if (dias < 10) return { texto: `parado há ${dias} dias`, classe: estilo.parado }
  return { texto: `parado há ${dias} dias`, classe: estilo.paradoMuito }
}

export function ListView({ ordens }: { ordens: OrdemNaVista[] }) {
  return (
    <div className={estilo.radar}>
      {ordens.map((o) => {
        const t = tempo(o.diasParado)
        return (
          <div key={o.id} className={estilo.linha}>
            <div className={estilo.linhaTxt}>
              <div className={estilo.linhaTopo}>
                <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaNumero}>
                  O.S. {String(o.numero).padStart(5, '0')}
                </Link>
                <Chip tom={o.estado.tom}>{o.estado.rotulo}</Chip>
                {o.urgente ? <Chip tom="danger">Prioridade alta</Chip> : null}
                {o.atrasada ? <Chip tom="danger">Prazo vencido</Chip> : null}
              </div>
              <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaTitulo}>
                {o.equipamento}
              </Link>
              <div className={estilo.linhaApoio}>
                <span>{o.cliente}</span>
                {o.serie ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="num">{o.serie}</span>
                  </>
                ) : null}
                <span aria-hidden="true">·</span>
                <span className={t.classe}>{t.texto}</span>
                {o.tecnico ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{o.tecnico}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className={estilo.linhaAcao}>
              {o.acao ? (
                <BotaoDaVez ordemId={o.id} acao={o.acao} />
              ) : (
                <Chip tom="pending">Com {o.estado.quemAge}</Chip>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===========================================================================
// <KanbanBoard>
// ===========================================================================

/**
 * O quadro, com uma coluna por estado da esteira enxuta.
 *
 * As colunas são as 13 da direção — os desvios não viram coluna, porque não são
 * degraus do caminho. Uma ordem recusada ou cancelada aparece na LISTA, com o
 * chip vermelho dela; pendurar três colunas de saída lateral no fim do quadro
 * transformaria o mapa da esteira num mapa das exceções.
 *
 * COLUNA VAZIA CONTINUA APARECENDO. É o oposto do reflexo de esconder: a
 * ausência é informação. Um quadro sem a coluna "Aprovado" não conta que nada
 * foi aprovado esta semana — ele só não conta nada.
 */
export function KanbanBoard({ ordens }: { ordens: OrdemNaVista[] }) {
  return (
    <div className={estilo.quadro}>
      {COLUNAS_ESTEIRA.map((coluna) => {
        const doEstado = ordens.filter((o) => o.estado.chave === coluna.chave)
        return (
          <div key={coluna.chave} className={estilo.coluna}>
            <div className={estilo.colunaTopo}>
              <span className={estilo.colunaPasso}>{String(coluna.passo).padStart(2, '0')}</span>
              <span className={estilo.colunaTitulo}>{coluna.rotulo}</span>
              <span className={estilo.colunaQuantos}>{doEstado.length}</span>
            </div>

            {doEstado.map((o) => (
              <Link key={o.id} href={`/sistema/ordens/${o.id}`} className={estilo.ficha}>
                <span className={estilo.fichaTitulo}>{o.equipamento}</span>
                <span className={estilo.fichaApoio}>
                  O.S. {String(o.numero).padStart(5, '0')} · {o.cliente}
                </span>
                {o.atrasada || o.urgente || o.diasParado >= 4 ? (
                  <span className={estilo.fichaApoio}>
                    {o.atrasada ? (
                      <Chip tom="danger">Prazo vencido</Chip>
                    ) : o.urgente ? (
                      <Chip tom="danger">Alta</Chip>
                    ) : (
                      <Chip tom="warn">{o.diasParado} dias</Chip>
                    )}
                  </span>
                ) : null}
              </Link>
            ))}

            {doEstado.length === 0 ? (
              <p className={estilo.colunaVazia}>Vazia</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
