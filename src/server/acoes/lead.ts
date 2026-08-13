'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { ipDaRequisicao } from '@/server/auth/guarda'

/**
 * O formulário do site — o passo 1 da linha do tempo.
 *
 * É a segunda superfície pública do sistema, e a única que ESCREVE sem sessão.
 * Três decisões sustentam isso:
 *
 *  • **A empresa de destino vem do ambiente, não do formulário.** Se viesse do
 *    corpo do request, bastaria trocar um campo para despejar contatos na caixa
 *    de entrada da franquia vizinha.
 *  • **A escrita passa por uma função do banco que só enxerga `leads`.** Abrir
 *    uma policy pública de INSERT resolveria o problema imediato e criaria um
 *    buraco permanente; a função não alcança nenhuma outra tabela.
 *  • **Limite de taxa por IP e campo-armadilha.** Formulário público sem
 *    nenhum dos dois vira canhão de spam em questão de dias, e aí a caixa de
 *    entrada deixa de ser lida — que é o mesmo que não ter formulário.
 */

export type RespostaLead = { ok: true } | { ok: false; motivo: string }

const schema = z.object({
  nome: z.string().trim().min(3, 'Escreva seu nome.').max(160),
  telefone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 10 && v.length <= 13, 'Informe um telefone com DDD.'),
  email: z.string().trim().toLowerCase().max(160).nullish(),
  empresa: z.string().trim().max(160).nullish(),
  cidade: z.string().trim().max(120).nullish(),
  equipamento: z.string().trim().max(200).nullish(),
  mensagem: z.string().trim().min(10, 'Conte em uma frase o que está acontecendo.').max(4000),
  // Campo-armadilha: fica escondido no CSS, gente não preenche, robô preenche.
  site: z.string().nullish(),
})

const tentativas = new Map<string, { n: number; desde: number }>()

function excedeu(ip: string): boolean {
  const agora = Date.now()
  const t = tentativas.get(ip)
  if (!t || agora - t.desde > env.LEAD_RATE_LIMIT_WINDOW_MS) {
    tentativas.set(ip, { n: 1, desde: agora })
    return false
  }
  t.n++
  return t.n > env.LEAD_RATE_LIMIT_MAX
}

// A tabela não pode crescer para sempre num processo de vida longa.
setInterval(() => {
  const limite = Date.now() - env.LEAD_RATE_LIMIT_WINDOW_MS
  for (const [k, v] of tentativas) if (v.desde < limite) tentativas.delete(k)
}, 60_000).unref?.()

export async function pedirRetirada(_anterior: RespostaLead, form: FormData): Promise<RespostaLead> {
  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // Armadilha preenchida: respondemos "ok" e descartamos. Dizer "spam
  // detectado" só ensinaria o robô a contornar na próxima tentativa.
  if (v.site) return { ok: true }

  const h = await headers()
  const ip = ipDaRequisicao(h, env.TRUST_PROXY) ?? 'desconhecido'

  if (excedeu(ip)) {
    return {
      ok: false,
      motivo: 'Recebemos vários pedidos deste acesso. Se for urgente, chame no WhatsApp.',
    }
  }

  // O e-mail é opcional; quando vem, precisa ser plausível — senão o retorno
  // volta com erro e ninguém descobre.
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) {
    return { ok: false, motivo: 'Confira o e-mail digitado.' }
  }

  try {
    const linhas = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT app.registrar_lead(
        ${env.SITE_TENANT_SLUG},
        ${v.nome},
        ${v.telefone},
        ${v.email ?? ''},
        ${v.empresa ?? ''},
        ${v.cidade ?? ''},
        ${v.equipamento ?? ''},
        ${v.mensagem},
        ${ip === 'desconhecido' ? '' : ip},
        ${h.get('user-agent')?.slice(0, 400) ?? ''}
      ) AS id
    `
    if (!linhas[0]?.id) {
      // Empresa não encontrada ou suspensa. Para quem está do lado de fora, o
      // problema é nosso — e é, de fato.
      console.error(`[lead] empresa "${env.SITE_TENANT_SLUG}" não recebeu o contato.`)
      return {
        ok: false,
        motivo: 'Não conseguimos registrar agora. Chame no WhatsApp que a gente resolve na hora.',
      }
    }
  } catch (e) {
    console.error('[lead] falha ao registrar:', e)
    return {
      ok: false,
      motivo: 'Não conseguimos registrar agora. Chame no WhatsApp que a gente resolve na hora.',
    }
  }

  return { ok: true }
}
