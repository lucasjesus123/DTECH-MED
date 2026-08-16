import type { FormaPagamento } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso, exigirEmpresa } from '@/lib/db'
import { aplicarBaixa, formatarBRL } from '@/lib/dinheiro'

/**
 * Financeiro.
 *
 * Três invariantes carregam este arquivo, e cada uma existe porque a ausência
 * dela já custou dinheiro em sistemas reais:
 *
 *  1. **A baixa relê o valor pago do banco, dentro da transação.** Somar sobre
 *     o número que estava na tela apaga o pagamento que outro operador
 *     registrou nesse meio-tempo — e o dinheiro some sem deixar rastro.
 *  2. **Uma fatura aceita quantos recebimentos precisar.** Parte em dinheiro
 *     hoje, parte no pix semana que vem. Marcar "pago" no primeiro seria
 *     mentir para o caixa.
 *  3. **Conferir é diferente de pagar.** "Pago" é operacional: alguém
 *     registrou. "Conferido" é gerencial: o dono olhou e validou. Misturar as
 *     duas tira do dono a única checagem que ele realmente controla.
 */

export type ResultadoBaixa =
  | { ok: true; pagoCentavos: number; abertoCentavos: number; quitada: boolean }
  | { ok: false; motivo: string }

export type LinhaPagamento = {
  forma: FormaPagamento
  valorCentavos: number
  parcelas?: number
  bandeira?: string
  autorizacao?: string
  observacao?: string
}

/**
 * Registra um ou mais recebimentos numa fatura.
 *
 * Aceita várias formas de uma vez porque é assim que acontece no balcão: o
 * cliente paga R$ 800 no pix, R$ 400 em dinheiro e o resto no cartão.
 */
export async function darBaixa(
  ctx: ContextoAcesso,
  autor: { id: string | null; nome: string },
  entrada: {
    faturaId: string
    pagamentos: LinhaPagamento[]
    multaCentavos?: number
    jurosCentavos?: number
    taxaCentavos?: number
    recebidoEm?: Date
  },
): Promise<ResultadoBaixa> {
  if (!entrada.pagamentos.length) {
    return { ok: false, motivo: 'Informe ao menos uma forma de pagamento.' }
  }
  for (const p of entrada.pagamentos) {
    if (!Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0) {
      return { ok: false, motivo: 'Todo valor recebido precisa ser maior que zero.' }
    }
  }

  return comEscopo(ctx, async (tx) => {
    // Bloqueio de linha + releitura: é isto que impede a corrida entre dois
    // operadores com a mesma fatura aberta.
    const travadas = await tx.$queryRaw<
      Array<{
        id: string
        valorTotalCentavos: number
        valorPagoCentavos: number
        multaCentavos: number
        jurosCentavos: number
        status: string
      }>
    >`
      SELECT id, "valorTotalCentavos", "valorPagoCentavos", "multaCentavos",
             "jurosCentavos", status
        FROM faturas
       WHERE id = ${entrada.faturaId} AND "tenantId" = ${ctx.tenantId}
         FOR UPDATE
    `
    const f = travadas[0]
    if (!f) return { ok: false, motivo: 'Fatura não encontrada.' }
    if (f.status === 'CANCELADA') return { ok: false, motivo: 'Esta fatura foi cancelada.' }

    const multa = entrada.multaCentavos ?? f.multaCentavos
    const juros = entrada.jurosCentavos ?? f.jurosCentavos

    const r = aplicarBaixa({
      valorTotalCentavos: f.valorTotalCentavos,
      // Do banco, agora — nunca do que veio da tela.
      pagoAtualCentavos: f.valorPagoCentavos,
      novos: entrada.pagamentos,
      multaCentavos: multa,
      jurosCentavos: juros,
    })

    const quando = entrada.recebidoEm ?? new Date()
    for (const p of entrada.pagamentos) {
      await tx.pagamento.create({
        data: {
          tenantId: exigirEmpresa(ctx),
          faturaId: f.id,
          forma: p.forma,
          valorCentavos: p.valorCentavos,
          parcelas: p.parcelas ?? 1,
          bandeira: p.bandeira ?? null,
          autorizacao: p.autorizacao ?? null,
          observacao: p.observacao ?? null,
          recebidoEm: quando,
          autorId: autor.id,
          autorNome: autor.nome,
        },
      })
    }

    await tx.fatura.update({
      where: { id: f.id },
      data: {
        valorPagoCentavos: r.pagoCentavos,
        multaCentavos: multa,
        jurosCentavos: juros,
        // A taxa é custo nosso, em coluna própria: sem ela separada não há como
        // conciliar com o extrato da maquininha nem saber o recebido líquido.
        ...(entrada.taxaCentavos != null ? { taxaCentavos: entrada.taxaCentavos } : {}),
        status: r.quitada ? 'QUITADA' : 'PARCIAL',
        quitadaEm: r.quitada ? quando : null,
      },
    })

    return { ok: true, ...r }
  })
}

/**
 * Estorna um recebimento.
 *
 * A linha permanece, marcada como estornada. Apagar o pagamento faria o caixa
 * fechar, mas destruiria a explicação de por que ele fechou — e é justamente
 * essa explicação que o contador pede.
 */
export async function estornar(
  ctx: ContextoAcesso,
  pagamentoId: string,
  motivo: string,
): Promise<ResultadoBaixa> {
  return comEscopo(ctx, async (tx) => {
    const p = await tx.pagamento.findUnique({ where: { id: pagamentoId } })
    if (!p) return { ok: false, motivo: 'Pagamento não encontrado.' }
    if (p.estornadoEm) return { ok: false, motivo: 'Este pagamento já foi estornado.' }

    await tx.pagamento.update({
      where: { id: pagamentoId },
      data: { estornadoEm: new Date(), motivoEstorno: motivo },
    })

    const f = await tx.fatura.findUnique({ where: { id: p.faturaId } })
    if (!f) return { ok: false, motivo: 'Fatura não encontrada.' }

    const pago = Math.max(0, f.valorPagoCentavos - p.valorCentavos)
    const devido = f.valorTotalCentavos + f.multaCentavos + f.jurosCentavos
    const quitada = pago + 1 >= devido

    await tx.fatura.update({
      where: { id: f.id },
      data: {
        valorPagoCentavos: pago,
        status: quitada ? 'QUITADA' : pago > 0 ? 'PARCIAL' : 'ABERTA',
        quitadaEm: quitada ? f.quitadaEm : null,
        // Estorno derruba a conferência: o gestor precisa olhar de novo.
        conferido: false,
        conferidoEm: null,
        conferidoPorId: null,
        conferidoPorNome: null,
      },
    })

    return { ok: true, pagoCentavos: pago, abertoCentavos: Math.max(0, devido - pago), quitada }
  })
}

/**
 * Conferência do gestor — a etapa 16 da linha do tempo.
 *
 * A empresa-alvo é lida da PRÓPRIA LINHA, nunca de parâmetro do cliente. Se o
 * tenant viesse do corpo do request, qualquer um trocaria o id e conferiria
 * conta de outra franquia. O RLS já barra, mas a regra não pode depender só
 * de uma camada.
 */
export async function conferir(
  ctx: ContextoAcesso,
  autor: { id: string; nome: string },
  faturaId: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  return comEscopo(ctx, async (tx) => {
    const f = await tx.fatura.findUnique({
      where: { id: faturaId },
      select: { id: true, status: true, conferido: true },
    })
    if (!f) return { ok: false, motivo: 'Fatura não encontrada.' }
    if (f.conferido) return { ok: false, motivo: 'Esta fatura já foi conferida.' }
    if (f.status !== 'QUITADA') {
      return { ok: false, motivo: 'Só dá para conferir depois que a fatura estiver quitada.' }
    }

    await tx.fatura.update({
      where: { id: f.id },
      data: {
        conferido: true,
        conferidoEm: new Date(),
        conferidoPorId: autor.id,
        conferidoPorNome: autor.nome,
      },
    })
    return { ok: true }
  })
}

/** Emite a fatura da ordem a partir do orçamento aprovado. */
export async function emitirFatura(
  ctx: ContextoAcesso,
  ordemId: string,
  vencimento?: Date,
): Promise<{ ok: true; faturaId: string; total: string } | { ok: false; motivo: string }> {
  return comEscopo(ctx, async (tx) => {
    const existente = await tx.fatura.findUnique({ where: { ordemId } })
    if (existente) return { ok: false, motivo: 'Esta ordem já tem fatura emitida.' }

    const ordem = await tx.ordem.findUnique({
      where: { id: ordemId },
      select: { clienteId: true },
    })
    if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

    const orc = await tx.orcamento.findFirst({
      where: { ordemId, status: 'APROVADO' },
      orderBy: { versao: 'desc' },
    })
    if (!orc) return { ok: false, motivo: 'Não há orçamento aprovado para faturar.' }

    // Numeração por empresa, com bloqueio de linha: duas faturas emitidas ao
    // mesmo tempo não podem receber o mesmo número.
    const numero = await proximoNumero(tx, exigirEmpresa(ctx), 'fatura')

    const f = await tx.fatura.create({
      data: {
        tenantId: exigirEmpresa(ctx),
        ordemId,
        clienteId: ordem.clienteId,
        numero,
        valorTotalCentavos: orc.totalCentavos,
        vencimento: vencimento ?? null,
      },
    })
    return { ok: true, faturaId: f.id, total: formatarBRL(orc.totalCentavos) }
  })
}

/**
 * Próximo número sequencial da empresa.
 *
 * Sequence global do Postgres daria números únicos, mas a franquia A veria a
 * ordem pular de 41 para 87 porque a B emitiu no meio — e isso levanta
 * pergunta do contador. Contador por empresa resolve, com bloqueio para não
 * repetir sob concorrência.
 */
export async function proximoNumero(
  tx: Parameters<Parameters<typeof comEscopo>[1]>[0],
  tenantId: string,
  chave: 'ordem' | 'orcamento' | 'fatura',
): Promise<number> {
  const r = await tx.$queryRaw<Array<{ valor: number }>>`
    INSERT INTO contadores ("tenantId", chave, valor)
         VALUES (${tenantId}, ${chave}, 1)
    ON CONFLICT ("tenantId", chave)
      DO UPDATE SET valor = contadores.valor + 1
      RETURNING valor
  `
  return r[0]!.valor
}
