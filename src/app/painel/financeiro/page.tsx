import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, podeVer, exigirAba } from '@/server/auth/guarda'
import { aguardandoFatura, caixaDoMes, listarFaturas } from '@/server/consultas/listas'
import {
  categoriasUsadas,
  fluxoDosMeses,
  formasDoMes,
  listarContas,
  listarRecorrencias,
  maioresDevedores,
  mesPorExtenso,
  mesValido,
  panoramaDoMes,
  pendentesDeGeracao,
  porCategoria,
  esperandoAprovacao,
  prontasParaBaixa,
  quantasEsperandoAprovacao,
} from '@/server/consultas/caixa'
import AbasDoCaixa, { type AbaCaixa } from './abas'
import FilaDeAprovacao from './aprovar'
import FilaDeBaixa from './baixa'
import Aguardando from './aguardando'
import Contas from './contas'
import Faturas from './faturas'
import Recorrencias from './recorrencias'
import Relatorios from './relatorios'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Financeiro', robots: { index: false } }
export const dynamic = 'force-dynamic'

const ABAS: AbaCaixa[] = ['faturas', 'receber', 'pagar', 'aprovar', 'baixa', 'recorrencias', 'relatorios']

/**
 * FINANCEIRO — o caixa inteiro numa tela.
 *
 * =============================================================================
 * O QUE MUDOU, E POR QUÊ
 * =============================================================================
 * Esta tela sabia cobrar serviço e não sabia mais nada. `faturas` nasce de uma
 * ordem — responde "quanto o cliente me deve" e não diz uma palavra sobre
 * aluguel, energia, contador, salário ou a peça comprada no fornecedor.
 *
 * Metade da história sobre dinheiro é pior que nenhuma, porque parece completa.
 * Quem abria aqui via "recebi R$ 42 mil este mês" sem nunca ter subtraído os
 * R$ 38 mil que saíram.
 *
 * =============================================================================
 * OS CINCO NÚMEROS DO TOPO VALEM PARA AS CINCO ABAS
 * =============================================================================
 * Eles ficam ACIMA da barra de abas de propósito: são a resposta curta, e quem
 * abre o Financeiro pela manhã quer só isso. As abas são o detalhe de quem
 * precisou olhar mais fundo.
 *
 * A separação entre eles é a distinção que a tela inteira defende:
 *
 *   ENTROU / SAIU / SOBROU — realizado. Tem data de pagamento. Não muda mais.
 *   A RECEBER / A PAGAR    — previsto. Tem vencimento. Muda todo dia.
 *
 * "Entrou" soma as DUAS origens do dinheiro: a baixa de fatura de serviço e o
 * recebimento avulso. É isso que faz o número ser uma resposta, e não um pedaço
 * de resposta.
 *
 * =============================================================================
 * VENCIDO NÃO RESPEITA O MÊS DA TELA
 * =============================================================================
 * Uma conta de março que ninguém pagou continua sendo problema em agosto. Se o
 * atraso só aparecesse dentro do mês em que venceu, a dívida mais velha — que é
 * a pior — seria a mais escondida.
 */
export default async function Financeiro({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string
    mes?: string
    status?: string
    busca?: string
    situacao?: string
  }>
}) {
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.FINANCEIRO)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('financeiro')
  const q = await searchParams

    // O padrão é FATURAS, não "A receber". Ver o comentário da ordem em
  // `abas.tsx`: emitir e receber a fatura é o que destrava a esteira, e quem
  // abre esta tela sem escolher aba está quase sempre vindo fazer isso.
  const aba: AbaCaixa = ABAS.includes(q.aba as AbaCaixa) ? (q.aba as AbaCaixa) : 'faturas'
  const mes = mesValido(q.mes)
  const mesExtenso = mesPorExtenso(mes)
  const podeApagar = podeVer(sessao.papel, Papel.GESTOR)
  // Quem aprova é o mesmo piso de quem apaga: GESTOR para cima. A trava de
  // verdade está na ação — esconder a aba impede o clique, não a requisição.
  const podeAprovar = podeVer(sessao.papel, Papel.GESTOR)

  const [panorama, aFaturar, esperando] = await Promise.all([
    panoramaDoMes(ctx, mes),
    aguardandoFatura(ctx),
    quantasEsperandoAprovacao(ctx),
  ])

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Dinheiro</p>
          <h1 className={estilo.titulo}>Financeiro</h1>
        </div>
      </div>

      <div className={`${estilo.resumo} ${estilo.resumo5}`}>
        <Indicador
          rotulo="Entrou no mês"
          valor={formatarBRL(panorama.entrouCentavos)}
          nota={
            panorama.entrouDeAvulso > 0
              ? `${formatarBRL(panorama.entrouDeServico)} de serviço · ${formatarBRL(panorama.entrouDeAvulso)} avulso`
              : 'serviços e recebimentos avulsos'
          }
        />
        <Indicador
          rotulo="Saiu no mês"
          valor={formatarBRL(panorama.saiuCentavos)}
          nota="contas já pagas"
        />
        <Indicador
          rotulo="Sobrou"
          valor={formatarBRL(panorama.sobrouCentavos)}
          nota={panorama.sobrouCentavos < 0 ? 'saiu mais do que entrou' : 'o que o mês deixou'}
          alerta={panorama.sobrouCentavos < 0}
        />
        <Indicador
          rotulo="A receber vencido"
          valor={formatarBRL(panorama.receberVencidoCentavos)}
          nota={
            panorama.receberVencidas > 0
              ? `${panorama.receberVencidas} ${panorama.receberVencidas === 1 ? 'cobrança atrasada' : 'cobranças atrasadas'}`
              : 'ninguém devendo em atraso'
          }
          alerta={panorama.receberVencidoCentavos > 0}
        />
        <Indicador
          rotulo="A pagar vencido"
          valor={formatarBRL(panorama.pagarVencidoCentavos)}
          nota={
            panorama.pagarVencidas > 0
              ? `${panorama.pagarVencidas} ${panorama.pagarVencidas === 1 ? 'conta atrasada' : 'contas atrasadas'}`
              : 'nada atrasado'
          }
          alerta={panorama.pagarVencidoCentavos > 0}
        />
      </div>

      {/* ACIMA das abas, e por isso presente nas cinco.
          Uma ordem liberada pela gestão e ainda sem fatura trava o aparelho de
          um cliente na oficina — isso não é o recorte de uma aba, é chamado de
          hoje. Quando este bloco morava dentro da aba de faturas, o financeiro
          abria a tela, não via "Emitir fatura", e a ordem ficava presa na etapa
          14. Ver `aguardando.tsx`. */}
      <Aguardando
        pendentes={aFaturar.map((o) => ({
          ordemId: o.id,
          numero: o.numero,
          cliente: o.cliente.nome,
          equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
          totalCentavos: o.orcamentos[0]?.totalCentavos ?? 0,
        }))}
      />

      <AbasDoCaixa atual={aba} mes={mes} podeAprovar={podeAprovar} esperando={esperando} />

      {aba === 'aprovar' ? (
        podeAprovar ? (
          <PainelAprovar ctx={ctx} meuNome={sessao.nome} />
        ) : (
          <div className={estilo.vazio}>
            Seu perfil não aprova conta. Quem lança não aprova — é o que impede uma conta inventada
            de percorrer o sistema sem passar por outro par de olhos.
          </div>
        )
      ) : aba === 'baixa' ? (
        <PainelBaixa ctx={ctx} />
      ) : aba === 'receber' || aba === 'pagar' ? (
        <PainelContas
          ctx={ctx}
          tipo={aba === 'pagar' ? 'PAGAR' : 'RECEBER'}
          mes={mes}
          situacao={q.situacao ?? 'abertas'}
          busca={q.busca}
          podeApagar={podeApagar}
        />
      ) : aba === 'recorrencias' ? (
        <PainelRecorrencias ctx={ctx} mes={mes} mesExtenso={mesExtenso} podeApagar={podeApagar} />
      ) : aba === 'relatorios' ? (
        <PainelRelatorios ctx={ctx} mes={mes} mesExtenso={mesExtenso} />
      ) : (
        <PainelFaturas ctx={ctx} sessao={sessao} status={q.status} busca={q.busca} mes={mes} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// As abas
// ---------------------------------------------------------------------------

type Ctx = Awaited<ReturnType<typeof exigirPapel>>['ctx']
type Sessao = Awaited<ReturnType<typeof exigirPapel>>['sessao']

async function PainelContas({
  ctx,
  tipo,
  mes,
  situacao,
  busca,
  podeApagar,
}: {
  ctx: Ctx
  tipo: 'PAGAR' | 'RECEBER'
  mes: string
  situacao: string
  busca?: string
  podeApagar: boolean
}) {
  const [contas, categorias, clientes] = await Promise.all([
    listarContas(ctx, { tipo, mes, situacao, busca }),
    categoriasUsadas(ctx, tipo),
    clientesParaEscolher(ctx),
  ])

  return (
    <Contas
      tipo={tipo}
      mes={mes}
      situacao={situacao}
      busca={busca ?? ''}
      categorias={categorias}
      clientes={clientes}
      podeApagar={podeApagar}
      contas={contas.map((c) => ({
        id: c.id,
        descricao: c.descricao,
        categoria: c.categoria,
        contraparte: c.contraparte,
        clienteNome: c.cliente?.nome ?? null,
        valorCentavos: c.valorCentavos,
        valorPagoCentavos: c.valorPagoCentavos,
        vencimento: c.vencimento.toISOString(),
        pagoEm: c.pagoEm?.toISOString() ?? null,
        forma: c.forma,
        grupo: c.grupo,
        parcela: c.parcela,
        parcelas: c.parcelas,
        daRecorrencia: Boolean(c.recorrenciaId),
        observacoes: c.observacoes,
      }))}
    />
  )
}

async function PainelRecorrencias({
  ctx,
  mes,
  mesExtenso,
  podeApagar,
}: {
  ctx: Ctx
  mes: string
  mesExtenso: string
  podeApagar: boolean
}) {
  const [recorrencias, clientes, pendentes] = await Promise.all([
    listarRecorrencias(ctx),
    clientesParaEscolher(ctx),
    pendentesDeGeracao(ctx, mes),
  ])

  return (
    <Recorrencias
      mes={mes}
      mesExtenso={mesExtenso}
      pendentes={pendentes}
      clientes={clientes}
      podeApagar={podeApagar}
      recorrencias={recorrencias.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        descricao: r.descricao,
        categoria: r.categoria,
        contraparte: r.contraparte,
        clienteId: r.clienteId,
        clienteNome: r.cliente?.nome ?? null,
        valorCentavos: r.valorCentavos,
        diaVencimento: r.diaVencimento,
        ativo: r.ativo,
        inicio: r.inicio.toISOString(),
        fim: r.fim?.toISOString() ?? null,
        ultimoMesGerado: r.ultimoMesGerado,
        observacoes: r.observacoes,
      }))}
    />
  )
}

async function PainelRelatorios({
  ctx,
  mes,
  mesExtenso,
}: {
  ctx: Ctx
  mes: string
  mesExtenso: string
}) {
  const [fluxo, saidas, entradas, formas, devedores] = await Promise.all([
    fluxoDosMeses(ctx, 6),
    porCategoria(ctx, 'PAGAR', mes),
    porCategoria(ctx, 'RECEBER', mes),
    formasDoMes(ctx, mes),
    maioresDevedores(ctx, 8),
  ])

  return (
    <Relatorios
      fluxo={fluxo}
      saidas={saidas}
      entradas={entradas}
      formas={formas}
      devedores={devedores}
      mesExtenso={mesExtenso}
    />
  )
}

/**
 * A aba antiga, intacta.
 *
 * Faturas de serviço continuam sendo faturas de serviço: elas nascem da esteira,
 * têm número, e a conferência do gestor é a etapa 16 da linha do tempo. Fundi-las
 * com os lançamentos avulsos apagaria justamente o que as distingue.
 */
async function PainelFaturas({
  ctx,
  sessao,
  status,
  busca,
  mes,
}: {
  ctx: Ctx
  sessao: Sessao
  status?: string
  busca?: string
  mes: string
}) {
  const [faturas, caixa] = await Promise.all([
    listarFaturas(ctx, { status: status ?? 'aberto', busca }),
    caixaDoMes(ctx),
  ])

  return (
    <>
      {/* Estes dois números são SÓ de fatura de serviço, e por isso moraram
          sempre aqui e não lá em cima: a conferência do gestor é a etapa 16 da
          linha do tempo, e a taxa da maquininha só existe onde houve cartão.
          No topo, misturados com o caixa da empresa, eles pareceriam falar de
          tudo — e falam de uma coisa só. */}
      <div className={estilo.caixaTopo}>
        <div className={estilo.caixaSomas}>
          <span>
            <span className={estilo.grav}>Aguardando conferência</span>
            <strong
              className={caixa.aConferir > 0 ? `${estilo.caixaSoma} ${estilo.indAlerta}` : estilo.caixaSoma}
            >
              {caixa.aConferir}
            </strong>
            <span className={estilo.fraco}>
              {caixa.aConferir > 0 ? 'quitadas, esperando a gestão validar' : 'nada pendente'}
            </span>
          </span>
          <span>
            <span className={estilo.grav}>Taxas do mês</span>
            <strong className={estilo.caixaSoma}>{formatarBRL(caixa.taxasNoMes)}</strong>
            <span className={estilo.fraco}>o que a maquininha comeu</span>
          </span>
        </div>
      </div>

      <form method="get" className={estilo.filtros}>
        <input type="hidden" name="aba" value="faturas" />
        <input type="hidden" name="mes" value={mes} />
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={busca ?? ''}
            placeholder="Número da fatura ou cliente"
            aria-label="Buscar faturas"
          />
        </div>
        <select className={estilo.selecao} name="status" defaultValue={status ?? 'aberto'} aria-label="Situação">
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

// ---------------------------------------------------------------------------

/**
 * Os clientes, para o seletor dos formulários.
 *
 * `take` alto e sem busca porque é um `<select>`: uma carteira de mais de mil
 * clientes vai precisar de um campo com autocompletar, e aí este trecho vira
 * outra coisa. Enquanto não for esse o tamanho, carregar a lista é mais simples
 * e mais rápido do que uma ida ao servidor por tecla digitada.
 */
async function clientesParaEscolher(ctx: Ctx) {
  return comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      take: 500,
      select: { id: true, nome: true },
    }),
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
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}


/**
 * A FILA DE APROVAÇÃO — o que espera o segundo par de olhos.
 *
 * Sem recorte de mês, de propósito: uma conta lançada em julho e nunca aprovada
 * continua parada em agosto. Filtrar por mês a esconderia justamente quando ela
 * já está atrasada.
 */
async function PainelAprovar({ ctx, meuNome }: { ctx: Ctx; meuNome: string }) {
  const contas = await esperandoAprovacao(ctx)
  return <FilaDeAprovacao contas={contas} meuNome={meuNome} />
}

/**
 * A FILA DA BAIXA — aprovado, ainda não pago, e a baixa é dada AQUI.
 *
 * A primeira versão só listava e mandava a pessoa para a aba A pagar. Uma tela
 * chamada "Dar baixa" que não dá baixa é pior do que não existir: quem a abre
 * está com a mão no dinheiro naquele momento, e trocar de aba para reencontrar
 * a mesma conta numa lista maior desfaz o motivo dela existir.
 *
 * Sem recorte de mês, de propósito: conta vencida em julho que ninguém pagou
 * continua sendo trabalho de hoje.
 */
async function PainelBaixa({ ctx }: { ctx: Ctx }) {
  const contas = await prontasParaBaixa(ctx)
  return (
    <FilaDeBaixa
      // O mesmo formato da aba de contas: datas viram texto ISO aqui, no
      // servidor, porque componente cliente não recebe `Date`.
      contas={contas.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        descricao: c.descricao,
        categoria: c.categoria,
        contraparte: c.contraparte,
        clienteNome: c.cliente?.nome ?? null,
        valorCentavos: c.valorCentavos,
        valorPagoCentavos: c.valorPagoCentavos,
        vencimento: c.vencimento.toISOString(),
        pagoEm: c.pagoEm?.toISOString() ?? null,
        forma: c.forma,
        grupo: c.grupo,
        parcela: c.parcela,
        parcelas: c.parcelas,
        daRecorrencia: Boolean(c.recorrenciaId),
        observacoes: c.observacoes,
        aprovadoPorNome: c.aprovadoPorNome,
      }))}
    />
  )
}
