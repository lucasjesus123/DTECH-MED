import type { NoDoRoteiro } from './roteiro'

/**
 * AS TRÊS FASES — o andar de cima do roteiro.
 *
 * =============================================================================
 * POR QUE UMA TERCEIRA CONTAGEM, DEPOIS DE 18 E DE 11
 * =============================================================================
 * O pedido do dono, depois de olhar a janela pronta:
 *
 *     "Não quero mais 300 mil telas de O.S. tudo bagunçado, quero algo
 *      simplificado que até uma criança de 6 anos possa executar."
 *
 * Onze bolinhas numa fileira não são bagunça por serem erradas — são bagunça
 * por serem ONZE. Quem abre a janela precisa responder uma pergunta antes de
 * todas as outras: **o aparelho está vindo, está na bancada, ou está voltando?**
 * Essa pergunta tem três respostas, não onze, e é ela que a tela precisa
 * responder de longe, sem ler nada.
 *
 * Então a contagem vira uma escada de três degraus:
 *
 *     18 etapas  → são as TRAVAS. Quem valida é a máquina de estados.
 *     11 passos  → são o DIA. É como o dono conta o trabalho em voz alta.
 *      3 fases   → é a TELA. É o que a pessoa vê antes de ler qualquer coisa.
 *
 * Nenhuma das três substitui as outras, e nenhuma delas autoriza nada: agrupar
 * é desenho. Ninguém pula trava porque seis quadradinhos viraram um botão.
 *
 * =============================================================================
 * A TRAVA DA FASE É DE OLHO, NÃO DE MÃO
 * =============================================================================
 * O pedido original dizia que a fase 2 só pode começar depois da fase 1 estar
 * concluída. Isso JÁ É VERDADE, e não por causa desta tela: a máquina de
 * estados não aceita `RECEBIDO_NA_EMPRESA` sem `COLETADO` antes. A trava de
 * verdade mora lá, e sempre morou.
 *
 * O que esta camada faz é diferente e menor: ela diz de que cor está cada fase.
 * Uma fase adiante **pode ser aberta e lida** — o técnico que quer conferir o
 * que vem depois não é um invasor, e fechar a leitura não protegeria nada que a
 * máquina já não proteja. O que ele não encontra ali é botão que ande a
 * esteira, porque a esteira não anda fora de ordem.
 *
 * =============================================================================
 * A COR SOZINHA NÃO CONTA A HISTÓRIA
 * =============================================================================
 * Verde, laranja e vermelho são a leitura de longe, e elas falham exatamente
 * para quem mais precisa: cerca de um homem em cada doze não separa verde de
 * vermelho. Por isso cada fase carrega também um `selo` (um sinal desenhado) e
 * um `situacao` escrito. A cor é o atalho, não a informação.
 *
 * Módulo puro: sem banco, sem React. É testado em `fases.test.ts`.
 */

export type EstadoDaFase =
  /** Tudo o que era desta fase já aconteceu. Verde. */
  | 'concluida'
  /** A ordem está dentro dela agora. Laranja. */
  | 'agora'
  /** Ainda não chegou aqui. Vermelho. */
  | 'adiante'
  /** A ordem saiu do caminho dentro desta fase. Cinza de alerta. */
  | 'parada'

export type DefinicaoDeFase = {
  /** 1, 2 ou 3. */
  n: number
  /** O nome curto, em português de quem trabalha. É o que fica grande no botão. */
  nome: string
  /** O nome do processo, para quem procura pelo termo formal. Fica pequeno. */
  formal: string
  /** Quem põe a mão nesta fase. */
  quem: string
  /** Uma frase dizendo o que a fase inteira resolve. */
  oQue: string
  /** Os passos do roteiro que moram nesta fase. */
  passos: number[]
  /** A redação de quando é o cliente que despacha o aparelho. */
  envio?: { nome: string; quem: string; oQue: string }
}

/**
 * AS TRÊS FASES, e por que o corte é onde é.
 *
 * O corte não foi escolhido por caber bonito: ele segue quem tem o aparelho na
 * mão. Na fase 1 o equipamento está com o cliente ou na rua. Na 2 está na
 * bancada. Na 3 já está consertado e o que falta é dinheiro e estrada. Trocar
 * de fase é o aparelho trocar de lugar no mundo — é por isso que a pessoa
 * consegue dizer em que fase a ordem está sem abrir nada.
 */
export const FASES: readonly DefinicaoDeFase[] = [
  {
    n: 1,
    nome: 'Buscar o aparelho',
    formal: 'Coleta e logística inicial',
    quem: 'central e motorista',
    oQue:
      'O combinado com o cliente, a O.S. aberta, e o aparelho saindo de lá — com dia, motorista, foto e assinatura. Termina quando o equipamento está com a gente.',
    passos: [1, 2, 3, 4, 5, 6],
    envio: {
      nome: 'O aparelho chegar',
      quem: 'central e cliente',
      oQue:
        'O combinado com o cliente, a O.S. aberta, e o endereço para onde despachar. Termina quando o equipamento chega na assistência.',
    },
  },
  {
    n: 2,
    nome: 'Consertar',
    formal: 'Execução técnica e manutenção',
    quem: 'técnico e gestão',
    oQue:
      'Entrada com fotos, laudo, orçamento aprovado pelo cliente, conserto feito e peça baixada do estoque. Termina quando a gestão confere o serviço.',
    passos: [7, 8],
  },
  {
    n: 3,
    nome: 'Devolver e receber',
    formal: 'Logística de devolução',
    quem: 'financeiro e motorista',
    oQue:
      'A fatura montada e quitada, a entrega marcada, e o aparelho de volta na mão do cliente com assinatura. Termina com a baixa e o começo da garantia.',
    passos: [9, 10, 11],
  },
]

export const TOTAL_DE_FASES = FASES.length

/** Em que fase um passo do roteiro mora. */
export function faseDoPasso(passo: number): number {
  return FASES.find((f) => f.passos.includes(passo))?.n ?? 0
}

export type FaseMontada = {
  n: number
  nome: string
  formal: string
  quem: string
  oQue: string
  estado: EstadoDaFase
  /**
   * O SINAL DESENHADO, para quem não lê a cor.
   *
   * Não é enfeite: é a metade da informação que a cor não entrega. Quem não
   * separa verde de vermelho lê daqui, e lê a mesma coisa que todo mundo.
   */
  selo: '✓' | '●' | '○' | '!'
  /** A situação por extenso. Vai no botão, ao lado do selo. */
  situacao: string
  /** Os números dos passos desta fase — para a régua pequena de dentro. */
  passos: number[]
  /** Quantos passos desta fase já foram cumpridos. */
  feitos: number
  /** Quantos passos ela tem no total. */
  total: number
  /** De 0 a 100, para a barrinha de dentro do botão. */
  porcento: number
  /** Quando a ordem entrou nesta fase, se entrou. */
  quando: Date | null
  /**
   * O que falta para esta fase acabar, em uma frase — só na fase viva.
   * É o texto que responde "e agora, o que eu faço?" sem abrir nada.
   */
  falta: string | null
}

const SITUACAO: Record<EstadoDaFase, { selo: FaseMontada['selo']; texto: string }> = {
  concluida: { selo: '✓', texto: 'Pronta' },
  agora: { selo: '●', texto: 'Acontecendo agora' },
  adiante: { selo: '○', texto: 'Ainda não começou' },
  parada: { selo: '!', texto: 'Parou aqui' },
}

/**
 * Monta as três fases a partir dos passos já montados do roteiro.
 *
 * Recebe `passos` prontos de propósito: quem sabe dizer se um passo foi
 * cumprido é `montarRoteiro`, que tem a linha do tempo na mão. Refazer essa
 * conta aqui seria abrir espaço para as duas divergirem — a régua dizendo
 * "cumprido" e o botão da fase dizendo "ainda não", na mesma tela.
 */
export function montarFases(
  passos: readonly NoDoRoteiro[],
  opcoes?: { desvio?: boolean; terminou?: boolean; viaCorreio?: boolean },
): FaseMontada[] {
  const desvio = opcoes?.desvio ?? false
  const terminou = opcoes?.terminou ?? false
  const viaCorreio = opcoes?.viaCorreio ?? false

  return FASES.map((f) => {
    const meus = f.passos
      .map((n) => passos.find((p) => p.n === n))
      .filter((p): p is NoDoRoteiro => p !== undefined)

    const cumpridos = meus.filter((p) => p.estado === 'cumprido')
    const temAgora = meus.some((p) => p.estado === 'agora')

    /**
     * A ORDEM FINALIZADA PINTA A FASE 3 DE VERDE.
     *
     * Sem isto, a última fase ficaria laranja para sempre: o passo 11 é o
     * último e continua marcado como "agora" mesmo depois de a ordem acabar.
     * Uma O.S. entregue, paga e baixada mostrando "acontecendo agora" faria a
     * central ligar para o cliente perguntando de um serviço que já terminou.
     */
    const estado: EstadoDaFase = terminou
      ? 'concluida'
      : desvio && temAgora
        ? 'parada'
        : temAgora
          ? 'agora'
          : cumpridos.length === meus.length
            ? 'concluida'
            : 'adiante'

    const feitos = estado === 'concluida' ? meus.length : cumpridos.length
    const sit = SITUACAO[estado]
    const redacao = viaCorreio && f.envio ? f.envio : f

    // A entrada na fase é a entrada no PRIMEIRO passo dela pelo qual a ordem
    // passou de verdade — e não a data do passo 1, que não tem etapa e por isso
    // nunca tem data.
    const entrada = meus.find((p) => p.quando !== null)?.quando ?? null

    return {
      n: f.n,
      nome: redacao.nome,
      formal: f.formal,
      quem: redacao.quem,
      oQue: redacao.oQue,
      estado,
      selo: sit.selo,
      situacao: sit.texto,
      passos: f.passos,
      feitos,
      total: meus.length,
      porcento: meus.length === 0 ? 0 : Math.round((feitos / meus.length) * 100),
      quando: entrada,
      falta:
        estado === 'agora'
          ? (meus.find((p) => p.estado === 'agora')?.oQue ?? null)
          : null,
    }
  })
}

/**
 * A fase em que a ordem está — a que fica aberta quando a janela abre.
 *
 * Numa ordem que saiu do caminho é a fase onde ela parou; numa finalizada é a
 * última. Nunca devolve zero: a janela precisa sempre ter uma fase para abrir.
 */
export function faseViva(fases: readonly FaseMontada[]): number {
  return (
    fases.find((f) => f.estado === 'agora' || f.estado === 'parada')?.n ??
    fases.filter((f) => f.estado === 'concluida').at(-1)?.n ??
    1
  )
}
