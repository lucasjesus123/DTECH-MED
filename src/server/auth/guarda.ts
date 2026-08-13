import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { contextoDe, lerSessao, type Sessao } from './sessao'

/**
 * Guardas de rota e de ação.
 *
 * A regra que organiza este arquivo: **esconder o botão não é segurança**. A
 * tela usa `podeVer` só para não oferecer o que não vai funcionar; quem decide
 * de verdade é o guarda no servidor, em toda ação, sempre.
 *
 * Hierarquia:
 *   SUPER_ADMIN    dono da plataforma; cadastra as empresas
 *   ADMIN_EMPRESA  responsável pela franquia; cria os usuários dela
 *   GESTOR         aprova orçamento e serviço, dá a baixa final
 *   FINANCEIRO     lança pagamento e fecha fatura
 *   ATENDENTE      central: cliente, ordem de retirada, agenda
 *   TECNICO        bancada: recebe, fotografa, lauda, executa
 *   MOTORISTA      rua: retira e entrega, coleta assinatura
 */

const P = Papel

/** Peso para comparações do tipo "no mínimo gestor". */
export const NIVEL: Record<Papel, number> = {
  SUPER_ADMIN: 100,
  ADMIN_EMPRESA: 80,
  GESTOR: 60,
  FINANCEIRO: 40,
  ATENDENTE: 30,
  TECNICO: 20,
  MOTORISTA: 10,
}

export type Autenticado = { sessao: Sessao; ctx: ContextoAcesso }

/** Exige alguém logado. Sem sessão, manda para o login. */
export async function exigirSessao(): Promise<Autenticado> {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  return { sessao, ctx: contextoDe(sessao) }
}

/** Exige um dos papéis listados. */
export async function exigirPapel(...papeis: Papel[]): Promise<Autenticado> {
  const a = await exigirSessao()
  // O super admin atravessa a checagem de papel, mas nunca as pré-condições
  // de negócio da máquina de estados.
  if (a.sessao.papel === P.SUPER_ADMIN) return a
  if (!papeis.includes(a.sessao.papel)) redirect('/painel/sem-permissao')
  return a
}

/** Exige um nível mínimo na hierarquia. */
export async function exigirNivel(minimo: Papel): Promise<Autenticado> {
  const a = await exigirSessao()
  if (NIVEL[a.sessao.papel] < NIVEL[minimo]) redirect('/painel/sem-permissao')
  return a
}

export async function exigirSuperAdmin(): Promise<Autenticado> {
  const a = await exigirSessao()
  if (a.sessao.papel !== P.SUPER_ADMIN) redirect('/painel/sem-permissao')
  return a
}

/** Só para a tela decidir o que desenhar. Nunca para autorizar. */
export function podeVer(papel: Papel, minimo: Papel): boolean {
  return NIVEL[papel] >= NIVEL[minimo]
}

/**
 * Registra na trilha de segurança.
 *
 * `negado: true` marca tentativa barrada. É a linha que responde, meses
 * depois, se alguém andou tentando alcançar dado de outra empresa.
 */
export async function auditar(
  ctx: ContextoAcesso,
  sessao: Sessao | null,
  dados: {
    acao: string
    entidade?: string
    entidadeId?: string
    detalhes?: Record<string, unknown>
    ip?: string | null
    userAgent?: string | null
    negado?: boolean
  },
): Promise<void> {
  try {
    await comEscopo(ctx, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: sessao?.userId ?? null,
          userNome: sessao?.nome ?? null,
          userPapel: sessao?.papel ?? null,
          acao: dados.acao,
          entidade: dados.entidade ?? null,
          entidadeId: dados.entidadeId ?? null,
          // Nunca guardamos senha, token ou documento em claro aqui.
          detalhes: (dados.detalhes ?? {}) as never,
          ip: dados.ip ?? null,
          userAgent: dados.userAgent?.slice(0, 400) ?? null,
          negado: dados.negado ?? false,
        },
      })
    })
  } catch {
    // Falha ao auditar não pode derrubar a operação do usuário. Mas também não
    // pode passar em silêncio, então vai para o log do processo.
    console.error('[auditoria] não foi possível gravar:', dados.acao)
  }
}

/**
 * Extrai o IP do cliente.
 *
 * Só confia em `x-forwarded-for` quando `TRUST_PROXY` está ligado. Fora disso,
 * o header é campo livre que qualquer um preenche — e um IP forjado na trilha
 * de auditoria é pior que nenhum IP, porque parece confiável.
 */
export function ipDaRequisicao(headers: Headers, confiarNoProxy: boolean): string | null {
  if (confiarNoProxy) {
    const xff = headers.get('x-forwarded-for')
    if (xff) return xff.split(',')[0]!.trim()
    const real = headers.get('x-real-ip')
    if (real) return real.trim()
  }
  return null
}
