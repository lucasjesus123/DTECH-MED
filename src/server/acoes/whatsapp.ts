'use server'

import { revalidatePath } from 'next/cache'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { conectar, criarInstancia, guardarToken, status, tokenDaEmpresa } from '@/server/whatsapp/uazapi'

/**
 * Conexão do WhatsApp da empresa.
 *
 * Cada franquia tem o SEU número. A chave-mestra da uazapi fica só no ambiente
 * do servidor e é usada num único lugar — criar a instância. O token da
 * instância, que é o que de fato envia mensagem, é cifrado antes de encostar no
 * banco e nunca sai para o navegador: quem lê um dump não sai disparando
 * mensagem pelo número do cliente.
 *
 * O QR Code aparece na tela e some com ele. Guardá-lo seria guardar uma chave
 * de sessão do WhatsApp em repouso, sem necessidade nenhuma.
 */

type Resposta<T = unknown> = { ok: true; dados?: T; mensagem?: string } | { ok: false; motivo: string }

const PODE_CONECTAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

/** Cria a instância (se ainda não houver) e devolve o QR Code para leitura. */
export async function conectarWhatsapp(): Promise<Resposta<{ qrcode: string | null; paircode: string | null }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONECTAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não conecta o WhatsApp da empresa.' }
  }
  if (!a.ctx.tenantId) return { ok: false, motivo: 'Escolha uma empresa antes de conectar.' }

  try {
    let token = await tokenDaEmpresa(a.ctx)

    if (!token) {
      const empresa = await comEscopo(a.ctx, (tx) =>
        tx.tenant.findUnique({ where: { id: a.ctx.tenantId! }, select: { nome: true } }),
      )
      if (!empresa) return { ok: false, motivo: 'Empresa não encontrada.' }

      const nova = await criarInstancia(a.ctx.tenantId, empresa.nome)
      await guardarToken(a.ctx, { uazInstanceId: nova.uazInstanceId, uazToken: nova.uazToken })
      token = nova.uazToken
    }

    const r = await conectar(token)
    await auditar(a.ctx, a.sessao, { acao: 'whatsapp.conectar', entidade: 'tenant', entidadeId: a.ctx.tenantId })
    revalidatePath('/painel/whatsapp')

    return {
      ok: true,
      dados: r,
      mensagem: r.qrcode
        ? 'Leia o código no WhatsApp do celular da empresa: Aparelhos conectados → Conectar aparelho.'
        : 'A instância respondeu sem QR Code. Se o número já estiver conectado, atualize o status.',
    }
  } catch (e) {
    // O erro da uazapi pode conter detalhe de infraestrutura; a tela recebe uma
    // frase útil, e o detalhe fica no log do servidor.
    console.error('[whatsapp] falha ao conectar:', e)
    return {
      ok: false,
      motivo:
        'Não foi possível falar com o serviço de WhatsApp agora. Confira a chave da uazapi no servidor e tente de novo.',
    }
  }
}

/** Pergunta ao provedor se o número está de fato conectado e grava o resultado. */
export async function atualizarStatusWhatsapp(): Promise<Resposta<{ conectado: boolean }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CONECTAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera a conexão do WhatsApp.' }
  }

  const token = await tokenDaEmpresa(a.ctx)
  if (!token) return { ok: false, motivo: 'Esta empresa ainda não tem instância criada.' }

  try {
    const s = await status(token)
    await comEscopo(a.ctx, async (tx) => {
      await tx.whatsappInstance.update({
        where: { tenantId: a.ctx.tenantId! },
        data: {
          status: s.conectado ? 'CONECTADA' : 'DESCONECTADA',
          profileName: s.profileName,
          ultimoStatusEm: new Date(),
        },
      })
    })
    revalidatePath('/painel/whatsapp')
    return {
      ok: true,
      dados: { conectado: s.conectado },
      mensagem: s.conectado ? 'Número conectado.' : 'O número ainda não está conectado.',
    }
  } catch (e) {
    console.error('[whatsapp] falha ao consultar status:', e)
    return { ok: false, motivo: 'Não foi possível consultar o status agora.' }
  }
}
