import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { motoristasDaEmpresa, ordensNaCasa } from '@/server/consultas/listas'
import { ondeEsta } from '@/server/ordem/onde-esta'
import { montarTrilha } from '@/server/ordem/trilha'
import { Cartoes, type CartaoOrdem } from './cartoes'
import AbasOS from '../os-abas'
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
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('acompanhar')
  const { q } = await searchParams
  const [ordens, motoristas] = await Promise.all([ordensNaCasa(ctx, q), motoristasDaEmpresa(ctx)])

  const agora = new Date()
  const atrasadas = ordens.filter((o) => o.prazoPrometido && o.prazoPrometido < agora).length
  const esperandoCliente = ordens.filter((o) => o.etapa === 'ORCAMENTO_ENVIADO').length
  const aDespachar = ordens.filter((o) => o.etapa === 'FATURADO' || o.etapa === 'ORDEM_RETIRADA_GERADA').length

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O.S.</p>
          <h1 className={estilo.titulo}>Acompanhar</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            Todo equipamento que está com a gente agora, e em que ponto está cada um.
          </p>
        </div>
      </div>

      <AbasOS atual="acompanhar" papel={sessao.papel} telas={sessao.telas} />

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
        <Cartoes ordens={ordens.map(paraCartao)} motoristas={motoristas.map((m) => ({ id: m.id, nome: m.nome }))} />
      )}
    </>
  )

  /**
   * O cartão, reduzido ao que ele mostra.
   *
   * A lista roda no SERVIDOR e entrega ao componente de cliente só o que
   * aparece no cartão — nem o token do portal, nem o WhatsApp do cliente, nem
   * os itens do orçamento. O dossiê completo vem depois, no clique, e passa
   * pelo guarda de papel de novo.
   */
  function paraCartao(o: (typeof ordens)[number]): CartaoOrdem {
    const trilha = montarTrilha(
      o.etapa,
      o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
    )
    const orc = o.orcamentos[0]
    // Quem está com o aparelho AGORA: o motorista da parada aberta quando ele
    // está na rua, o técnico quando está na bancada. São pessoas diferentes na
    // maior parte do dia, e dizer o nome errado ao telefone é pior que não
    // dizer nome nenhum.
    const naRua = o.agendamentos[0]
    const quem = naRua?.motorista?.nome ?? o.tecnico?.nome ?? null
    const onde = ondeEsta(o.etapa, quem)
    return {
      id: o.id,
      numero: o.numero,
      cliente: o.cliente.nome,
      equipamento:
        `${o.equipamento.marca} ${o.equipamento.modelo}` +
        (o.equipamento.numeroSerie ? ` · ${o.equipamento.numeroSerie}` : ''),
      atrasada: !!o.prazoPrometido && o.prazoPrometido < agora,
      agora: trilha.agora,
      porcento: trilha.porcento,
      desvio: !!trilha.desvio,
      cumpridos: trilha.cumpridos,
      total: trilha.total,
      valorCentavos: o.fatura?.valorTotalCentavos ?? orc?.totalCentavos ?? null,
      emAbertoCentavos: o.fatura ? o.fatura.valorTotalCentavos - o.fatura.valorPagoCentavos : null,
      fotos: o._count.fotos,
      assinaturas: o._count.assinaturas,
      podeDespachar: o.etapa === 'ORDEM_RETIRADA_GERADA' || o.etapa === 'FATURADO',
      onde: onde.rotulo,
      lugar: onde.lugar,
      fotoId: o.fotos[0]?.id ?? null,
    }
  }
}
