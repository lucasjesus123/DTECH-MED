import { EtapaOrdem } from '@/generated/prisma/enums'
import type { Papel } from '@/generated/prisma/enums'
import { hashEvento } from '@/lib/cripto'
import { comEscopo, type ContextoAcesso, type Transacao } from '@/lib/db'
import { validarTransicao, type Transicao } from './maquina-estados'

/**
 * O motor da linha do tempo.
 *
 * Nenhuma etapa de Ordem muda em nenhum outro lugar do sistema. Tudo passa por
 * aqui, e por um motivo prático: cada avanço precisa fazer cinco coisas de uma
 * vez só, ou nenhuma.
 *
 *   1. conferir se o salto é permitido para aquele papel;
 *   2. conferir as pré-condições contra o banco (fotos, assinatura, pagamento);
 *   3. gravar o evento imutável, encadeado por hash ao anterior;
 *   4. atualizar a Ordem e os marcos de tempo;
 *   5. enfileirar as automações — WhatsApp e PDF.
 *
 * O ponto que costuma dar errado em sistema assim é o passo 5 ficar fora da
 * transação. Aí acontece o pior cenário possível: a etapa muda, a fila falha,
 * e o cliente nunca é avisado. Ninguém percebe até ele ligar irritado.
 * Aqui o job nasce na MESMA transação da mudança de etapa. Ou os dois
 * acontecem, ou nada acontece. É o padrão outbox transacional.
 */

export type PedidoTransicao = {
  ordemId: string
  para: EtapaOrdem
  /** Texto livre para a linha do tempo (motivo do cancelamento, observação). */
  observacao?: string
  /** Dados extras congelados no evento. */
  payload?: Record<string, unknown>
  /** Aprovação e recusa chegam do portal, sem usuário logado. */
  viaPortalCliente?: boolean
  /** Nome de quem agiu quando não há usuário (cliente no portal). */
  autorExterno?: string
  ip?: string | null
}

export type ResultadoTransicao =
  | { ok: true; etapa: EtapaOrdem; eventoId: string; sequencia: number }
  | { ok: false; motivo: string }

type Ator = { id: string | null; nome: string; papel: Papel }

/**
 * Executa uma transição.
 *
 * Devolve `{ ok: false, motivo }` em vez de lançar, porque recusa não é
 * excepcional: é o caminho normal quando o operador clica no que não pode.
 * A mensagem vai direto para a tela dele.
 */
export async function avancarOrdem(
  ctx: ContextoAcesso,
  ator: Ator,
  pedido: PedidoTransicao,
): Promise<ResultadoTransicao> {
  return comEscopo(ctx, async (tx) => {
    // O RLS já garante que uma ordem de outra empresa não aparece aqui.
    const ordem = await tx.ordem.findUnique({
      where: { id: pedido.ordemId },
      include: {
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        fatura: { select: { status: true, valorPagoCentavos: true, valorTotalCentavos: true } },
      },
    })
    if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

    const val = validarTransicao({
      de: ordem.etapa,
      para: pedido.para,
      papel: ator.papel,
      viaPortalCliente: pedido.viaPortalCliente,
    })
    if (!val.ok) return { ok: false, motivo: val.motivo }

    const barreira = await conferirPreCondicoes(tx, ordem.id, val.transicao)
    if (barreira) return { ok: false, motivo: barreira }

    // --- evento imutável, encadeado ---------------------------------------
    const anterior = await tx.eventoOrdem.findFirst({
      where: { ordemId: ordem.id },
      orderBy: { sequencia: 'desc' },
      select: { sequencia: true, hash: true },
    })
    const sequencia = (anterior?.sequencia ?? 0) + 1
    const criadoEm = new Date()
    const payload = { ...(pedido.payload ?? {}), observacao: pedido.observacao ?? null }

    const hash = hashEvento({
      ordemId: ordem.id,
      sequencia,
      etapaNova: pedido.para,
      tipo: val.transicao.tipo,
      autorId: ator.id,
      criadoEm,
      payload,
      hashAnterior: anterior?.hash ?? null,
    })

    const evento = await tx.eventoOrdem.create({
      data: {
        tenantId: ordem.tenantId,
        ordemId: ordem.id,
        sequencia,
        etapaAnterior: ordem.etapa,
        etapaNova: pedido.para,
        tipo: val.transicao.tipo,
        titulo: val.transicao.titulo,
        descricao: pedido.observacao ?? null,
        autorId: ator.id,
        // Nome e papel congelados: se a pessoa for renomeada ou desligada
        // depois, o histórico continua contando a verdade da época.
        autorNome: ator.id ? ator.nome : (pedido.autorExterno ?? ator.nome),
        autorPapel: ator.papel,
        payload,
        hash,
        hashAnterior: anterior?.hash ?? null,
        visivelCliente: val.transicao.avisaCliente,
        ip: pedido.ip ?? null,
        criadoEm,
      },
      select: { id: true },
    })

    // --- a ordem avança ----------------------------------------------------
    await tx.ordem.update({
      where: { id: ordem.id },
      data: { etapa: pedido.para, ...marcosDe(pedido.para, criadoEm) },
    })

    // --- a parada do motorista acompanha a etapa ---------------------------
    await fecharAgendamento(tx, ordem.id, pedido.para, criadoEm)

    // --- automações, na mesma transação -----------------------------------
    if (val.transicao.gera) {
      await enfileirar(tx, ordem.tenantId, {
        tipo: 'pdf.gerar',
        prioridade: 3,
        dedupeKey: `pdf:${ordem.id}:${val.transicao.gera}:${sequencia}`,
        payload: {
          ordemId: ordem.id,
          documento: val.transicao.gera,
          eventoId: evento.id,
        },
      })
    }

    if (val.transicao.avisaCliente) {
      await enfileirar(tx, ordem.tenantId, {
        tipo: 'whatsapp.enviar',
        prioridade: 2,
        // Idempotência: se esta transação for repetida por retry de rede, o
        // job já existe e o cliente não recebe a mesma mensagem duas vezes.
        dedupeKey: `zap:${ordem.id}:${sequencia}`,
        payload: {
          ordemId: ordem.id,
          eventoId: evento.id,
          template: val.transicao.tipo,
          // O PDF, quando existe, é anexado pelo worker depois de gerado.
          anexarDocumento: val.transicao.gera ?? null,
        },
      })
    }

    return { ok: true, etapa: pedido.para, eventoId: evento.id, sequencia }
  })
}

/**
 * As pré-condições declaradas na máquina de estados, conferidas contra o banco.
 *
 * A validação não pode viver só no formulário: a tela quebra, o request se
 * repete, alguém chama a API direto. Estas checagens são a última palavra.
 */
async function conferirPreCondicoes(
  tx: Transacao,
  ordemId: string,
  t: Transicao,
): Promise<string | null> {
  if (!t.exige?.length) return null

  for (const regra of t.exige) {
    switch (regra) {
      case 'MIN_6_FOTOS': {
        const n = await tx.foto.count({ where: { ordemId, categoria: 'RECEBIMENTO' } })
        if (n < 6) {
          const faltam = 6 - n
          return faltam === 1
            ? 'Falta 1 foto para dar entrada no equipamento.'
            : `Faltam ${faltam} fotos para dar entrada no equipamento.`
        }
        break
      }
      case 'ASSINATURA_RETIRADA': {
        const a = await tx.assinatura.count({ where: { ordemId, tipo: 'RETIRADA' } })
        if (a === 0) return 'Colete a assinatura do cliente antes de concluir a retirada.'
        break
      }
      case 'ASSINATURA_ENTREGA': {
        const a = await tx.assinatura.count({ where: { ordemId, tipo: 'ENTREGA' } })
        if (a === 0) return 'Colete a assinatura de quem recebeu antes de concluir a entrega.'
        break
      }
      case 'DIAGNOSTICO': {
        const o = await tx.ordem.findUnique({
          where: { id: ordemId },
          select: { diagnostico: true },
        })
        if (!o?.diagnostico?.trim()) {
          return 'Escreva o diagnóstico antes de mandar o orçamento para revisão.'
        }
        break
      }
      case 'ORCAMENTO_APROVADO': {
        const o = await tx.orcamento.count({ where: { ordemId, status: 'APROVADO' } })
        if (o === 0) return 'A manutenção só começa depois do cliente aprovar o orçamento.'
        break
      }
      case 'FATURA_QUITADA': {
        const f = await tx.fatura.findUnique({
          where: { ordemId },
          select: { status: true, valorTotalCentavos: true, valorPagoCentavos: true },
        })
        if (!f) return 'Emita a fatura antes de faturar a ordem.'
        if (f.status !== 'QUITADA') {
          const falta = f.valorTotalCentavos - f.valorPagoCentavos
          return `Ainda faltam ${(falta / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })} para quitar a fatura.`
        }
        break
      }
    }
  }
  return null
}

/**
 * Marcos de tempo por etapa.
 *
 * São redundantes com a linha do tempo de propósito: alimentam os indicadores
 * do painel sem varrer a tabela de eventos a cada carregamento de tela.
 */
/**
 * Sincroniza a parada do motorista com a etapa da ordem.
 *
 * Sem isto, o agendamento ficava `ATRIBUIDO` para sempre. Na tela do motorista
 * o efeito era ruim de um jeito específico: a rota do dia **nunca andava**. Ele
 * coletava o aparelho, a ordem seguia para a oficina, e a parada continuava lá
 * com o botão "Cheguei · coletar assinatura" — convidando a coletar de novo o
 * que já estava na bancada. O contador do topo dizia "8 paradas · 0 concluídas"
 * o dia inteiro.
 *
 * Fica no motor, e não na ação do app, de propósito: a coleta também acontece
 * pelo correio (a central marca COLETADO sem motorista nenhum), e a entrega
 * pode ser fechada pela central. Amarrando à ETAPA, todos os caminhos fecham a
 * parada — inclusive os que ainda não existem.
 */
async function fecharAgendamento(
  tx: Transacao,
  ordemId: string,
  etapa: EtapaOrdem,
  agora: Date,
): Promise<void> {
  const emRota =
    etapa === EtapaOrdem.EM_ROTA_RETIRADA
      ? 'RETIRADA'
      : etapa === EtapaOrdem.EM_ROTA_ENTREGA
        ? 'ENTREGA'
        : null

  if (emRota) {
    await tx.agendamento.updateMany({
      where: { ordemId, tipo: emRota, status: { in: ['PENDENTE', 'ATRIBUIDO'] } },
      data: { status: 'EM_ROTA', iniciadoEm: agora },
    })
    return
  }

  const concluido =
    etapa === EtapaOrdem.COLETADO
      ? 'RETIRADA'
      : etapa === EtapaOrdem.ENTREGUE
        ? 'ENTREGA'
        : null

  if (concluido) {
    await tx.agendamento.updateMany({
      where: { ordemId, tipo: concluido, status: { in: ['PENDENTE', 'ATRIBUIDO', 'EM_ROTA'] } },
      data: { status: 'CONCLUIDO', concluidoEm: agora },
    })
    return
  }

  // Ordem cancelada com parada marcada: o motorista não pode sair para buscar
  // um aparelho que ninguém mais quer.
  if (etapa === EtapaOrdem.CANCELADO) {
    await tx.agendamento.updateMany({
      where: { ordemId, status: { in: ['PENDENTE', 'ATRIBUIDO', 'EM_ROTA'] } },
      data: { status: 'CANCELADO', motivoFalha: 'Ordem cancelada' },
    })
  }
}

function marcosDe(etapa: EtapaOrdem, agora: Date): Record<string, Date> {
  const m: Record<EtapaOrdem, string | null> = {
    SOLICITACAO_RECEBIDA: null,
    ORDEM_RETIRADA_GERADA: null,
    RETIRADA_AGENDADA: null,
    EM_ROTA_RETIRADA: null,
    COLETADO: 'coletadaEm',
    RECEBIDO_NA_EMPRESA: 'recebidaEm',
    EM_ANALISE: null,
    ORCAMENTO_INTERNO: null,
    ORCAMENTO_ENVIADO: 'orcadaEm',
    ORCAMENTO_APROVADO: 'aprovadaEm',
    ORCAMENTO_REPROVADO: null,
    EM_MANUTENCAO: null,
    MANUTENCAO_CONCLUIDA: 'concluidaEm',
    APROVACAO_GESTAO: null,
    FATURAMENTO: null,
    FATURADO: 'faturadaEm',
    EM_ROTA_ENTREGA: null,
    ENTREGUE: 'entregueEm',
    FINALIZADO: 'finalizadaEm',
    DEVOLVIDO_SEM_REPARO: null,
    CANCELADO: 'finalizadaEm',
  }
  const campo = m[etapa]
  return campo ? { [campo]: agora } : {}
}

/**
 * Coloca um job na fila.
 *
 * `dedupeKey` é único no banco: se a mesma transação for repetida por retry,
 * o insert falha e a transação inteira volta atrás, em vez de o cliente
 * receber a mesma mensagem duas vezes. Usamos `createMany` com `skipDuplicates`
 * porque aqui a repetição é esperada, não é erro.
 */
async function enfileirar(
  tx: Transacao,
  tenantId: string,
  job: {
    tipo: string
    payload: Record<string, unknown>
    prioridade?: number
    dedupeKey?: string
    atrasoMs?: number
  },
) {
  await tx.outboxJob.createMany({
    data: [
      {
        tenantId,
        tipo: job.tipo,
        payload: job.payload as never,
        prioridade: job.prioridade ?? 5,
        dedupeKey: job.dedupeKey ?? null,
        agendadoPara: new Date(Date.now() + (job.atrasoMs ?? 0)),
      },
    ],
    skipDuplicates: true,
  })
}

/** Exposto para outros módulos enfileirarem dentro da própria transação. */
export { enfileirar }

/**
 * Confere a cadeia de hash de uma ordem, do primeiro evento ao último.
 *
 * É o que transforma o histórico de anotação em prova: se alguém editar um
 * evento antigo direto no banco, o hash daquele evento deixa de bater e todos
 * os seguintes ficam órfãos. O relatório final mostra exatamente onde quebrou.
 */
export async function verificarIntegridade(
  ctx: ContextoAcesso,
  ordemId: string,
): Promise<{ integra: boolean; quebrouNaSequencia?: number; total: number }> {
  return comEscopo(ctx, async (tx) => {
    const eventos = await tx.eventoOrdem.findMany({
      where: { ordemId },
      orderBy: { sequencia: 'asc' },
    })

    let anterior: string | null = null
    for (const e of eventos) {
      const esperado = hashEvento({
        ordemId: e.ordemId,
        sequencia: e.sequencia,
        etapaNova: e.etapaNova,
        tipo: e.tipo,
        autorId: e.autorId,
        criadoEm: e.criadoEm,
        payload: e.payload,
        hashAnterior: anterior,
      })
      if (esperado !== e.hash || e.hashAnterior !== anterior) {
        return { integra: false, quebrouNaSequencia: e.sequencia, total: eventos.length }
      }
      anterior = e.hash
    }
    return { integra: true, total: eventos.length }
  })
}
