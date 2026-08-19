import { comEscopo, type ContextoAcesso, type Transacao } from '@/lib/db'

/**
 * A garantia do serviço.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEIO A IDEIA
 * ---------------------------------------------------------------------------
 * Do desenho de dois ERPs abertos, traduzido para o que uma assistência técnica
 * de fato faz:
 *
 *  • o Odoo carrega um `under_warranty` na ordem de reparo — um sim/não que
 *    muda o que se cobra;
 *  • o ERPNext vai além e guarda a DATA de vencimento no equipamento
 *    (`warranty_expiry_date`), com um estado de cobertura ao lado.
 *
 * Nenhum dos dois foi copiado: o deles é Python sobre um ERP genérico, com
 * armazém, unidade de medida e centro de custo no meio do caminho. Aqui a
 * pergunta é uma só, e ela é local — "este aparelho voltou dentro do prazo do
 * serviço que a gente mesmo fez?".
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É DINHEIRO, E NÃO CADASTRO
 * ---------------------------------------------------------------------------
 * "Voltou em garantia" acontece toda semana numa assistência, e é o que decide
 * se cobra ou não. Antes, a data não existia em lugar nenhum do sistema: o
 * prazo era um número no PDF do orçamento e a decisão ficava na memória de quem
 * estava no balcão. O sistema faturaria um retorno em garantia sem piscar.
 */

export type Cobertura = {
  /** Está coberto agora. */
  cobre: boolean
  /** Até quando. Nulo quando nunca houve serviço entregue neste aparelho. */
  ate: Date | null
  /** Quantos dias ainda faltam. Negativo quando já venceu. */
  diasRestantes: number | null
  /** A ordem que deu a garantia. */
  ordem: { id: string; numero: number } | null
}

const DIA = 86_400_000

/**
 * O serviço mais recente ainda na garantia para este equipamento.
 *
 * Olha o EQUIPAMENTO, não o cliente: a garantia é do conserto que foi feito
 * naquele aparelho. Se a clínica trocar de dono, o aparelho continua coberto —
 * e é isso que qualquer pessoa espera de uma garantia.
 */
export async function coberturaDoEquipamento(
  tx: Transacao,
  equipamentoId: string,
  quando: Date = new Date(),
  ignorarOrdemId?: string,
): Promise<Cobertura> {
  const anterior = await tx.ordem.findFirst({
    where: {
      equipamentoId,
      garantiaAte: { gt: quando },
      ...(ignorarOrdemId ? { id: { not: ignorarOrdemId } } : {}),
    },
    orderBy: { garantiaAte: 'desc' },
    select: { id: true, numero: true, garantiaAte: true },
  })

  if (!anterior?.garantiaAte) {
    return { cobre: false, ate: null, diasRestantes: null, ordem: null }
  }

  return {
    cobre: true,
    ate: anterior.garantiaAte,
    diasRestantes: Math.ceil((anterior.garantiaAte.getTime() - quando.getTime()) / DIA),
    ordem: { id: anterior.id, numero: anterior.numero },
  }
}

/** A mesma pergunta, com escopo próprio, para quem chama de fora de uma transação. */
export function coberturaDe(
  ctx: ContextoAcesso,
  equipamentoId: string,
  ignorarOrdemId?: string,
): Promise<Cobertura> {
  return comEscopo(ctx, (tx) => coberturaDoEquipamento(tx, equipamentoId, new Date(), ignorarOrdemId))
}

/**
 * O texto que vai para a tela.
 *
 * Uma data crua não decide nada: "24/11/2026" obriga quem lê a fazer a conta de
 * cabeça com o cliente esperando. O que serve é a frase com o número de dias.
 */
export function frasedaCobertura(c: Cobertura): string | null {
  if (!c.cobre || !c.ate || c.diasRestantes == null) return null
  const dia = c.ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  if (c.diasRestantes <= 7) {
    return `Na garantia da O.S. #${String(c.ordem?.numero ?? 0).padStart(4, '0')} — vence em ${c.diasRestantes} dia${c.diasRestantes === 1 ? '' : 's'} (${dia})`
  }
  return `Na garantia da O.S. #${String(c.ordem?.numero ?? 0).padStart(4, '0')} até ${dia} — faltam ${c.diasRestantes} dias`
}
