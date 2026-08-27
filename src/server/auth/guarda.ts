import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { podeAbrir } from '@/server/auth/telas'
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

/**
 * Exige que a pessoa TENHA a aba.
 *
 * Fica ao LADO do guarda de papel de cada página, e não no lugar dele: são duas
 * perguntas, e as duas precisam valer.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE ALÉM DO `exigirNivel`
 * ---------------------------------------------------------------------------
 * `exigirNivel` responde "o papel dela alcança esta tela?". Esta função responde
 * a outra pergunta: "esta tela foi dada a ela?".
 *
 * As duas precisam valer. Um financeiro cujo administrador deixou marcado só o
 * Financeiro tem papel para abrir a Preventiva — e não deve abrir, porque não
 * foi isso que combinaram. Sem esta checagem, esconder a aba no menu seria
 * enfeite: bastaria digitar o endereço.
 *
 * Devolve para a mesma tela de "sem permissão" das outras recusas. Dizer "você
 * até poderia, mas não te deram" seria mapear o sistema para quem estivesse
 * tateando.
 */
export async function exigirAba(chave: string): Promise<void> {
  const a = await exigirSessao()
  if (!podeAbrir(a.sessao.papel, a.sessao.telas, chave)) redirect('/painel/sem-permissao')
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
    /**
     * Quem fez, quando NÃO HÁ SESSÃO — e mesmo assim se sabe quem é.
     *
     * A recuperação de senha é o caso: a pessoa está deslogada por definição,
     * mas o link prova de quem é a conta. Sem isto, a linha mais importante da
     * trilha ("a senha desta pessoa foi trocada por um link") aparecia como
     * "Sem autor registrado" — verdadeiro e inútil, porque quem lê quer saber
     * exatamente de quem.
     *
     * Só vale quando não há sessão. Havendo, a sessão manda: o nome de quem
     * está logado não pode ser sobrescrito por um parâmetro de chamada, senão
     * a trilha deixa de provar qualquer coisa.
     */
    autorNome?: string | null
    autorPapel?: Papel | null
  },
): Promise<void> {
  try {
    await comEscopo(ctx, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: sessao?.userId ?? null,
          // A sessão vence sempre; o parâmetro só preenche o vazio.
          userNome: sessao?.nome ?? dados.autorNome ?? null,
          userPapel: sessao?.papel ?? dados.autorPapel ?? null,
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
