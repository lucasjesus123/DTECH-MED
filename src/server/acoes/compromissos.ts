'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * MARCAR, CONCLUIR E APAGAR UM COMPROMISSO.
 *
 * =============================================================================
 * QUEM MARCA
 * =============================================================================
 * Todo mundo do painel, do MOTORISTA para cima. É agenda de equipe: o motorista
 * que descobre na rua que a clínica só recebe de manhã precisa poder anotar
 * isso no dia, sem pedir para alguém do escritório.
 *
 * Apagar é mais restrito — do GESTOR para cima. Compromisso apagado some da
 * agenda de todo mundo, e quem marcou pode não ser quem depende dele.
 */

type Resposta = { ok: true; mensagem: string } | { ok: false; motivo: string }

const PODE_MARCAR: Papel[] = [
  Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR,
  Papel.ATENDENTE, Papel.FINANCEIRO, Papel.TECNICO, Papel.MOTORISTA,
]
const PODE_APAGAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

const schema = z.object({
  id: z.string().trim().optional(),
  titulo: z.string().trim().min(2, 'Escreva o que é o compromisso.').max(160),
  // 'AAAA-MM-DD'. Guardado como `date`, sem hora e sem fuso — ver o comentário
  // do modelo: um compromisso é do DIA, e `timestamp` faria o do dia 12
  // aparecer no 11 para quem abre a tela de outro fuso.
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  hora: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida — use 14:30.')
    .optional()
    .or(z.literal('')),
  responsavelId: z.string().trim().optional(),
  observacao: z.string().trim().max(500).optional(),
})

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

export async function salvarCompromisso(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MARCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não marca compromisso.' }
  }

  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    // O responsável precisa ser DESTA empresa. Sem esta conferência, um id de
    // usuário de outra franquia gravaria — o RLS protege a leitura, não o valor
    // que alguém escreve numa coluna solta.
    if (v.responsavelId) {
      const existe = await tx.user.findUnique({ where: { id: v.responsavelId }, select: { id: true } })
      if (!existe) return { ok: false as const, motivo: 'Essa pessoa não está na sua empresa.' }
    }

    const dados = {
      titulo: v.titulo,
      // `new Date('2026-08-28')` em JS é MEIA-NOITE UTC — que no Brasil é o dia
      // 27 às 21h. Para uma coluna `date` o Postgres guarda só a parte da data,
      // e é essa parte que precisa estar certa. `T12:00:00Z` põe o instante no
      // meio do dia, longe das duas bordas, então nenhum fuso o empurra para o
      // dia vizinho.
      dia: new Date(`${v.dia}T12:00:00Z`),
      hora: v.hora || null,
      responsavelId: v.responsavelId || null,
      observacao: v.observacao || null,
    }

    if (v.id) {
      const c = await tx.compromisso.updateMany({ where: { id: v.id }, data: dados })
      if (c.count === 0) return { ok: false as const, motivo: 'Compromisso não encontrado.' }
      return { ok: true as const, novo: false, id: v.id }
    }
    const criado = await tx.compromisso.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        ...dados,
        autorId: a.sessao.userId,
        autorNome: a.sessao.nome,
      },
      select: { id: true },
    })
    return { ok: true as const, novo: true, id: criado.id }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: r.novo ? 'compromisso.marcado' : 'compromisso.editado',
    entidade: 'compromisso',
    entidadeId: r.id,
    detalhes: { titulo: v.titulo, dia: v.dia },
  })
  revalidatePath('/painel/calendario')
  return { ok: true, mensagem: r.novo ? 'Compromisso marcado.' : 'Compromisso salvo.' }
}

/** Marca como resolvido, ou desmarca. Não apaga: a agenda de trás responde
 *  "quando foi mesmo que estivemos lá". */
export async function alternarCompromisso(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MARCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não mexe em compromisso.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const c = await tx.compromisso.findUnique({ where: { id }, select: { concluido: true, titulo: true } })
    if (!c) return { ok: false as const, motivo: 'Compromisso não encontrado.' }
    await tx.compromisso.updateMany({ where: { id }, data: { concluido: !c.concluido } })
    return { ok: true as const, feito: !c.concluido, titulo: c.titulo }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: r.feito ? 'compromisso.concluido' : 'compromisso.reaberto',
    entidade: 'compromisso',
    entidadeId: id,
    detalhes: { titulo: r.titulo },
  })
  revalidatePath('/painel/calendario')
  return { ok: true, mensagem: r.feito ? 'Marcado como feito.' : 'Reaberto.' }
}

export async function excluirCompromisso(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_APAGAR.includes(a.sessao.papel)) {
    return {
      ok: false,
      motivo: 'Seu perfil não apaga compromisso — ele some da agenda de todo mundo. Marque como feito.',
    }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const c = await tx.compromisso.deleteMany({ where: { id } })
    return c.count > 0 ? { ok: true as const } : { ok: false as const, motivo: 'Compromisso não encontrado.' }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: 'compromisso.excluido', entidade: 'compromisso', entidadeId: id })
  revalidatePath('/painel/calendario')
  return { ok: true, mensagem: 'Compromisso apagado.' }
}
