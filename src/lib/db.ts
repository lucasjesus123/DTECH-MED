import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env } from './env'

/**
 * Acesso ao banco, sempre com escopo de empresa.
 *
 * O ponto central deste arquivo: nenhuma consulta de negócio roda fora de uma
 * transação que declarou a qual empresa ela pertence. As policies de RLS leem
 * essa declaração; sem ela, devolvem zero linhas.
 *
 * Por que transação e não conexão: o pool reaproveita conexões entre
 * requisições. Se o tenant fosse definido na conexão, a próxima requisição a
 * pegar aquela conexão herdaria o tenant da anterior — que é exatamente o
 * vazamento entre franquias que queremos impossibilitar. `SET LOCAL` morre no
 * fim da transação, então a conexão volta ao pool limpa.
 */

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

function criarCliente() {
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

// Em desenvolvimento o hot reload recria o módulo a cada alteração; sem o
// cache global cada recarga abriria um pool novo até estourar as conexões.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalParaPrisma.prisma ?? criarCliente()
if (env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma

export type ContextoAcesso = {
  /** Nulo apenas para SUPER_ADMIN, que não pertence a nenhuma empresa. */
  tenantId: string | null
  userId: string | null
  ehSuperAdmin: boolean
}

export type Transacao = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Erro de quem pediu algo de empresa sem estar em uma.
 *
 * É o caso do Super Admin: ele administra a plataforma, não pertence a nenhuma
 * franquia. Toda tela e toda ação que trabalha sobre dados de UMA empresa
 * precisa de um `tenantId`, e ele não tem.
 */
export class SemEmpresaError extends Error {
  constructor(oQue = 'Esta operação') {
    super(
      `${oQue} pertence a uma empresa, e o administrador da plataforma não está em nenhuma. ` +
        'Entre pela conta de um usuário da empresa.',
    )
    this.name = 'SemEmpresaError'
  }
}

/**
 * A empresa do contexto, ou um erro que se entende.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * O código escrevia `exigirEmpresa(ctx)` em 31 lugares. A exclamação cala o
 * compilador dizendo "confie, não é nulo" — e para o Super Admin ele É nulo,
 * sempre.
 *
 * O resultado foi encontrado num teste que abriu todas as telas com todos os
 * papéis: a tela do WhatsApp devolvia erro 500 para o dono da plataforma e
 * funcionava para todos os outros. Erro de banco cru na tela, sem explicação,
 * numa tela que ele pode abrir pelo menu.
 *
 * Trocar a exclamação por esta função não faz o Super Admin passar a ter
 * empresa — não deveria mesmo. O que ela faz é transformar uma quebra
 * incompreensível numa frase que diz o que houve e o que fazer.
 */
export function exigirEmpresa(ctx: ContextoAcesso, oQue?: string): string {
  if (!ctx.tenantId) throw new SemEmpresaError(oQue)
  return ctx.tenantId
}

/**
 * Roda `fn` dentro de uma transação já carimbada com a empresa do contexto.
 *
 * Use `set_config(..., true)` em vez de `SET LOCAL app.tenant_id = '...'`
 * porque o Postgres não aceita parâmetro em `SET`. Interpolar o id na string
 * seria abrir uma porta de injeção justamente no mecanismo que existe para
 * fechar portas. O terceiro argumento `true` diz "local à transação".
 */
export async function comEscopo<T>(
  ctx: ContextoAcesso,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> {
  if (!ctx.ehSuperAdmin && !ctx.tenantId) {
    // Falha alta e cedo. Sem isso, a consulta desceria até o banco, voltaria
    // vazia, e o bug apareceria como "sumiram os dados" em vez de erro claro.
    throw new Error('Contexto sem empresa: recusando executar consulta de negócio.')
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true)`
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', ${ctx.ehSuperAdmin ? 'on' : 'off'}, true)`
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true)`
    return fn(tx)
  })
}

/**
 * Contexto de autenticação: janela estreita que libera SOMENTE `usuarios` e
 * `sessoes`, e apenas para leitura. Existe porque no login ainda não se sabe a
 * empresa — é preciso achar o usuário pelo e-mail para descobrir o tenant dele.
 *
 * Não use para mais nada. A policy correspondente no banco recusa escrita
 * mesmo que alguém tente.
 */
export async function comContextoAuth<T>(fn: (tx: Transacao) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.auth_context', 'on', true)`
    return fn(tx)
  })
}

/**
 * Contexto do worker: libera apenas a fila `outbox_jobs`, para o processo
 * varrer jobs de todas as empresas. Ao processar cada job, o worker reabre o
 * escopo com o tenant do próprio job antes de tocar em dado de negócio.
 */
export async function comContextoWorker<T>(fn: (tx: Transacao) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.worker_context', 'on', true)`
    return fn(tx)
  })
}

/**
 * Contexto da plataforma: janela estreita que libera SOMENTE
 * `config_plataforma`, e apenas para leitura.
 *
 * Existe por um motivo concreto: o token de administração da uazapi é da
 * PLATAFORMA, mas quem aperta o botão "conectar WhatsApp" é o gestor de uma
 * franquia. Sem esta janela, ele não conseguiria conectar o número da própria
 * casa — a chave está num cofre que o papel dele não abre.
 *
 * A política no banco recusa escrita mesmo que alguém tente por aqui. Gravar
 * continua sendo só do dono da plataforma, pela tela dele.
 */
export async function comContextoPlataforma<T>(fn: (tx: Transacao) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.plataforma_context', 'on', true)`
    return fn(tx)
  })
}
