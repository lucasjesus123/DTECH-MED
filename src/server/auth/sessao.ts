import { cookies } from 'next/headers'
import type { Papel } from '@/generated/prisma/enums'
import { comparaSegura, conferirSenha, hashToken, novoToken } from '@/lib/cripto'
import { comContextoAuth, type ContextoAcesso } from '@/lib/db'
import { ehProducao, env } from '@/lib/env'

/**
 * Sessão do usuário.
 *
 * Decisões que valem explicação:
 *
 *  • O cookie guarda um token opaco de 256 bits; o banco guarda apenas o HMAC
 *    dele. Um dump vazado entrega hashes, não sessões utilizáveis.
 *  • Nada de JWT. Token assinado não dá para revogar antes de expirar — e num
 *    sistema onde o admin da empresa demite um técnico e precisa cortar o
 *    acesso na hora, isso é requisito, não preferência.
 *  • `SameSite=Strict` porque não existe fluxo de terceiro legítimo entrando
 *    no painel. É proteção de CSRF que não custa usabilidade nenhuma aqui.
 */

const NOME_COOKIE = 'dtm_sessao'

export type Sessao = {
  userId: string
  nome: string
  email: string
  papel: Papel
  tenantId: string | null
  tenantNome: string | null
  trocarSenha: boolean
}

const TTL_MS = () => env.SESSION_TTL_HOURS * 60 * 60 * 1000

export async function criarSessao(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const token = novoToken()
  const expiraEm = new Date(Date.now() + TTL_MS())

  await comContextoAuth(async (tx) => {
    await tx.sessao.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiraEm,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
      },
    })
  })

  const jar = await cookies()
  jar.set(NOME_COOKIE, token, {
    httpOnly: true, // fora do alcance de qualquer script na página
    secure: ehProducao, // em produção só trafega por HTTPS
    sameSite: 'strict',
    path: '/',
    expires: expiraEm,
  })

  return token
}

/**
 * Lê a sessão do cookie e devolve quem está logado.
 *
 * Devolve `null` para qualquer problema — expirada, revogada, usuário inativo,
 * empresa bloqueada. Nunca explica qual dos casos: para quem está do lado de
 * fora, todos são iguais.
 */
export async function lerSessao(): Promise<Sessao | null> {
  const jar = await cookies()
  const token = jar.get(NOME_COOKIE)?.value
  if (!token) return null

  const registro = await comContextoAuth(async (tx) =>
    tx.sessao.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: {
            tenant: { select: { nome: true, ativo: true, bloqueado: true } },
          },
        },
      },
    }),
  )

  if (!registro) return null
  if (registro.revogadaEm) return null
  if (registro.expiraEm.getTime() < Date.now()) return null

  const u = registro.user
  if (!u.ativo) return null
  // Super admin não tem empresa; os demais precisam de uma ativa e liberada.
  if (u.papel !== 'SUPER_ADMIN') {
    if (!u.tenant || !u.tenant.ativo || u.tenant.bloqueado) return null
  }

  // Renovação preguiçosa: só grava se passou tempo suficiente, para não
  // transformar cada carregamento de tela numa escrita no banco.
  const passou = Date.now() - registro.ultimoUso.getTime()
  if (passou > 5 * 60_000) {
    await comContextoAuth(async (tx) => {
      await tx.sessao.update({
        where: { id: registro.id },
        data: { ultimoUso: new Date() },
      })
    })
  }

  return {
    userId: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    tenantId: u.tenantId,
    tenantNome: u.tenant?.nome ?? null,
    trocarSenha: u.trocarSenha,
  }
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(NOME_COOKIE)?.value
  if (token) {
    await comContextoAuth(async (tx) => {
      await tx.sessao.updateMany({
        where: { tokenHash: hashToken(token), revogadaEm: null },
        data: { revogadaEm: new Date() },
      })
    })
  }
  jar.delete(NOME_COOKIE)
}

/** Corta todas as sessões de um usuário — desligamento, senha trocada, suspeita. */
export async function revogarTodasAsSessoes(userId: string): Promise<number> {
  return comContextoAuth(async (tx) => {
    const r = await tx.sessao.updateMany({
      where: { userId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
    return r.count
  })
}

export function contextoDe(s: Sessao): ContextoAcesso {
  return {
    tenantId: s.tenantId,
    userId: s.userId,
    ehSuperAdmin: s.papel === 'SUPER_ADMIN',
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export type ResultadoLogin =
  | { ok: true; userId: string; papel: Papel; trocarSenha: boolean }
  | { ok: false; motivo: string; esperarSegundos?: number }

/** Bloqueio progressivo: cada falha custa mais caro que a anterior. */
const LIMITE_TENTATIVAS = 5
const BLOQUEIO_BASE_MS = 60_000

export async function autenticar(entrada: {
  email: string
  senha: string
  ip?: string | null
  userAgent?: string | null
}): Promise<ResultadoLogin> {
  const email = entrada.email.trim().toLowerCase()

  const usuarios = await comContextoAuth(async (tx) =>
    tx.user.findMany({
      where: { email },
      include: { tenant: { select: { ativo: true, bloqueado: true } } },
    }),
  )

  // O mesmo e-mail pode existir em duas franquias. Se houver mais de um, a
  // senha decide qual — sem revelar ao usuário que existe outro cadastro.
  const agora = Date.now()
  for (const u of usuarios) {
    if (u.bloqueadoAte && u.bloqueadoAte.getTime() > agora) {
      const s = Math.ceil((u.bloqueadoAte.getTime() - agora) / 1000)
      return {
        ok: false,
        motivo: `Muitas tentativas seguidas. Tente de novo em ${s} segundos.`,
        esperarSegundos: s,
      }
    }

    if (await conferirSenha(u.senhaHash, entrada.senha)) {
      if (!u.ativo) return { ok: false, motivo: 'Acesso desativado. Fale com o responsável.' }
      if (u.papel !== 'SUPER_ADMIN' && (!u.tenant?.ativo || u.tenant.bloqueado)) {
        return { ok: false, motivo: 'Acesso da empresa suspenso. Fale com o responsável.' }
      }

      await registrarTentativa(u.id, true)
      return { ok: true, userId: u.id, papel: u.papel, trocarSenha: u.trocarSenha }
    }

    // Senha errada: encarece a próxima tentativa daquele cadastro.
    await registrarTentativa(u.id, false)
  }

  // Quando o e-mail não existe, gastamos tempo de propósito verificando um
  // hash descartável. Sem isso, a diferença de tempo de resposta entrega quais
  // e-mails estão cadastrados, e a lista vira alvo de ataque dirigido.
  if (usuarios.length === 0) {
    await conferirSenha(HASH_DESCARTAVEL, entrada.senha)
  }

  return { ok: false, motivo: 'E-mail ou senha incorretos.' }
}

/**
 * Atualiza o contador anti-força-bruta.
 *
 * Passa por uma função do banco em vez de um UPDATE direto, e isso é
 * deliberado: a policy de `usuarios` proíbe escrita no contexto de login —
 * sem essa proibição, uma falha aqui viraria alteração de usuário, inclusive
 * de papel. A função toca exatamente três colunas de uma linha: contador,
 * bloqueio e último acesso. Ela não alcança papel, empresa, senha nem `ativo`.
 */
async function registrarTentativa(userId: string, sucesso: boolean): Promise<void> {
  await comContextoAuth(async (tx) => {
    await tx.$executeRaw`
      SELECT app.registrar_tentativa_login(
        ${userId},
        ${sucesso},
        ${LIMITE_TENTATIVAS},
        ${`${Math.round(BLOQUEIO_BASE_MS / 1000)} seconds`}::interval
      )
    `
  })
}

/** Hash real de uma senha aleatória, só para consumir o tempo do Argon2. */
const HASH_DESCARTAVEL =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Z8p1Xn9K3PYy7oS2cO4lZQqvJ7XU3rMk2xNvBcQwErY'

export { comparaSegura }
