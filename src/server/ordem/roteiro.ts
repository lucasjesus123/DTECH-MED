import { EtapaOrdem as E } from '@/generated/prisma/enums'
import { ROTULO_ETAPA } from './maquina-estados'

/**
 * O ROTEIRO — as 18 etapas contadas em 11 passos.
 *
 * =============================================================================
 * POR QUE EXISTEM DUAS CONTAGENS, E POR QUE ISSO NÃO É DUPLICAÇÃO
 * =============================================================================
 * A máquina de estados tem 18 etapas porque cada uma delas é uma TRAVA: um
 * ponto onde o sistema confere assinatura, foto, orçamento ou pagamento antes
 * de deixar a ordem andar. Tirar qualquer uma é abrir um buraco.
 *
 * Só que ninguém trabalha contando 18. O dono do sistema descreveu o dia dele
 * em onze passos, e são esses onze que ele diz em voz alta ao telefone:
 *
 *     "combinei o valor, abri a O.S., marquei a retirada, escolhi o dia e o
 *      motorista, ele foi buscar, trouxe assinado, o técnico laudou, entrou em
 *      manutenção, fechou o pagamento, marquei a entrega, entregou."
 *
 * Este arquivo é a tradução entre as duas contagens. As 18 continuam mandando —
 * quem valida é `maquina-estados.ts`, e ninguém pula trava porque a tela agrupa.
 * Os 11 são o que a JANELA mostra, e é neles que a pessoa se localiza.
 *
 * =============================================================================
 * O PASSO 1 NÃO TEM ETAPA, E ISSO É PROPOSITAL
 * =============================================================================
 * "Orçamento" acontece ANTES de existir ordem: é o valor combinado no telefone,
 * antes de alguém digitar qualquer coisa. Não há etapa para ele porque não há
 * ordem ainda — quando a ordem existe, esse passo já aconteceu.
 *
 * Ele aparece no roteiro mesmo assim, sempre cumprido, porque tirá-lo faria a
 * régua começar no passo 2 e discordar da contagem de quem usa. O valor
 * combinado fica gravado na ordem (`valorPrevioCentavos`) e a janela o mostra
 * ali, no primeiro passo — é onde a pessoa vai procurar.
 *
 * =============================================================================
 * QUANDO O CLIENTE ENVIA PELO CORREIO, QUATRO PASSOS MUDAM DE NOME
 * =============================================================================
 * A esteira é a mesma e as travas são as mesmas; o que muda é quem dirige. Um
 * roteiro que insiste em dizer "motorista a caminho" para um aparelho que veio
 * de transportadora está mentindo em quatro telas seguidas — inclusive na do
 * cliente. Por isso cada passo pode ter uma segunda redação, usada quando a
 * ordem é `viaCorreio`.
 *
 * Módulo puro: sem banco, sem React. É testado em `roteiro.test.ts`.
 */

export type PassoDoRoteiro = {
  /** 1 a 11 — o número que a pessoa conta no dedo. */
  n: number
  nome: string
  /** Quem põe a mão neste passo. Vira legenda. */
  quem: string
  /** Uma frase dizendo o que acontece aqui. */
  oQue: string
  /** As etapas da máquina que vivem dentro deste passo. */
  etapas: E[]
  /** A redação alternativa de quando o cliente é que envia o aparelho. */
  envio?: { nome: string; oQue: string; quem: string }
}

/**
 * OS ONZE PASSOS, na ordem em que o dia acontece.
 *
 * A soma das `etapas` de todos eles é exatamente o caminho normal da máquina —
 * as 18. Nenhuma etapa fica de fora e nenhuma aparece em dois passos; é isso
 * que garante que a régua nunca fique sem lugar para a ordem estar. O teste
 * confere as duas coisas.
 */
export const ROTEIRO: readonly PassoDoRoteiro[] = [
  {
    n: 1,
    nome: 'Orçamento',
    quem: 'central',
    oQue: 'O que foi combinado com o cliente antes de abrir a O.S. — a retirada, a avaliação, o que estiver acertado.',
    etapas: [],
  },
  {
    n: 2,
    nome: 'Abertura da O.S.',
    quem: 'central',
    oQue: 'O cliente, o aparelho e o defeito entram no sistema. Sai a ordem de retirada em PDF.',
    etapas: [E.SOLICITACAO_RECEBIDA],
  },
  {
    n: 3,
    nome: 'Retirada ou envio',
    quem: 'central',
    oQue: 'Quem leva o aparelho até a bancada: um motorista nosso vai buscar, ou o cliente despacha.',
    etapas: [E.ORDEM_RETIRADA_GERADA],
  },
  {
    n: 4,
    nome: 'Dia e motorista',
    quem: 'central',
    oQue: 'A parada marcada no calendário, com motorista escolhido. Sem os dois a retirada não anda.',
    etapas: [E.RETIRADA_AGENDADA],
    envio: {
      nome: 'Aguardando chegar',
      quem: 'cliente',
      oQue: 'O cliente foi avisado de para onde mandar. A ordem espera o aparelho chegar na assistência.',
    },
  },
  {
    n: 5,
    nome: 'Motorista a caminho',
    quem: 'motorista',
    oQue: 'A parada apareceu no aplicativo dele, com o endereço e o cliente. Ele saiu para buscar.',
    etapas: [E.EM_ROTA_RETIRADA],
    envio: {
      nome: 'A caminho',
      quem: 'transportadora',
      oQue: 'O aparelho foi despachado pelo cliente e está a caminho da assistência.',
    },
  },
  {
    n: 6,
    nome: 'Retirado e assinado',
    quem: 'motorista',
    oQue: 'Foto do aparelho no local e assinatura do cliente na tela do celular. É a prova de que ele saiu de lá.',
    etapas: [E.COLETADO],
    envio: {
      nome: 'Despachado',
      quem: 'cliente',
      oQue: 'O aparelho saiu do cliente pelo correio ou transportadora, com o código de rastreio registrado.',
    },
  },
  {
    n: 7,
    nome: 'Recebimento e laudo',
    quem: 'técnico e gestão',
    oQue: 'O técnico dá entrada com no mínimo seis fotos, escreve o laudo, e a gestão manda o orçamento ao cliente — que aprova pelo link.',
    etapas: [
      E.RECEBIDO_NA_EMPRESA,
      E.EM_ANALISE,
      E.ORCAMENTO_INTERNO,
      E.ORCAMENTO_ENVIADO,
      E.ORCAMENTO_APROVADO,
    ],
  },
  {
    n: 8,
    nome: 'Manutenção',
    quem: 'técnico',
    oQue: 'O conserto acontece. Peça usada é lançada do estoque, e a gestão confere antes de liberar.',
    etapas: [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA, E.APROVACAO_GESTAO],
  },
  {
    n: 9,
    nome: 'Pagamento',
    quem: 'financeiro',
    oQue: 'A fatura é montada e recebida — inteira ou em partes. O aparelho só é liberado com ela quitada.',
    etapas: [E.FATURAMENTO, E.FATURADO],
  },
  {
    n: 10,
    nome: 'Entrega a caminho',
    quem: 'motorista',
    oQue: 'A parada de entrega marcada, e o motorista na rua com o aparelho consertado.',
    etapas: [E.EM_ROTA_ENTREGA],
  },
  {
    n: 11,
    nome: 'Entregue',
    quem: 'motorista e gestão',
    oQue: 'Foto na entrega, assinatura de quem recebeu, e a baixa final da gestão. A garantia começa a contar daqui.',
    etapas: [E.ENTREGUE, E.FINALIZADO],
  },
]

export const TOTAL_DE_PASSOS = ROTEIRO.length

/** As saídas do caminho. Não são posição na régua — são o fim dela. */
const DESVIOS: readonly E[] = [E.CANCELADO, E.DEVOLVIDO_SEM_REPARO, E.ORCAMENTO_REPROVADO]

/** Em que passo dos onze uma etapa mora. Zero quando ela é desvio. */
export function passoDaEtapa(etapa: E): number {
  return ROTEIRO.find((p) => p.etapas.includes(etapa))?.n ?? 0
}

export type NoDoRoteiro = {
  n: number
  nome: string
  quem: string
  oQue: string
  estado: 'cumprido' | 'agora' | 'adiante'
  /** Quando a ordem entrou neste passo, se entrou. */
  quando: Date | null
  /** Quem registrou a entrada, quando ficou gravado. */
  autor: string | null
  /** O rótulo da etapa exata dentro do passo — "Orçamento enviado", e não só "Recebimento e laudo". */
  detalhe: string | null
}

export type Roteiro = {
  passos: NoDoRoteiro[]
  /** O passo em que a ordem está agora. Zero quando ela saiu do caminho. */
  atual: number
  total: number
  /** De 0 a 100, para a régua preenchida. */
  porcento: number
  /** O nome do passo atual, ou do desvio. */
  agora: string
  /** Quando a ordem sai do caminho, a régua PARA e diz o motivo. */
  desvio: { rotulo: string; quando: Date | null } | null
}

/**
 * Monta o roteiro de uma ordem.
 *
 * `eventos` é a linha do tempo real — dela sai QUANDO cada passo aconteceu e
 * QUEM o fez. Um passo marcado como cumprido sem evento por trás seria a régua
 * contando uma história que o prontuário não confirma.
 */
export function montarRoteiro(
  etapaAtual: E,
  eventos: ReadonlyArray<{ para: E; criadoEm: Date; autorNome: string | null }>,
  opcoes?: { viaCorreio?: boolean },
): Roteiro {
  const viaCorreio = opcoes?.viaCorreio ?? false

  // O PRIMEIRO evento de cada etapa. Uma ordem que volta para trás — o
  // orçamento devolvido ao técnico é o caso de toda semana — passa duas vezes
  // pela mesma etapa; na régua o que interessa é quando ela chegou ali.
  const marcos = new Map<E, { quando: Date; quem: string | null }>()
  for (const ev of [...eventos].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())) {
    if (!marcos.has(ev.para)) marcos.set(ev.para, { quando: ev.criadoEm, quem: ev.autorNome })
  }

  const saiuDoCaminho = DESVIOS.includes(etapaAtual)

  /**
   * Onde a régua para.
   *
   * No caminho normal é o passo da etapa atual. Num desvio é o último passo
   * pelo qual a ordem realmente passou — foi até ali que o aparelho chegou
   * antes de sair da linha.
   */
  const atual = saiuDoCaminho
    ? ROTEIRO.reduce((ultimo, p) => (p.etapas.some((e) => marcos.has(e)) ? p.n : ultimo), 1)
    : passoDaEtapa(etapaAtual)

  const passos: NoDoRoteiro[] = ROTEIRO.map((p) => {
    // A primeira etapa DO PASSO pela qual a ordem passou dá a data; a última
    // dá o detalhe. São perguntas diferentes: "desde quando está no passo 7" e
    // "em que ponto do passo 7 está".
    const visitadas = p.etapas.filter((e) => marcos.has(e))
    const entrada = visitadas.length ? marcos.get(visitadas[0]!)! : null
    const dentroDoPasso = p.etapas.includes(etapaAtual) && !saiuDoCaminho
    const redacao = viaCorreio && p.envio ? p.envio : p

    return {
      n: p.n,
      nome: redacao.nome,
      quem: redacao.quem,
      oQue: redacao.oQue,
      // O passo 1 não tem etapa: ele já aconteceu quando a ordem existe.
      estado: p.n < atual || p.etapas.length === 0 ? 'cumprido' : p.n === atual ? 'agora' : 'adiante',
      quando: entrada?.quando ?? null,
      autor: entrada?.quem ?? null,
      // Só o passo em que a ordem está mostra a etapa exata: nos cumpridos a
      // etapa já passou, e nos adiante ela ainda não existe.
      detalhe: dentroDoPasso ? ROTULO_ETAPA[etapaAtual] : null,
    }
  })

  return {
    passos,
    atual: saiuDoCaminho ? 0 : atual,
    total: TOTAL_DE_PASSOS,
    // A régua enche até o CENTRO do passo atual, não até o fim dele: o passo em
    // que se está ainda não terminou.
    porcento: Math.max(0, Math.min(100, ((atual - 1) / (TOTAL_DE_PASSOS - 1)) * 100)),
    agora: ROTULO_ETAPA[etapaAtual],
    desvio: saiuDoCaminho
      ? { rotulo: ROTULO_ETAPA[etapaAtual], quando: marcos.get(etapaAtual)?.quando ?? null }
      : null,
  }
}
