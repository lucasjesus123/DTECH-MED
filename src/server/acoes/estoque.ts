'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { Papel, TipoMovimentoEstoque } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { aCentavos } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { movimentar } from '@/server/estoque/servico'

/**
 * Cadastro e movimentação de peças, pela tela.
 *
 * O saldo nunca é digitado. Mesmo o inventário entra como movimento de AJUSTE,
 * que registra o delta e quem o fez. Um campo "saldo" editável parece prático
 * até a primeira divergência, quando ninguém consegue dizer se faltou peça, se
 * alguém levou, ou se foi erro de digitação.
 */

type Resposta = { ok: true } | { ok: false; motivo: string }

const PODE_MEXER: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome } }
}

const schemaPeca = z.object({
  id: z.string().nullish(),
  sku: z.string().trim().min(1, 'Informe o código da peça.').max(40),
  nome: z.string().trim().min(2, 'Informe o nome da peça.'),
  categoria: z.string().trim().nullish(),
  aplicacao: z.string().trim().nullish(),
  unidade: z.string().trim().default('UN'),
  localizacao: z.string().trim().nullish(),
  fornecedor: z.string().trim().nullish(),
  custoMedio: z.coerce.number().min(0).default(0),
  precoVenda: z.coerce.number().min(0).default(0),
  estoqueMinimo: z.coerce.number().min(0).default(0),
})

export async function salvarPeca(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não cadastra peça.' }
  }

  const d = schemaPeca.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const jaExiste = await tx.peca.findFirst({
      where: { sku: v.sku, ...(v.id ? { NOT: { id: v.id } } : {}) },
      select: { id: true },
    })
    if (jaExiste) return { ok: false as const, motivo: `Já existe uma peça com o código ${v.sku}.` }

    const dados = {
      sku: v.sku,
      nome: v.nome,
      categoria: v.categoria || null,
      aplicacao: v.aplicacao || null,
      unidade: v.unidade || 'UN',
      localizacao: v.localizacao || null,
      fornecedor: v.fornecedor || null,
      precoVendaCentavos: aCentavos(v.precoVenda),
      estoqueMinimo: new Prisma.Decimal(v.estoqueMinimo),
    }

    if (v.id) {
      // O custo médio é consequência das entradas — editá-lo pela tela faria o
      // relatório de margem mentir. Só entra no cadastro inicial.
      await tx.peca.update({ where: { id: v.id }, data: dados })
    } else {
      await tx.peca.create({
        data: {
          tenantId: exigirEmpresa(a.ctx),
          ...dados,
          custoMedioCentavos: aCentavos(v.custoMedio),
        },
      })
    }
    return { ok: true as const }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: v.id ? 'peca.editada' : 'peca.criada', entidade: 'peca', entidadeId: v.id ?? v.sku })
  revalidatePath('/painel/estoque')
  return { ok: true }
}

const schemaMovimento = z.object({
  pecaId: z.string().min(1),
  tipo: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA']),
  quantidade: z.coerce.number().min(0),
  custoUnit: z.coerce.number().min(0).nullish(),
  motivo: z.string().trim().nullish(),
  documentoFiscal: z.string().trim().nullish(),
})

export async function lancarMovimento(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não movimenta estoque.' }
  }

  const d = schemaMovimento.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // No AJUSTE a quantidade é o saldo contado no inventário, e zero é resposta
  // legítima. Nos demais, movimento de zero não é movimento.
  if (v.tipo !== 'AJUSTE' && v.quantidade <= 0) {
    return { ok: false, motivo: 'A quantidade precisa ser maior que zero.' }
  }
  if (v.tipo === 'AJUSTE' && !v.motivo) {
    return { ok: false, motivo: 'Ajuste de inventário exige o motivo — é o que explica a diferença depois.' }
  }

  const r = await comEscopo(a.ctx, (tx) =>
    movimentar(tx, exigirEmpresa(a.ctx), a.ator, {
      pecaId: v.pecaId,
      tipo: v.tipo as TipoMovimentoEstoque,
      quantidade: v.quantidade,
      motivo: v.motivo || undefined,
      custoUnitCentavos: v.custoUnit != null ? aCentavos(v.custoUnit) : undefined,
      documentoFiscal: v.documentoFiscal || undefined,
    }),
  )
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: `estoque.${v.tipo.toLowerCase()}`,
    entidade: 'peca',
    entidadeId: v.pecaId,
    detalhes: { quantidade: v.quantidade },
  })
  revalidatePath('/painel/estoque')
  revalidatePath('/painel')
  return { ok: true }
}
