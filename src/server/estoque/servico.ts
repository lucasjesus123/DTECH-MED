import { Prisma } from '@/generated/prisma/client'
import { TipoMovimentoEstoque as TM } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso, type Transacao } from '@/lib/db'

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
    Array<{ id: string; nome: string; saldo: string; saldoReservado: string; custoMedioCentavos: number }>
  >`
    SELECT id, nome, saldo, "saldoReservado", "custoMedioCentavos"
      FROM pecas
     WHERE id = ${dados.pecaId} AND "tenantId" = ${tenantId}
       FOR UPDATE
  `
  const peca = travadas[0]
  if (!peca) return { ok: false, motivo: 'Peça não encontrada.' }

  const saldo = Number(peca.saldo)
  const reservado = Number(peca.saldoReservado)
  const q = dados.quantidade

  let novoSaldo = saldo
  let novoReservado = reservado
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
      const r = await movimentar(tx, ctx.tenantId!, autor, {
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
 * Consome as peças reservadas quando o técnico inicia a execução.
 * A partir daqui elas saíram fisicamente da prateleira.
 */
export async function consumirNaExecucao(
  ctx: ContextoAcesso,
  autor: Autor,
  ordemId: string,
): Promise<{ ok: true; consumidas: number } | { ok: false; motivo: string }> {
  return comEscopo(ctx, async (tx) => {
    const reservas = await tx.movimentoEstoque.findMany({
      where: { ordemId, tipo: TM.RESERVA },
    })
    let n = 0
    for (const r of reservas) {
      const m = await movimentar(tx, ctx.tenantId!, autor, {
        pecaId: r.pecaId,
        tipo: TM.SAIDA,
        quantidade: Number(r.quantidade),
        ordemId,
        motivo: 'Consumo na execução do serviço',
      })
      if (!m.ok) throw new Error(m.motivo)
      n++
    }
    return { ok: true as const, consumidas: n }
  }).catch((e: Error) => ({ ok: false as const, motivo: e.message }))
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
      await movimentar(tx, ctx.tenantId!, autor, {
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
