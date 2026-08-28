import { EtapaOrdem } from '@/generated/prisma/enums'

/**
 * ONDE O APARELHO ESTÁ, FISICAMENTE.
 *
 * =============================================================================
 * A PERGUNTA QUE ESTE ARQUIVO RESPONDE
 * =============================================================================
 * O cliente liga e pergunta uma coisa só: **"cadê meu aparelho?"**
 *
 * A tela sabia responder outra: em que ETAPA a ordem está. São coisas
 * diferentes, e a diferença aparece na hora em que alguém precisa falar. Quem
 * lê "APROVACAO_GESTAO" no cartão não consegue dizer ao telefone onde o
 * equipamento se encontra — precisa saber de cor que aquela etapa acontece com
 * o aparelho já consertado, na bancada, esperando a gestão conferir.
 *
 * São vinte e uma etapas. Ninguém decora vinte e uma etapas, e ninguém deveria
 * precisar: o lugar do aparelho é sempre um de QUATRO.
 *
 *   NO CLIENTE   ainda não foi buscado
 *   NA RUA       dentro do carro, indo ou voltando
 *   NA OFICINA   com a gente, na bancada
 *   ENTREGUE     de volta com o dono
 *
 * =============================================================================
 * POR QUE ISTO É UM ARQUIVO, E NÃO UM `switch` DENTRO DO CARTÃO
 * =============================================================================
 * Porque a mesma pergunta é feita em quatro lugares — o cartão do Acompanhar, a
 * janela que abre por cima dele, o portal do cliente e a mensagem automática do
 * WhatsApp. Quatro cópias divergem na primeira etapa nova, e a que diverge é
 * sempre a que o cliente lê.
 *
 * =============================================================================
 * O CASO QUE PARECE ERRO E NÃO É
 * =============================================================================
 * `ORCAMENTO_ENVIADO` e `ORCAMENTO_REPROVADO` são "na oficina". A ordem está
 * parada esperando o cliente decidir, mas o APARELHO continua na bancada — e é
 * o aparelho que a pergunta procura. Confundir os dois é o que faz alguém dizer
 * "está com o senhor" para quem está ligando justamente porque não está.
 */

export type Lugar = 'cliente' | 'rua' | 'oficina' | 'entregue'

export type Onde = {
  lugar: Lugar
  /** A frase curta, para o cartão. */
  rotulo: string
  /** A frase que se fala ao telefone. */
  frase: string
}

const NO_CLIENTE: EtapaOrdem[] = [
  EtapaOrdem.SOLICITACAO_RECEBIDA,
  EtapaOrdem.ORDEM_RETIRADA_GERADA,
  EtapaOrdem.RETIRADA_AGENDADA,
]

const NA_RUA: EtapaOrdem[] = [
  EtapaOrdem.EM_ROTA_RETIRADA,
  EtapaOrdem.COLETADO,
  EtapaOrdem.EM_ROTA_ENTREGA,
]

const ENTREGUE: EtapaOrdem[] = [
  EtapaOrdem.ENTREGUE,
  EtapaOrdem.FINALIZADO,
  EtapaOrdem.DEVOLVIDO_SEM_REPARO,
]

/**
 * Onde está, e como dizer isso.
 *
 * `quem` é o nome de quem está com o aparelho agora — o motorista, quando está
 * na rua; o técnico, quando está na bancada. Sem ele a frase ainda funciona;
 * com ele, o atendente responde "está com o Adriano, a caminho" em vez de
 * "está a caminho", e é a diferença entre uma resposta e uma resposta boa.
 */
export function ondeEsta(etapa: EtapaOrdem, quem?: string | null): Onde {
  if (NO_CLIENTE.includes(etapa)) {
    return {
      lugar: 'cliente',
      rotulo: 'ainda no cliente',
      frase:
        etapa === EtapaOrdem.RETIRADA_AGENDADA
          ? 'Ainda com o senhor. A retirada já está marcada.'
          : 'Ainda com o senhor. Vamos agendar a retirada.',
    }
  }

  if (NA_RUA.includes(etapa)) {
    const voltando = etapa === EtapaOrdem.EM_ROTA_ENTREGA
    return {
      lugar: 'rua',
      rotulo: quem ? `na rua com ${primeiroNome(quem)}` : 'na rua',
      frase: voltando
        ? `A caminho da sua casa${quem ? `, com ${primeiroNome(quem)}` : ''}.`
        : `Sendo buscado${quem ? ` pelo ${primeiroNome(quem)}` : ''}.`,
    }
  }

  if (ENTREGUE.includes(etapa)) {
    return {
      lugar: 'entregue',
      rotulo: etapa === EtapaOrdem.DEVOLVIDO_SEM_REPARO ? 'devolvido sem reparo' : 'entregue',
      frase: 'Já foi entregue.',
    }
  }

  if (etapa === EtapaOrdem.CANCELADO) {
    return { lugar: 'entregue', rotulo: 'cancelada', frase: 'A ordem foi cancelada.' }
  }

  // Todo o resto está na oficina — inclusive o que espera resposta do cliente.
  // A ordem para; o aparelho não sai da bancada.
  return {
    lugar: 'oficina',
    rotulo: quem ? `na oficina com ${primeiroNome(quem)}` : 'na oficina',
    frase: fraseDaOficina(etapa, quem),
  }
}

function fraseDaOficina(etapa: EtapaOrdem, quem?: string | null): string {
  const com = quem ? ` com ${primeiroNome(quem)}` : ''
  switch (etapa) {
    case EtapaOrdem.RECEBIDO_NA_EMPRESA:
      return 'Já chegou aqui. Entra na fila de análise.'
    case EtapaOrdem.EM_ANALISE:
    case EtapaOrdem.ORCAMENTO_INTERNO:
      return `Aqui na oficina, em análise${com}.`
    case EtapaOrdem.ORCAMENTO_ENVIADO:
      return 'Aqui na oficina, parado esperando o senhor aprovar o orçamento.'
    case EtapaOrdem.ORCAMENTO_REPROVADO:
      return 'Aqui na oficina. O orçamento não foi aprovado — vamos agendar a devolução.'
    case EtapaOrdem.ORCAMENTO_APROVADO:
      return 'Aqui na oficina, entrando para o conserto.'
    case EtapaOrdem.EM_MANUTENCAO:
      return `Em conserto${com}.`
    case EtapaOrdem.MANUTENCAO_CONCLUIDA:
      return 'Consertado, na bancada, passando pela conferência.'
    case EtapaOrdem.APROVACAO_GESTAO:
      return 'Consertado e conferido, indo para o faturamento.'
    case EtapaOrdem.FATURAMENTO:
      return 'Consertado. Falta acertar o pagamento para sair para entrega.'
    case EtapaOrdem.FATURADO:
      return 'Consertado e pago. Vamos agendar a entrega.'
    default:
      return `Aqui na oficina${com}.`
  }
}

/**
 * "Adriano", e não "Adriano Ferreira da Silva".
 *
 * No cartão o nome divide a linha com o lugar; o nome inteiro empurra o resto
 * para fora. E ao telefone ninguém diz o nome completo do motorista.
 */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
