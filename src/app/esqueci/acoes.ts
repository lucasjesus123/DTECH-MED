'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { env } from '@/lib/env'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'
import { pedirRecuperacao, redefinirComToken } from '@/server/auth/recuperacao'

/**
 * As duas pontas da recuperação de senha.
 *
 * =============================================================================
 * A REGRA QUE ORGANIZA ESTE ARQUIVO
 * =============================================================================
 * A tela de pedir **nunca** varia a resposta. E-mail que existe, e-mail que não
 * existe, conta desativada, empresa suspensa, freio de dois minutos: sai sempre
 * o mesmo aviso. Qualquer diferença — no texto, no tempo, num campo destacado —
 * vira uma máquina de descobrir quem trabalha na empresa, e essa lista é metade
 * do trabalho de quem vai atacar as senhas depois.
 *
 * A tela de redefinir varia, porque ali a pessoa já provou ter o link: dizer
 * "a senha é curta demais" não conta nada a quem não tem o link, e não dizer
 * deixaria quem tem preso numa tela que recusa sem explicar.
 */

const schemaPedido = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
})

const schemaRedefinir = z
  .object({
    token: z.string().min(20, 'Link inválido.'),
    // Mesma régua da troca de senha de dentro do sistema. Duas exigências
    // diferentes para a mesma senha confundiriam quem trocou pelos dois
    // caminhos e não entendeu por que uma foi aceita e a outra não.
    nova: z.string().min(10, 'A nova senha precisa ter ao menos 10 caracteres.'),
    confirmacao: z.string().min(1, 'Repita a nova senha.'),
  })
  .refine((v) => v.nova === v.confirmacao, {
    message: 'As duas senhas não são iguais.',
    path: ['confirmacao'],
  })

export type EstadoPedido = { enviado?: boolean; erro?: string }
export type EstadoRedefinicao = { ok?: boolean; erro?: string }

// ---------------------------------------------------------------------------
// Freio por IP
// ---------------------------------------------------------------------------
// O freio por CONTA vive no banco (`app.criar_recuperacao`), porque é lá que
// ele funciona com mais de um processo. Este aqui é outro: impede que UMA
// máquina dispare pedido em volume. Em memória basta — ele protege contra
// volume, e volume de uma origem só passa por um processo só.
//
// O TETO é 20, e não 5, porque o endereço de rede não é a pessoa: uma clínica
// inteira sai pelo mesmo IP. Numa segunda-feira em que meia equipe volta de
// férias sem lembrar a senha, um teto apertado barraria gente legítima — e
// barraria em SILÊNCIO, porque a resposta desta tela é sempre a mesma. O
// remédio ficaria pior que a doença: a pessoa veria "enviamos" e esperaria uma
// mensagem que nunca sairia.
//
// Vinte é firme o suficiente. O que este freio protege é o WhatsApp de terceiro
// contra disparo em massa — e essa porta já tem outra tranca, o freio de dois
// minutos POR CONTA, que vale mesmo com o pedido vindo de mil endereços.
// Descobrir quais e-mails existem, este teto nem precisa impedir: a resposta é
// idêntica para conta que existe e conta que não existe.

const pedidos = new Map<string, { n: number; desde: number }>()
const JANELA_MS = 15 * 60 * 1000
const TETO = 20

function excedeu(ip: string): boolean {
  const agora = Date.now()
  const t = pedidos.get(ip)
  if (!t || agora - t.desde > JANELA_MS) {
    pedidos.set(ip, { n: 1, desde: agora })
    return false
  }
  t.n++
  return t.n > TETO
}

setInterval(() => {
  const limite = Date.now() - JANELA_MS
  for (const [k, v] of pedidos) if (v.desde < limite) pedidos.delete(k)
}, 60_000).unref?.()

// ---------------------------------------------------------------------------

export async function pedirLink(_anterior: EstadoPedido, form: FormData): Promise<EstadoPedido> {
  const d = schemaPedido.safeParse({ email: form.get('email') })
  // Um e-mail malformado é o ÚNICO erro que aparece aqui, e ele não conta nada:
  // "abc" não é endereço para ninguém, existindo cadastro ou não.
  if (!d.success) return { erro: d.error.issues[0]!.message }

  const h = await headers()
  const ip = ipDaRequisicao(h, env.TRUST_PROXY) ?? 'desconhecido'
  const ua = h.get('user-agent')

  if (excedeu(ip)) {
    await auditar({ tenantId: null, userId: null, ehSuperAdmin: true }, null, {
      acao: 'senha.esqueci.rate_limit',
      ip,
      userAgent: ua,
      negado: true,
    })
    // Mesmo desfecho visual do sucesso: quem varre não pode descobrir que
    // esbarrou num limite, senão ele espera e recomeça com a contagem zerada.
    return { enviado: true }
  }

  await pedirRecuperacao({ email: d.data.email, ip, userAgent: ua })
  return { enviado: true }
}

export async function redefinir(
  _anterior: EstadoRedefinicao,
  form: FormData,
): Promise<EstadoRedefinicao> {
  const d = schemaRedefinir.safeParse({
    token: form.get('token'),
    nova: form.get('nova'),
    confirmacao: form.get('confirmacao'),
  })
  if (!d.success) return { erro: d.error.issues[0]!.message }

  const h = await headers()
  const ip = ipDaRequisicao(h, env.TRUST_PROXY) ?? 'desconhecido'
  const ua = h.get('user-agent')

  const r = await redefinirComToken({ token: d.data.token, senha: d.data.nova, ip, userAgent: ua })
  if (!r.ok) return { erro: r.motivo }

  return { ok: true }
}
