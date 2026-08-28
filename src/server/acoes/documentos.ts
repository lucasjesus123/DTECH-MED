'use server'

import { revalidatePath } from 'next/cache'
import { Papel, type TipoDocumento } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { gerarPdfDaOrdem } from '@/server/documentos/gerar'

/**
 * EMITIR UM DOCUMENTO SOB DEMANDA.
 *
 * =============================================================================
 * POR QUE ESTES DOIS SÃO PEDIDOS, E NÃO AUTOMÁTICOS
 * =============================================================================
 * Os outros documentos nascem sozinhos, disparados pela esteira: a ordem de
 * retirada quando a coleta é agendada, o recibo quando a fatura é quitada. Eles
 * acompanham fatos que sempre acontecem.
 *
 * Contrato de prestação e nota promissória não. O contrato só é preciso quando
 * o cliente é hospital ou órgão público e o setor de compras exige instrumento
 * assinado; a nota promissória, quando o cliente leva o aparelho e paga depois.
 * Emitir os dois em toda ordem encheria a pasta de papel que ninguém pediu — e
 * uma nota promissória gerada sem necessidade é um TÍTULO DE CRÉDITO solto, com
 * o valor da dívida escrito nele.
 *
 * =============================================================================
 * QUEM EMITE
 * =============================================================================
 * Do FINANCEIRO para cima. Os dois documentos obrigam o cliente — um em
 * contrato, outro em título — e assinar em nome da empresa não é trabalho de
 * bancada nem de balcão.
 *
 * =============================================================================
 * O VALOR NUNCA É DIGITADO
 * =============================================================================
 * Ele vem da fatura, ou do orçamento aprovado quando ainda não há fatura. Um
 * campo de valor aqui seria a porta para cobrar diferente do que foi combinado
 * — e, na nota promissória, para emitir um título por uma quantia que o cliente
 * nunca aprovou.
 */

type Resposta = { ok: true; mensagem: string } | { ok: false; motivo: string }

const PODE_EMITIR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.FINANCEIRO,
]

/** Só estes dois. Os demais nascem da esteira e não se pedem à mão. */
const SOB_DEMANDA: TipoDocumento[] = ['CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA']

const NOME: Record<string, string> = {
  CONTRATO_PRESTACAO: 'Contrato de prestação de serviço',
  NOTA_PROMISSORIA: 'Nota promissória',
}

export async function emitirDocumento(ordemId: string, tipo: string): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_EMITIR.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não emite contrato nem nota promissória.' }
  }
  if (!SOB_DEMANDA.includes(tipo as TipoDocumento)) {
    return { ok: false, motivo: 'Este documento não é emitido à mão — ele nasce da esteira.' }
  }

  const ctx = contextoDe(sessao)
  let tenantId: string
  try {
    tenantId = exigirEmpresa(ctx)
  } catch {
    return { ok: false, motivo: 'Você está fora de uma empresa. Entre numa empresa para emitir.' }
  }

  // A ORDEM É CONFERIDA DENTRO DO ESCOPO ANTES DE GERAR. `gerarPdfDaOrdem`
  // monta o próprio contexto a partir do tenantId que recebe; sem esta leitura,
  // um id de outra franquia chegaria lá dentro e a checagem dependeria de um
  // detalhe daquela função. Aqui a recusa é explícita e local.
  const ordem = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: ordemId },
      select: {
        id: true,
        numero: true,
        fatura: {
          select: {
            valorTotalCentavos: true,
            valorPagoCentavos: true,
            multaCentavos: true,
            jurosCentavos: true,
          },
        },
        orcamentos: {
          where: { status: 'APROVADO' },
          orderBy: { versao: 'desc' },
          take: 1,
          select: { totalCentavos: true },
        },
      },
    }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

  /**
   * OS DOIS DOCUMENTOS OLHAM NÚMEROS DIFERENTES, E ISSO É O PONTO.
   *
   * O CONTRATO vale o serviço combinado: é o valor TOTAL, e ele não muda quando
   * o cliente paga — um contrato de dez mil continua sendo de dez mil depois de
   * quitado.
   *
   * A NOTA PROMISSÓRIA é promessa do que AINDA SE DEVE: é o saldo em ABERTO.
   * Emiti-la pelo total transformaria um título em cobrança de coisa já paga.
   *
   * A primeira versão errou exatamente aqui: a trava conferia o total e o PDF
   * imprimia o saldo. Numa ordem já quitada a trava aprovava (total = 1.795,00)
   * e saía uma nota promissória de R$ 0,00, com "ZERO REAL" por extenso no
   * meio da folha. Um título sem objeto, assinável.
   *
   * Agora o número que a trava confere é O MESMO que o documento imprime.
   */
  const total = ordem.fatura?.valorTotalCentavos ?? ordem.orcamentos[0]?.totalCentavos ?? 0
  const emAberto = ordem.fatura
    ? ordem.fatura.valorTotalCentavos +
      ordem.fatura.multaCentavos +
      ordem.fatura.jurosCentavos -
      ordem.fatura.valorPagoCentavos
    : total

  const valor = tipo === 'NOTA_PROMISSORIA' ? emAberto : total

  if (valor <= 0) {
    return {
      ok: false,
      motivo:
        tipo === 'NOTA_PROMISSORIA'
          ? 'Não há saldo em aberto nesta ordem. Nota promissória é promessa de pagamento — sem dívida, ela sairia zerada.'
          : 'Esta ordem ainda não tem valor aprovado. O contrato sai com o valor do orçamento — sem ele, sairia zerado.',
    }
  }

  try {
    await gerarPdfDaOrdem({ ordemId, documento: tipo as TipoDocumento }, tenantId)
  } catch (e) {
    return {
      ok: false,
      motivo: `Não foi possível gerar o documento: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
    }
  }

  await auditar(ctx, sessao, {
    acao: 'documento.emitido',
    entidade: 'ordem',
    entidadeId: ordemId,
    detalhes: { tipo, valorCentavos: valor },
  })

  revalidatePath(`/painel/ordens/${ordemId}`)
  return { ok: true, mensagem: `${NOME[tipo] ?? 'Documento'} emitido.` }
}
