import { EtapaOrdem as E } from '@/generated/prisma/enums'

/**
 * O QUE PODE SER APAGADO, E O QUE NUNCA.
 *
 * =============================================================================
 * POR QUE ESTA REGRA EXISTE ANTES DO BOTÃO
 * =============================================================================
 * Este sistema existe para responder "quem mexeu neste aparelho" com
 * honestidade — ao cliente, ao fabricante e à vigilância sanitária. Um botão de
 * excluir, sozinho, é a forma mais direta de quebrar essa promessa: some a
 * ordem, somem os eventos, some a assinatura que o cliente deu no celular do
 * motorista, e ninguém consegue mais provar coisa nenhuma.
 *
 * E o banco não protege ninguém disso. O papel da aplicação NÃO tem permissão
 * de apagar evento, assinatura nem foto — mas as chaves estrangeiras são
 * `onDelete: Cascade`, e cascata não passa por checagem de permissão. Medido:
 * um `delete` numa única ordem levou junto 17 eventos, 2 assinaturas e 6 fotos.
 * A revogação protege contra apagamento DIRETO; contra cascata, quem protege é
 * esta função, e só ela.
 *
 * Mas "nunca apagar" também não é resposta. Uma O.S. aberta por engano — nome
 * errado, cliente duplicado, teste que ficou — polui a lista de quem trabalha e
 * não prova nada de ninguém. Cancelar não serve: cancelada continua aparecendo,
 * porque cancelar é um FATO sobre uma ordem de verdade.
 *
 * A linha divisória é esta: **apaga-se o que ainda não virou prova.**
 *
 * =============================================================================
 * O QUE CONTA COMO PROVA
 * =============================================================================
 * Cada trava abaixo é um tipo diferente de compromisso já assumido:
 *
 *   ASSINATURA   alguém assinou com o dedo na tela. É a prova de que o aparelho
 *                mudou de mão. Apagar isso é apagar a palavra de uma pessoa.
 *   FOTO         o estado em que o aparelho chegou. É a fronteira entre o
 *                arranhão que já vinha e o que aconteceu aqui dentro.
 *   FATURA       dinheiro foi cobrado. O fechamento do mês tem de bater, e uma
 *                ordem que some do meio dele é um buraco que ninguém explica.
 *   ORÇAMENTO    o cliente aprovou pelo link, com documento conferido. Aquilo
 *     APROVADO   virou contrato — e contrato não se apaga de um lado só.
 *   PEÇA         há peça do cliente guardada aqui em nome desta ordem. Sem a
 *    RETIRADA    ordem, ninguém sabe de quem é aquela peça na gaveta.
 *   MOVIMENTO    saiu peça da prateleira por causa desta ordem. O movimento
 *   DE ESTOQUE   sobrevive à exclusão (a chave é `SetNull`), mas vira uma baixa
 *                sem dono: o estoque deixa de saber explicar o próprio saldo.
 *   JÁ ANDOU     o aparelho passou da portaria. Coletado é o corte.
 *
 * Nenhuma dessas é impedimento burocrático: são as perguntas que voltam meses
 * depois, por telefone, e que só a ordem sabe responder.
 *
 * =============================================================================
 * POR QUE `jaColetada` NÃO É A MESMA COISA QUE A ETAPA ATUAL
 * =============================================================================
 * `CANCELADO` é uma etapa como qualquer outra: uma ordem que rodou meio mundo e
 * foi cancelada no fim SAI da lista de etapas "já andou" e cairia como
 * apagável. Por isso a trava olha para onde a ordem JÁ ESTEVE, lido dos
 * eventos, e não só para onde ela está agora.
 *
 * Módulo puro: sem banco, sem sessão. Testado em `exclusao.test.ts`.
 */

/** O que a ordem carrega, do ponto de vista de "isto já virou prova?". */
export type PesoDaOrdem = {
  /** Onde a ordem está agora. */
  etapa: E
  /** A ordem já passou por COLETADO alguma vez, lido da linha do tempo. */
  jaColetada: boolean
  assinaturas: number
  fotos: number
  pecasRetiradas: number
  /** Baixas de estoque lançadas em nome desta ordem. */
  movimentosEstoque: number
  /** Existe fatura emitida, paga ou não. */
  temFatura: boolean
  /** O cliente aprovou algum orçamento pelo link. */
  orcamentoAprovado: boolean
  /** Outras ordens que são retorno de garantia desta. */
  retornosDeGarantia: number
  /** PDFs gerados (ordem de retirada, O.S.). */
  documentos: number
}

export type Veredito =
  | { pode: true; avisos: string[] }
  | { pode: false; motivo: string; alternativa: string }

/**
 * As etapas a partir das quais a ordem já tem vida própria.
 *
 * Coletado é o corte: dali em diante o aparelho está com a gente, e existe foto
 * de recebimento, laudo e histórico do equipamento pendurados nesta ordem.
 */
export const JA_ANDOU: readonly E[] = [
  E.COLETADO,
  E.RECEBIDO_NA_EMPRESA,
  E.EM_ANALISE,
  E.ORCAMENTO_INTERNO,
  E.ORCAMENTO_ENVIADO,
  E.ORCAMENTO_APROVADO,
  E.ORCAMENTO_REPROVADO,
  E.EM_MANUTENCAO,
  E.MANUTENCAO_CONCLUIDA,
  E.APROVACAO_GESTAO,
  E.FATURAMENTO,
  E.FATURADO,
  E.EM_ROTA_ENTREGA,
  E.ENTREGUE,
  E.FINALIZADO,
  E.DEVOLVIDO_SEM_REPARO,
]

const CANCELAR = 'Cancele a ordem: ela sai da esteira e o histórico fica de pé.'

const plural = (n: number, um: string, muitos: string) =>
  n === 1 ? `uma ${um}` : `${n} ${muitos}`

export function podeExcluir(o: PesoDaOrdem): Veredito {
  const trava = (motivo: string): Veredito => ({ pode: false, motivo, alternativa: CANCELAR })

  if (o.assinaturas > 0) {
    return trava(
      `Esta ordem tem ${plural(o.assinaturas, 'assinatura', 'assinaturas')} coletada na tela do ` +
        'celular. Apagar isso é apagar a palavra de quem assinou.',
    )
  }
  if (o.temFatura) {
    return trava(
      'Esta ordem já tem fatura. O fechamento do mês precisa dela — uma ordem que some do meio ' +
        'do relatório é um buraco que ninguém consegue explicar depois.',
    )
  }
  if (o.orcamentoAprovado) {
    return trava(
      'O cliente aprovou o orçamento desta ordem pelo link, com o documento conferido. Aquilo ' +
        'virou contrato, e contrato não se apaga de um lado só.',
    )
  }
  if (o.fotos > 0) {
    return trava(
      `Esta ordem tem ${plural(o.fotos, 'foto', 'fotos')} do aparelho. É por elas que se sabe em ` +
        'que estado ele chegou — e sem elas não há como responder por um arranhão depois.',
    )
  }
  if (o.pecasRetiradas > 0) {
    return trava(
      `Há ${plural(o.pecasRetiradas, 'peça do cliente guardada', 'peças do cliente guardadas')} ` +
        'em nome desta ordem. Sem a ordem, ninguém sabe de quem é aquilo na gaveta.',
    )
  }
  if (o.movimentosEstoque > 0) {
    return trava(
      `Saiu peça da prateleira por causa desta ordem (${plural(o.movimentosEstoque, 'baixa', 'baixas')}). ` +
        'A baixa continuaria lá, sem dono, e o estoque deixaria de saber explicar o próprio saldo.',
    )
  }
  if (o.jaColetada || JA_ANDOU.includes(o.etapa)) {
    return trava(
      'O aparelho já entrou na assistência nesta ordem. Daqui em diante existem laudo e histórico ' +
        'do equipamento pendurados nela.',
    )
  }

  /**
   * Passou. Ainda assim, o que vai ser destruído é dito em voz alta antes.
   *
   * Mesmo uma ordem recém-aberta tem eventos — e o banco apaga os filhos em
   * cascata sem pedir licença a ninguém. Quem aperta o botão precisa saber
   * disso ANTES, e não descobrir depois.
   */
  const avisos = [
    'Some a ordem, a linha do tempo dela e o link que o cliente recebeu.',
    'O cliente, o equipamento e o histórico de outras ordens não são tocados.',
  ]
  if (o.documentos > 0) {
    avisos.push(
      `${o.documentos === 1 ? 'Um PDF gerado some' : `${o.documentos} PDFs gerados somem`} junto. ` +
        'Se algum já foi mandado para o cliente, a cópia dele continua lá.',
    )
  }
  if (o.retornosDeGarantia > 0) {
    avisos.push(
      `${plural(o.retornosDeGarantia, 'ordem aponta', 'ordens apontam')} para esta como retorno de ` +
        'garantia. Essas ordens continuam de pé, mas perdem o fio de volta até aqui.',
    )
  }
  avisos.push('Não tem volta.')
  return { pode: true, avisos }
}
