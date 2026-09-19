import { Prisma } from '@/generated/prisma/client'
import { EtapaOrdem } from '@/generated/prisma/enums'

/**
 * O QUE CONTA COMO ORDEM ABERTA, EM UM LUGAR SÓ.
 *
 * =============================================================================
 * HAVIA QUATRO RESPOSTAS PARA A MESMA PERGUNTA, NA MESMA TELA
 * =============================================================================
 * O Dashboard e a aba de Operação perguntavam "quais ordens estão abertas?"
 * quatro vezes, escrevendo a lista de etapas encerradas à mão em cada consulta
 * — e as quatro listas não eram iguais. A contagem de abertas e a lista de
 * atrasadas excluíam FINALIZADO, CANCELADO e DEVOLVIDO_SEM_REPARO; o "onde está
 * parado" excluía só as duas primeiras, e por isso contava como trabalho em
 * andamento o aparelho que já voltou para o cliente sem conserto.
 *
 * Quem lê a tela não tem como saber disso. Ele vê dois números que deveriam
 * fechar e não fecham, conclui que um dos dois está errado, e a partir daí
 * desconfia dos quatro.
 *
 * =============================================================================
 * POR QUE NÃO USAR O `TERMINAIS` DA MÁQUINA DE ESTADOS
 * =============================================================================
 * `maquina-estados.ts` tem `TERMINAIS = [FINALIZADO, CANCELADO]`, e está certo
 * para o que ele faz: são as etapas das quais não se sai, e é isso que a
 * máquina precisa saber para recusar uma transição.
 *
 * A pergunta do painel é outra: não "dá para sair daqui?", e sim "isto ainda é
 * trabalho meu?". DEVOLVIDO_SEM_REPARO responde não às duas, mas só a segunda
 * lista o considera encerrado. Emprestar a constante da máquina faria as duas
 * perguntas compartilharem uma resposta que só serve a uma delas — e no dia em
 * que a máquina ganhasse uma etapa terminal nova, o painel mudaria junto sem
 * ninguém ter decidido isso.
 */
export const ETAPAS_ENCERRADAS: EtapaOrdem[] = [
  EtapaOrdem.FINALIZADO,
  EtapaOrdem.CANCELADO,
  EtapaOrdem.DEVOLVIDO_SEM_REPARO,
]

/**
 * A mesma lista, pronta para entrar num `NOT IN (...)` de SQL cru.
 *
 * `Prisma.join` parametriza cada valor em vez de concatenar texto, então isto
 * continua sendo uma consulta preparada — a lista vai como parâmetro, não como
 * pedaço de string montada.
 */
export const SQL_ETAPAS_ENCERRADAS = Prisma.join(ETAPAS_ENCERRADAS.map((e) => Prisma.sql`${e}`))
