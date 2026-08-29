'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { env } from '@/lib/env'
import { auditar, exigirNivel, ipDaRequisicao } from '@/server/auth/guarda'

/**
 * OS CONTATOS DO SITE, DO LADO DE DENTRO.
 *
 * =============================================================================
 * POR QUE ISTO NÃO MORA EM `lead.ts`
 * =============================================================================
 * Aquele arquivo é a superfície PÚBLICA — a única que escreve sem sessão. O
 * cabeçalho dele diz isso, e essa frase é o que faz alguém revisá-lo com mais
 * cuidado. Misturar ali ações que exigem login apagaria a distinção justamente
 * no arquivo onde ela mais importa.
 *
 * =============================================================================
 * POR QUE DESCARTAR PRECISAVA EXISTIR
 * =============================================================================
 * O formulário do site é público, e público significa que chega de tudo: teste
 * de quem estava conferindo se funciona, e prospecção em massa — aquelas de
 * "avaliamos fornecedores para projetos futuros", em inglês, com vinte linhas
 * de assinatura.
 *
 * O campo-armadilha e o limite por IP barram robô. Não barram gente digitando,
 * e não devem: uma trava que barra gente barra cliente.
 *
 * O que faltava era o outro lado — poder dizer "isto não é serviço". Sem essa
 * saída, todo contato que entrou fica para sempre marcado como esperando
 * resposta, e uma lista que nunca esvazia deixa de ser lida. Aí o contato de
 * verdade se perde no meio, que é exatamente o oposto do que a lista serve.
 *
 * =============================================================================
 * DESCARTAR NÃO APAGA
 * =============================================================================
 * Muda o `status` para `descartado`, e nada mais. O contato continua na tela,
 * na aba "Descartados", e volta com um clique.
 *
 * É de propósito: quem descarta está com pressa, olhando uma lista, e vai
 * errar em algum momento. Um botão que apaga de verdade transforma um clique
 * errado numa venda perdida sem rastro — e o telefone de quem procurou a
 * empresa não é nosso para jogar fora.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const schemaId = z.string().min(1, 'Contato não informado.').max(60)

/**
 * O piso é ATENDENTE.
 *
 * É quem atende o telefone e abre ordem — a mesma pessoa que decide se um
 * contato vira serviço. Abaixo disso ninguém precisa: o técnico e o motorista
 * não respondem contato do site.
 */
async function quemPode() {
  return exigirNivel(Papel.ATENDENTE)
}

export async function descartarContato(id: string): Promise<Resposta> {
  const d = schemaId.safeParse(id)
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  const a = await quemPode()
  const h = await headers()

  // `updateMany` e não `update`: sob RLS, um id de outra empresa não deve
  // levantar exceção contando que aquele registro existe — deve simplesmente
  // não alcançar linha nenhuma. O `count` abaixo é quem responde a verdade.
  const { contagem, nome } = await comEscopo(a.ctx, async (tx) => {
    const antes = await tx.lead.findFirst({
      where: { id: d.data, status: 'novo' },
      select: { nome: true },
    })
    const r = await tx.lead.updateMany({
      where: { id: d.data, status: 'novo' },
      data: { status: 'descartado' },
    })
    return { contagem: r.count, nome: antes?.nome ?? null }
  })

  // Escrita barrada pela policy responde "0 linhas", não erro. Conferir o
  // número é o que separa "descartado" de uma mentira educada na tela.
  if (contagem !== 1) {
    return { ok: false, motivo: 'Este contato não está mais aguardando resposta. Atualize a tela.' }
  }

  await auditar(a.ctx, a.sessao, {
    acao: 'lead.descartado',
    entidade: 'lead',
    entidadeId: d.data,
    detalhes: nome ? { quem: nome } : undefined,
    ip: ipDaRequisicao(h, env.TRUST_PROXY),
    userAgent: h.get('user-agent'),
  })

  revalidatePath('/painel/contatos')
  revalidatePath('/painel')
  return { ok: true, mensagem: `${nome ?? 'Contato'} saiu da lista. Está em "Descartados".` }
}

export async function restaurarContato(id: string): Promise<Resposta> {
  const d = schemaId.safeParse(id)
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }

  const a = await quemPode()
  const h = await headers()

  const contagem = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.lead.updateMany({
      // Só volta o que foi descartado. Um contato já CONVERTIDO em ordem não
      // pode voltar para "aguardando": ele já virou trabalho, e reabri-lo
      // faria a mesma solicitação aparecer duas vezes na fila de quem atende.
      where: { id: d.data, status: 'descartado' },
      data: { status: 'novo' },
    })
    return r.count
  })

  if (contagem !== 1) {
    return { ok: false, motivo: 'Só dá para restaurar um contato que foi descartado.' }
  }

  await auditar(a.ctx, a.sessao, {
    acao: 'lead.restaurado',
    entidade: 'lead',
    entidadeId: d.data,
    ip: ipDaRequisicao(h, env.TRUST_PROXY),
    userAgent: h.get('user-agent'),
  })

  revalidatePath('/painel/contatos')
  revalidatePath('/painel')
  return { ok: true, mensagem: 'Contato de volta na lista de quem aguarda resposta.' }
}

/**
 * REGISTRAR UM CONTATO À MÃO.
 *
 * =============================================================================
 * POR QUE ISTO FALTAVA
 * =============================================================================
 * A tela Comercial só mostrava quem preencheu o FORMULÁRIO DO SITE. Só que a
 * maioria dos contatos de uma assistência não chega por formulário: chega pelo
 * WhatsApp, pelo telefone, por indicação de outra clínica, ou pela pessoa que
 * apareceu na porta com o aparelho no colo.
 *
 * Sem este registro, esses contatos existiam só na cabeça de quem atendeu — e
 * o funil da tela mentia: "3 aguardando resposta" quando havia doze. Um funil
 * que só conta uma das portas não é um funil, é o relatório de uma porta.
 *
 * =============================================================================
 * A ORIGEM É OBRIGATÓRIA, E NÃO TEM PADRÃO
 * =============================================================================
 * O enum já previa WHATSAPP, TELEFONE, INDICACAO e PRESENCIAL desde sempre —
 * era a tela que não deixava usar. Deixar cair em SITE por omissão poluiria a
 * única resposta que esta tela dá bem: "de onde vem o nosso trabalho".
 *
 * INDICACAO em especial: saber que metade dos clientes vem de indicação muda o
 * que a empresa faz com o dinheiro de anúncio.
 */
const schemaManual = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome de quem chamou.').max(120),
  telefone: z.string().trim().min(8, 'Sem telefone não dá para retornar o contato.').max(30),
  origem: z.enum(['WHATSAPP', 'TELEFONE', 'INDICACAO', 'PRESENCIAL', 'OUTRO'], {
    message: 'Diga por onde este contato chegou.',
  }),
  empresa: z.string().trim().max(140).optional(),
  cidade: z.string().trim().max(80).optional(),
  equipamento: z.string().trim().max(140).optional(),
  mensagem: z.string().trim().max(2000).optional(),
})

export async function registrarContato(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await quemPode()

  const d = schemaManual.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const criado = await comEscopo(a.ctx, (tx) =>
    tx.lead.create({
      data: {
        tenantId: a.sessao.tenantId!,
        nome: v.nome,
        telefone: v.telefone.replace(/\D/g, ''),
        empresa: v.empresa || null,
        cidade: v.cidade || null,
        equipamento: v.equipamento || null,
        // Quem anotou fica na mensagem porque `Lead` não tem autor: ele nasceu
        // para o formulário público, onde não existe quem. Guardar o nome aqui
        // responde "com quem essa pessoa falou?" sem uma coluna nova numa
        // tabela que o site inteiro escreve.
        mensagem: [v.mensagem, `— anotado por ${a.sessao.nome}`].filter(Boolean).join('\n\n'),
        origem: v.origem,
        status: 'novo',
      },
      select: { id: true },
    }),
  )

  await auditar(a.ctx, a.sessao, {
    acao: 'contato.registrado',
    entidade: 'lead',
    entidadeId: criado.id,
    detalhes: { nome: v.nome, origem: v.origem },
  })
  revalidatePath('/painel/contatos')
  revalidatePath('/painel')
  return { ok: true, mensagem: 'Contato registrado. Ele entra na fila como qualquer um do site.' }
}
