import { Prisma } from '@/generated/prisma/client'
import { TipoMovimentoEstoque as TM } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso, type Transacao, exigirEmpresa } from '@/lib/db'

/**
 * Estoque.
 *
 * A regra que organiza tudo: **o saldo da peça é consequência, nunca um número
 * digitado**. Ele sai da soma dos movimentos. Deixar alguém corrigir o saldo à
 * mão parece prático até a primeira divergência, quando não há como saber se
 * faltou peça, se alguém levou, ou se foi erro de digitação.
 *
 * E o estoque não é um módulo paralelo: a reserva nasce quando o cliente
 * aprova o orçamento, e a saída quando o técnico começa a execução. Ninguém
 * precisa lembrar de dar baixa — é o motor da linha do tempo que aciona.
 */

export type ResultadoMovimento =
  | { ok: true; saldo: number; saldoReservado: number }
  | { ok: false; motivo: string }

type Autor = { id: string | null; nome: string }

/**
 * Aplica um movimento e recalcula o saldo, tudo na mesma transação.
 *
 * `SELECT ... FOR UPDATE` na peça é o que impede duas O.S. reservarem a última
 * unidade ao mesmo tempo. Sem o bloqueio de linha, as duas leem saldo 1, as
 * duas acham que dá, e o estoque fica negativo.
 */
export async function movimentar(
  tx: Transacao,
  tenantId: string,
  autor: Autor,
  dados: {
    pecaId: string
    tipo: TM
    quantidade: number
    ordemId?: string | null
    motivo?: string
    custoUnitCentavos?: number
    documentoFiscal?: string
  },
): Promise<ResultadoMovimento> {
  if (dados.quantidade <= 0) {
    return { ok: false, motivo: 'A quantidade precisa ser maior que zero.' }
  }

  const travadas = await tx.$queryRaw<
    Array<{
      id: string
      nome: string
      saldo: string
      saldoReservado: string
      saldoEmprestado: string
      custoMedioCentavos: number
    }>
  >`
    SELECT id, nome, saldo, "saldoReservado", "saldoEmprestado", "custoMedioCentavos"
      FROM pecas
     WHERE id = ${dados.pecaId} AND "tenantId" = ${tenantId}
       FOR UPDATE
  `
  const peca = travadas[0]
  if (!peca) return { ok: false, motivo: 'Peça não encontrada.' }

  const saldo = Number(peca.saldo)
  const reservado = Number(peca.saldoReservado)
  const emprestado = Number(peca.saldoEmprestado)
  const q = dados.quantidade

  let novoSaldo = saldo
  let novoReservado = reservado
  let novoEmprestado = emprestado
  let novoCusto = peca.custoMedioCentavos

  switch (dados.tipo) {
    case TM.ENTRADA: {
      novoSaldo = saldo + q
      // Custo médio ponderado: é o que faz o relatório de margem parar de
      // mentir quando a mesma peça é comprada por preços diferentes.
      if (dados.custoUnitCentavos != null && novoSaldo > 0) {
        novoCusto = Math.round(
          (saldo * peca.custoMedioCentavos + q * dados.custoUnitCentavos) / novoSaldo,
        )
      }
      break
    }

    case TM.RESERVA: {
      // Só dá para reservar o que está livre: o já reservado pertence a outra
      // O.S. aprovada, e "roubar" essa peça atrasaria um serviço já vendido.
      const livre = saldo - reservado
      if (q > livre) {
        return {
          ok: false,
          motivo:
            livre <= 0
              ? `Não há "${peca.nome}" livre em estoque. ${reservado} ${reservado === 1 ? 'unidade está reservada' : 'unidades estão reservadas'} para outras ordens.`
              : `Só ${livre} de "${peca.nome}" ${livre === 1 ? 'está livre' : 'estão livres'}. O restante está reservado para outras ordens.`,
        }
      }
      novoReservado = reservado + q
      break
    }

    case TM.LIBERACAO: {
      novoReservado = Math.max(0, reservado - q)
      break
    }

    case TM.SAIDA: {
      if (q > saldo) {
        return { ok: false, motivo: `Estoque insuficiente de "${peca.nome}": há ${saldo} em mãos.` }
      }
      novoSaldo = saldo - q
      // A saída consome a própria reserva, se houver.
      novoReservado = Math.max(0, reservado - q)
      break
    }

    case TM.PERDA: {
      if (q > saldo) return { ok: false, motivo: `Não há ${q} de "${peca.nome}" para baixar.` }
      novoSaldo = saldo - q
      break
    }

    case TM.AJUSTE: {
      // No ajuste, `quantidade` é o saldo contado no inventário, não o delta.
      novoSaldo = q
      break
    }

    /**
     * =======================================================================
     * EMPRÉSTIMO E DEVOLUÇÃO NÃO MEXEM NO SALDO — de propósito
     * =======================================================================
     * A ferramenta emprestada continua sendo da empresa. O que muda é o LUGAR
     * dela, e por isso `saldoEmprestado` é irmão de `saldoReservado`:
     *
     *     disponível = saldo − reservado − emprestado
     *
     * Baixar o saldo faria a ferramenta desaparecer do sistema no dia em que
     * alguém a levou — que é exatamente o defeito que este par conserta. Uma
     * chave de fenda que sai com o técnico não foi consumida.
     */
    case TM.EMPRESTIMO: {
      const livre = saldo - reservado - emprestado
      if (q > livre) {
        return {
          ok: false,
          motivo:
            livre <= 0
              ? `Não há "${peca.nome}" disponível: ${emprestado} ${emprestado === 1 ? 'está' : 'estão'} com alguém e ${reservado} ${reservado === 1 ? 'está reservada' : 'estão reservadas'}.`
              : `Só ${livre} de "${peca.nome}" ${livre === 1 ? 'está disponível' : 'estão disponíveis'} para sair.`,
        }
      }
      novoEmprestado = emprestado + q
      break
    }

    case TM.DEVOLUCAO: {
      // `Math.max` porque devolver mais do que consta emprestado é erro de
      // digitação, não motivo para deixar o número negativo no banco.
      novoEmprestado = Math.max(0, emprestado - q)
      break
    }
  }

  await tx.movimentoEstoque.create({
    data: {
      tenantId,
      pecaId: dados.pecaId,
      ordemId: dados.ordemId ?? null,
      tipo: dados.tipo,
      quantidade: new Prisma.Decimal(dados.tipo === TM.AJUSTE ? q - saldo : q),
      saldoAnterior: new Prisma.Decimal(saldo),
      saldoPosterior: new Prisma.Decimal(novoSaldo),
      custoUnitCentavos: dados.custoUnitCentavos ?? peca.custoMedioCentavos,
      motivo: dados.motivo ?? null,
      documentoFiscal: dados.documentoFiscal ?? null,
      autorId: autor.id,
      autorNome: autor.nome,
    },
  })

  await tx.peca.update({
    where: { id: dados.pecaId },
    data: {
      saldo: new Prisma.Decimal(novoSaldo),
      saldoReservado: new Prisma.Decimal(novoReservado),
      saldoEmprestado: new Prisma.Decimal(novoEmprestado),
      custoMedioCentavos: novoCusto,
    },
  })

  return { ok: true, saldo: novoSaldo, saldoReservado: novoReservado }
}

/**
 * Reserva todas as peças de um orçamento aprovado.
 *
 * Chamado pelo motor no instante da aprovação. Se qualquer peça faltar, a
 * transação inteira volta atrás — reservar metade deixaria a O.S. num estado
 * que ninguém consegue explicar depois.
 */
export async function reservarDoOrcamento(
  ctx: ContextoAcesso,
  autor: Autor,
  orcamentoId: string,
): Promise<{ ok: true; reservadas: number } | { ok: false; motivo: string }> {
  return comEscopo(ctx, async (tx) => {
    const itens = await tx.orcamentoItem.findMany({
      where: { orcamentoId, tipo: 'PECA', pecaId: { not: null } },
      include: { orcamento: { select: { ordemId: true } } },
    })

    let n = 0
    for (const i of itens) {
      const r = await movimentar(tx, exigirEmpresa(ctx), autor, {
        pecaId: i.pecaId!,
        tipo: TM.RESERVA,
        quantidade: Number(i.quantidade),
        ordemId: i.orcamento.ordemId,
        motivo: 'Reserva automática pela aprovação do orçamento',
      })
      if (!r.ok) throw new Error(r.motivo)
      n++
    }
    return { ok: true as const, reservadas: n }
  }).catch((e: Error) => ({ ok: false as const, motivo: e.message }))
}

/**
 * Baixa as peças reservadas, DENTRO de uma transação já aberta.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA VERSÃO EXISTE
 * ---------------------------------------------------------------------------
 * A baixa precisa acontecer no mesmo instante em que a ordem entra em
 * manutenção, e a etapa muda dentro da transação do motor. Chamar a versão de
 * fora abriria uma segunda transação: se ela falhasse, a ordem teria avançado
 * e o estoque não — que é exatamente o tipo de divergência que o razão de
 * estoque existe para impedir.
 *
 * É idempotente por construção: consome apenas as RESERVAS que ainda não têm
 * SAÍDA correspondente. Reprocessar a mesma etapa não baixa duas vezes.
 */
export async function consumirNaExecucaoTx(
  tx: Transacao,
  tenantId: string,
  autor: Autor,
  ordemId: string,
): Promise<number> {
  const reservas = await tx.movimentoEstoque.findMany({ where: { ordemId, tipo: TM.RESERVA } })
  if (reservas.length === 0) return 0

  const jaSairam = await tx.movimentoEstoque.findMany({ where: { ordemId, tipo: TM.SAIDA } })
  const baixado = new Map<string, number>()
  for (const s of jaSairam) baixado.set(s.pecaId, (baixado.get(s.pecaId) ?? 0) + Number(s.quantidade))

  let n = 0
  for (const r of reservas) {
    const falta = Number(r.quantidade) - (baixado.get(r.pecaId) ?? 0)
    if (falta <= 0) continue
    const m = await movimentar(tx, tenantId, autor, {
      pecaId: r.pecaId,
      tipo: TM.SAIDA,
      quantidade: falta,
      ordemId,
      motivo: 'Consumo na execução do serviço',
    })
    if (!m.ok) throw new Error(m.motivo)
    baixado.set(r.pecaId, (baixado.get(r.pecaId) ?? 0) + falta)
    n++
  }
  return n
}

/**
 * Consome as peças reservadas quando o técnico inicia a execução.
 * A partir daqui elas saíram fisicamente da prateleira.
 */
export async function consumirNaExecucao(
  ctx: ContextoAcesso,
  autor: Autor,
  ordemId: string,
): Promise<{ ok: true; consumidas: number } | { ok: false; motivo: string }> {
  return comEscopo(ctx, async (tx) => ({
    ok: true as const,
    consumidas: await consumirNaExecucaoTx(tx, exigirEmpresa(ctx), autor, ordemId),
  })).catch((e: Error) => ({ ok: false as const, motivo: e.message }))
}

/** Devolve a reserva quando o orçamento é recusado ou a ordem cancelada. */
export async function liberarReservas(
  ctx: ContextoAcesso,
  autor: Autor,
  ordemId: string,
): Promise<number> {
  return comEscopo(ctx, async (tx) => {
    const reservas = await tx.movimentoEstoque.findMany({
      where: { ordemId, tipo: TM.RESERVA },
    })
    const saidas = await tx.movimentoEstoque.findMany({
      where: { ordemId, tipo: TM.SAIDA },
    })
    // Peça que já saiu não volta por liberação: se precisar voltar, é entrada,
    // e o movimento registra que houve devolução ao estoque.
    const jaSaiu = new Set(saidas.map((s) => s.pecaId))

    let n = 0
    for (const r of reservas) {
      if (jaSaiu.has(r.pecaId)) continue
      await movimentar(tx, exigirEmpresa(ctx), autor, {
        pecaId: r.pecaId,
        tipo: TM.LIBERACAO,
        quantidade: Number(r.quantidade),
        ordemId,
        motivo: 'Liberação por recusa ou cancelamento',
      })
      n++
    }
    return n
  })
}

/** Peças abaixo do mínimo — o alerta que evita a O.S. parar esperando peça. */
export async function abaixoDoMinimo(ctx: ContextoAcesso) {
  return comEscopo(ctx, async (tx) =>
    tx.$queryRaw<Array<{ id: string; sku: string; nome: string; saldo: string; estoqueMinimo: string }>>`
      SELECT id, sku, nome, saldo, "estoqueMinimo"
        FROM pecas
       WHERE "tenantId" = ${ctx.tenantId}
         AND ativo = true
         AND saldo <= "estoqueMinimo"
       ORDER BY (saldo - "estoqueMinimo") ASC, nome ASC
    `,
  )
}
