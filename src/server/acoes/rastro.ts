'use server'

import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * O RASTRO DA ROTA.
 *
 * ---------------------------------------------------------------------------
 * TRÊS TRAVAS, E POR QUE CADA UMA
 * ---------------------------------------------------------------------------
 * 1. **Só o motorista DAQUELA parada grava.** Sem isso, qualquer sessão de
 *    motorista poderia empurrar posição para a parada de outro — e o mapa
 *    passaria a mostrar uma pessoa onde ela não está, que é pior do que não
 *    mostrar nada.
 *
 * 2. **Só enquanto a parada está EM_ROTA.** É a trava de FINALIDADE. Fora da
 *    rota, guardar a localização de alguém deixa de ser logística e vira
 *    monitoramento de funcionário — outra finalidade, outra base legal. Aqui
 *    isso não depende de ninguém lembrar: a gravação simplesmente recusa.
 *
 * 3. **Uma posição a cada 25 segundos, no máximo.** O `watchPosition` do
 *    navegador dispara a cada poucos metros; sem freio, uma rota de duas horas
 *    viraria milhares de linhas que não dizem nada além do que dizem cinco.
 *
 * ---------------------------------------------------------------------------
 * O QUE ACONTECE QUANDO FALHA
 * ---------------------------------------------------------------------------
 * Nada. Devolve `{ ok: false }` e a tela do motorista ignora. Rastro é
 * conveniência para quem está na central; se ele atrapalhar quem está na rua
 * — travando a tela, gastando bateria, mostrando erro — ele passa a custar
 * mais do que vale.
 */

type Resposta = { ok: true } | { ok: false; motivo: string }

/** O freio: menos que isto entre duas linhas da mesma parada é descartado. */
const INTERVALO_MINIMO_MS = 25_000

const schema = z.object({
  agendamentoId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  precisaoM: z.number().min(0).max(100_000).nullish(),
  velocidade: z.number().min(0).max(120).nullish(),
})

export async function registrarPosicao(entrada: {
  agendamentoId: string
  latitude: number
  longitude: number
  precisaoM?: number | null
  velocidade?: number | null
}): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada.' }
  if (sessao.papel !== Papel.MOTORISTA && sessao.papel !== Papel.SUPER_ADMIN) {
    return { ok: false, motivo: 'Só quem está na rua grava posição.' }
  }

  const d = schema.safeParse(entrada)
  if (!d.success) return { ok: false, motivo: 'Coordenada inválida.' }
  const v = d.data

  const ctx = contextoDe(sessao)

  return comEscopo(ctx, async (tx) => {
    const parada = await tx.agendamento.findUnique({
      where: { id: v.agendamentoId },
      select: { id: true, status: true, motoristaId: true },
    })
    if (!parada) return { ok: false as const, motivo: 'Parada não encontrada.' }

    // Trava 1: é a parada DESTE motorista?
    if (sessao.papel !== Papel.SUPER_ADMIN && parada.motoristaId !== sessao.userId) {
      return { ok: false as const, motivo: 'Esta parada não é sua.' }
    }
    // Trava 2: a rota está acontecendo AGORA?
    if (parada.status !== 'EM_ROTA') {
      return { ok: false as const, motivo: 'A parada não está em rota.' }
    }

    // Trava 3: o freio.
    const ultima = await tx.posicaoRota.findFirst({
      where: { agendamentoId: v.agendamentoId },
      orderBy: { criadoEm: 'desc' },
      select: { criadoEm: true },
    })
    if (ultima && Date.now() - ultima.criadoEm.getTime() < INTERVALO_MINIMO_MS) {
      // Não é erro: é o freio funcionando. A tela não mostra nada.
      return { ok: true as const }
    }

    await tx.posicaoRota.create({
      data: {
        tenantId: exigirEmpresa(ctx),
        agendamentoId: v.agendamentoId,
        motoristaId: sessao.userId,
        motoristaNome: sessao.nome,
        latitude: v.latitude,
        longitude: v.longitude,
        precisaoM: v.precisaoM ?? null,
        velocidade: v.velocidade ?? null,
      },
    })
    return { ok: true as const }
  }).catch(() => ({ ok: false as const, motivo: 'Não foi possível gravar a posição.' }))
}
