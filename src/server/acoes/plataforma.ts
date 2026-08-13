'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { conferirSenha, hashSenha } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao, revogarTodasAsSessoes } from '@/server/auth/sessao'

/**
 * Administração da plataforma e dos usuários.
 *
 * Duas fronteiras que este arquivo não deixa ninguém atravessar:
 *
 *  1. **Só o Super Admin cria empresa**, e a empresa nasce junto com o admin
 *     dela. Uma franquia sem responsável é uma franquia que ninguém consegue
 *     usar, e o passo esquecido vira chamado no dia seguinte.
 *  2. **Ninguém cria alguém acima de si.** Um gestor não promove a si mesmo a
 *     admin, e um admin de empresa não cria Super Admin. Sem essa regra, o
 *     primeiro usuário comprometido vira dono da plataforma inteira.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const NIVEL: Record<Papel, number> = {
  SUPER_ADMIN: 100,
  ADMIN_EMPRESA: 80,
  GESTOR: 60,
  FINANCEIRO: 40,
  ATENDENTE: 30,
  TECNICO: 20,
  MOTORISTA: 10,
}

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

const schemaEmpresa = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da empresa.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, 'O identificador aceita só letras minúsculas, números e hífen.'),
  cnpj: z.string().transform((v) => v.replace(/\D/g, '')).nullish(),
  cidade: z.string().trim().nullish(),
  uf: z.string().trim().length(2, 'UF com duas letras.').nullish(),
  telefone: z.string().trim().nullish(),
  whatsapp: z.string().trim().nullish(),
  adminNome: z.string().trim().min(3, 'Informe o nome do responsável.'),
  adminEmail: z.string().trim().toLowerCase().email('E-mail do responsável inválido.'),
  adminSenha: z.string().min(10, 'A senha provisória precisa ter ao menos 10 caracteres.'),
})

/** Cria a empresa e o administrador dela, na mesma transação. */
export async function criarEmpresa(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só o administrador da plataforma cadastra empresa.' }
  }

  const d = schemaEmpresa.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  if (v.cnpj && v.cnpj.length !== 14) return { ok: false, motivo: 'CNPJ precisa ter 14 dígitos.' }

  const senhaHash = await hashSenha(v.adminSenha)

  // O contexto de Super Admin é o único que enxerga além de uma empresa. Aqui
  // ele é usado para CRIAR a fronteira, não para atravessá-la.
  const ctxPlataforma: ContextoAcesso = { tenantId: null, userId: a.sessao.userId, ehSuperAdmin: true }

  const r = await comEscopo(ctxPlataforma, async (tx) => {
    const colide = await tx.tenant.findFirst({
      where: { OR: [{ slug: v.slug }, ...(v.cnpj ? [{ cnpj: v.cnpj }] : [])] },
      select: { slug: true, cnpj: true },
    })
    if (colide) {
      return {
        ok: false as const,
        motivo: colide.slug === v.slug ? `O identificador "${v.slug}" já está em uso.` : 'Já existe empresa com este CNPJ.',
      }
    }

    const empresa = await tx.tenant.create({
      data: {
        nome: v.nome,
        slug: v.slug,
        cnpj: v.cnpj || null,
        cidade: v.cidade || null,
        uf: v.uf?.toUpperCase() || null,
        telefone: v.telefone?.replace(/\D/g, '') || null,
        whatsapp: v.whatsapp?.replace(/\D/g, '') || null,
      },
      select: { id: true, nome: true },
    })

    await tx.user.create({
      data: {
        tenantId: empresa.id,
        nome: v.adminNome,
        email: v.adminEmail,
        senhaHash,
        papel: Papel.ADMIN_EMPRESA,
        // Senha provisória: a troca no primeiro acesso é obrigatória, porque
        // quem digitou a senha aqui não é quem vai usá-la.
        trocarSenha: true,
      },
    })

    return { ok: true as const, id: empresa.id, nome: empresa.nome }
  })
  if (!r.ok) return r

  await auditar(ctxPlataforma, a.sessao, { acao: 'empresa.criada', entidade: 'tenant', entidadeId: r.id })
  revalidatePath('/painel/empresas')
  return { ok: true, mensagem: `Empresa ${r.nome} criada. O responsável troca a senha no primeiro acesso.` }
}

/** Suspende ou reativa uma empresa. Suspensa, ninguém dela consegue entrar. */
export async function alternarBloqueio(tenantId: string, bloquear: boolean, motivo?: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só o administrador da plataforma altera o acesso de uma empresa.' }
  }
  if (bloquear && !motivo?.trim()) {
    return { ok: false, motivo: 'Escreva o motivo da suspensão — ele aparece para quem tentar entrar.' }
  }

  const ctxPlataforma: ContextoAcesso = { tenantId: null, userId: a.sessao.userId, ehSuperAdmin: true }

  await comEscopo(ctxPlataforma, async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { bloqueado: bloquear, motivoBloqueio: bloquear ? motivo!.trim() : null },
    })
  })

  // Suspender sem derrubar as sessões abertas seria suspender só no papel:
  // quem já estava dentro continuaria trabalhando até o cookie vencer.
  if (bloquear) {
    await prisma.sessao.updateMany({
      where: { user: { tenantId }, revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
  }

  await auditar(ctxPlataforma, a.sessao, {
    acao: bloquear ? 'empresa.suspensa' : 'empresa.reativada',
    entidade: 'tenant',
    entidadeId: tenantId,
    detalhes: motivo ? { motivo: motivo.trim() } : undefined,
  })
  revalidatePath('/painel/empresas')
  return { ok: true, mensagem: bloquear ? 'Empresa suspensa e sessões encerradas.' : 'Empresa reativada.' }
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

const schemaUsuario = z.object({
  id: z.string().nullish(),
  tenantId: z.string().nullish(),
  nome: z.string().trim().min(3, 'Informe o nome completo.'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  telefone: z.string().trim().nullish(),
  papel: z.enum(['ADMIN_EMPRESA', 'GESTOR', 'FINANCEIRO', 'ATENDENTE', 'TECNICO', 'MOTORISTA']),
  senha: z.string().nullish(),
})

export async function salvarUsuario(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (NIVEL[a.sessao.papel] < NIVEL[Papel.ADMIN_EMPRESA]) {
    return { ok: false, motivo: 'Seu perfil não cadastra usuário.' }
  }

  const d = schemaUsuario.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // Ninguém cria alguém do seu nível ou acima. Sem isso, o primeiro usuário
  // comprometido escala até o topo em dois cliques.
  if (NIVEL[v.papel as Papel] >= NIVEL[a.sessao.papel] && a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Você não pode criar um usuário com perfil igual ou acima do seu.' }
  }

  // O Super Admin escolhe a empresa; qualquer outro cria dentro da própria.
  const tenantAlvo = a.sessao.papel === Papel.SUPER_ADMIN ? v.tenantId : a.ctx.tenantId
  if (!tenantAlvo) return { ok: false, motivo: 'Escolha a empresa do usuário.' }

  const senhaHash = v.senha ? await hashSenha(v.senha) : null
  if (!v.id && !senhaHash) return { ok: false, motivo: 'Informe a senha provisória.' }
  if (v.senha && v.senha.length < 10) {
    return { ok: false, motivo: 'A senha precisa ter ao menos 10 caracteres.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const colide = await tx.user.findFirst({
      where: { tenantId: tenantAlvo, email: v.email, ...(v.id ? { NOT: { id: v.id } } : {}) },
      select: { id: true },
    })
    if (colide) return { ok: false as const, motivo: 'Já existe usuário com este e-mail nesta empresa.' }

    if (v.id) {
      const alvo = await tx.user.findUnique({ where: { id: v.id }, select: { papel: true } })
      if (!alvo) return { ok: false as const, motivo: 'Usuário não encontrado.' }
      // Também não se edita alguém acima de si — inclusive para rebaixá-lo.
      if (NIVEL[alvo.papel] >= NIVEL[a.sessao.papel] && a.sessao.papel !== Papel.SUPER_ADMIN) {
        return { ok: false as const, motivo: 'Você não pode alterar um usuário de perfil igual ou acima do seu.' }
      }

      await tx.user.update({
        where: { id: v.id },
        data: {
          nome: v.nome,
          email: v.email,
          telefone: v.telefone?.replace(/\D/g, '') || null,
          papel: v.papel as Papel,
          ...(senhaHash ? { senhaHash, trocarSenha: true } : {}),
        },
      })
      return { ok: true as const, id: v.id, senhaTrocada: Boolean(senhaHash) }
    }

    const novo = await tx.user.create({
      data: {
        tenantId: tenantAlvo,
        nome: v.nome,
        email: v.email,
        telefone: v.telefone?.replace(/\D/g, '') || null,
        papel: v.papel as Papel,
        senhaHash: senhaHash!,
        trocarSenha: true,
        criadoPorId: a.sessao.userId,
      },
      select: { id: true },
    })
    return { ok: true as const, id: novo.id, senhaTrocada: true }
  })
  if (!r.ok) return r

  // Trocar a senha de alguém derruba as sessões dele. É o que faz a troca
  // servir para conter um acesso indevido, e não só para o próximo login.
  if (v.id && r.senhaTrocada) await revogarTodasAsSessoes(v.id)

  await auditar(a.ctx, a.sessao, {
    acao: v.id ? 'usuario.editado' : 'usuario.criado',
    entidade: 'usuario',
    entidadeId: r.id,
    detalhes: { papel: v.papel },
  })
  revalidatePath('/painel/empresas')
  revalidatePath('/painel/usuarios')
  return { ok: true, mensagem: v.id ? 'Usuário atualizado.' : 'Usuário criado. Ele troca a senha no primeiro acesso.' }
}

export async function alternarUsuario(userId: string, ativar: boolean): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (NIVEL[a.sessao.papel] < NIVEL[Papel.ADMIN_EMPRESA]) {
    return { ok: false, motivo: 'Seu perfil não altera usuário.' }
  }
  if (userId === a.sessao.userId) {
    return { ok: false, motivo: 'Você não pode desativar a si mesmo.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const alvo = await tx.user.findUnique({ where: { id: userId }, select: { papel: true } })
    if (!alvo) return { ok: false as const, motivo: 'Usuário não encontrado.' }
    if (NIVEL[alvo.papel] >= NIVEL[a.sessao.papel] && a.sessao.papel !== Papel.SUPER_ADMIN) {
      return { ok: false as const, motivo: 'Você não pode alterar um usuário de perfil igual ou acima do seu.' }
    }
    await tx.user.update({
      where: { id: userId },
      // Desbloquear também limpa o bloqueio por tentativas: quem foi
      // reativado pela mão do admin não deve continuar preso pelo contador.
      data: { ativo: ativar, ...(ativar ? { tentativasFalhas: 0, bloqueadoAte: null } : {}) },
    })
    return { ok: true as const }
  })
  if (!r.ok) return r

  if (!ativar) await revogarTodasAsSessoes(userId)

  await auditar(a.ctx, a.sessao, {
    acao: ativar ? 'usuario.ativado' : 'usuario.desativado',
    entidade: 'usuario',
    entidadeId: userId,
  })
  revalidatePath('/painel/empresas')
  revalidatePath('/painel/usuarios')
  return { ok: true, mensagem: ativar ? 'Usuário reativado.' : 'Usuário desativado e sessões encerradas.' }
}

// ---------------------------------------------------------------------------
// Conta do próprio usuário
// ---------------------------------------------------------------------------

const schemaSenha = z
  .object({
    atual: z.string().min(1, 'Informe a senha atual.'),
    nova: z.string().min(10, 'A nova senha precisa ter ao menos 10 caracteres.'),
    confirmacao: z.string().min(1, 'Repita a nova senha.'),
  })
  .refine((v) => v.nova === v.confirmacao, {
    message: 'As duas senhas não são iguais.',
    path: ['confirmacao'],
  })
  .refine((v) => v.nova !== v.atual, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['nova'],
  })

/**
 * Troca a própria senha.
 *
 * Exige a senha atual mesmo com sessão válida: sem isso, um notebook deixado
 * aberto vira uma conta tomada em dois cliques.
 */
export async function trocarSenha(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a || !a.sessao.userId) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const d = schemaSenha.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  const atual = await prisma.user.findUnique({
    where: { id: a.sessao.userId },
    select: { senhaHash: true },
  })
  if (!atual) return { ok: false, motivo: 'Usuário não encontrado.' }

  if (!(await conferirSenha(atual.senhaHash, d.data.atual))) {
    await auditar(a.ctx, a.sessao, { acao: 'senha.troca_negada', negado: true })
    return { ok: false, motivo: 'A senha atual não confere.' }
  }

  const novoHash = await hashSenha(d.data.nova)
  await prisma.user.update({
    where: { id: a.sessao.userId },
    data: { senhaHash: novoHash, trocarSenha: false },
  })

  await auditar(a.ctx, a.sessao, { acao: 'senha.trocada', entidade: 'usuario', entidadeId: a.sessao.userId })
  return {
    ok: true,
    mensagem: 'Senha trocada. As outras sessões continuam abertas — encerre-as se desconfiar de acesso indevido.',
  }
}

/** Encerra todas as sessões do próprio usuário, inclusive a atual. */
export async function encerrarTodasAsSessoes(): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a || !a.sessao.userId) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const n = await revogarTodasAsSessoes(a.sessao.userId)
  await auditar(a.ctx, a.sessao, { acao: 'sessoes.encerradas', detalhes: { quantidade: n } })
  return { ok: true, mensagem: `${n} ${n === 1 ? 'sessão encerrada' : 'sessões encerradas'}. Entre de novo.` }
}
