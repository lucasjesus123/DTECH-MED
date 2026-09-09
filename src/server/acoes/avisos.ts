'use server'

import { z } from 'zod'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { chavePublica, ligado } from '@/server/push/avisos'

/**
 * LIGAR E DESLIGAR O AVISO NO CELULAR.
 *
 * =============================================================================
 * A INSCRIÇÃO É DO APARELHO, E QUEM A CRIA É O NAVEGADOR
 * =============================================================================
 * O que chega aqui não é um pedido para "ativar notificações": é o endereço que
 * o servidor push do fabricante (Google, Apple, Mozilla) já entregou ao
 * navegador do motorista, mais as duas chaves da criptografia ponta a ponta.
 * O nosso trabalho é guardar isso amarrado à pessoa e à empresa.
 *
 * =============================================================================
 * POR QUE O `endpoint` É ÚNICO E A GRAVAÇÃO É UM UPSERT
 * =============================================================================
 * O mesmo aparelho, reinstalando o aplicativo ou trocando de usuário, devolve o
 * mesmo endereço. Sem o upsert, cada vez criaria uma linha nova — e o celular
 * tocaria duas, três, cinco vezes pelo mesmo aviso. O upsert também é o que
 * transfere o aparelho quando outra pessoa entra nele: a linha passa a apontar
 * para quem está logado agora.
 */

type Resposta = { ok: true } | { ok: false; motivo: string }

const schema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(300),
  auth: z.string().min(1).max(300),
  aparelho: z.string().trim().max(120).optional(),
})

/** O que a tela precisa saber antes de oferecer o botão. */
export async function estadoDosAvisos(): Promise<{
  ligado: boolean
  chavePublica: string | null
}> {
  return { ligado: ligado(), chavePublica: chavePublica() }
}

export async function inscreverAparelho(entrada: unknown): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!ligado()) {
    return {
      ok: false,
      motivo: 'Os avisos no celular ainda não foram ligados nesta empresa.',
    }
  }

  const d = schema.safeParse(entrada)
  if (!d.success) return { ok: false, motivo: 'Inscrição inválida.' }
  const v = d.data
  const ctx = contextoDe(sessao)

  await comEscopo(ctx, (tx) =>
    tx.pushInscricao.upsert({
      where: { endpoint: v.endpoint },
      create: {
        tenantId: exigirEmpresa(ctx),
        usuarioId: sessao.userId,
        endpoint: v.endpoint,
        p256dh: v.p256dh,
        auth: v.auth,
        aparelho: v.aparelho || null,
      },
      /**
       * O UPDATE TROCA O DONO, e isso é de propósito.
       *
       * Celular emprestado entre dois motoristas é rotina numa frota pequena.
       * Quem estiver logado agora é quem deve receber o aviso — deixar a linha
       * no nome de quem usou o aparelho ontem faria a corrida de hoje tocar no
       * bolso errado.
       *
       * `falhas: 0` porque uma inscrição refeita é um aparelho que voltou: o
       * contador de desistência recomeça.
       */
      update: {
        usuarioId: sessao.userId,
        p256dh: v.p256dh,
        auth: v.auth,
        aparelho: v.aparelho || null,
        falhas: 0,
      },
    }),
  )

  return { ok: true }
}

/**
 * Desliga o aviso NESTE aparelho.
 *
 * Só neste: quem desliga no celular pessoal não quer desligar no que fica no
 * carro. Por isso a chave é o endpoint, e não a pessoa.
 */
export async function desinscreverAparelho(endpoint: string): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  const ctx = contextoDe(sessao)

  // `deleteMany` e não `delete`: o endpoint pode já não existir — a pessoa
  // clicou duas vezes, ou o navegador revogou antes. Apagar o que não há não é
  // erro, e o RLS garante que ninguém apaga o aparelho de outra empresa.
  await comEscopo(ctx, (tx) => tx.pushInscricao.deleteMany({ where: { endpoint } }))
  return { ok: true }
}
