'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { avancarOrdem, enfileirar } from '@/server/ordem/motor'

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

    const ag = await tx.agendamento.create({
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
      select: { id: true },
    })

    /**
     * O TOQUE NO CELULAR DE QUEM VAI DIRIGIR — o passo 5 do processo.
     *
     * Marcar a corrida e não avisar era o buraco: a central escrevia, o
     * aparelho do cliente ficava esperando, e o motorista só descobria se
     * abrisse o aplicativo por vontade própria. Ele está na rua.
     *
     * Entra na MESMA transação do agendamento, pela fila: ou a parada existe e
     * o aviso está enfileirado, ou nenhum dos dois aconteceu. Um aviso de
     * corrida que não existe é pior que nenhum.
     *
     * Sem motorista designado não há a quem avisar — a parada sem dono é de
     * quem pegar, e ela aparece na Agenda de rota da central.
     */
    if (v.motoristaId) {
      await enfileirar(tx, exigirEmpresa(a.ctx), {
        tipo: 'push.enviar',
        prioridade: 1,
        // Uma parada, um aviso. Se a transação for repetida por retry de rede,
        // o job já existe e o celular não toca duas vezes.
        dedupeKey: `push:parada:${ag.id}`,
        payload: { motivo: 'parada.designada', agendamentoId: ag.id },
      })
    }

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
      select: { id: true, status: true, ordemId: true },
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

    /**
     * O AVISO NO CELULAR TAMBÉM SAI POR AQUI — e não saía.
     *
     * A ação `agendar` enfileira `push.enviar` quando a parada nasce com
     * motorista. Esta, que é o outro jeito de um motorista receber uma corrida
     * — a parada que nasceu sem dono, ou a que trocou de dono —, não
     * enfileirava nada. O resultado: designar pela Rota funcionava no banco e
     * era silencioso no bolso de quem ia dirigir.
     *
     * O `dedupeKey` é o mesmo da criação, `push:parada:<id>`, e é isso que
     * garante que a parada criada JÁ com motorista não toque duas vezes. Trocar
     * o motorista depois também não toca de novo — e essa é a escolha certa
     * entre as duas erradas: o alternativa seria uma chave por troca, e aí
     * corrigir um nome digitado errado viraria uma sequência de apitos no
     * celular de quem está dirigindo.
     */
    if (motoristaId) {
      await enfileirar(tx, exigirEmpresa(a.ctx), {
        tipo: 'push.enviar',
        prioridade: 1,
        dedupeKey: `push:parada:${agendamentoId}`,
        payload: { motivo: 'parada.designada', agendamentoId },
      })
    }

    return { ok: true as const, ordemId: ag.ordemId }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'agenda.motorista',
    entidade: 'agendamento',
    entidadeId: agendamentoId,
    detalhes: { motoristaId: motoristaId || null },
  })
  revalidatePath('/painel/rota')
  // A janela da O.S. mostra a parada e o nome de quem vai. Sem esta linha, o
  // motorista trocado só aparecia lá depois de a pessoa recarregar a página.
  revalidatePath(`/painel/ordens/${r.ordemId}`)
  revalidatePath('/painel/ordens')
  revalidatePath('/painel/calendario')
  return { ok: true }
}

/**
 * REMARCAR UMA PARADA QUE JÁ EXISTE — dia, hora, endereço e recado.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É `agendar` COM UM `id`
 * =============================================================================
 * `agendar` é um PASSO DO PROCESSO: criar a retirada avança a ordem de
 * "O.S. gerada" para "retirada agendada" e dispara o WhatsApp que promete ao
 * cliente uma data e um nome. Remarcar não é passo nenhum — a ordem já andou, e
 * fazê-la andar de novo mandaria ao cliente um segundo aviso de agendamento
 * para uma retirada que ele já sabe que existe.
 *
 * Por isso esta ação NÃO chama `avancarOrdem`. Ela corrige um dado da corrida e
 * para aí.
 *
 * =============================================================================
 * O QUE ELA SE RECUSA A FAZER
 * =============================================================================
 * Parada CONCLUÍDA ou que FALHOU não se remarca. O que aconteceu já tem foto,
 * assinatura e hora gravadas; mudar a data prevista depois disso faria o
 * comprovante do cliente discordar do sistema — e o comprovante é a prova.
 * Para essas o caminho é outro: cancelar e marcar uma nova.
 */
const schemaRemarcar = z.object({
  agendamentoId: z.string().min(1),
  data: z.string().min(10, 'Escolha a data.'),
  hora: z.string().nullish(),
  janelaFim: z.string().nullish(),
  endereco: z.string().trim().min(5, 'Confirme o endereço da parada.'),
  contatoNome: z.string().trim().nullish(),
  contatoTelefone: z.string().trim().nullish(),
  pontoReferencia: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
})

export async function remarcarParada(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_AGENDAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera a rota.' }
  }

  const d = schemaRemarcar.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const previsto = new Date(`${v.data}T${v.hora || '09:00'}:00-03:00`)
  if (Number.isNaN(previsto.getTime())) return { ok: false, motivo: 'Data ou hora inválida.' }
  const fim = v.janelaFim ? new Date(`${v.data}T${v.janelaFim}:00-03:00`) : null
  if (fim && !Number.isNaN(fim.getTime()) && fim <= previsto) {
    return { ok: false, motivo: 'O fim da janela precisa ser depois do início.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const ag = await tx.agendamento.findUnique({
      where: { id: v.agendamentoId },
      select: { id: true, status: true, ordemId: true },
    })
    if (!ag) return { ok: false as const, motivo: 'Parada não encontrada.' }
    if (ag.status === 'CONCLUIDO') {
      return { ok: false as const, motivo: 'Esta parada já foi concluída — cancele e marque outra.' }
    }
    if (ag.status === 'CANCELADO') return { ok: false as const, motivo: 'Esta parada foi cancelada.' }

    await tx.agendamento.update({
      where: { id: v.agendamentoId },
      data: {
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
    return { ok: true as const, ordemId: ag.ordemId }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'agenda.remarcar',
    entidade: 'agendamento',
    entidadeId: v.agendamentoId,
    detalhes: { previstoPara: previsto.toISOString() },
  })
  revalidatePath('/painel/rota')
  revalidatePath(`/painel/ordens/${r.ordemId}`)
  revalidatePath('/painel/ordens')
  revalidatePath('/painel/calendario')
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
