import Link from 'next/link'
import { formatarBRL } from '@/lib/dinheiro'
import { FASES } from '@/server/consultas/comercial'
import estilo from '../painel.module.css'

export type LinhaFunil = {
  id: string
  numero: number
  versao: number
  status: string
  totalCentavos: number
  criadoEm: Date
  enviadoEm: Date | null
  respondidoEm: Date | null
  validoAte: Date | null
  motivoReprovacao: string | null
  aprovadoPorNome: string | null
  ordemId: string
  ordemNumero: number
  cliente: string
  clienteId: string
  equipamento: string
  diasEsperando: number | null
  vencido: boolean
}

/**
 * O FUNIL, LINHA A LINHA.
 *
 * =============================================================================
 * A ORDEM DA LISTA É A ORDEM DA URGÊNCIA
 * =============================================================================
 * Quem espera resposta vem primeiro, e dentro disso o MAIS ANTIGO no topo. Não
 * é detalhe: o orçamento parado há doze dias é o que corre risco de virar venda
 * do concorrente; o de ontem ainda está no prazo normal de decisão.
 *
 * Uma lista ordenada por data decrescente — o padrão de quase toda tela —
 * enterraria justamente os que precisam de telefonema hoje.
 *
 * =============================================================================
 * "HÁ 12 DIAS" E NÃO A DATA
 * =============================================================================
 * "Enviado em 16/08" obriga a fazer a conta de cabeça, com o calendário. "Há 12
 * dias" já é a resposta — e é ela que decide se vale ligar agora.
 */
export default function Funil({
  linhas,
  fase,
  busca,
  dias,
}: {
  linhas: LinhaFunil[]
  fase: string
  busca: string
  dias: number
}) {
  return (
    <>
      <form method="get" className={estilo.filtros}>
        <input type="hidden" name="aba" value="orcamentos" />
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Cliente, equipamento ou número do orçamento"
            aria-label="Buscar orçamentos"
          />
        </div>
        <select className={estilo.selecao} name="fase" defaultValue={fase} aria-label="Situação">
          <option value="">Todas as situações</option>
          {FASES.map((f) => (
            <option key={f.chave} value={f.chave}>
              {f.rotulo}
            </option>
          ))}
        </select>
        <select className={estilo.selecao} name="dias" defaultValue={String(dias)} aria-label="Período">
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
        </select>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      {linhas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum orçamento com esse filtro. Eles aparecem aqui quando saem da bancada e vão para o
          cliente — rascunho e revisão interna ficam de fora de propósito, porque ninguém está
          esperando resposta deles.
        </p>
      ) : (
        <ul className={estilo.caixaLista}>
          {linhas.map((l) => (
            <li
              key={l.id}
              className={
                l.status === 'ENVIADO' && (l.vencido || (l.diasEsperando ?? 0) >= 7)
                  ? `${estilo.caixaItem} ${estilo.caixaItemVencido}`
                  : estilo.caixaItem
              }
            >
              <div className={estilo.caixaQuando}>
                <strong>#{String(l.numero).padStart(3, '0')}</strong>
                <span className={estilo.fraco}>{l.versao > 1 ? `v${l.versao}` : 'orçam.'}</span>
              </div>

              <div className={estilo.caixaMeio}>
                <strong className={estilo.caixaDesc}>
                  <Link href={`/painel/clientes/${l.clienteId}`}>{l.cliente}</Link>
                </strong>
                <p className={estilo.caixaDetalhe}>
                  <span>{l.equipamento}</span>
                  <Link href={`/painel/ordens/${l.ordemId}`} className={estilo.caixaCat}>
                    O.S. #{String(l.ordemNumero).padStart(4, '0')}
                  </Link>
                </p>
                {/* O motivo da recusa estava gravado e nenhuma tela lia. É a
                    informação que muda o negócio: "achou caro" dez vezes no mês
                    é recado sobre a tabela de preço. */}
                {l.status === 'REPROVADO' && l.motivoReprovacao ? (
                  <p className={estilo.fraco}>motivo: {l.motivoReprovacao}</p>
                ) : null}
                {l.status === 'APROVADO' && l.aprovadoPorNome ? (
                  <p className={estilo.fraco}>aprovado por {l.aprovadoPorNome}</p>
                ) : null}
              </div>

              <div className={estilo.caixaValor}>
                <strong>{formatarBRL(l.totalCentavos)}</strong>
                <span className={selo(l.status, l.vencido)}>{rotulo(l.status, l.vencido)}</span>
                {l.diasEsperando != null ? (
                  <span className={estilo.fraco}>
                    {l.diasEsperando === 0
                      ? 'enviado hoje'
                      : `há ${l.diasEsperando} ${l.diasEsperando === 1 ? 'dia' : 'dias'}`}
                  </span>
                ) : null}
              </div>

              {/* CHEGAR NO ORÇAMENTO, e não "na ordem".
                  Antes toda linha levava ao topo da ficha, e a pessoa rolava
                  atrás do bloco de orçamento numa página longa. O funil existe
                  para trabalhar orçamento; o destino tem que ser o orçamento.

                  A âncora `#orcamento` é o que faz a diferença entre um atalho
                  e um link — sem ela, os dois botões abaixo abrem exatamente a
                  mesma coisa que antes. */}
              <div className={estilo.caixaAcoes}>
                <Link href={`/painel/ordens/${l.ordemId}#orcamento`} className={estilo.btnSec}>
                  {l.status === 'RASCUNHO' ? 'Continuar orçamento' : 'Abrir orçamento'}
                </Link>
                {l.status === 'ENVIADO' ? (
                  <Link href={`/painel/ordens/${l.ordemId}#orcamento`} className={estilo.linkAcao}>
                    Cobrar resposta
                  </Link>
                ) : null}
                {l.status === 'RECUSADO' ? (
                  // Recusado não é fim: a versão nova nasce do mesmo lugar, e
                  // é o caso em que a pessoa mais precisa voltar rápido.
                  <Link href={`/painel/ordens/${l.ordemId}#orcamento`} className={estilo.linkAcao}>
                    Refazer com outro valor
                  </Link>
                ) : null}
                <Link href={`/painel/ordens/${l.ordemId}`} className={estilo.fraco}>
                  ver a ordem inteira
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className={estilo.dica} style={{ marginTop: 'var(--s5)' }}>
        A lista mostra a ÚLTIMA versão de cada orçamento. Um orçamento revisado três vezes é uma
        proposta só, não três — e o valor do topo conta assim também.
      </p>
    </>
  )
}

function rotulo(status: string, vencido: boolean): string {
  if (status === 'ENVIADO') return vencido ? 'validade venceu' : 'esperando'
  if (status === 'APROVADO') return 'aprovado'
  if (status === 'REPROVADO') return 'recusado'
  if (status === 'EXPIRADO') return 'expirou'
  return status.toLowerCase()
}

function selo(status: string, vencido: boolean): string {
  if (status === 'APROVADO') return `${estilo.tag} ${estilo.tagOk}`
  if (status === 'REPROVADO' || status === 'EXPIRADO' || vencido) {
    return `${estilo.tag} ${estilo.tagAlerta}`
  }
  return `${estilo.tag} ${estilo.tagEspera}`
}
