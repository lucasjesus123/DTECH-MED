'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { conferirSenha, hashSenha } from '@/lib/cripto'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { gravarConfigWhatsapp } from '@/server/plataforma/config'
import {
  contextoDe,
  lerSessao,
  limparEmpresaVisitada,
  marcarEmpresaVisitada,
  revogarTodasAsSessoes,
} from '@/server/auth/sessao'

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
  /**
   * UF é OPCIONAL, e por isso a string vazia precisa passar.
   *
   * `.length(2).nullish()` aceita `null` e `undefined` — e um campo de texto
   * que ninguém tocou não chega como nenhum dos dois. `Object.fromEntries(form)`
   * entrega STRING VAZIA, que bate no `.length(2)` e derruba o cadastro inteiro
   * com "UF com duas letras.".
   *
   * O efeito era este, medido num navegador de verdade: quem cadastrasse uma
   * empresa sem preencher UF — um campo sem asterisco, que a tela apresenta
   * como opcional — via o formulário recusar, apontando para um campo que ela
   * não tinha motivo para preencher.
   *
   * `.or(z.literal(''))` é o mesmo remédio que `cadastros.ts` já usa no e-mail
   * do cliente. Vazio passa e vira `null` na gravação; preenchido continua
   * tendo de ter duas letras.
   */
  uf: z.string().trim().length(2, 'UF com duas letras.').nullish().or(z.literal('')),
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
    // Pelo escopo de Super Admin, e não pelo cliente cru: `sessoes` também
    // está sob FORCE RLS. Sem contexto, o updateMany não enxerga sessão
    // nenhuma, responde "0" e a suspensão fica só no papel — quem já estava
    // dentro seguiria trabalhando até o cookie vencer.
    await comEscopo(ctxPlataforma, async (tx) => {
      await tx.sessao.updateMany({
        where: { user: { tenantId }, revogadaEm: null },
        data: { revogadaEm: new Date() },
      })
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

  // As abas do sistema que esta pessoa vê. Vazio = o padrão do papel.
  // A regra do "subtrai, nunca soma" NÃO é aplicada aqui: ela vive em
  // `telasEfetivas`, e é lá que ela vale para todo mundo — inclusive para uma
  // lista que alguém tenha forjado no formulário.
  telas: z.array(z.string().max(40)).max(40).optional(),

  // A ficha da pessoa. Tudo opcional: obrigar endereço para cadastrar um
  // acesso é travar a contratação por causa de um CEP que ninguém tem à mão na
  // hora — e o acesso é o que a pessoa precisa para começar a trabalhar.
  documento: z.string().nullish(),
  cep: z.string().nullish(),
  logradouro: z.string().trim().nullish(),
  numero: z.string().trim().nullish(),
  complemento: z.string().trim().nullish(),
  bairro: z.string().trim().nullish(),
  cidade: z.string().trim().nullish(),
  uf: z.string().trim().nullish(),
})

/** Os campos da ficha, do jeito que vão para o banco. Vazio vira `null`. */
function fichaDe(v: {
  documento?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
}) {
  return {
    documento: v.documento?.replace(/\D/g, '') || null,
    cep: v.cep?.replace(/\D/g, '') || null,
    logradouro: v.logradouro?.trim() || null,
    numero: v.numero?.trim() || null,
    complemento: v.complemento?.trim() || null,
    bairro: v.bairro?.trim() || null,
    cidade: v.cidade?.trim() || null,
    uf: v.uf?.trim().toUpperCase() || null,
  }
}

export async function salvarUsuario(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (NIVEL[a.sessao.papel] < NIVEL[Papel.ADMIN_EMPRESA]) {
    return { ok: false, motivo: 'Seu perfil não cadastra usuário.' }
  }

  /**
   * `Object.fromEntries` fica com o ÚLTIMO valor de cada campo repetido — e as
   * abas chegam como vários campos `telas`, um por caixinha marcada. Lidas
   * assim, dezoito marcações virariam uma. `getAll` é o que enxerga a lista.
   */
  const d = schemaUsuario.safeParse({
    ...Object.fromEntries(form),
    telas: form.getAll('telas').map(String),
  })
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // Ninguém cria alguém do seu nível ou acima. Sem isso, o primeiro usuário
  // comprometido escala até o topo em dois cliques.
  if (NIVEL[v.papel as Papel] >= NIVEL[a.sessao.papel] && a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Você não pode criar um usuário com perfil igual ou acima do seu.' }
  }

  /**
   * De qual empresa é esta pessoa.
   *
   * Criando: o Super Admin escolhe; qualquer outro cria dentro da própria.
   *
   * EDITANDO: a empresa é a que a pessoa já tem, e nunca a que veio do
   * formulário. Duas razões, e a segunda é a que pega.
   *
   * A primeira é conforto: a ficha de edição não precisa carregar um seletor de
   * empresa que ninguém vai mexer — e sem ele, o Super Admin batia num "Escolha
   * a empresa do usuário" ao tentar corrigir um telefone.
   *
   * A segunda é que aceitar o campo aqui seria aceitar MUDAR alguém de empresa
   * por um valor de formulário. Isso levaria o histórico da pessoa junto — as
   * ordens que ela assinou, as fotos que ela tirou — para uma franquia que não
   * viveu aquilo. Trocar de empresa, se um dia precisar, é criar acesso novo lá
   * e desativar o daqui, com as duas trilhas intactas.
   */
  const tenantAlvo = v.id
    ? ((await comEscopo(a.ctx, (tx) =>
        tx.user.findUnique({ where: { id: v.id! }, select: { tenantId: true } }),
      ))?.tenantId ?? null)
    : a.sessao.papel === Papel.SUPER_ADMIN
      ? v.tenantId
      : a.ctx.tenantId
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
          telas: v.telas ?? [],
          ...fichaDe(v),
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
        telas: v.telas ?? [],
        ...fichaDe(v),
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

  // `comEscopo` e não o cliente cru: `usuarios` está sob FORCE ROW LEVEL
  // SECURITY, que prende o DONO da tabela junto com todo mundo. Sem declarar a
  // empresa, o `findUnique` volta nulo — o usuário lia "Usuário não
  // encontrado." estando logado — e o `update` alteraria zero linhas
  // respondendo "salvo". Ninguém conseguia trocar a própria senha.
  const atual = await comEscopo(a.ctx, async (tx) =>
    tx.user.findUnique({ where: { id: a.sessao.userId! }, select: { senhaHash: true } }),
  )
  if (!atual) return { ok: false, motivo: 'Usuário não encontrado.' }

  if (!(await conferirSenha(atual.senhaHash, d.data.atual))) {
    await auditar(a.ctx, a.sessao, { acao: 'senha.troca_negada', negado: true })
    return { ok: false, motivo: 'A senha atual não confere.' }
  }

  const novoHash = await hashSenha(d.data.nova)
  const trocadas = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: a.sessao.userId! },
      data: { senhaHash: novoHash, trocarSenha: false },
    })
    return r.count
  })

  // Uma escrita barrada pela policy responde "0 linhas", não erro. Conferir o
  // número é o que separa "senha trocada" de uma mentira educada na tela.
  if (trocadas !== 1) {
    await auditar(a.ctx, a.sessao, { acao: 'senha.troca_falhou', negado: true })
    return { ok: false, motivo: 'Não foi possível salvar a nova senha. Tente de novo.' }
  }

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

// ---------------------------------------------------------------------------
// ENTRAR NUMA EMPRESA
// ---------------------------------------------------------------------------

/**
 * O dono da plataforma entra numa das empresas da rede.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO É, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * NÃO é virar outra pessoa. Ele continua sendo ele — mesmo nome no crachá,
 * mesma trilha de auditoria, mesmo login. O que muda é o CONJUNTO DE DADOS que
 * ele está olhando: ao entrar na franquia de Lajeado, o painel, as ordens, a
 * agenda e o financeiro passam a ser os de Lajeado, e só os de Lajeado.
 *
 * É a diferença entre "assumir o crachá de alguém" e "ir até a loja". A
 * primeira apaga o rastro; a segunda deixa um.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO ABRE UM BURACO NO ISOLAMENTO
 * ---------------------------------------------------------------------------
 * Porque durante a visita o atalho de super admin do banco fica DESLIGADO
 * (ver `contextoDe`). Quem separa uma franquia da outra passa a ser o Postgres,
 * exatamente como para qualquer funcionário — o dono da plataforma dentro de
 * Lajeado tem o alcance de Lajeado, nem uma linha além.
 *
 * A entrada e a saída ficam registradas na trilha. Numa rede de franquias, o
 * franqueado tem direito de saber quando o franqueador esteve dentro da casa
 * dele.
 */
export async function entrarNaEmpresa(tenantId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só o administrador da plataforma entra em outra empresa.' }
  }

  const ctxPlataforma: ContextoAcesso = { tenantId: null, userId: a.sessao.userId, ehSuperAdmin: true }
  const empresa = await comEscopo(ctxPlataforma, async (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nome: true, ativo: true, bloqueado: true },
    }),
  )

  if (!empresa || !empresa.ativo) {
    await auditar(a.ctx, a.sessao, {
      acao: 'empresa.entrada_negada', entidade: 'tenant', entidadeId: tenantId, negado: true,
    })
    return { ok: false, motivo: 'Empresa não encontrada.' }
  }
  if (empresa.bloqueado) {
    return { ok: false, motivo: 'Esta empresa está suspensa. Reative antes de entrar nela.' }
  }

  await marcarEmpresaVisitada(empresa.id)
  await auditar(a.ctx, a.sessao, {
    acao: 'empresa.entrou', entidade: 'tenant', entidadeId: empresa.id,
    detalhes: { empresa: empresa.nome },
  })

  revalidatePath('/painel', 'layout')
  return { ok: true, mensagem: `Você está dentro de ${empresa.nome}.` }
}

/** Volta para a visão da rede. */
export async function sairDaEmpresa(): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  if (a.sessao.visitando) {
    await auditar(a.ctx, a.sessao, {
      acao: 'empresa.saiu', entidade: 'tenant', entidadeId: a.sessao.tenantId ?? undefined,
      detalhes: { empresa: a.sessao.tenantNome },
    })
  }

  await limparEmpresaVisitada()
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// A CONTA DE WHATSAPP DA PLATAFORMA
// ---------------------------------------------------------------------------

const schemaWhats = z.object({
  baseUrl: z.string().trim().url('O endereço precisa começar com https:// e ser um endereço válido.'),
  adminToken: z.string().nullish(),
})

/**
 * Guarda o endereço e o token de administração da uazapi.
 *
 * Uma conta para a rede inteira, e uma instância de WhatsApp por franquia
 * pendurada nela — é assim que a uazapi funciona e é assim que um SaaS cobra:
 * o contrato com o provedor é do dono da plataforma, não de cada franqueado.
 *
 * O token entra cifrado e NUNCA volta para a tela. Quem abre a tela vê
 * "configurado" ou "vazio", e o campo em branco significa "não mexi nele" — não
 * "apague". Apagar por omissão é como se perde a chave da rede inteira num
 * salvamento distraído.
 */
export async function salvarWhatsappDaPlataforma(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só o dono da plataforma configura a conta de WhatsApp da rede.' }
  }

  const d = schemaWhats.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  const ctxPlataforma: ContextoAcesso = { tenantId: null, userId: a.sessao.userId, ehSuperAdmin: true }
  await gravarConfigWhatsapp(ctxPlataforma, a.sessao.userId, {
    baseUrl: d.data.baseUrl,
    adminToken: d.data.adminToken ?? null,
  })

  await auditar(a.ctx, a.sessao, {
    acao: 'plataforma.whatsapp_configurado',
    // O token não vai para a trilha nem em pedaço: trilha de auditoria é lida
    // por mais gente e guardada por mais tempo que qualquer outra tabela.
    detalhes: { baseUrl: d.data.baseUrl, tokenTrocado: Boolean(d.data.adminToken?.trim()) },
  })

  revalidatePath('/painel/plataforma-whatsapp')
  return { ok: true, mensagem: 'Conta de WhatsApp da plataforma salva.' }
}

// ---------------------------------------------------------------------------
// EDITAR A EMPRESA
// ---------------------------------------------------------------------------

/**
 * O que se pode mudar depois que a empresa nasceu.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O IDENTIFICADOR NÃO ESTÁ AQUI
 * ---------------------------------------------------------------------------
 * O `slug` é o nome curto da empresa dentro do sistema, e ele encosta em coisa
 * que já saiu de casa: aparece em endereço, em arquivo guardado e em conversa
 * de suporte. Trocar depois é o tipo de mudança que funciona em toda tela que
 * alguém lembrou de testar e quebra na que ninguém lembrou.
 *
 * Nome muda quando a empresa muda de nome; identificador não. É a mesma
 * distinção entre como você é chamado e o número do seu CPF.
 *
 * O endereço da matriz entra aqui inteiro porque ele sai impresso no cabeçalho
 * das ordens de serviço e dos orçamentos — um CEP errado vira PDF errado na mão
 * do cliente, e hoje só se corrigia mexendo no banco.
 */
const schemaEdicaoEmpresa = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(3, 'Informe o nome da empresa.'),
  razaoSocial: z.string().trim().nullish(),
  cnpj: z.string().transform((v) => v.replace(/\D/g, '')).nullish(),
  email: z.string().trim().toLowerCase().nullish(),
  telefone: z.string().trim().nullish(),
  whatsapp: z.string().trim().nullish(),
  cep: z.string().trim().nullish(),
  logradouro: z.string().trim().nullish(),
  numero: z.string().trim().nullish(),
  complemento: z.string().trim().nullish(),
  bairro: z.string().trim().nullish(),
  cidade: z.string().trim().nullish(),
  uf: z.string().trim().nullish(),
  plano: z.string().trim().min(1).default('padrao'),
})

export async function editarEmpresa(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a.sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só o dono da plataforma edita o cadastro de uma empresa.' }
  }

  const d = schemaEdicaoEmpresa.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const uf = v.uf?.trim().toUpperCase() || null
  if (uf && uf.length !== 2) return { ok: false, motivo: 'UF com duas letras.' }

  const ctxPlataforma: ContextoAcesso = { tenantId: null, userId: a.sessao.userId, ehSuperAdmin: true }

  const r = await comEscopo(ctxPlataforma, async (tx) => {
    // O CNPJ é único na plataforma inteira. Sem esta conferência, o choque
    // apareceria como erro cru do banco numa tela de cadastro.
    if (v.cnpj) {
      const colide = await tx.tenant.findFirst({
        where: { cnpj: v.cnpj, NOT: { id: v.id } },
        select: { nome: true },
      })
      if (colide) {
        return { ok: false as const, motivo: `Este CNPJ já está cadastrado em "${colide.nome}".` }
      }
    }

    const antes = await tx.tenant.findUnique({ where: { id: v.id }, select: { nome: true } })
    if (!antes) return { ok: false as const, motivo: 'Empresa não encontrada.' }

    await tx.tenant.update({
      where: { id: v.id },
      data: {
        nome: v.nome,
        razaoSocial: v.razaoSocial?.trim() || null,
        cnpj: v.cnpj || null,
        email: v.email?.trim() || null,
        telefone: v.telefone?.replace(/\D/g, '') || null,
        whatsapp: v.whatsapp?.replace(/\D/g, '') || null,
        cep: v.cep?.replace(/\D/g, '') || null,
        logradouro: v.logradouro?.trim() || null,
        numero: v.numero?.trim() || null,
        complemento: v.complemento?.trim() || null,
        bairro: v.bairro?.trim() || null,
        cidade: v.cidade?.trim() || null,
        uf,
        plano: v.plano,
      },
    })
    return { ok: true as const, nomeAntes: antes.nome }
  })

  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'empresa.editada',
    entidade: 'tenant',
    entidadeId: v.id,
    detalhes: r.nomeAntes !== v.nome ? { de: r.nomeAntes, para: v.nome } : { nome: v.nome },
  })

  revalidatePath('/painel/empresas')
  revalidatePath('/painel', 'layout')
  return { ok: true, mensagem: 'Cadastro da empresa atualizado.' }
}

/**
 * Apagar de vez o acesso de alguém.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO SÓ VALE PARA QUEM NUNCA TRABALHOU
 * ---------------------------------------------------------------------------
 * Todas as ligações do usuário no banco são `ON DELETE SET NULL`. Isso quer
 * dizer que apagar uma pessoa não derruba nada — apenas **apaga o nome dela de
 * tudo o que ela fez**. O evento "deu entrada no equipamento" continua lá, com
 * data, hora e hash; o autor vira um traço.
 *
 * Num sistema cuja promessa é "a trilha não se apaga", esse é o pior tipo de
 * perda: silenciosa, irreversível, e descoberta meses depois, quando alguém
 * precisa saber quem assinou a retirada de um aparelho que sumiu.
 *
 * Então a regra é: **acesso que já foi usado não se apaga, se desativa.**
 * Desativar corta na hora, derruba as sessões abertas, e o histórico fica
 * inteiro com o nome de quem fez. Apagar fica para o que realmente é lixo —
 * o cadastro com e-mail errado, criado há dez minutos, que nunca entrou.
 *
 * A recusa diz o número, e não um "não pode": saber que a pessoa aparece em 47
 * registros é o que faz a decisão de desativar parecer óbvia em vez de
 * arbitrária.
 */
export async function excluirUsuario(userId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (NIVEL[a.sessao.papel] < NIVEL[Papel.ADMIN_EMPRESA]) {
    return { ok: false, motivo: 'Seu perfil não exclui usuário.' }
  }
  if (userId === a.sessao.userId) {
    return { ok: false, motivo: 'Você não pode excluir o próprio acesso.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const alvo = await tx.user.findUnique({
      where: { id: userId },
      select: { nome: true, email: true, papel: true, ultimoLogin: true },
    })
    if (!alvo) return { ok: false as const, motivo: 'Usuário não encontrado.' }

    if (alvo.papel === Papel.SUPER_ADMIN) {
      return { ok: false as const, motivo: 'O administrador da plataforma não pode ser excluído.' }
    }
    if (NIVEL[alvo.papel] >= NIVEL[a.sessao.papel] && a.sessao.papel !== Papel.SUPER_ADMIN) {
      return { ok: false as const, motivo: 'Você não pode excluir um usuário de perfil igual ou acima do seu.' }
    }

    // Tudo o que carrega o nome dela. Contado de uma vez, para a mensagem poder
    // dizer o tamanho do rastro em vez de só recusar.
    // Assinatura fica de fora: quem assina é o CLIENTE, não alguém da equipe.
    const [eventos, fotos, pagamentos, ordensAtend, ordensTec, paradas, orcamentos] =
      await Promise.all([
        tx.eventoOrdem.count({ where: { autorId: userId } }),
        tx.foto.count({ where: { autorId: userId } }),
        tx.pagamento.count({ where: { autorId: userId } }),
        tx.ordem.count({ where: { atendenteId: userId } }),
        tx.ordem.count({ where: { tecnicoId: userId } }),
        tx.agendamento.count({ where: { motoristaId: userId } }),
        tx.orcamento.count({ where: { tecnicoId: userId } }),
      ])
    const rastro = eventos + fotos + pagamentos + ordensAtend + ordensTec + paradas + orcamentos

    if (rastro > 0 || alvo.ultimoLogin) {
      const onde = rastro > 0 ? `${rastro} ${rastro === 1 ? 'registro' : 'registros'} do histórico` : 'acessos já feitos'
      return {
        ok: false as const,
        motivo:
          `${alvo.nome} aparece em ${onde}. Apagar o cadastro tiraria o nome dela ` +
          `de tudo o que fez, e o histórico ficaria sem autor. Use Desativar: o acesso ` +
          `é cortado na hora, as sessões abertas caem, e a trilha continua inteira.`,
      }
    }

    await tx.user.delete({ where: { id: userId } })
    return { ok: true as const, nome: alvo.nome, email: alvo.email }
  })

  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'usuario.excluido',
    entidade: 'usuario',
    entidadeId: userId,
    detalhes: { nome: r.nome, email: r.email },
  })
  revalidatePath('/painel/usuarios')
  return { ok: true, mensagem: `Cadastro de ${r.nome} excluído.` }
}
