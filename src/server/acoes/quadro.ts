'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { COLUNAS_PADRAO, TODAS_AS_ETAPAS } from '@/server/consultas/quadro'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * AS COLUNAS DO QUADRO — quem mexe no processo da casa.
 *
 * =============================================================================
 * QUEM PODE, E POR QUE É MAIS RESTRITO QUE MOVER UM CARTÃO
 * =============================================================================
 * Mover uma O.S. é trabalho do dia, e o piso é o da própria transição — o
 * técnico anda o que é dele, o motorista o que é dele. Isso a máquina de
 * estados já decide sozinha.
 *
 * Redesenhar as COLUNAS é outra coisa: muda o que a equipe inteira vê, e uma
 * coluna apagada por engano faz vinte ordens mudarem de lugar na tela de todo
 * mundo ao mesmo tempo. É decisão de quem responde pelo processo — GESTOR para
 * cima.
 *
 * =============================================================================
 * MEXER NA COLUNA NÃO MEXE EM NENHUMA ORDEM
 * =============================================================================
 * Vale escrever porque é o que torna isto seguro: apagar uma coluna, renomear
 * ou trocar as etapas dela não escreve NADA em `ordens`. Nenhuma etapa muda,
 * nenhum evento é gravado, nenhuma corrente de hash é tocada. O quadro é
 * leitura; a etapa de cada ordem continua sendo o que a esteira disse que é.
 *
 * O pior estrago possível aqui é uma etapa ficar sem coluna — e aí a consulta
 * desenha "Fora do quadro" e nada some.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const PODE_DESENHAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

function repintar() {
  revalidatePath('/painel/ordens')
  revalidatePath('/painel/ordens/quadro')
}

const CORES = ['violeta', 'sinal', 'alerta', 'espera', 'acao'] as const

const schemaColuna = z.object({
  id: z.string().optional().or(z.literal('')),
  nome: z.string().trim().min(1, 'A coluna precisa de um nome.').max(40),
  cor: z.enum(CORES).optional().or(z.literal('')),
  /** As etapas chegam como uma lista de caixas marcadas. */
  etapas: z.array(z.string()).optional(),
})

export async function salvarColuna(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_DESENHAR.includes(a.sessao.papel)) {
    return {
      ok: false,
      motivo: 'Desenhar o quadro é da gestão — ele muda o que a equipe inteira vê.',
    }
  }

  let tenantId: string
  try {
    tenantId = exigirEmpresa(a.ctx)
  } catch {
    return { ok: false, motivo: 'Você está fora de uma empresa. Entre numa para desenhar o quadro dela.' }
  }

  const bruto = Object.fromEntries(form)
  const d = schemaColuna.safeParse({ ...bruto, etapas: form.getAll('etapas').map(String) })
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // Etapa desconhecida é descartada em silêncio: ela só chega aqui por
  // formulário adulterado ou por enum que mudou, e nenhum dos dois merece
  // travar quem está tentando organizar o quadro.
  const etapas = (v.etapas ?? []).filter((e) => e in ROTULO_ETAPA)

  const r = await comEscopo(a.ctx, async (tx) => {
    /**
     * UMA ETAPA EM DUAS COLUNAS DUPLICARIA O CARTÃO.
     *
     * A mesma O.S. apareceria em dois lugares do quadro, e mover uma das
     * cópias deixaria a outra desatualizada até a página recarregar — a
     * pessoa veria a mesma ordem em dois estados diferentes na mesma tela.
     *
     * Então salvar uma coluna TIRA as etapas escolhidas de todas as outras. É
     * o comportamento que quem arrasta espera: pôr "Em análise" aqui significa
     * que ela sai de onde estava. A recusa seria pior — obrigaria a
     * desmarcar na outra coluna primeiro, adivinhando qual é.
     */
    if (etapas.length > 0) {
      const outras = await tx.colunaQuadro.findMany({
        where: v.id ? { NOT: { id: v.id } } : {},
        select: { id: true, etapas: true },
      })
      for (const o of outras) {
        const sobra = o.etapas.filter((e) => !etapas.includes(e))
        if (sobra.length !== o.etapas.length) {
          await tx.colunaQuadro.update({ where: { id: o.id }, data: { etapas: sobra } })
        }
      }
    }

    if (v.id) {
      const n = await tx.colunaQuadro.updateMany({
        where: { id: v.id },
        data: { nome: v.nome, cor: v.cor || null, etapas },
      })
      return n.count > 0 ? ('editada' as const) : null
    }

    // Ordem esparsa: a nova entra no fim, com folga para alguém inserir entre
    // duas sem reescrever a fila toda.
    const ultima = await tx.colunaQuadro.findFirst({
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    })
    await tx.colunaQuadro.create({
      data: {
        tenantId,
        nome: v.nome,
        cor: v.cor || null,
        etapas,
        ordem: (ultima?.ordem ?? 0) + 10,
      },
    })
    return 'criada' as const
  })
  if (!r) return { ok: false, motivo: 'Coluna não encontrada.' }

  await auditar(a.ctx, a.sessao, {
    acao: r === 'criada' ? 'quadro.coluna_criada' : 'quadro.coluna_editada',
    entidade: 'coluna_quadro',
    entidadeId: v.id || v.nome,
    detalhes: { nome: v.nome, etapas },
  })
  repintar()
  return {
    ok: true,
    mensagem:
      r === 'criada'
        ? `Coluna "${v.nome}" criada com ${etapas.length} ${etapas.length === 1 ? 'etapa' : 'etapas'}.`
        : `Coluna "${v.nome}" atualizada.`,
  }
}

/**
 * Apaga uma coluna. Nenhuma ordem é tocada.
 *
 * As etapas dela ficam órfãs, e as ordens que estiverem nelas aparecem na
 * coluna "Fora do quadro" — visíveis, com o aviso. É por isso que apagar aqui
 * não precisa de confirmação assustadora: não se perde nada além do desenho.
 */
export async function excluirColuna(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_DESENHAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Desenhar o quadro é da gestão.' }
  }

  const n = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.colunaQuadro.deleteMany({ where: { id } })
    return r.count
  })
  if (n === 0) return { ok: false, motivo: 'Coluna não encontrada.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'quadro.coluna_apagada',
    entidade: 'coluna_quadro',
    entidadeId: id,
  })
  repintar()
  return {
    ok: true,
    mensagem:
      'Coluna apagada. Nenhuma ordem mudou — as que estavam nela aparecem em "Fora do quadro" até você as encaixar noutra coluna.',
  }
}

/** Troca uma coluna de lugar com a vizinha. */
export async function moverColuna(id: string, direcao: 'esquerda' | 'direita'): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_DESENHAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Desenhar o quadro é da gestão.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const esta = await tx.colunaQuadro.findFirst({ where: { id }, select: { id: true, ordem: true } })
    if (!esta) return 'nao-achou' as const

    // A vizinha na direção pedida. `orderBy` invertido de um lado porque a
    // vizinha da esquerda é a MAIOR ordem menor que esta.
    const vizinha = await tx.colunaQuadro.findFirst({
      where:
        direcao === 'esquerda' ? { ordem: { lt: esta.ordem } } : { ordem: { gt: esta.ordem } },
      orderBy: { ordem: direcao === 'esquerda' ? 'desc' : 'asc' },
      select: { id: true, ordem: true },
    })
    if (!vizinha) return 'ja-na-ponta' as const

    // Troca as duas ordens. Numa transação, então nunca ficam iguais no meio.
    await tx.colunaQuadro.update({ where: { id: esta.id }, data: { ordem: vizinha.ordem } })
    await tx.colunaQuadro.update({ where: { id: vizinha.id }, data: { ordem: esta.ordem } })
    return 'trocou' as const
  })

  if (r === 'nao-achou') return { ok: false, motivo: 'Coluna não encontrada.' }
  if (r === 'ja-na-ponta') return { ok: true, mensagem: 'Ela já está na ponta.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'quadro.coluna_movida',
    entidade: 'coluna_quadro',
    entidadeId: id,
    detalhes: { direcao },
  })
  repintar()
  return { ok: true, mensagem: 'Coluna movida.' }
}

/**
 * Monta o quadro padrão — as quatro fases da esteira mais os desfechos.
 *
 * Existe porque um quadro que nasce vazio obriga a pessoa a desenhar o processo
 * inteiro antes de ver serventia nenhuma, e ninguém monta oito colunas para
 * descobrir se gostou. Estas cinco já fazem sentido no primeiro dia, e a
 * empresa reescreve o que quiser.
 *
 * Recusa se já houver coluna: o botão só aparece no quadro vazio, e clicar duas
 * vezes na tela lenta não pode dobrar as colunas de ninguém.
 */
export async function criarQuadroPadrao(): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_DESENHAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Desenhar o quadro é da gestão.' }
  }

  let tenantId: string
  try {
    tenantId = exigirEmpresa(a.ctx)
  } catch {
    return { ok: false, motivo: 'Você está fora de uma empresa.' }
  }

  const criadas = await comEscopo(a.ctx, async (tx) => {
    const quantas = await tx.colunaQuadro.count()
    if (quantas > 0) return 0
    await tx.colunaQuadro.createMany({
      data: COLUNAS_PADRAO.map((c, i) => ({
        tenantId,
        nome: c.nome,
        cor: c.cor,
        etapas: c.etapas as string[],
        ordem: (i + 1) * 10,
      })),
    })
    return COLUNAS_PADRAO.length
  })
  if (criadas === 0) return { ok: false, motivo: 'Este quadro já tem colunas.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'quadro.padrao_criado',
    entidade: 'coluna_quadro',
    entidadeId: tenantId,
    detalhes: { colunas: criadas },
  })
  repintar()
  return { ok: true, mensagem: `${criadas} colunas criadas. Renomeie e reorganize à vontade.` }
}

/** As etapas com rótulo, para o editor de colunas montar as caixas. */
export async function etapasParaEscolher() {
  return TODAS_AS_ETAPAS.map((e) => ({ chave: e, rotulo: ROTULO_ETAPA[e] ?? e }))
}
