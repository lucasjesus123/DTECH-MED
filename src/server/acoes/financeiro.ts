'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel, type FormaPagamento } from '@/generated/prisma/enums'
import { aCentavos } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { conferir, darBaixa, emitirFatura, estornar } from '@/server/financeiro/servico'
import { avancarOrdem } from '@/server/ordem/motor'

/**
 * Financeiro, pela tela.
 *
 * O pagamento fracionado é a razão de a baixa aceitar uma LISTA: o cliente paga
 * R$ 800 no pix, R$ 400 em dinheiro e o resto no cartão, tudo no mesmo balcão.
 * Registrar isso como um pagamento só apagaria a informação de que parte entrou
 * na conta e parte ficou no caixa — e é justamente essa separação que o
 * fechamento do dia precisa.
 *
 * A conferência do gestor é uma ação à parte, de propósito. "Pago" é
 * operacional; "conferido" é gerencial. Fundir as duas tira do dono a única
 * checagem que ele de fato controla.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const PODE_RECEBER: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.FINANCEIRO]
const PODE_CONFERIR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel } }
}

const linha = z.object({
  forma: z.enum(['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE']),
  valor: z.coerce.number().positive(),
  parcelas: z.coerce.number().int().min(1).max(24).default(1),
  bandeira: z.string().trim().nullish(),
  autorizacao: z.string().trim().nullish(),
})

const schemaBaixa = z.object({
  faturaId: z.string().min(1),
  ordemId: z.string().min(1),
  pagamentosJson: z.string(),
  multa: z.coerce.number().min(0).default(0),
  juros: z.coerce.number().min(0).default(0),
  taxa: z.coerce.number().min(0).default(0),
})

/**
 * Registra os recebimentos e, se a fatura fechou, avança a ordem.
 *
 * A ordem só passa a FATURADO quando o motor confirma a pré-condição
 * FATURA_QUITADA lendo o banco. Confiar no retorno da baixa aqui seria confiar
 * numa leitura que já ficou velha.
 */
export async function receber(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_RECEBER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não registra recebimento.' }
  }

  const d = schemaBaixa.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  let brutos: unknown
  try {
    brutos = JSON.parse(v.pagamentosJson)
  } catch {
    return { ok: false, motivo: 'Não foi possível ler as formas de pagamento.' }
  }
  const linhas = z.array(linha).min(1, 'Informe ao menos uma forma de pagamento.').safeParse(brutos)
  if (!linhas.success) return { ok: false, motivo: linhas.error.issues[0]!.message }

  const r = await darBaixa(a.ctx, { id: a.sessao.userId, nome: a.sessao.nome }, {
    faturaId: v.faturaId,
    pagamentos: linhas.data.map((l) => ({
      forma: l.forma as FormaPagamento,
      valorCentavos: aCentavos(l.valor),
      parcelas: l.parcelas,
      bandeira: l.bandeira || undefined,
      autorizacao: l.autorizacao || undefined,
    })),
    multaCentavos: aCentavos(v.multa),
    jurosCentavos: aCentavos(v.juros),
    taxaCentavos: aCentavos(v.taxa),
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'financeiro.recebimento',
    entidade: 'fatura',
    entidadeId: v.faturaId,
    detalhes: { formas: linhas.data.length, quitada: r.quitada },
  })

  let mensagem = r.quitada
    ? 'Fatura quitada.'
    : `Recebimento registrado. Ainda faltam ${(r.abertoCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`

  if (r.quitada) {
    const t = await avancarOrdem(a.ctx, a.ator, {
      ordemId: v.ordemId,
      para: EtapaOrdem.FATURADO,
      payload: { faturaId: v.faturaId, pagoCentavos: r.pagoCentavos },
    })
    // A baixa vale mesmo que a ordem não possa avançar agora: o dinheiro
    // entrou. A pendência aparece na tela e no painel.
    if (!t.ok) mensagem = `Fatura quitada, mas a ordem não avançou: ${t.motivo}`
  }

  revalidatePath('/painel/financeiro')
  revalidatePath(`/painel/ordens/${v.ordemId}`)
  revalidatePath('/painel')
  return { ok: true, mensagem }
}

export async function emitir(ordemId: string, vencimentoISO?: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_RECEBER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não emite fatura.' }
  }

  const vencimento = vencimentoISO ? new Date(`${vencimentoISO}T23:59:00-03:00`) : undefined
  if (vencimento && Number.isNaN(vencimento.getTime())) {
    return { ok: false, motivo: 'Data de vencimento inválida.' }
  }

  const r = await emitirFatura(a.ctx, ordemId, vencimento)
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: 'financeiro.fatura_emitida', entidade: 'ordem', entidadeId: ordemId })
  revalidatePath('/painel/financeiro')
  revalidatePath(`/painel/ordens/${ordemId}`)
  return { ok: true, mensagem: `Fatura emitida no valor de ${r.total}.` }
}

/** Etapa 16: a baixa final do gestor sobre a fatura já quitada. */
export async function conferirFatura(faturaId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONFERIR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'A conferência é da gestão — é ela que fecha o ciclo.' }
  }
  if (!a.sessao.userId) return { ok: false, motivo: 'Sessão sem usuário identificado.' }

  const r = await conferir(a.ctx, { id: a.sessao.userId, nome: a.sessao.nome }, faturaId)
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: 'financeiro.conferida', entidade: 'fatura', entidadeId: faturaId })
  revalidatePath('/painel/financeiro')
  return { ok: true, mensagem: 'Fatura conferida.' }
}

export async function estornarPagamento(pagamentoId: string, motivo: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONFERIR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só a gestão estorna recebimento.' }
  }
  if (!motivo?.trim()) return { ok: false, motivo: 'Escreva o motivo do estorno.' }

  const r = await estornar(a.ctx, pagamentoId, motivo.trim())
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'financeiro.estorno',
    entidade: 'pagamento',
    entidadeId: pagamentoId,
    detalhes: { motivo: motivo.trim() },
  })
  revalidatePath('/painel/financeiro')
  return { ok: true, mensagem: 'Pagamento estornado. A linha continua no caixa, marcada.' }
}
