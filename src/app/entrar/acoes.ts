'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { env } from '@/lib/env'
import { autenticar, criarSessao } from '@/server/auth/sessao'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'

/**
 * Ação de login.
 *
 * Um detalhe que vale a pena: a mensagem de erro é sempre a mesma, seja e-mail
 * inexistente ou senha errada. Dizer "e-mail não cadastrado" entrega ao
 * atacante metade do trabalho — ele passa a saber quais endereços existem e
 * concentra a força bruta neles.
 *
 * O rate limit por IP mora aqui e é em memória. Isso basta para um processo
 * só, que é o caso desta gaveta; se um dia rodar em várias instâncias, precisa
 * migrar para o banco ou Redis, senão cada instância conta separado e o teto
 * efetivo multiplica.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Digite sua senha.'),
  // `nullish`, não `optional`: quando o campo oculto não é renderizado,
  // `FormData.get()` devolve **null**, e não `undefined`. Com `.optional()` o
  // Zod rejeitava o login inteiro e a pessoa via "expected string, received
  // null" no lugar da mensagem de erro de verdade.
  destino: z.string().nullish(),
})

type Estado = { erro?: string; campo?: 'email' | 'senha' }

const tentativas = new Map<string, { n: number; desde: number }>()

function excedeu(chave: string): boolean {
  const agora = Date.now()
  const t = tentativas.get(chave)
  if (!t || agora - t.desde > env.LOGIN_RATE_LIMIT_WINDOW_MS) {
    tentativas.set(chave, { n: 1, desde: agora })
    return false
  }
  t.n++
  return t.n > env.LOGIN_RATE_LIMIT_MAX
}

// A tabela não pode crescer para sempre num processo de vida longa.
setInterval(() => {
  const limite = Date.now() - env.LOGIN_RATE_LIMIT_WINDOW_MS
  for (const [k, v] of tentativas) if (v.desde < limite) tentativas.delete(k)
}, 60_000).unref?.()

export async function entrar(_anterior: Estado, form: FormData): Promise<Estado> {
  const dados = schema.safeParse({
    email: form.get('email'),
    senha: form.get('senha'),
    destino: form.get('destino'),
  })
  if (!dados.success) {
    const i = dados.error.issues[0]!
    return { erro: i.message, campo: i.path[0] as 'email' | 'senha' }
  }

  const h = await headers()
  const ip = ipDaRequisicao(h, env.TRUST_PROXY) ?? 'desconhecido'
  const ua = h.get('user-agent')

  if (excedeu(`${ip}:${dados.data.email}`)) {
    await auditar({ tenantId: null, userId: null, ehSuperAdmin: true }, null, {
      acao: 'login.rate_limit',
      detalhes: { email: mascarar(dados.data.email) },
      ip,
      userAgent: ua,
      negado: true,
    })
    return { erro: 'Muitas tentativas. Espere alguns minutos e tente de novo.' }
  }

  const r = await autenticar({ email: dados.data.email, senha: dados.data.senha, ip, userAgent: ua })

  if (!r.ok) {
    await auditar({ tenantId: null, userId: null, ehSuperAdmin: true }, null, {
      acao: 'login.falhou',
      detalhes: { email: mascarar(dados.data.email) },
      ip,
      userAgent: ua,
      negado: true,
    })
    return { erro: r.motivo }
  }

  await criarSessao(r.userId, { ip, userAgent: ua })
  tentativas.delete(`${ip}:${dados.data.email}`)

  // Só aceita destino interno. Sem isso, `?destino=https://site-falso` faria o
  // login legítimo terminar numa página controlada por outra pessoa.
  const destino = dados.data.destino
  const seguro = destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/painel'
  redirect(r.trocarSenha ? '/painel/trocar-senha' : seguro)
}

/** Guarda o e-mail na auditoria sem escrever o endereço inteiro. */
function mascarar(email: string): string {
  const [u, d] = email.split('@')
  if (!u || !d) return '***'
  return `${u.slice(0, 2)}***@${d}`
}
