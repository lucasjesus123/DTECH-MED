import { Papel } from '@/generated/prisma/enums'

/**
 * QUEM CONDUZ A RUA PELO PAINEL — e por que isso precisa de um arquivo.
 *
 * =============================================================================
 * O PEDIDO, E O QUE ELE CUSTA
 * =============================================================================
 * O dono pediu autonomia completa: sentado no computador, poder aceitar a
 * corrida, marcar a saída, registrar a chegada e colher a assinatura, como se
 * estivesse na porta do cliente. O pedido é legítimo — numa oficina de poucas
 * pessoas, quem dirige a van muitas vezes é o próprio dono.
 *
 * O custo é real e vale ser dito em voz alta: a assinatura no visor é a prova
 * de que ALGUÉM ESTEVE na porta do cliente. Se ela passa a poder ser colhida de
 * uma mesa, ela deixa de provar isso sozinha.
 *
 * =============================================================================
 * A SAÍDA NÃO É FURAR A REGRA, É NOMEAR A EXCEÇÃO
 * =============================================================================
 * Daria para simplesmente acrescentar dois papéis a três listas espalhadas e
 * seguir a vida. O registro passaria a dizer "Lucas Jesus coletou a assinatura"
 * sem distinguir se ele estava na clínica ou no escritório — e a folha de
 * rastreabilidade, que existe para responder "quem mexeu neste aparelho" com
 * honestidade, começaria a responder menos do que sabe.
 *
 * Aqui a exceção tem nome (`viaGestao`), mora num lugar só, e ACOMPANHA a ação
 * até a trilha. A autonomia é inteira; o registro é inteiro também. Quem ler a
 * folha daqui a dois anos vê "pelo painel, em modo gestão" ao lado do nome, e
 * sabe exatamente o que aconteceu.
 *
 * =============================================================================
 * O MOTORISTA NÃO MUDOU
 * =============================================================================
 * Nada aqui afrouxa a regra dele: continua aceitando só a própria corrida. O
 * motivo está escrito em `aceitarCorrida` — aceitar a do colega some com ela da
 * fila dele, e a central passa a ver como resolvido um endereço que ninguém
 * tem. Essa trava protege a operação de um engano; a gestão que age pelo painel
 * não é engano, é decisão, e por isso passa — assinada.
 */

/**
 * Os papéis que conduzem a rua sentados no painel.
 *
 * A lista é curta de propósito. O GESTOR ficou de fora: ele despacha, reordena
 * e troca o motorista, e para isso não precisa assinar em nome de ninguém.
 * Acrescentar um papel aqui é uma decisão visível, num arquivo que fala sobre
 * prova — não um item a mais numa lista de permissões.
 */
const CONDUZ_PELO_PAINEL: ReadonlyArray<Papel> = [Papel.ADMIN_EMPRESA, Papel.SUPER_ADMIN]

/** A pessoa está conduzindo a rua a partir do painel, e não do celular? */
export function pelaGestao(papel: Papel): boolean {
  return CONDUZ_PELO_PAINEL.includes(papel)
}

/**
 * A marca que acompanha a ação até a trilha.
 *
 * Vai no `payload` do evento da esteira e nos `detalhes` do log de auditoria.
 * Objeto vazio quando foi o motorista — para não sujar a trilha de quem fez o
 * trabalho do jeito comum.
 */
export function marcaDaGestao(papel: Papel): Record<string, unknown> {
  return pelaGestao(papel) ? { viaGestao: true, modo: 'painel' } : {}
}

/**
 * A frase que vai para a linha do tempo, em português, quando foi a gestão.
 *
 * `undefined` quando foi o motorista: a ausência de observação já diz que o
 * caminho foi o comum, e escrever "feito pelo motorista" em toda parada seria
 * ruído em cima da informação que importa.
 */
export function observacaoDaGestao(papel: Papel, oQue: string): string | undefined {
  if (!pelaGestao(papel)) return undefined
  return `${oQue} pelo painel, em modo gestão.`
}
