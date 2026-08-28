'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { avancarOrdem } from '@/server/ordem/motor'

/**
 * Agenda de retirada e entrega.
 *
 * O endereço é **congelado** no agendamento, não referenciado do cadastro. Se
 * a clínica mudar de sala seis meses depois, o comprovante precisa continuar
 * mostrando onde o motorista realmente foi — senão o documento perde o valor
 * exatamente quando alguém precisa dele.
 */

type Resposta = { ok: true } | { ok: false; motivo: string }

const PODE_AGENDAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel } }
}

const schema = z.object({
  ordemId: z.string().min(1),
  tipo: z.enum(['RETIRADA', 'ENTREGA']),
  motoristaId: z.string().nullish(),
  data: z.string().min(10, 'Escolha a data.'),
  hora: z.string().nullish(),
  janelaFim: z.string().nullish(),
  endereco: z.string().trim().min(5, 'Confirme o endereço da parada.'),
  contatoNome: z.string().trim().nullish(),
  contatoTelefone: z.string().trim().nullish(),
  pontoReferencia: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
})

/** Agenda a parada e avança a ordem, quando a etapa permite. */
export async function agendar(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_AGENDAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não agenda rota.' }
  }

  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const previsto = new Date(`${v.data}T${v.hora || '09:00'}:00-03:00`)
  if (Number.isNaN(previsto.getTime())) return { ok: false, motivo: 'Data ou hora inválida.' }
  const fim = v.janelaFim ? new Date(`${v.data}T${v.janelaFim}:00-03:00`) : null
  if (fim && !Number.isNaN(fim.getTime()) && fim <= previsto) {
    return { ok: false, motivo: 'O fim da janela precisa ser depois do início.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const ordem = await tx.ordem.findUnique({
      where: { id: v.ordemId },
      select: { id: true, etapa: true },
    })
    if (!ordem) return { ok: false as const, motivo: 'Ordem não encontrada.' }

    await tx.agendamento.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        ordemId: v.ordemId,
        tipo: v.tipo,
        status: v.motoristaId ? 'ATRIBUIDO' : 'PENDENTE',
        motoristaId: v.motoristaId || null,
        previstoPara: previsto,
        janelaInicio: previsto,
        janelaFim: fim && !Number.isNaN(fim.getTime()) ? fim : null,
        enderecoSnapshot: v.endereco,
        contatoNome: v.contatoNome || null,
        contatoTelefone: v.contatoTelefone?.replace(/\D/g, '') || null,
        pontoReferencia: v.pontoReferencia || null,
        observacoes: v.observacoes || null,
      },
    })
    return { ok: true as const, etapa: ordem.etapa }
  })
  if (!r.ok) return r

  // A retirada agendada é a etapa 3 da linha do tempo e dispara o aviso ao
  // cliente com data, hora e nome do motorista. A entrega já vem de FATURADO,
  // e quem avança ali é o motorista ao sair.
  if (v.tipo === 'RETIRADA' && r.etapa === EtapaOrdem.ORDEM_RETIRADA_GERADA) {
    const t = await avancarOrdem(a.ctx, a.ator, {
      ordemId: v.ordemId,
      para: EtapaOrdem.RETIRADA_AGENDADA,
      payload: { previstoPara: previsto.toISOString(), endereco: v.endereco },
    })
    if (!t.ok) return { ok: false, motivo: t.motivo }
  }

  await auditar(a.ctx, a.sessao, { acao: `agenda.${v.tipo.toLowerCase()}`, entidade: 'ordem', entidadeId: v.ordemId })
  revalidatePath('/painel/rota')
  revalidatePath(`/painel/ordens/${v.ordemId}`)
  revalidatePath('/painel')
  return { ok: true }
}

/** Troca o motorista de uma parada já marcada. */
export async function atribuirMotorista(agendamentoId: string, motoristaId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_AGENDAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera a rota.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const ag = await tx.agendamento.findUnique({
      where: { id: agendamentoId },
      select: { id: true, status: true },
    })
    if (!ag) return { ok: false as const, motivo: 'Agendamento não encontrado.' }
    if (ag.status === 'CONCLUIDO') return { ok: false as const, motivo: 'Esta parada já foi concluída.' }

    // Confere que o motorista é desta empresa. O RLS já barraria a escrita, mas
    // uma mensagem clara vale mais que um erro de policy na tela.
    if (motoristaId) {
      const m = await tx.user.findFirst({
        where: { id: motoristaId, papel: Papel.MOTORISTA, ativo: true },
        select: { id: true },
      })
      if (!m) return { ok: false as const, motivo: 'Motorista não encontrado nesta empresa.' }
    }

    await tx.agendamento.update({
      where: { id: agendamentoId },
      data: {
        motoristaId: motoristaId || null,
        status: motoristaId ? 'ATRIBUIDO' : 'PENDENTE',
      },
    })
    return { ok: true as const }
  })
  if (!r.ok) return r

  revalidatePath('/painel/rota')
  return { ok: true }
}

export async function cancelarAgendamento(agendamentoId: string, motivo: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_AGENDAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera a rota.' }
  }

  await comEscopo(a.ctx, async (tx) => {
    await tx.agendamento.update({
      where: { id: agendamentoId },
      // A parada não some da agenda: fica cancelada, com o motivo. Apagar
      // esconderia que a visita foi marcada e desmarcada.
      data: { status: 'CANCELADO', motivoFalha: motivo || 'Cancelado pela central' },
    })
  })

  await auditar(a.ctx, a.sessao, { acao: 'agenda.cancelada', entidade: 'agendamento', entidadeId: agendamentoId })
  revalidatePath('/painel/rota')
  return { ok: true }
}
