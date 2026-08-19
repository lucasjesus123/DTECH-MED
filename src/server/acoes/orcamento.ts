'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { Prisma } from '@/generated/prisma/client'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { aCentavos, calcularTotal } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { proximoNumero } from '@/server/financeiro/servico'
import { avancarOrdem } from '@/server/ordem/motor'

/**
 * Montagem do orçamento.
 *
 * O orçamento é o documento que vira contrato quando o cliente assina, e por
 * isso ele **versiona em vez de editar**. Reprovou, a gestora refaz: nasce a
 * versão 2, e a versão 1 continua no banco exatamente como o cliente a viu.
 * Sem isso, uma discussão sobre "não foi isso que me mandaram" não tem como ser
 * resolvida.
 *
 * Os totais são recalculados NO SERVIDOR a partir dos itens. O número que veio
 * da tela é ignorado — se ele mandasse, bastaria alterar um campo no formulário
 * para aprovar um serviço de R$ 3.000 por R$ 30.
 */

type Resposta<T = unknown> = { ok: true; dados?: T } | { ok: false; motivo: string }

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel } }
}

/**
 * Quem MONTA o orçamento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A ATENDENTE ENTROU NESTA LISTA
 * ---------------------------------------------------------------------------
 * O processo da casa diz, com todas as letras, que "a secretaria gera o
 * orçamento no sistema". O código dizia outra coisa: só bancada e gestão. Quem
 * ficava no meio era a pessoa que atende o cliente — ela digitava o orçamento
 * na cabeça do técnico, por WhatsApp, e alguém copiava para cá.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISSO NÃO É AFROUXAR O CONTROLE DO PREÇO
 * ---------------------------------------------------------------------------
 * Montar não é ENVIAR. O orçamento montado fica em `ORCAMENTO_INTERNO`, e a
 * passagem para `ORCAMENTO_ENVIADO` — a única que faz o número chegar ao
 * cliente — continua exigindo GESTÃO na máquina de estados. Ou seja: a
 * secretaria escreve, o gestor confere e libera.
 *
 * A trava que importa nunca foi quem digita; é quem autoriza sair. Essa não
 * mudou, e é ela que impede um serviço de R$ 3.000 virar R$ 300 sem ninguém
 * olhar. Os totais, aliás, continuam recalculados no servidor a partir dos
 * itens — o número que vem da tela é ignorado, para qualquer papel.
 */
const PODE_ORCAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.TECNICO,
  Papel.ATENDENTE,
]

const item = z.object({
  tipo: z.enum(['PECA', 'SERVICO', 'DESLOCAMENTO', 'TAXA']),
  pecaId: z.string().nullish(),
  descricao: z.string().trim().min(2),
  quantidade: z.coerce.number().positive(),
  valorUnit: z.coerce.number().min(0),
})

const schema = z.object({
  ordemId: z.string().min(1),
  laudoTecnico: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
  garantiaDias: z.coerce.number().int().min(0).max(3650).default(90),
  prazoExecucaoDias: z.coerce.number().int().min(0).max(365).default(7),
  desconto: z.coerce.number().min(0).default(0),
  acrescimo: z.coerce.number().min(0).default(0),
  validadeDias: z.coerce.number().int().min(1).max(180).default(15),
  itensJson: z.string(),
})

/**
 * Grava (ou regrava) o orçamento em rascunho da ordem.
 *
 * Enquanto o orçamento não saiu para o cliente, editar é seguro: ninguém viu.
 * Depois que saiu, esta função cria uma versão nova em vez de mexer na antiga.
 */
export async function salvarOrcamento(
  _anterior: Resposta,
  form: FormData,
): Promise<Resposta<{ id: string; aviso?: string }>> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ORCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não monta orçamento.' }
  }

  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  let brutos: unknown
  try {
    brutos = JSON.parse(v.itensJson)
  } catch {
    return { ok: false, motivo: 'Não foi possível ler a lista de itens.' }
  }
  const itens = z.array(item).min(1, 'Inclua ao menos um item no orçamento.').safeParse(brutos)
  if (!itens.success) return { ok: false, motivo: itens.error.issues[0]!.message }

  // Os totais saem daqui, nunca do formulário.
  const linhas = itens.data.map((i, ordem) => ({
    ...i,
    ordem,
    valorUnitCentavos: aCentavos(i.valorUnit),
    valorTotalCentavos: aCentavos(i.valorUnit * i.quantidade),
  }))

  const subtotalPecas = linhas
    .filter((l) => l.tipo === 'PECA')
    .reduce((s, l) => s + l.valorTotalCentavos, 0)
  const subtotalServicos = linhas
    .filter((l) => l.tipo !== 'PECA')
    .reduce((s, l) => s + l.valorTotalCentavos, 0)
  const descontoCentavos = aCentavos(v.desconto)
  const acrescimoCentavos = aCentavos(v.acrescimo)
  const totalCentavos = calcularTotal({
    subtotalPecas,
    subtotalServicos,
    desconto: descontoCentavos,
    acrescimo: acrescimoCentavos,
  })

  const r = await comEscopo(a.ctx, async (tx) => {
    const ordem = await tx.ordem.findUnique({
      where: { id: v.ordemId },
      select: { id: true, etapa: true },
    })
    if (!ordem) return { ok: false as const, motivo: 'Ordem não encontrada.' }

    const atual = await tx.orcamento.findFirst({
      where: { ordemId: v.ordemId },
      orderBy: { versao: 'desc' },
    })

    const dadosComuns = {
      laudoTecnico: v.laudoTecnico || null,
      observacoes: v.observacoes || null,
      garantiaDias: v.garantiaDias,
      prazoExecucaoDias: v.prazoExecucaoDias,
      subtotalPecas,
      subtotalServicos,
      descontoCentavos,
      acrescimoCentavos,
      totalCentavos,
      validoAte: new Date(Date.now() + v.validadeDias * 86_400_000),
      tecnicoId: a.sessao.userId,
    }

    // Rascunho ou em revisão: ainda não saiu, dá para reescrever no lugar.
    const podeReescrever = atual && (atual.status === 'RASCUNHO' || atual.status === 'EM_REVISAO')

    const orcamento = podeReescrever
      ? await tx.orcamento.update({
          where: { id: atual.id },
          data: { ...dadosComuns, status: 'EM_REVISAO' },
        })
      : await tx.orcamento.create({
          data: {
            tenantId: exigirEmpresa(a.ctx),
            ordemId: v.ordemId,
            numero: atual?.numero ?? (await proximoNumero(tx, exigirEmpresa(a.ctx), 'orcamento')),
            // Versão nova preserva a que o cliente já viu.
            versao: atual ? atual.versao + 1 : 1,
            status: 'EM_REVISAO',
            ...dadosComuns,
          },
        })

    if (podeReescrever) {
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: orcamento.id } })
    }

    await tx.orcamentoItem.createMany({
      data: linhas.map((l) => ({
        tenantId: exigirEmpresa(a.ctx),
        orcamentoId: orcamento.id,
        tipo: l.tipo,
        pecaId: l.tipo === 'PECA' && l.pecaId ? l.pecaId : null,
        descricao: l.descricao,
        quantidade: new Prisma.Decimal(l.quantidade),
        valorUnitCentavos: l.valorUnitCentavos,
        valorTotalCentavos: l.valorTotalCentavos,
        ordem: l.ordem,
      })),
    })

    return { ok: true as const, id: orcamento.id, etapa: ordem.etapa }
  })

  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: 'orcamento.salvo', entidade: 'ordem', entidadeId: v.ordemId })
  revalidatePath(`/painel/ordens/${v.ordemId}`)

  // Laudo pronto sai da análise e entra na mesa da gestora. É o motor que
  // decide se o salto vale — aqui só pedimos.
  if (r.etapa === EtapaOrdem.EM_ANALISE) {
    const t = await avancarOrdem(a.ctx, a.ator, { ordemId: v.ordemId, para: EtapaOrdem.ORCAMENTO_INTERNO })
    if (!t.ok) {
      // O orçamento FOI salvo — não desfazemos o trabalho da pessoa. Mas o
      // motivo de a ordem não ter andado precisa aparecer.
      //
      // Engolir esta mensagem criava o pior tipo de beco sem saída: a tela
      // dizia "orçamento salvo", o botão de enviar ao cliente nunca aparecia,
      // e nada na interface explicava que faltava preencher o diagnóstico.
      return {
        ok: true,
        dados: { id: r.id, aviso: t.motivo },
      }
    }
  }

  return { ok: true, dados: { id: r.id } }
}

/**
 * Envia o orçamento ao cliente.
 *
 * Marca o orçamento como ENVIADO e pede a transição ao motor, que gera o PDF e
 * enfileira o WhatsApp com o link do portal. As duas coisas na sequência certa:
 * marcar depois de avançar deixaria uma janela em que o cliente recebe o link e
 * o sistema ainda acha que o orçamento está na mesa.
 */
export async function enviarOrcamento(ordemId: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const preparo = await comEscopo(a.ctx, async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { ordemId },
      orderBy: { versao: 'desc' },
      select: { id: true, status: true, totalCentavos: true, _count: { select: { itens: true } } },
    })
    if (!orc) return { ok: false as const, motivo: 'Monte o orçamento antes de enviar.' }
    if (orc._count.itens === 0) return { ok: false as const, motivo: 'O orçamento está sem itens.' }
    if (orc.status === 'ENVIADO') return { ok: false as const, motivo: 'Este orçamento já foi enviado.' }
    if (orc.status === 'APROVADO') return { ok: false as const, motivo: 'Este orçamento já foi aprovado.' }
    return { ok: true as const, id: orc.id, total: orc.totalCentavos }
  })
  if (!preparo.ok) return preparo

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId,
    para: EtapaOrdem.ORCAMENTO_ENVIADO,
    payload: { orcamentoId: preparo.id, totalCentavos: preparo.total },
  })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await comEscopo(a.ctx, async (tx) => {
    await tx.orcamento.update({
      where: { id: preparo.id },
      data: { status: 'ENVIADO', enviadoEm: new Date(), revisorId: a.sessao.userId },
    })
  })

  await auditar(a.ctx, a.sessao, { acao: 'orcamento.enviado', entidade: 'ordem', entidadeId: ordemId })
  revalidatePath(`/painel/ordens/${ordemId}`)
  revalidatePath('/painel')
  return { ok: true }
}

/** Preenche o diagnóstico e o parecer — o que a gestora lê antes de fechar. */
export async function salvarDiagnostico(form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }

  const d = z
    .object({
      ordemId: z.string().min(1),
      diagnostico: z.string().trim().min(10, 'Descreva o que foi encontrado no aparelho.'),
      parecerTecnico: z.string().trim().nullish(),
      servicoExecutado: z.string().trim().nullish(),
      testesFinais: z.string().trim().nullish(),
    })
    .safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  await comEscopo(a.ctx, async (tx) => {
    await tx.ordem.update({
      where: { id: d.data.ordemId },
      data: {
        diagnostico: d.data.diagnostico,
        parecerTecnico: d.data.parecerTecnico || undefined,
        servicoExecutado: d.data.servicoExecutado || undefined,
        testesFinais: d.data.testesFinais || undefined,
      },
    })
  })

  revalidatePath(`/painel/ordens/${d.data.ordemId}`)
  return { ok: true }
}

/** Define técnico responsável e prazo prometido ao cliente. */
export async function definirResponsavel(form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ORCAR.includes(a.sessao.papel) && a.sessao.papel !== Papel.ATENDENTE) {
    return { ok: false, motivo: 'Seu perfil não altera o responsável da ordem.' }
  }

  const d = z
    .object({
      ordemId: z.string().min(1),
      tecnicoId: z.string().nullish(),
      prazoPrometido: z.string().nullish(),
      prioridade: z.enum(['NORMAL', 'ALTA']).default('NORMAL'),
    })
    .safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  const prazo = d.data.prazoPrometido ? new Date(`${d.data.prazoPrometido}T18:00:00-03:00`) : null
  if (prazo && Number.isNaN(prazo.getTime())) return { ok: false, motivo: 'Data de prazo inválida.' }

  await comEscopo(a.ctx, async (tx) => {
    await tx.ordem.update({
      where: { id: d.data.ordemId },
      data: {
        tecnicoId: d.data.tecnicoId || null,
        prazoPrometido: prazo,
        prioridade: d.data.prioridade,
      },
    })
  })

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.responsavel',
    entidade: 'ordem',
    entidadeId: d.data.ordemId,
  })
  revalidatePath(`/painel/ordens/${d.data.ordemId}`)
  return { ok: true }
}
