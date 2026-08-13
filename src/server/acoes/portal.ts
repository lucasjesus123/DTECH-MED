'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comparaSegura, hashDocumento } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { env } from '@/lib/env'
import { ipDaRequisicao } from '@/server/auth/guarda'
import { avancarOrdem } from '@/server/ordem/motor'
import { guardarAssinatura } from '@/server/arquivos/storage'
import { reservarDoOrcamento } from '@/server/estoque/servico'

/**
 * Portal público do cliente.
 *
 * É a única superfície do sistema que funciona sem login, e por isso a mais
 * delicada. As decisões:
 *
 *  • O acesso é por um token opaco de 256 bits no link, e não pelo número da
 *    ordem. Número é sequencial: quem recebe a ordem 41 tentaria a 42 e veria
 *    o equipamento de outra clínica.
 *  • O token abre só a LEITURA da linha do tempo. Para aprovar, o cliente
 *    confirma o CPF ou CNPJ, comparado por hash em tempo constante.
 *  • Nenhum funcionário aprova no lugar dele — nem o Super Admin. Aprovar em
 *    nome do cliente destruiria o valor jurídico da assinatura, que é
 *    justamente o que faz o contrato provar que ele concordou.
 */

type Resposta = { ok: true } | { ok: false; motivo: string }

/**
 * Resolve a ordem pelo token do link.
 *
 * O visitante não tem sessão, então não há contexto de empresa — e o RLS,
 * corretamente, devolveria zero linhas.
 *
 * A saída não é abrir uma policy pública em `ordens`: isso deixaria qualquer
 * consulta sem contexto enxergar a carteira inteira de todas as franquias. Em
 * vez disso, uma função do banco converte o token em APENAS o id da empresa —
 * sem devolver nome, valor nem etapa. Com esse id, abrimos o escopo normal, e
 * daí em diante todas as policies voltam a valer.
 *
 * O token prova o direito àquela ordem; ele não vira passe livre.
 */
async function ordemDoToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null

  const linhas = await prisma.$queryRaw<Array<{ tenant: string | null }>>`
    SELECT app.empresa_do_token(${token}) AS tenant
  `
  const tenantId = linhas[0]?.tenant
  if (!tenantId) return null

  return comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, (tx) =>
    tx.ordem.findUnique({
    where: { tokenPublico: token },
    include: {
      tenant: { select: { id: true, nome: true, telefone: true } },
      cliente: { select: { nome: true, documentoHash: true, contatoNome: true } },
      equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
      eventos: {
        where: { visivelCliente: true },
        orderBy: { sequencia: 'desc' },
      },
      orcamentos: {
        where: { status: { in: ['ENVIADO', 'APROVADO', 'REPROVADO'] } },
        orderBy: { versao: 'desc' },
        take: 1,
        include: { itens: { orderBy: { ordem: 'asc' } } },
      },
      documentos: { orderBy: { geradoEm: 'desc' } },
    },
    }),
  )
}

export async function carregarOrdemPublica(token: string) {
  return ordemDoToken(token)
}

const schema = z.object({
  token: z.string().min(20),
  documento: z.string().transform((v) => v.replace(/\D/g, '')),
  decisao: z.enum(['aprovar', 'reprovar']),
  assinanteNome: z.string().trim().min(3, 'Escreva seu nome completo.').optional(),
  dataUrl: z.string().optional(),
  motivo: z.string().trim().optional(),
})

/**
 * Registra a decisão do cliente sobre o orçamento.
 *
 * Aprovar exige nome e assinatura; recusar não — obrigar alguém a assinar para
 * dizer "não" é fricção sem propósito, e ainda azeda a relação.
 */
export async function responderOrcamento(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const d = schema.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const ordem = await ordemDoToken(v.token)
  if (!ordem) return { ok: false, motivo: 'Link inválido ou expirado.' }

  // Comparação em tempo constante: com `===`, o tempo de resposta revelaria
  // quantos caracteres do hash bateram, e adivinhação cega viraria busca
  // guiada.
  if (!comparaSegura(hashDocumento(v.documento), ordem.cliente.documentoHash)) {
    return {
      ok: false,
      motivo: 'O CPF ou CNPJ não confere com o cadastro desta ordem. Confira e tente de novo.',
    }
  }

  if (ordem.etapa !== EtapaOrdem.ORCAMENTO_ENVIADO) {
    return {
      ok: false,
      motivo:
        ordem.etapa === EtapaOrdem.ORCAMENTO_APROVADO
          ? 'Este orçamento já foi aprovado. Não precisa fazer nada.'
          : 'Este orçamento não está aguardando resposta no momento.',
    }
  }

  const orcamento = ordem.orcamentos[0]
  if (!orcamento) return { ok: false, motivo: 'Não encontramos o orçamento desta ordem.' }

  const ctx: ContextoAcesso = { tenantId: ordem.tenant.id, userId: null, ehSuperAdmin: false }
  const h = await headers()
  const ip = ipDaRequisicao(h, env.TRUST_PROXY)

  // --- Recusa -------------------------------------------------------------
  if (v.decisao === 'reprovar') {
    await comEscopo(ctx, async (tx) => {
      await tx.orcamento.update({
        where: { id: orcamento.id },
        data: { status: 'REPROVADO', respondidoEm: new Date(), motivoReprovacao: v.motivo || null },
      })
    })
    const r = await avancarOrdem(
      ctx,
      { id: null, nome: ordem.cliente.contatoNome ?? ordem.cliente.nome, papel: Papel.ATENDENTE },
      {
        ordemId: ordem.id,
        para: EtapaOrdem.ORCAMENTO_REPROVADO,
        viaPortalCliente: true,
        autorExterno: ordem.cliente.contatoNome ?? ordem.cliente.nome,
        observacao: v.motivo || undefined,
        ip,
      },
    )
    if (!r.ok) return { ok: false, motivo: r.motivo }
    revalidatePath(`/os/${v.token}`)
    return { ok: true }
  }

  // --- Aprovação ----------------------------------------------------------
  if (!v.assinanteNome) return { ok: false, motivo: 'Escreva seu nome completo para assinar.' }
  if (!v.dataUrl || v.dataUrl.length < 200) {
    return { ok: false, motivo: 'Assine no quadro antes de confirmar.' }
  }

  const img = await guardarAssinatura({ tenantId: ordem.tenant.id, ordemId: ordem.id, dataUrl: v.dataUrl })
  if (!img.ok) return { ok: false, motivo: img.motivo }

  await comEscopo(ctx, async (tx) => {
    await tx.assinatura.create({
      data: {
        tenantId: ordem.tenant.id,
        ordemId: ordem.id,
        tipo: 'APROVACAO_ORCAMENTO',
        assinanteNome: v.assinanteNome!,
        // Guardamos o documento informado no ato, para o comprovante mostrar
        // os últimos dígitos e ninguém precisar consultar o cadastro depois.
        assinanteDocumento: v.documento,
        caminhoImagem: img.caminho,
        hashImagem: img.hash,
        // Congela o conteúdo aprovado: se o texto do orçamento mudar depois,
        // a divergência fica demonstrável.
        hashDocumento: `${orcamento.id}:${orcamento.versao}:${orcamento.totalCentavos}`,
        ip,
        userAgent: h.get('user-agent')?.slice(0, 400) ?? null,
      },
    })

    await tx.orcamento.update({
      where: { id: orcamento.id },
      data: {
        status: 'APROVADO',
        respondidoEm: new Date(),
        aprovadoPorNome: v.assinanteNome,
        aprovadoPorDocumento: v.documento,
      },
    })
  })

  const r = await avancarOrdem(
    ctx,
    { id: null, nome: v.assinanteNome, papel: Papel.ATENDENTE },
    {
      ordemId: ordem.id,
      para: EtapaOrdem.ORCAMENTO_APROVADO,
      viaPortalCliente: true,
      autorExterno: v.assinanteNome,
      payload: { orcamentoId: orcamento.id, totalCentavos: orcamento.totalCentavos },
      ip,
    },
  )
  if (!r.ok) return { ok: false, motivo: r.motivo }

  // A aprovação reserva as peças na hora. É o elo que faz o estoque deixar de
  // ser módulo paralelo: ninguém precisa lembrar de separar material.
  const reserva = await reservarDoOrcamento(
    ctx,
    { id: null, nome: 'Aprovação do cliente' },
    orcamento.id,
  )
  if (!reserva.ok) {
    // A aprovação vale mesmo assim — o cliente cumpriu a parte dele. A falta
    // de peça é problema da operação, e aparece no painel como pendência.
    console.warn(`[portal] ordem ${ordem.id}: peças não reservadas — ${reserva.motivo}`)
  }

  revalidatePath(`/os/${v.token}`)
  return { ok: true }
}
