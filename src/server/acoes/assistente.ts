'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel, TipoMovimentoEstoque } from '@/generated/prisma/enums'
import type { StatusAgendamento } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { auditar, exigirPapel, ipDaRequisicao } from '@/server/auth/guarda'
import { enderecoDaColeta } from '@/lib/endereco'
import { diaLocal } from '@/lib/datas'
import { env } from '@/lib/env'
import { aCentavos, lerValorBR } from '@/lib/dinheiro'
import { ROTULO_ETAPA, TERMINAIS, proximosPassos } from '@/server/ordem/maquina-estados'
import { montarRoteiro, type Roteiro } from '@/server/ordem/roteiro'
import {
  agendaDosMotoristas,
  listarPecas,
  motoristasDaEmpresa,
  tecnicosDaEmpresa,
  type AgendaDeMotorista,
  type ParadaMarcada,
} from '@/server/consultas/listas'
import { avancarOrdem } from '@/server/ordem/motor'
import { movimentar } from '@/server/estoque/servico'
import { dossieDaOrdem, type Dossie } from './acompanhar'
import { fichaDoCliente, type FichaDoCliente } from '@/server/consultas/ficha-do-cliente'

/**
 * O QUE A JANELA DA O.S. PRECISA SABER — tudo, numa ida só.
 *
 * =============================================================================
 * POR QUE UMA AÇÃO NOVA, E NÃO O DOSSIÊ DA TELINHA
 * =============================================================================
 * O dossiê responde "me conta como está essa ordem" — é para o telefone tocar e
 * alguém RESPONDER. Esta janela é outra coisa: é onde se TRABALHA a ordem. Ela
 * precisa do que o dossiê de propósito não carrega — o que dá para fazer agora,
 * quem pode fazer, o que falta para o próximo passo, a agenda dos motoristas
 * para marcar o dia, e o link do portal.
 *
 * O dossiê continua sendo reaproveitado inteiro: esta ação chama ele e ACRESCENTA
 * a parte de trabalho. Duas leituras num clique é barato; duas cópias da mesma
 * consulta de setenta campos, não — a segunda envelhece sozinha no dia em que
 * alguém mexer só na primeira.
 *
 * =============================================================================
 * O QUE ESTA AÇÃO NÃO FAZ
 * =============================================================================
 * Não decide nada. Ela LÊ e devolve; quem valida transição continua sendo o
 * motor, e quem diz quem pode continua sendo a máquina de estados. Se um dia a
 * tela mostrar um botão a mais por engano, o clique é recusado do mesmo jeito.
 */

export type PassoOferecido = {
  para: EtapaOrdem
  titulo: string
  avisaCliente: boolean
  /** Este passo abre a marcação de parada antes de andar. */
  pedeParada: 'RETIRADA' | 'ENTREGA' | null
}

export type ParadaParaMarcar = {
  tipo: 'RETIRADA' | 'ENTREGA'
  /** Os passos que só andam depois que ela existir. */
  exigidaPor: EtapaOrdem[]
  dias: string[]
  motoristas: AgendaDeMotorista[]
  semMotorista: ParadaMarcada[]
  endereco: string
  contatoNome: string
  contatoTelefone: string
  observacoes: string
}

/**
 * UMA PARADA QUE JÁ EXISTE — para ver e para corrigir.
 *
 * `ParadaParaMarcar` é o formulário de CRIAR: ele só aparece no passo que exige
 * a parada, e some no instante em que ela nasce. Esta é a outra metade, que
 * faltava: a parada marcada, com quem vai, quando e onde, disponível enquanto a
 * O.S. estiver de pé.
 *
 * As duas não podem ser a mesma coisa. Criar é um passo do roteiro, com
 * consequência — a retirada agendada avança a etapa e dispara o WhatsApp do
 * cliente. Corrigir não anda com o processo: troca-se o motorista de uma
 * corrida de amanhã sem que a O.S. mude de etapa.
 */
export type ParadaMarcadaNaOrdem = {
  id: string
  tipo: 'RETIRADA' | 'ENTREGA'
  /** O rótulo humano do status — 'Sem motorista definido', 'A caminho'… */
  situacao: string
  /** 'PENDENTE' | 'ATRIBUIDO' | … — a tela usa para decidir o que oferecer. */
  status: string
  /** '19/09/2026' */
  data: string
  /** '09h00' ou '09h00 às 12h00' */
  horario: string
  /** O valor para o `<input type="date">`: 'AAAA-MM-DD'. */
  dataCampo: string
  /** O valor para o `<input type="time">`: 'HH:MM'. */
  horaCampo: string
  janelaFimCampo: string
  motoristaId: string | null
  motorista: string | null
  aceitoEm: string | null
  endereco: string
  contatoNome: string
  contatoTelefone: string
  pontoReferencia: string
  observacoes: string
  /** Concluída ou cancelada: não se remarca o que já aconteceu. */
  fechada: boolean
}

/** O recorte de orçamento que a janela desenha. Igual ao da ficha longa. */
export type OrcamentoNaJanela = {
  id: string
  numero: number
  versao: number
  status: string
  totalCentavos: number
  subtotalPecas: number
  subtotalServicos: number
  descontoCentavos: number
  acrescimoCentavos: number
  garantiaDias: number
  prazoExecucaoDias: number
  validoAte: string | null
  enviadoEm: string | null
  respondidoEm: string | null
  aprovadoPorNome: string | null
  motivoReprovacao: string | null
  itens: Array<{
    id: string
    tipo: string
    descricao: string
    quantidade: number
    valorUnitCentavos: number
    valorTotalCentavos: number
  }>
}

export type PainelDaOrdem = {
  dossie: Dossie
  roteiro: Roteiro
  etapaRotulo: string
  prioridade: 'NORMAL' | 'ALTA'
  defeitoRelatado: string
  diagnostico: string | null
  /** O cliente é que despacha o aparelho: não há motorista na ida. */
  viaCorreio: boolean
  codigoRastreio: string | null
  valorPrevioCentavos: number | null
  condicaoCombinada: string | null
  contatoNome: string | null
  passos: PassoOferecido[]
  parada: ParadaParaMarcar | null
  /** As paradas que ESTA ordem já tem — para ver e corrigir. */
  paradasMarcadas: ParadaMarcadaNaOrdem[]
  /** Para trocar o motorista de uma parada já marcada. */
  motoristasDaCasa: Array<{ id: string; nome: string }>
  /** Quem pode mexer na rota. Só ela vê os controles da parada. */
  podeMexerNaRota: boolean
  podeCancelar: boolean
  /** Só quem pode mexer em dinheiro vê e edita o combinado. */
  podeCombinar: boolean
  /** O que saiu da prateleira nesta ordem, já lançado. */
  pecasLancadas: Array<{
    id: string
    nome: string
    sku: string
    quantidade: number
    quem: string | null
    quando: string
  }>
  /** Quando alguém afirmou que este serviço não usou peça, e quem. */
  semPecaDeclaradoEm: string | null
  semPecaDeclaradoPorNome: string | null
  podeLancarPeca: boolean
  /**
   * O catálogo para escolher a peça — só carregado quando a janela vai de fato
   * oferecer o lançamento. Uma lista de trezentas peças em toda abertura de
   * ordem é trabalho de banco jogado fora.
   */
  catalogoDePecas: Array<{ id: string; sku: string; nome: string; livre: number }>
  /**
   * A ficha do cliente, para a aba "O cliente" da janela.
   *
   * Vem junto do resto e não numa segunda ida ao servidor: a janela já faz UMA
   * viagem que traz roteiro, passos, parada, peças e fatura, e trocar de aba
   * dentro dela não pode ser uma espera nova. `null` só se o cliente sumiu
   * entre a leitura da ordem e a dele, que é praticamente impossível e mesmo
   * assim não pode derrubar a janela.
   */
  cliente: FichaDoCliente | null
  /**
   * O QUE O PASSO 7 E O PASSO 8 PRECISAM PARA ACONTECER AQUI DENTRO.
   *
   * =============================================================================
   * POR QUE ISTO ENTROU NA JANELA
   * =============================================================================
   * A janela conduzia os onze passos e sabia executar dois deles: a peça (8) e o
   * pagamento (9). Os passos 7 — laudo e orçamento — continuavam só na ficha
   * longa. Quem estava na janela lia *"o técnico dá entrada, escreve o laudo, e
   * a gestão manda o orçamento"* e não tinha onde escrever nem o laudo nem o
   * orçamento: precisava fechar, abrir a ficha, rolar até o bloco.
   *
   * Era o buraco do meio do processo — justamente onde a O.S. passa mais tempo.
   *
   * Tudo isto só é carregado NA ETAPA em que serve. Fora dela, `null` e lista
   * vazia: carregar o catálogo de peças com preço em toda abertura de janela é
   * trabalho de banco para desenhar coisa nenhuma.
   */
  laudo: {
    diagnostico: string
    parecerTecnico: string
    servicoExecutado: string
    testesFinais: string
    /** A ordem já passou pela bancada? Só então execução e testes existem. */
    jaExecutou: boolean
  } | null
  /** Técnico responsável e prazo, para o passo 7 designar sem sair daqui. */
  responsavel: {
    tecnicoAtualId: string | null
    prazoPrometido: string
    tecnicos: Array<{ id: string; nome: string }>
  } | null
  /** O orçamento desta ordem, e o catálogo com preço para montá-lo. */
  orcamento: {
    versoes: OrcamentoNaJanela[]
    pecas: Array<{ id: string; sku: string; nome: string; precoVendaCentavos: number; livre: number }>
  } | null
  /**
   * O ORÇAMENTO DO PASSO 1 QUE ORIGINOU ESTA ORDEM, quando ela veio de um.
   *
   * É o elo que fecha o passo a passo: o passo 1 deixou de ser uma anotação de
   * valor dentro da ordem e virou uma peça própria, aprovada pelo cliente. A
   * janela precisa mostrar de onde a ordem veio — senão o passo 1 continua
   * invisível de dentro do lugar onde a O.S. é trabalhada.
   */
  propostaOrigem: {
    id: string
    numero: number
    totalCentavos: number
    aprovadaPorNome: string | null
    aprovadaEm: string | null
  } | null
  /** O papel de quem abriu — o editor de orçamento decide o que oferecer. */
  meuPapel: Papel
  /** Quem emite fatura e registra recebimento. */
  podeFaturar: boolean
  /**
   * O id da fatura, que o dossiê não carrega — ele mostra o NÚMERO, que é o que
   * o cliente cita. A baixa precisa do id, e passar o número no lugar dele daria
   * um "fatura não encontrada" que ninguém entenderia.
   */
  faturaId: string | null
  /** Quando ficou combinado o pagamento, em 'AAAA-MM-DD'. */
  faturaVence: string | null
  /** O endereço da casa, para o aviso de envio dizer para onde mandar. */
  enderecoDaCasa: string | null
  linkPortal: string
}

type Resposta<T = undefined> =
  | { ok: true; dados?: T }
  | { ok: false; motivo: string }

const CENTRAL: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]
/** Quem decide — e cancelar é decisão, não atendimento. */
const GESTAO: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]
/** Quem emite fatura e dá baixa. A mesma lista da tela do Financeiro. */
const FINANCEIRO: Papel[] = [...GESTAO, Papel.FINANCEIRO]
/** Quem encosta em estoque. A mesma lista da tela de Estoque. */
const PODE_LANCAR_PECA: Papel[] = [...GESTAO, Papel.TECNICO]

/** O mesmo preâmbulo das outras ações: a empresa vem da sessão, nunca do form. */
async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return {
    sessao,
    ctx: contextoDe(sessao),
    ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel },
  }
}

async function ipAtual() {
  return ipDaRequisicao(await headers(), env.TRUST_PROXY)
}

function enderecoDaCasa(t: {
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}): string | null {
  const rua = [t.logradouro, t.numero].filter(Boolean).join(', ')
  const praca = [t.cidade, t.uf].filter(Boolean).join('/')
  return [rua, t.bairro, praca, t.cep && `CEP ${t.cep}`].filter(Boolean).join(' — ') || null
}

export async function painelDaOrdem(
  ordemId: string,
): Promise<{ ok: true; painel: PainelDaOrdem } | { ok: false; motivo: string }> {
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )

  const [dossie, extra] = await Promise.all([
    dossieDaOrdem(ordemId),
    comEscopo(ctx, (tx) =>
      tx.ordem.findUnique({
        where: { id: ordemId },
        select: {
          etapa: true,
          prioridade: true,
          viaCorreio: true,
          codigoRastreio: true,
          valorPrevioCentavos: true,
          condicaoCombinada: true,
          defeitoRelatado: true,
          diagnostico: true,
          tokenPublico: true,
          cliente: {
            select: {
              id: true,
              contatoNome: true,
              telefone: true,
              logradouro: true,
              numero: true,
              complemento: true,
              bairro: true,
              cidade: true,
              uf: true,
              coletaMesmoEndereco: true,
              coletaLogradouro: true,
              coletaNumero: true,
              coletaComplemento: true,
              coletaBairro: true,
              coletaCidade: true,
              coletaUf: true,
              coletaObservacao: true,
            },
          },
          tenant: {
            select: {
              logradouro: true,
              numero: true,
              bairro: true,
              cidade: true,
              uf: true,
              cep: true,
            },
          },
          parecerTecnico: true,
          servicoExecutado: true,
          testesFinais: true,
          tecnicoId: true,
          prazoPrometido: true,
          orcamentos: {
            orderBy: { versao: 'desc' },
            include: { itens: { orderBy: { ordem: 'asc' } } },
          },
          propostaOrigem: {
            select: {
              id: true,
              numero: true,
              totalCentavos: true,
              aprovadaPorNome: true,
              respondidaEm: true,
            },
          },
          semPecaDeclaradoEm: true,
          semPecaDeclaradoPorNome: true,
          fatura: { select: { id: true, vencimento: true } },
          eventos: {
            orderBy: { sequencia: 'asc' },
            select: { etapaNova: true, criadoEm: true, autorNome: true },
          },
          /**
           * AS PARADAS INTEIRAS, e não só tipo e status.
           *
           * A consulta pedia dois campos porque a janela só precisava saber
           * "já existe parada deste tipo?". Isso bastava para decidir se
           * OFERECER o calendário, e não bastava para nada depois disso: uma
           * vez marcada, a parada sumia da janela — dia, hora, endereço e
           * MOTORISTA ficavam invisíveis para quem estava olhando a O.S.
           *
           * O efeito foi relatado do jeito mais direto possível: "preciso
           * colocar o motorista e não estou conseguindo". A parada existia,
           * estava sem motorista, e a única tela que a mostrava era a Rota —
           * que é outra aba, com outra lista, e sem a O.S. na frente.
           */
          agendamentos: {
            orderBy: { previstoPara: 'asc' },
            select: {
              id: true,
              tipo: true,
              status: true,
              previstoPara: true,
              janelaFim: true,
              aceitoEm: true,
              iniciadoEm: true,
              concluidoEm: true,
              enderecoSnapshot: true,
              contatoNome: true,
              contatoTelefone: true,
              pontoReferencia: true,
              observacoes: true,
              motoristaId: true,
              motorista: { select: { nome: true } },
            },
          },
          // Só a SAÍDA: é ela que prova que a peça deixou a prateleira. A
          // reserva é a peça separada, ainda no lugar dela.
          movimentos: {
            where: { tipo: 'SAIDA' },
            orderBy: { criadoEm: 'asc' },
            select: {
              id: true,
              quantidade: true,
              autorNome: true,
              criadoEm: true,
              peca: { select: { nome: true, sku: true } },
            },
          },
        },
      }),
    ),
  ])

  // Ordem de outra franquia não devolve linha nenhuma pelo RLS, e a resposta é
  // a mesma de "não existe" — é essa indistinção que evita confirmar o registro.
  if (!dossie.ok) return dossie
  if (!extra) return { ok: false, motivo: 'Ordem não encontrada.' }

  const passosDaMaquina = proximosPassos(extra.etapa, sessao.papel)

  /**
   * QUAL PASSO PEDE PARADA sai da própria máquina de estados, pelo `exige` da
   * transição — nunca de uma lista repetida aqui. Uma segunda lista ficaria
   * desencontrada no dia em que a esteira mudasse, e o sintoma seria o pior
   * possível: uma janela de agendamento abrindo para um passo que não precisa
   * dela, ou recusando em silêncio o passo que precisava.
   */
  const tipoQuePede = (exige: readonly string[] | undefined): 'RETIRADA' | 'ENTREGA' | null =>
    exige?.includes('PARADA_DE_RETIRADA')
      ? 'RETIRADA'
      : exige?.includes('PARADA_DE_ENTREGA')
        ? 'ENTREGA'
        : null

  const passos: PassoOferecido[] = passosDaMaquina
    /**
     * O APARELHO QUE VEM PELO CORREIO NÃO TEM MOTORISTA SAINDO PARA BUSCÁ-LO.
     *
     * A transição `EM_ROTA_RETIRADA` continua existindo na máquina — ela é o
     * caminho normal, e não é papel desta tela apagar caminho. O que ela não
     * pode é OFERECER, lado a lado, "o cliente vai despachar" e "o motorista
     * saiu para buscar": são as duas metades de uma escolha que já foi feita, e
     * clicar na errada manda ao cliente um aviso dizendo que alguém está a
     * caminho da porta dele.
     */
    .filter((p) => !(extra.viaCorreio && p.para === EtapaOrdem.EM_ROTA_RETIRADA))
    .map((p) => ({
      para: p.para,
      titulo: p.titulo,
      avisaCliente: p.avisaCliente,
      // A retirada pelo correio não tem parada para marcar: o motor dispensa a
      // exigência, e oferecer a janela do calendário aqui seria pedir motorista
      // para uma viagem que ninguém vai fazer.
      pedeParada:
        tipoQuePede(p.exige) === 'RETIRADA' && extra.viaCorreio ? null : tipoQuePede(p.exige),
    }))

  const pedindo = passos.filter((p) => p.pedeParada !== null)
  const tipoDaParada = pedindo[0]?.pedeParada ?? null

  // A mesma lista de status que o motor usa: cancelada não conta, concluída sim.
  const jaTemParada =
    tipoDaParada !== null &&
    extra.agendamentos.some((a) => a.tipo === tipoDaParada && a.status !== 'CANCELADO')

  const podeAgendar = CENTRAL.includes(sessao.papel)

  // A agenda dos motoristas é consulta cara e só serve quando a janela vai de
  // fato oferecer o calendário. Fora disso ela nem roda.
  const agenda =
    tipoDaParada && !jaTemParada && podeAgendar ? await agendaDosMotoristas(ctx) : null

  const podeLancarPeca = PODE_LANCAR_PECA.includes(sessao.papel)

  /**
   * O catálogo só é lido no passo em que ele serve.
   *
   * Fora da manutenção, oferecer "lançar peça" seria oferecer uma baixa de
   * estoque para uma ordem que ainda nem foi orçada — e carregar a lista
   * inteira de peças em toda abertura de janela é trabalho de banco para nada.
   */
  const catalogoDePecas =
    extra.etapa === EtapaOrdem.EM_MANUTENCAO && podeLancarPeca
      ? (
          await comEscopo(ctx, (tx) =>
            tx.peca.findMany({
              where: { ativo: true },
              orderBy: { nome: 'asc' },
              select: { id: true, sku: true, nome: true, saldo: true, saldoReservado: true },
            }),
          )
        ).map((p) => ({
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          livre: Number(p.saldo) - Number(p.saldoReservado),
        }))
      : []

  /**
   * O PASSO 7 INTEIRO — laudo, responsável e orçamento — carregado só nele.
   *
   * As quatro etapas que o roteiro agrupa no passo 7 são onde a O.S. passa mais
   * tempo, e eram as únicas do assistente sem nada para fazer dentro da janela.
   * Fora delas isto tudo é `null`: a lista de peças com preço e as versões de
   * orçamento não têm por que atravessar a rede numa ordem que acabou de nascer.
   */
  const NO_PASSO_7 =
    extra.etapa === EtapaOrdem.RECEBIDO_NA_EMPRESA ||
    extra.etapa === EtapaOrdem.EM_ANALISE ||
    extra.etapa === EtapaOrdem.ORCAMENTO_INTERNO ||
    extra.etapa === EtapaOrdem.ORCAMENTO_ENVIADO ||
    extra.etapa === EtapaOrdem.ORCAMENTO_REPROVADO

  const laudo = NO_PASSO_7
    ? {
        diagnostico: extra.diagnostico ?? '',
        parecerTecnico: extra.parecerTecnico ?? '',
        servicoExecutado: extra.servicoExecutado ?? '',
        testesFinais: extra.testesFinais ?? '',
        // Execução e testes só existem depois que o aparelho entra na bancada.
        jaExecutou: false,
      }
    : null

  const [tecnicosDaCasa, pecasComPreco] = await Promise.all([
    NO_PASSO_7 && podeAgendar ? tecnicosDaEmpresa(ctx) : Promise.resolve([]),
    NO_PASSO_7 ? listarPecas(ctx) : Promise.resolve([]),
  ])

  const responsavel = NO_PASSO_7
    ? {
        tecnicoAtualId: extra.tecnicoId,
        prazoPrometido: extra.prazoPrometido ? diaLocal(extra.prazoPrometido) : '',
        tecnicos: tecnicosDaCasa.map((t) => ({ id: t.id, nome: t.nome })),
      }
    : null

  const orcamento = NO_PASSO_7
    ? {
        versoes: extra.orcamentos.map((o) => ({
          id: o.id,
          numero: o.numero,
          versao: o.versao,
          status: o.status,
          totalCentavos: o.totalCentavos,
          subtotalPecas: o.subtotalPecas,
          subtotalServicos: o.subtotalServicos,
          descontoCentavos: o.descontoCentavos,
          acrescimoCentavos: o.acrescimoCentavos,
          garantiaDias: o.garantiaDias,
          prazoExecucaoDias: o.prazoExecucaoDias,
          validoAte: o.validoAte?.toISOString() ?? null,
          enviadoEm: o.enviadoEm?.toISOString() ?? null,
          respondidoEm: o.respondidoEm?.toISOString() ?? null,
          aprovadoPorNome: o.aprovadoPorNome,
          motivoReprovacao: o.motivoReprovacao,
          itens: o.itens.map((i) => ({
            id: i.id,
            tipo: i.tipo,
            descricao: i.descricao,
            // `Decimal` do Prisma não atravessa a fronteira servidor→cliente.
            quantidade: Number(i.quantidade),
            valorUnitCentavos: i.valorUnitCentavos,
            valorTotalCentavos: i.valorTotalCentavos,
          })),
        })),
        pecas: pecasComPreco.map((x) => ({
          id: x.id,
          sku: x.sku,
          nome: x.nome,
          precoVendaCentavos: x.precoVendaCentavos,
          livre: x.livre,
        })),
      }
    : null

  /**
   * QUEM MEXE NA ROTA — a mesma lista que a ação `agendar` confere.
   *
   * A janela desenha os controles a partir daqui, e a ação recusa por conta
   * própria. As duas listas serem a mesma é o que evita o botão que aparece e
   * leva "seu perfil não agenda rota" na cara de quem clicou.
   */
  const podeMexerNaRota = podeAgendar

  /**
   * A LISTA DE MOTORISTAS SÓ É BUSCADA SE ELA VAI SER USADA.
   *
   * Duas condições, e nenhuma delas é "sempre": tem de haver parada nesta ordem
   * e a pessoa tem de poder mexer na rota. Um administrador abrindo uma O.S. que
   * ainda nem foi orçada não gasta consulta com uma lista de motoristas que a
   * janela não vai desenhar.
   */
  const paradasVivas = extra.agendamentos.filter((a) => a.status !== 'CANCELADO')
  const motoristasDaCasa =
    podeMexerNaRota && paradasVivas.length > 0
      ? (await motoristasDaEmpresa(ctx)).map((m) => ({ id: m.id, nome: m.nome }))
      : []

  /**
   * A FICHA DO CLIENTE — buscada aqui, e não numa segunda ida da tela.
   *
   * A janela já faz uma viagem só que traz roteiro, passos, parada, peças e
   * fatura. Trocar de aba dentro dela é gesto de meio segundo; fazer disso uma
   * ida ao servidor daria à aba do cliente uma espera que nenhuma outra tem.
   *
   * O corte de dinheiro é passado explicitamente, com a mesma lista de papéis
   * que decide `podeFaturar`. A consulta nem lê as faturas quando ele é falso —
   * dado que não sai do banco não escapa por engano.
   */
  const cliente = await fichaDoCliente(ctx, extra.cliente.id, {
    ordemAtual: ordemId,
    podeVerDinheiro: FINANCEIRO.includes(sessao.papel),
  })

  const paradasMarcadas: ParadaMarcadaNaOrdem[] = paradasVivas.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    status: a.status,
    situacao: SITUACAO_DA_PARADA[a.status],
    data: DATA_BR.format(a.previstoPara),
    horario: a.janelaFim
      ? `${HORA_BR.format(a.previstoPara)} às ${HORA_BR.format(a.janelaFim)}`
      : HORA_BR.format(a.previstoPara),
    dataCampo: diaLocal(a.previstoPara),
    horaCampo: HORA_CAMPO.format(a.previstoPara),
    janelaFimCampo: a.janelaFim ? HORA_CAMPO.format(a.janelaFim) : '',
    motoristaId: a.motoristaId,
    motorista: a.motorista?.nome ?? null,
    aceitoEm: a.aceitoEm ? `${DATA_BR.format(a.aceitoEm)} às ${HORA_BR.format(a.aceitoEm)}` : null,
    endereco: a.enderecoSnapshot,
    contatoNome: a.contatoNome ?? '',
    contatoTelefone: a.contatoTelefone ?? '',
    pontoReferencia: a.pontoReferencia ?? '',
    observacoes: a.observacoes ?? '',
    // Concluída é passado: remarcar o dia de uma coleta que já aconteceu
    // reescreveria o comprovante que o cliente assinou.
    fechada: a.status === 'CONCLUIDO' || a.status === 'FALHOU',
  }))

  const parada: ParadaParaMarcar | null =
    agenda && tipoDaParada
      ? {
          tipo: tipoDaParada,
          exigidaPor: pedindo.map((p) => p.para),
          dias: agenda.dias,
          motoristas: agenda.motoristas,
          semMotorista: agenda.semMotorista,
          endereco: enderecoDaColeta(extra.cliente),
          contatoNome: extra.cliente.contatoNome ?? '',
          contatoTelefone: extra.cliente.telefone ?? '',
          // O recado do cadastro só descreve o OUTRO endereço. No mesmo
          // endereço ele costuma estar vazio, ou falar de outra coisa.
          observacoes: extra.cliente.coletaMesmoEndereco
            ? ''
            : (extra.cliente.coletaObservacao ?? ''),
        }
      : null

  return {
    ok: true,
    painel: {
      dossie: dossie.dossie,
      roteiro: montarRoteiro(
        extra.etapa,
        extra.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
        { viaCorreio: extra.viaCorreio },
      ),
      etapaRotulo: ROTULO_ETAPA[extra.etapa],
      prioridade: extra.prioridade === 'ALTA' ? 'ALTA' : 'NORMAL',
      defeitoRelatado: extra.defeitoRelatado,
      diagnostico: extra.diagnostico,
      viaCorreio: extra.viaCorreio,
      codigoRastreio: extra.codigoRastreio,
      valorPrevioCentavos: extra.valorPrevioCentavos,
      condicaoCombinada: extra.condicaoCombinada,
      contatoNome: extra.cliente.contatoNome,
      passos,
      parada,
      paradasMarcadas,
      motoristasDaCasa,
      podeMexerNaRota,
      podeCancelar: GESTAO.includes(sessao.papel) && !TERMINAIS.includes(extra.etapa),
      podeCombinar: CENTRAL.includes(sessao.papel),
      pecasLancadas: extra.movimentos.map((m) => ({
        id: m.id,
        nome: m.peca.nome,
        sku: m.peca.sku,
        quantidade: Number(m.quantidade),
        quem: m.autorNome,
        quando: m.criadoEm.toISOString(),
      })),
      semPecaDeclaradoEm: extra.semPecaDeclaradoEm?.toISOString() ?? null,
      semPecaDeclaradoPorNome: extra.semPecaDeclaradoPorNome,
      podeLancarPeca,
      catalogoDePecas,
      cliente,
      propostaOrigem: extra.propostaOrigem
        ? {
            id: extra.propostaOrigem.id,
            numero: extra.propostaOrigem.numero,
            totalCentavos: extra.propostaOrigem.totalCentavos,
            aprovadaPorNome: extra.propostaOrigem.aprovadaPorNome,
            aprovadaEm: extra.propostaOrigem.respondidaEm
              ? DATA_BR.format(extra.propostaOrigem.respondidaEm)
              : null,
          }
        : null,
      laudo,
      responsavel,
      orcamento,
      meuPapel: sessao.papel,
      podeFaturar: FINANCEIRO.includes(sessao.papel),
      faturaId: extra.fatura?.id ?? null,
      faturaVence: extra.fatura?.vencimento ? diaLocal(extra.fatura.vencimento) : null,
      enderecoDaCasa: enderecoDaCasa(extra.tenant),
      linkPortal: `${env.APP_URL}/os/${extra.tokenPublico}`,
    },
  }
}

// ---------------------------------------------------------------------------
// O passo 1: o valor combinado antes de existir orçamento
// ---------------------------------------------------------------------------

const schemaCombinado = z.object({
  ordemId: z.string().min(1),
  /** Vazio significa "apagar o que estava lá" — e apagar é correção legítima. */
  valor: z.string().trim().max(20),
  condicao: z.string().trim().max(200),
})

/**
 * Grava o que foi combinado no telefone.
 *
 * Fica na trilha de auditoria com o antes e o depois. Mudar em silêncio o valor
 * que o cliente ouviu é indistinguível de reescrever a conversa — e é
 * exatamente essa a discussão que aparece na hora de cobrar.
 */
export async function salvarCombinado(_anterior: unknown, form: FormData): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!CENTRAL.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não mexe no valor combinado.' }
  }
  const ctx = contextoDe(sessao)

  const d = schemaCombinado.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // `lerValorBR` é quem sabe que "1.200" é mil e duzentos aqui e um vírgula dois
  // para o `Number`. Adivinhar isso na mão multiplica a conta por mil.
  const reais = v.valor === '' ? null : lerValorBR(v.valor)
  if (v.valor !== '' && (reais === null || reais < 0)) {
    return { ok: false, motivo: 'Valor inválido. Escreva como 250,00.' }
  }
  const centavos = reais === null ? null : aCentavos(reais)

  const antes = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: v.ordemId },
      select: { valorPrevioCentavos: true, condicaoCombinada: true },
    }),
  )
  if (!antes) return { ok: false, motivo: 'Ordem não encontrada.' }

  await comEscopo(ctx, (tx) =>
    tx.ordem.update({
      where: { id: v.ordemId },
      data: {
        valorPrevioCentavos: centavos,
        condicaoCombinada: v.condicao || null,
      },
    }),
  )

  await auditar(ctx, sessao, {
    acao: 'ordem.combinado',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    detalhes: {
      de: { valor: antes.valorPrevioCentavos, condicao: antes.condicaoCombinada },
      para: { valor: centavos, condicao: v.condicao || null },
    },
  })

  revalidatePath('/painel/ordens')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// O passo 3: quem leva o aparelho até a bancada
// ---------------------------------------------------------------------------

const schemaEnvio = z.object({
  ordemId: z.string().min(1),
  rastreio: z.string().trim().max(60),
})

/**
 * "O CLIENTE É QUE ENVIA" — a outra metade do passo 3.
 *
 * =============================================================================
 * POR QUE ISTO PRECISOU EXISTIR
 * =============================================================================
 * Os 10% que chegam de transportadora não tinham caminho honesto no sistema. A
 * única saída de `ORDEM_RETIRADA_GERADA` é `RETIRADA_AGENDADA`, que exige
 * parada marcada — e parada é dia, hora e MOTORISTA. Para uma caixa que o
 * cliente vai postar não existe motorista nenhum, então ou a ordem ficava presa
 * ali para sempre, ou alguém marcava uma parada de mentira só para destravar,
 * enfiando na rota de um motorista uma viagem que ele nunca faria.
 *
 * Agora a escolha é explícita e fica gravada: `viaCorreio` marca a ordem, o
 * motor dispensa a parada só para a IDA, e o aviso que sai no WhatsApp é outro
 * texto — com o endereço da casa e o pedido do código de rastreio, em vez de
 * "quem vai buscar".
 *
 * A VOLTA continua exigindo parada. Na entrega o aparelho é nosso e sai daqui:
 * alguém dirige.
 */
export async function marcarComoEnvioDoCliente(
  _anterior: unknown,
  form: FormData,
): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!CENTRAL.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não define como o aparelho vem.' }
  }

  const d = schemaEnvio.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const ordem = await comEscopo(a.ctx, (tx) =>
    tx.ordem.findUnique({ where: { id: v.ordemId }, select: { etapa: true } }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }
  if (ordem.etapa !== EtapaOrdem.ORDEM_RETIRADA_GERADA) {
    return {
      ok: false,
      motivo: `Esta ordem já passou do ponto de escolher como o aparelho vem — ela está em "${ROTULO_ETAPA[ordem.etapa]}".`,
    }
  }

  /**
   * A MARCA VEM ANTES DA TRANSIÇÃO, e a ordem importa.
   *
   * É `viaCorreio` que faz o motor dispensar a parada e o worker escolher o
   * outro texto do WhatsApp. Gravada depois, a transição seria recusada por
   * falta de parada — e, se passasse, o aviso já teria saído prometendo um
   * motorista que não existe.
   */
  await comEscopo(a.ctx, (tx) =>
    tx.ordem.update({
      where: { id: v.ordemId },
      data: { viaCorreio: true, codigoRastreio: v.rastreio || null },
    }),
  )

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId: v.ordemId,
    para: EtapaOrdem.RETIRADA_AGENDADA,
    observacao: v.rastreio
      ? `O cliente envia o aparelho. Rastreio ${v.rastreio}.`
      : 'O cliente envia o aparelho.',
    ip: await ipAtual(),
  })

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.envio_do_cliente',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    negado: !r.ok,
    detalhes: r.ok ? { rastreio: v.rastreio || null } : { motivo: r.motivo },
  })

  if (!r.ok) {
    // A transição foi recusada: desfazemos a marca para a ordem não ficar
    // dizendo "vem pelo correio" enquanto continua parada esperando motorista.
    await comEscopo(a.ctx, (tx) =>
      tx.ordem.update({ where: { id: v.ordemId }, data: { viaCorreio: false } }),
    )
    return { ok: false, motivo: r.motivo }
  }

  revalidatePath('/painel/ordens')
  revalidatePath('/painel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// O passo 8: o que saiu da prateleira neste serviço
// ---------------------------------------------------------------------------

const schemaPeca = z.object({
  ordemId: z.string().min(1),
  pecaId: z.string().min(1, 'Escolha a peça.'),
  quantidade: z.coerce.number().positive('A quantidade precisa ser maior que zero.'),
  observacao: z.string().trim().max(200).optional(),
})

/**
 * LANÇA A PEÇA USADA, AMARRADA À ORDEM.
 *
 * =============================================================================
 * POR QUE ELA NÃO É A MESMA COISA QUE A RESERVA DO ORÇAMENTO
 * =============================================================================
 * A peça que o cliente aprovou no orçamento já é reservada na aprovação e
 * baixada quando a manutenção começa. Isso cobre o caso planejado — e o caso
 * planejado não é o que faz o estoque derivar.
 *
 * O que derruba a contagem é a peça que ninguém previu: o técnico abre o
 * aparelho, descobre que o fusível também foi, pega um da gaveta e fecha. Não
 * havia item de orçamento para ela, então não havia reserva, então não havia
 * baixa — e o sistema segue dizendo que o fusível está na prateleira até
 * alguém procurar e não achar.
 *
 * Este lançamento é para essa peça. Ele gera SAÍDA amarrada à ordem, com quem,
 * quanto e quando, e aparece na ficha do equipamento e no prontuário.
 */
export async function lancarPecaDaOrdem(_anterior: unknown, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR_PECA.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não lança peça do estoque.' }
  }

  const d = schemaPeca.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const ordem = await tx.ordem.findUnique({ where: { id: v.ordemId }, select: { id: true } })
    if (!ordem) return { ok: false as const, motivo: 'Ordem não encontrada.' }

    const m = await movimentar(tx, exigirEmpresa(a.ctx), a.ator, {
      pecaId: v.pecaId,
      tipo: TipoMovimentoEstoque.SAIDA,
      quantidade: v.quantidade,
      ordemId: v.ordemId,
      motivo: v.observacao || 'Peça usada no serviço',
    })
    if (!m.ok) return { ok: false as const, motivo: m.motivo }

    /**
     * LANÇAR PEÇA APAGA O "NÃO USEI PEÇA NENHUMA".
     *
     * Sem isto a ordem ficaria com as duas respostas ao mesmo tempo: uma
     * declaração dizendo que não saiu nada e um movimento provando que saiu.
     * Quem lesse o prontuário depois não saberia em qual acreditar — e a
     * declaração é justamente o registro que existe para ser acreditado.
     */
    await tx.ordem.update({
      where: { id: v.ordemId },
      data: { semPecaDeclaradoEm: null, semPecaDeclaradoPorNome: null },
    })
    return { ok: true as const }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.peca_lancada',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    detalhes: { pecaId: v.pecaId, quantidade: v.quantidade },
  })

  revalidatePath('/painel/ordens')
  revalidatePath('/painel/estoque')
  return { ok: true }
}

/**
 * "NÃO USEI PEÇA NENHUMA" — a outra resposta da mesma pergunta.
 *
 * Ela precisa existir porque a ausência de movimento não diz nada: "não usei" e
 * "esqueci de lançar" são o mesmo silêncio no banco. Com a declaração, passam a
 * ser coisas diferentes — uma tem nome e hora, a outra continua sendo silêncio,
 * e o motor recusa o fechamento enquanto for silêncio.
 */
export async function declararSemPeca(ordemId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR_PECA.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não declara o consumo de peça.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const saiu = await tx.movimentoEstoque.count({
      where: { ordemId, tipo: TipoMovimentoEstoque.SAIDA },
    })
    if (saiu > 0) {
      return {
        ok: false as const,
        motivo:
          'Esta ordem já tem peça baixada do estoque. Se a baixa está errada, corrija pelo Estoque — declarar "sem peça" por cima deixaria a ordem com duas respostas opostas.',
      }
    }
    const feito = await tx.ordem.updateMany({
      where: { id: ordemId },
      // O nome fica congelado: se a pessoa for desligada depois, o prontuário
      // continua dizendo quem afirmou isto, e quando.
      data: { semPecaDeclaradoEm: new Date(), semPecaDeclaradoPorNome: a.sessao.nome },
    })
    if (feito.count === 0) return { ok: false as const, motivo: 'Ordem não encontrada.' }
    return { ok: true as const }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.sem_peca',
    entidade: 'ordem',
    entidadeId: ordemId,
  })

  revalidatePath('/painel/ordens')
  return { ok: true }
}

/**
 * Os rótulos do status de uma parada, em palavra de gente.
 *
 * 'PENDENTE' no banco quer dizer "ninguém foi designado" — e é a única linha
 * desta tabela que precisa de tradução de verdade: mostrar "pendente" numa
 * parada sem motorista faria parecer que ela está esperando o motorista chegar,
 * quando o que ela espera é alguém escolher quem vai.
 */
const SITUACAO_DA_PARADA: Record<StatusAgendamento, string> = {
  PENDENTE: 'Sem motorista definido',
  ATRIBUIDO: 'Motorista designado',
  EM_ROTA: 'A caminho',
  CONCLUIDO: 'Concluída',
  FALHOU: 'Não deu certo',
  CANCELADO: 'Cancelada',
}

const FUSO_DA_CASA = 'America/Sao_Paulo'

const DATA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_CASA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const HORA_BR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_CASA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * A hora no formato que o `<input type="time">` aceita: 'HH:MM' com dois
 * pontos. O `HORA_BR` do pt-BR devolve 'HH:MM' também, mas depender do formato
 * de um locale para preencher um campo de formulário é a espécie de detalhe que
 * quebra sozinho quando o Node troca de base de dados de idioma. `en-GB` é
 * 24 horas por definição.
 */
const HORA_CAMPO = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO_DA_CASA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
