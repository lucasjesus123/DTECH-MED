'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { ehTipoModelavel } from '@/server/consultas/modelos'
import { marcadoresDe, VARIAVEIS } from '@/lib/variaveis-documento'

/**
 * ESCREVER, GUARDAR E APOSENTAR OS MOLDES.
 *
 * =============================================================================
 * QUEM MEXE
 * =============================================================================
 * Do GESTOR para cima. O molde de contrato é o texto que obriga o cliente —
 * prazo, multa, foro. Quem edita isso decide o que a empresa promete e o que
 * ela cobra; não é trabalho de bancada nem de balcão.
 *
 * Repare que é mais restrito que EMITIR (que vai até o FINANCEIRO): emitir usa
 * o texto que alguém já aprovou; editar o texto é a decisão anterior.
 */

type Resposta = { ok: true; mensagem: string; id?: string } | { ok: false; motivo: string }

const PODE_MEXER: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

const schema = z.object({
  id: z.string().trim().optional(),
  nome: z.string().trim().min(1, 'Dê um nome ao modelo.').max(120),
  tipo: z.string().trim().min(1),
  descricao: z.string().trim().max(200).optional(),
  corpo: z.string().min(1, 'O modelo está vazio — escreva o texto do documento.'),
  padrao: z.union([z.literal('on'), z.literal('true'), z.literal('')]).optional(),
})

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

export async function salvarModelo(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não edita modelo de documento.' }
  }

  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data
  if (!ehTipoModelavel(v.tipo)) return { ok: false, motivo: 'Tipo de documento desconhecido.' }

  /**
   * O MARCADOR ERRADO É BARRADO AQUI, E NÃO NA HORA DE IMPRIMIR.
   *
   * Na geração, o desconhecido sai visível no papel de propósito — é melhor que
   * um buraco no lugar do nome. Mas isso é a última defesa, para o caso de um
   * molde antigo com um erro que ninguém viu.
   *
   * Este é o momento certo de avisar: a pessoa está com o texto na frente e
   * conserta em dois segundos. Deixar passar aqui é escolher que alguém
   * descubra o erro num contrato já impresso.
   */
  const usados = marcadoresDe(v.corpo)
  const conhecidas = new Set(VARIAVEIS.map((x) => x.chave))
  const errados = usados.filter((m) => !conhecidas.has(m))
  if (errados.length) {
    return {
      ok: false,
      motivo:
        errados.length === 1
          ? `O sistema não conhece a variável {{${errados[0]}}}. Confira na lista ao lado — ela sairia escrita assim no documento.`
          : `O sistema não conhece estas variáveis: ${errados.map((m) => `{{${m}}}`).join(', ')}. Elas sairiam escritas assim no documento.`,
    }
  }

  const querPadrao = v.padrao === 'on' || v.padrao === 'true'
  const tenantId = exigirEmpresa(a.ctx)

  const r = await comEscopo(a.ctx, async (tx) => {
    // Se este vai ser o padrão, o padrão anterior do MESMO TIPO sai antes.
    //
    // O banco tem índice único parcial garantindo um padrão por tipo — sem esta
    // linha, salvar o segundo padrão bateria numa violação de índice e a pessoa
    // levaria um erro de banco de dados na cara, em vez de a troca simplesmente
    // acontecer, que é o que ela pediu ao marcar a caixa.
    if (querPadrao) {
      await tx.modeloDocumento.updateMany({
        where: { tipo: v.tipo, padrao: true, ...(v.id ? { NOT: { id: v.id } } : {}) },
        data: { padrao: false },
      })
    }

    const dados = {
      nome: v.nome,
      tipo: v.tipo,
      descricao: v.descricao || null,
      corpo: v.corpo,
      padrao: querPadrao,
    }

    if (v.id) {
      const conta = await tx.modeloDocumento.updateMany({ where: { id: v.id }, data: dados })
      if (conta.count === 0) return { ok: false as const, motivo: 'Modelo não encontrado.' }
      return { ok: true as const, id: v.id, novo: false }
    }

    const criado = await tx.modeloDocumento.create({
      data: {
        tenantId,
        ...dados,
        autorId: a.sessao.userId,
        autorNome: a.sessao.nome,
      },
      select: { id: true },
    })
    return { ok: true as const, id: criado.id, novo: true }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: r.novo ? 'modelo.criado' : 'modelo.editado',
    entidade: 'modelo_documento',
    entidadeId: r.id,
    detalhes: { tipo: v.tipo, padrao: querPadrao, variaveis: usados.length },
  })
  revalidatePath('/painel/documentos')
  return {
    ok: true,
    id: r.id,
    mensagem: r.novo ? 'Modelo criado.' : 'Modelo salvo.',
  }
}

/** Marca um molde como o padrão do tipo dele — e desmarca o anterior. */
export async function definirPadrao(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não edita modelo de documento.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const m = await tx.modeloDocumento.findUnique({ where: { id }, select: { tipo: true, ativo: true } })
    if (!m) return { ok: false as const, motivo: 'Modelo não encontrado.' }
    // Um molde aposentado não pode virar padrão: ele foi tirado de uso de
    // propósito, e voltar por esta porta seria a emissão usar um texto que
    // alguém decidiu não usar mais.
    if (!m.ativo) return { ok: false as const, motivo: 'Este modelo está aposentado. Reative-o antes de torná-lo padrão.' }

    await tx.modeloDocumento.updateMany({ where: { tipo: m.tipo, padrao: true }, data: { padrao: false } })
    await tx.modeloDocumento.updateMany({ where: { id }, data: { padrao: true } })
    return { ok: true as const, tipo: m.tipo }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'modelo.padrao',
    entidade: 'modelo_documento',
    entidadeId: id,
    detalhes: { tipo: r.tipo },
  })
  revalidatePath('/painel/documentos')
  return { ok: true, mensagem: 'Este passou a ser o modelo padrão.' }
}

/**
 * Aposenta ou reativa um molde.
 *
 * Aposentar não apaga: documento já emitido nasceu de um texto, e "com que
 * texto isto foi assinado?" é pergunta que aparece justamente quando dá briga.
 */
export async function alternarAtivo(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não edita modelo de documento.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const m = await tx.modeloDocumento.findUnique({ where: { id }, select: { ativo: true, padrao: true } })
    if (!m) return { ok: false as const, motivo: 'Modelo não encontrado.' }
    // Aposentar o padrão deixaria o tipo sem padrão nenhum, e a emissão cairia
    // no texto embutido sem ninguém perceber. Então a marca de padrão sai junto,
    // e a tela mostra o tipo sem padrão — que é visível.
    const virando = !m.ativo
    await tx.modeloDocumento.updateMany({
      where: { id },
      data: { ativo: virando, ...(virando ? {} : { padrao: false }) },
    })
    return { ok: true as const, ativo: virando, eraPadrao: m.padrao }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: r.ativo ? 'modelo.reativado' : 'modelo.aposentado',
    entidade: 'modelo_documento',
    entidadeId: id,
  })
  revalidatePath('/painel/documentos')
  return {
    ok: true,
    mensagem: r.ativo
      ? 'Modelo reativado.'
      : r.eraPadrao
        ? 'Modelo aposentado. Ele era o padrão — escolha outro para este tipo.'
        : 'Modelo aposentado.',
  }
}

/** Apaga de vez. Só para o molde que nunca gerou nada. */
export async function excluirModelo(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não edita modelo de documento.' }
  }

  const r = await comEscopo(a.ctx, async (tx) => {
    const conta = await tx.modeloDocumento.deleteMany({ where: { id } })
    return conta.count > 0
      ? { ok: true as const }
      : { ok: false as const, motivo: 'Modelo não encontrado.' }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, { acao: 'modelo.excluido', entidade: 'modelo_documento', entidadeId: id })
  revalidatePath('/painel/documentos')
  return { ok: true, mensagem: 'Modelo excluído.' }
}
