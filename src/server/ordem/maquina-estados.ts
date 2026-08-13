import { EtapaOrdem, Papel } from '@/generated/prisma/enums'

/**
 * A máquina de estados da jornada do equipamento.
 *
 * Este arquivo é a lei. Nenhuma parte do sistema muda a etapa de uma Ordem por
 * conta própria: tudo passa pelo motor, que consulta esta tabela. É o que
 * impede o cenário que quebra a operação — um equipamento "faturado" que nunca
 * foi orçado, ou "entregue" sem ter sido consertado.
 *
 * Duas perguntas são respondidas aqui, e só aqui:
 *   1. Desta etapa, para onde é possível ir?
 *   2. Quem tem autoridade para fazer esse salto?
 *
 * Módulo puro: sem banco, sem rede. Dá para testar exaustivamente, e é o que
 * fazemos em maquina-estados.test.ts.
 */

export type Transicao = {
  de: EtapaOrdem
  para: EtapaOrdem
  /** Chave do evento e do template de mensagem. Ex.: "ordem.coletada". */
  tipo: string
  /** Frase que aparece na linha do tempo. */
  titulo: string
  /** Quem pode executar. SUPER_ADMIN entra por regra separada, abaixo. */
  papeis: Papel[]
  /** Dispara aviso ao cliente no WhatsApp quando a transição acontece. */
  avisaCliente: boolean
  /** Gera documento em PDF ao entrar nesta etapa. */
  gera?: 'ORDEM_RETIRADA' | 'COMPROVANTE_RETIRADA' | 'LAUDO_TECNICO' | 'ORCAMENTO' | 'CONTRATO_MANUTENCAO' | 'ORDEM_SERVICO' | 'COMPROVANTE_ENTREGA' | 'RECIBO_PAGAMENTO'
  /** Pré-condições verificadas pelo motor antes de aceitar a transição. */
  exige?: Array<'ASSINATURA_RETIRADA' | 'MIN_6_FOTOS' | 'ORCAMENTO_APROVADO' | 'FATURA_QUITADA' | 'ASSINATURA_ENTREGA' | 'DIAGNOSTICO'>
}

const T = EtapaOrdem
const P = Papel

/** Quem opera a central. */
const CENTRAL: Papel[] = [P.ADMIN_EMPRESA, P.GESTOR, P.ATENDENTE]
/** Quem decide. */
const GESTAO: Papel[] = [P.ADMIN_EMPRESA, P.GESTOR]

export const TRANSICOES: Transicao[] = [
  // ---- 1 a 3: a central abre e agenda ------------------------------------
  {
    de: T.SOLICITACAO_RECEBIDA,
    para: T.ORDEM_RETIRADA_GERADA,
    tipo: 'ordem.gerada',
    titulo: 'Ordem de retirada gerada',
    papeis: CENTRAL,
    avisaCliente: false,
    gera: 'ORDEM_RETIRADA',
  },
  {
    de: T.ORDEM_RETIRADA_GERADA,
    para: T.RETIRADA_AGENDADA,
    tipo: 'retirada.agendada',
    titulo: 'Retirada agendada',
    papeis: CENTRAL,
    avisaCliente: true,
  },

  // ---- 4 e 5: o motorista em campo ---------------------------------------
  {
    de: T.RETIRADA_AGENDADA,
    para: T.EM_ROTA_RETIRADA,
    tipo: 'retirada.em_rota',
    titulo: 'Motorista saiu para a retirada',
    papeis: [P.MOTORISTA, ...CENTRAL],
    avisaCliente: true,
  },
  {
    de: T.EM_ROTA_RETIRADA,
    para: T.COLETADO,
    tipo: 'ordem.coletada',
    titulo: 'Equipamento coletado e assinado pelo cliente',
    papeis: [P.MOTORISTA],
    avisaCliente: true,
    // Comprovante, e não outra ordem de retirada: este documento já traz a
    // assinatura, e é ele que prova que o aparelho saiu de lá.
    gera: 'COMPROVANTE_RETIRADA',
    // Sem a assinatura não há prova de que o equipamento saiu de lá. Meses
    // depois, sem ela, a discussão é perdida.
    exige: ['ASSINATURA_RETIRADA'],
  },
  {
    // Os 10% que chegam pelo correio pulam a rota, mas não a documentação.
    de: T.RETIRADA_AGENDADA,
    para: T.COLETADO,
    tipo: 'ordem.coletada_correio',
    titulo: 'Equipamento despachado pelo correio',
    papeis: CENTRAL,
    avisaCliente: true,
  },

  // ---- 6 e 7: a oficina recebe e diagnostica ------------------------------
  {
    de: T.COLETADO,
    para: T.RECEBIDO_NA_EMPRESA,
    tipo: 'ordem.recebida',
    titulo: 'Recebido na oficina',
    papeis: [P.TECNICO, ...CENTRAL],
    avisaCliente: true,
    // O estado em que o aparelho chegou, antes de alguém encostar a chave.
    exige: ['MIN_6_FOTOS'],
  },
  {
    de: T.RECEBIDO_NA_EMPRESA,
    para: T.EM_ANALISE,
    tipo: 'ordem.em_analise',
    titulo: 'Em análise técnica',
    papeis: [P.TECNICO, ...GESTAO],
    avisaCliente: true,
  },
  {
    de: T.EM_ANALISE,
    para: T.ORCAMENTO_INTERNO,
    tipo: 'orcamento.para_revisao',
    titulo: 'Laudo concluído, orçamento em revisão',
    papeis: [P.TECNICO],
    avisaCliente: false,
    gera: 'LAUDO_TECNICO',
    exige: ['DIAGNOSTICO'],
  },

  // ---- 8 e 9: a gestora fecha e o cliente decide --------------------------
  {
    de: T.ORCAMENTO_INTERNO,
    para: T.ORCAMENTO_ENVIADO,
    tipo: 'orcamento.enviado',
    titulo: 'Orçamento enviado ao cliente',
    papeis: GESTAO,
    avisaCliente: true,
    gera: 'ORCAMENTO',
  },
  {
    // Voltou para o técnico: faltou informação ou o valor não fechou.
    de: T.ORCAMENTO_INTERNO,
    para: T.EM_ANALISE,
    tipo: 'orcamento.devolvido',
    titulo: 'Orçamento devolvido ao técnico',
    papeis: GESTAO,
    avisaCliente: false,
  },
  {
    de: T.ORCAMENTO_ENVIADO,
    para: T.ORCAMENTO_APROVADO,
    tipo: 'orcamento.aprovado',
    titulo: 'Orçamento aprovado e assinado pelo cliente',
    // Quem aprova é o cliente, pelo portal público. Nenhum papel interno
    // aparece aqui de propósito: aprovar em nome do cliente destruiria o valor
    // jurídico da assinatura. O motor trata este caso por uma via própria.
    papeis: [],
    avisaCliente: true,
    gera: 'CONTRATO_MANUTENCAO',
  },
  {
    de: T.ORCAMENTO_ENVIADO,
    para: T.ORCAMENTO_REPROVADO,
    tipo: 'orcamento.reprovado',
    titulo: 'Orçamento recusado pelo cliente',
    papeis: [],
    avisaCliente: true,
  },
  {
    // Reprovou, mas voltou atrás depois de conversar. Acontece toda semana.
    de: T.ORCAMENTO_REPROVADO,
    para: T.ORCAMENTO_INTERNO,
    tipo: 'orcamento.revisado',
    titulo: 'Orçamento sendo refeito',
    papeis: GESTAO,
    avisaCliente: false,
  },
  {
    de: T.ORCAMENTO_REPROVADO,
    para: T.DEVOLVIDO_SEM_REPARO,
    tipo: 'ordem.devolucao_sem_reparo',
    titulo: 'Devolução sem reparo',
    papeis: GESTAO,
    avisaCliente: true,
  },

  // ---- 10 e 11: execução --------------------------------------------------
  {
    de: T.ORCAMENTO_APROVADO,
    para: T.EM_MANUTENCAO,
    tipo: 'manutencao.iniciada',
    titulo: 'Manutenção iniciada',
    papeis: [P.TECNICO, ...GESTAO],
    avisaCliente: true,
    gera: 'ORDEM_SERVICO',
    // Trava a execução antes do aceite. É o que impede serviço feito de graça.
    exige: ['ORCAMENTO_APROVADO'],
  },
  {
    de: T.EM_MANUTENCAO,
    para: T.MANUTENCAO_CONCLUIDA,
    tipo: 'manutencao.concluida',
    titulo: 'Manutenção concluída, testes aprovados',
    papeis: [P.TECNICO],
    avisaCliente: true,
  },

  // ---- 12 a 13: gestão libera e o financeiro cobra ------------------------
  {
    de: T.MANUTENCAO_CONCLUIDA,
    para: T.APROVACAO_GESTAO,
    tipo: 'gestao.em_aprovacao',
    titulo: 'Aguardando conferência da gestão',
    papeis: [P.TECNICO, ...GESTAO],
    avisaCliente: false,
  },
  {
    // A gestão reprovou o serviço: volta para a bancada, e o cliente não vê.
    de: T.APROVACAO_GESTAO,
    para: T.EM_MANUTENCAO,
    tipo: 'gestao.reprovou_servico',
    titulo: 'Serviço devolvido para ajuste',
    papeis: GESTAO,
    avisaCliente: false,
  },
  {
    de: T.APROVACAO_GESTAO,
    para: T.FATURAMENTO,
    tipo: 'faturamento.aberto',
    titulo: 'Liberado para faturamento',
    papeis: GESTAO,
    avisaCliente: false,
  },
  {
    de: T.FATURAMENTO,
    para: T.FATURADO,
    tipo: 'ordem.faturada',
    titulo: 'Pagamento confirmado',
    papeis: [P.FINANCEIRO, ...GESTAO],
    avisaCliente: true,
    gera: 'RECIBO_PAGAMENTO',
    exige: ['FATURA_QUITADA'],
  },

  // ---- 14 a 16: a volta ---------------------------------------------------
  {
    de: T.FATURADO,
    para: T.EM_ROTA_ENTREGA,
    tipo: 'entrega.em_rota',
    titulo: 'Saiu para entrega',
    papeis: [P.MOTORISTA, ...CENTRAL],
    avisaCliente: true,
  },
  {
    de: T.EM_ROTA_ENTREGA,
    para: T.ENTREGUE,
    tipo: 'ordem.entregue',
    titulo: 'Entregue e assinado pelo cliente',
    papeis: [P.MOTORISTA],
    avisaCliente: true,
    gera: 'COMPROVANTE_ENTREGA',
    exige: ['ASSINATURA_ENTREGA'],
  },
  {
    de: T.DEVOLVIDO_SEM_REPARO,
    para: T.EM_ROTA_ENTREGA,
    tipo: 'entrega.em_rota_sem_reparo',
    titulo: 'Saiu para devolução',
    papeis: [P.MOTORISTA, ...CENTRAL],
    avisaCliente: true,
  },
  {
    de: T.ENTREGUE,
    para: T.FINALIZADO,
    tipo: 'ordem.finalizada',
    titulo: 'Baixa final da gestão',
    papeis: GESTAO,
    avisaCliente: false,
  },
]

/** Etapas terminais: daqui não se sai. */
export const TERMINAIS: EtapaOrdem[] = [T.FINALIZADO, T.CANCELADO]

/**
 * O cancelamento é a única transição que parte de quase qualquer lugar, então
 * fica fora da tabela — listá-la 20 vezes convidaria alguém a esquecer uma.
 */
export const CANCELAMENTO = {
  tipo: 'ordem.cancelada',
  titulo: 'Ordem cancelada',
  papeis: GESTAO,
  avisaCliente: true,
} as const

export type ResultadoValidacao =
  | { ok: true; transicao: Transicao }
  | { ok: false; motivo: string }

/**
 * Responde se um salto é permitido, e por quê não quando não é.
 *
 * A mensagem de recusa é escrita para aparecer na tela do operador: ela diz o
 * que aconteceu e o que fazer, sem expor nome de enum nem termo de banco.
 */
export function validarTransicao(entrada: {
  de: EtapaOrdem
  para: EtapaOrdem
  papel: Papel
  /** Aprovação e recusa do orçamento vêm do portal, sem usuário logado. */
  viaPortalCliente?: boolean
}): ResultadoValidacao {
  const { de, para, papel, viaPortalCliente } = entrada

  if (de === para) {
    return { ok: false, motivo: 'A ordem já está nessa etapa.' }
  }

  if (para === EtapaOrdem.CANCELADO) {
    if (TERMINAIS.includes(de)) {
      return { ok: false, motivo: 'Ordem já encerrada não pode ser cancelada.' }
    }
    if (papel !== Papel.SUPER_ADMIN && !CANCELAMENTO.papeis.includes(papel)) {
      return { ok: false, motivo: 'Só a gestão pode cancelar uma ordem.' }
    }
    return {
      ok: true,
      transicao: {
        de,
        para,
        tipo: CANCELAMENTO.tipo,
        titulo: CANCELAMENTO.titulo,
        papeis: [...CANCELAMENTO.papeis],
        avisaCliente: CANCELAMENTO.avisaCliente,
      },
    }
  }

  if (TERMINAIS.includes(de)) {
    return { ok: false, motivo: 'Esta ordem já foi encerrada.' }
  }

  const t = TRANSICOES.find((x) => x.de === de && x.para === para)
  if (!t) {
    const saidas = TRANSICOES.filter((x) => x.de === de).map((x) => x.titulo)
    return {
      ok: false,
      motivo: saidas.length
        ? `Esse passo não existe a partir da etapa atual. Daqui, o que dá para fazer é: ${saidas.join('; ')}.`
        : 'Não há próximo passo a partir da etapa atual.',
    }
  }

  // A aprovação do cliente não tem papel interno: ela chega pelo portal.
  if (t.papeis.length === 0) {
    if (!viaPortalCliente) {
      return {
        ok: false,
        motivo: 'Só o próprio cliente pode responder ao orçamento, pelo link que recebeu.',
      }
    }
    return { ok: true, transicao: t }
  }

  // Super Admin atravessa a hierarquia de papéis, mas não as pré-condições:
  // ele continua sem poder faturar sem pagamento nem entregar sem assinatura.
  if (papel === Papel.SUPER_ADMIN) return { ok: true, transicao: t }

  if (!t.papeis.includes(papel)) {
    return { ok: false, motivo: `Seu perfil não tem permissão para: ${t.titulo.toLowerCase()}.` }
  }

  return { ok: true, transicao: t }
}

/** Próximos passos possíveis, para a tela montar os botões certos. */
export function proximosPassos(de: EtapaOrdem, papel: Papel): Transicao[] {
  if (TERMINAIS.includes(de)) return []
  return TRANSICOES.filter(
    (t) =>
      t.de === de &&
      t.papeis.length > 0 &&
      (papel === Papel.SUPER_ADMIN || t.papeis.includes(papel)),
  )
}

/** Rótulo humano de cada etapa — o que aparece na tela e no WhatsApp. */
export const ROTULO_ETAPA: Record<EtapaOrdem, string> = {
  SOLICITACAO_RECEBIDA: 'Solicitação recebida',
  ORDEM_RETIRADA_GERADA: 'Ordem de retirada gerada',
  RETIRADA_AGENDADA: 'Retirada agendada',
  EM_ROTA_RETIRADA: 'Motorista a caminho',
  COLETADO: 'Coletado',
  RECEBIDO_NA_EMPRESA: 'Recebido na oficina',
  EM_ANALISE: 'Em análise',
  ORCAMENTO_INTERNO: 'Orçamento em revisão',
  ORCAMENTO_ENVIADO: 'Orçamento enviado',
  ORCAMENTO_APROVADO: 'Orçamento aprovado',
  ORCAMENTO_REPROVADO: 'Orçamento recusado',
  EM_MANUTENCAO: 'Em manutenção',
  MANUTENCAO_CONCLUIDA: 'Manutenção concluída',
  APROVACAO_GESTAO: 'Em conferência da gestão',
  FATURAMENTO: 'Em faturamento',
  FATURADO: 'Faturado',
  EM_ROTA_ENTREGA: 'Saiu para entrega',
  ENTREGUE: 'Entregue',
  FINALIZADO: 'Finalizado',
  DEVOLVIDO_SEM_REPARO: 'Devolvido sem reparo',
  CANCELADO: 'Cancelado',
}

/**
 * Nome de gente para cada documento.
 *
 * O portal mostrava ao CLIENTE o identificador cru — "CONTRATO_MANUTENCAO-00009".
 * Serve para o banco, não para quem recebeu o link no WhatsApp e quer abrir o
 * contrato que acabou de assinar.
 */
export const ROTULO_DOCUMENTO: Record<string, string> = {
  ORDEM_RETIRADA: 'Ordem de retirada',
  COMPROVANTE_RETIRADA: 'Comprovante de retirada',
  LAUDO_TECNICO: 'Laudo técnico',
  ORCAMENTO: 'Orçamento',
  CONTRATO_MANUTENCAO: 'Contrato de manutenção',
  ORDEM_SERVICO: 'Ordem de serviço',
  RECIBO_PAGAMENTO: 'Recibo de pagamento',
  COMPROVANTE_ENTREGA: 'Comprovante de entrega',
}

/** Etapas que o cliente enxerga no portal público. */
export const VISIVEL_AO_CLIENTE: EtapaOrdem[] = [
  T.RETIRADA_AGENDADA,
  T.EM_ROTA_RETIRADA,
  T.COLETADO,
  T.RECEBIDO_NA_EMPRESA,
  T.EM_ANALISE,
  T.ORCAMENTO_ENVIADO,
  T.ORCAMENTO_APROVADO,
  T.ORCAMENTO_REPROVADO,
  T.EM_MANUTENCAO,
  T.MANUTENCAO_CONCLUIDA,
  T.FATURADO,
  T.EM_ROTA_ENTREGA,
  T.ENTREGUE,
  T.DEVOLVIDO_SEM_REPARO,
  T.CANCELADO,
]
