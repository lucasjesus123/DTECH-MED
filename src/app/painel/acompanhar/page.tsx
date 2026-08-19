import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { ordensNaCasa } from '@/server/consultas/listas'
import { montarTrilha } from '@/server/ordem/trilha'
import { formatarBRL } from '@/lib/dinheiro'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Acompanhar', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * ACOMPANHAR — todos os equipamentos que estão na casa, numa tela só.
 *
 * ---------------------------------------------------------------------------
 * A PERGUNTA QUE ESTA TELA RESPONDE
 * ---------------------------------------------------------------------------
 * "O cliente ligou perguntando do aparelho dele — onde está?"
 *
 * Antes, responder isso exigia procurar a ordem na lista, abrir a ficha e ler a
 * linha do tempo de baixo para cima. Três passos e uma leitura, com o cliente
 * esperando no telefone. Aqui é um só: o nome está na tela e a régua ao lado
 * mostra o ponto.
 *
 * ---------------------------------------------------------------------------
 * POR QUE CARTÃO E NÃO TABELA
 * ---------------------------------------------------------------------------
 * Uma tabela é melhor para comparar linhas por uma coluna — quem venceu
 * primeiro, quem custa mais. Aqui não se compara: procura-se UM cliente e lê-se
 * o estado dele. O cartão junta nome, aparelho, régua e valor num bloco que o
 * olho pega inteiro, e é isso que o balcão precisa.
 *
 * ---------------------------------------------------------------------------
 * A ORDEM DOS CARTÕES
 * ---------------------------------------------------------------------------
 * Por prazo prometido, o mais apertado primeiro. Não é por data de abertura nem
 * por etapa: o que decide a próxima hora de trabalho é o que vence antes.
 */
export default async function Acompanhar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { ctx } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )
  const { q } = await searchParams
  const ordens = await ordensNaCasa(ctx, q)

  const agora = new Date()
  const atrasadas = ordens.filter((o) => o.prazoPrometido && o.prazoPrometido < agora).length
  const esperandoCliente = ordens.filter((o) => o.etapa === 'ORCAMENTO_ENVIADO').length
  const aDespachar = ordens.filter((o) => o.etapa === 'FATURADO' || o.etapa === 'ORDEM_RETIRADA_GERADA').length

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>A esteira</p>
          <h1 className={estilo.titulo}>Acompanhar</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            Todo equipamento que está com a gente agora, e em que ponto está cada um.
          </p>
        </div>
      </div>

      <div className={estilo.resumo}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Na casa agora</span>
          <span className={estilo.indValor}>{ordens.length}</span>
          <span className={estilo.indNota}>equipamentos em andamento</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Passou do prazo</span>
          <span className={atrasadas > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {atrasadas}
          </span>
          <span className={estilo.indNota}>{atrasadas > 0 ? 'ligue antes que o cliente ligue' : 'nenhum atrasado'}</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Esperando o cliente</span>
          <span className={estilo.indValor}>{esperandoCliente}</span>
          <span className={estilo.indNota}>orçamento enviado, sem resposta</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Esperando a rua</span>
          <span className={estilo.indValor}>{aDespachar}</span>
          <span className={estilo.indNota}>a retirar ou a entregar</span>
        </div>
      </div>

      <form className={estilo.filtros} method="get">
        <input
          className={`${estilo.campo} ${estilo.busca}`}
          name="q"
          defaultValue={q ?? ''}
          placeholder="Nome do cliente, marca, modelo ou número da O.S."
          aria-label="Procurar equipamento"
        />
        <button type="submit" className={estilo.btn}>
          Procurar
        </button>
      </form>

      {ordens.length === 0 ? (
        <p className={estilo.vazio}>
          {q
            ? `Nada encontrado para "${q}". A busca olha nome do cliente, marca, modelo e número da O.S.`
            : 'Nenhum equipamento na casa agora. Quando uma ordem for aberta, ela aparece aqui.'}
        </p>
      ) : (
        <div className={estilo.gradeAcompanhar}>
          {ordens.map((o) => {
            const trilha = montarTrilha(
              o.etapa,
              o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
            )
            const atrasada = !!o.prazoPrometido && o.prazoPrometido < agora
            const orc = o.orcamentos[0]
            const valor = o.fatura?.valorTotalCentavos ?? orc?.totalCentavos ?? null
            const emAberto = o.fatura
              ? o.fatura.valorTotalCentavos - o.fatura.valorPagoCentavos
              : null

            return (
              <Link key={o.id} href={`/painel/ordens/${o.id}`} className={estilo.cartaoAcomp}>
                <div className={estilo.acompTopo}>
                  <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                  <span className={atrasada ? `${estilo.tag} ${estilo.tagAlerta}` : `${estilo.tag} ${estilo.tagNeutra}`}>
                    {atrasada ? 'passou do prazo' : trilha.agora}
                  </span>
                </div>

                <p className={estilo.acompCliente}>{o.cliente.nome}</p>
                <p className={estilo.acompEq}>
                  {o.equipamento.marca} {o.equipamento.modelo}
                  {o.equipamento.numeroSerie ? ` · ${o.equipamento.numeroSerie}` : ''}
                </p>

                {/* A régua curta. É o motivo desta tela existir. */}
                <div className={estilo.trilhaMini}>
                  <div className={estilo.trilhaMiniFio}>
                    <span
                      className={trilha.desvio ? estilo.trilhaMiniParado : estilo.trilhaMiniCheio}
                      style={{ width: `${trilha.porcento}%` }}
                    />
                  </div>
                  <div className={estilo.trilhaMiniTxt}>
                    <span>{trilha.agora}</span>
                    <span>
                      {trilha.cumpridos}/{trilha.total}
                    </span>
                  </div>
                </div>

                <div className={estilo.acompPe}>
                  <span>
                    {valor != null ? formatarBRL(valor) : 'sem orçamento ainda'}
                    {emAberto != null && emAberto > 0 ? (
                      <span className={estilo.acompAberto}> · {formatarBRL(emAberto)} em aberto</span>
                    ) : null}
                  </span>
                  <span className={estilo.acompProva}>
                    {o._count.fotos} foto{o._count.fotos === 1 ? '' : 's'} ·{' '}
                    {o._count.assinaturas} assinatura{o._count.assinaturas === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
