'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { hashDocumento } from '@/lib/cripto'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Cadastro de cliente e de equipamento.
 *
 * O documento é gravado em claro (a operação precisa dele para nota e contrato)
 * e também como hash cego. O hash é o que permite ao portal conferir o CPF/CNPJ
 * digitado pelo cliente sem varrer a tabela comparando texto — e sem o número
 * completo trafegar de volta ao navegador.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const PODE_CADASTRAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

const soDigitos = (v: string) => v.replace(/\D/g, '')

const schemaCliente = z.object({
  id: z.string().nullish(),
  nome: z.string().trim().min(3, 'Informe o nome do cliente.'),
  razaoSocial: z.string().trim().nullish(),
  documento: z
    .string()
    .transform(soDigitos)
    .refine((v) => v.length === 11 || v.length === 14, 'CPF ou CNPJ inválido.'),
  whatsapp: z.string().trim().min(8, 'Informe o WhatsApp — é por ele que os avisos saem.'),
  telefone: z.string().trim().nullish(),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').nullish().or(z.literal('')),
  contatoNome: z.string().trim().nullish(),
  cep: z.string().trim().nullish(),
  logradouro: z.string().trim().nullish(),
  numero: z.string().trim().nullish(),
  complemento: z.string().trim().nullish(),
  bairro: z.string().trim().nullish(),
  cidade: z.string().trim().nullish(),
  uf: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
})

export async function salvarCliente(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CADASTRAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não cadastra cliente.' }
  }

  const d = schemaCliente.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const colide = await tx.cliente.findFirst({
      where: { documento: v.documento, ...(v.id ? { NOT: { id: v.id } } : {}) },
      select: { id: true, nome: true },
    })
    if (colide) {
      return { ok: false as const, motivo: `Este CPF/CNPJ já está cadastrado para ${colide.nome}.` }
    }

    const dados = {
      nome: v.nome,
      razaoSocial: v.razaoSocial || null,
      tipo: v.documento.length === 11 ? ('PF' as const) : ('PJ' as const),
      documento: v.documento,
      documentoHash: hashDocumento(v.documento),
      whatsapp: soDigitos(v.whatsapp),
      telefone: v.telefone ? soDigitos(v.telefone) : soDigitos(v.whatsapp),
      email: v.email || null,
      contatoNome: v.contatoNome || null,
      cep: v.cep ? soDigitos(v.cep) : null,
      logradouro: v.logradouro || null,
      numero: v.numero || null,
      complemento: v.complemento || null,
      bairro: v.bairro || null,
      cidade: v.cidade || null,
      uf: v.uf?.toUpperCase().slice(0, 2) || null,
      observacoes: v.observacoes || null,
    }

    const cliente = v.id
      ? await tx.cliente.update({ where: { id: v.id }, data: dados, select: { id: true } })
      : await tx.cliente.create({ data: { tenantId: exigirEmpresa(a.ctx), ...dados }, select: { id: true } })

    return { ok: true as const, id: cliente.id }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: v.id ? 'cliente.editado' : 'cliente.criado',
    entidade: 'cliente',
    entidadeId: r.id,
  })
  revalidatePath('/painel/clientes')
  return { ok: true, mensagem: v.id ? 'Cadastro atualizado.' : 'Cliente cadastrado.' }
}

const schemaEquipamento = z.object({
  id: z.string().nullish(),
  clienteId: z.string().min(1, 'Escolha o cliente dono do equipamento.'),
  marca: z.string().trim().min(2, 'Informe a marca.'),
  modelo: z.string().trim().min(1, 'Informe o modelo.'),
  numeroSerie: z.string().trim().nullish(),
  patrimonio: z.string().trim().nullish(),
  categoria: z.string().trim().nullish(),
  voltagem: z.string().trim().nullish(),
  anoFabricacao: z.coerce.number().int().min(1970).max(2100).nullish(),
  acessorios: z.string().trim().nullish(),
  observacoes: z.string().trim().nullish(),
})

export async function salvarEquipamento(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_CADASTRAR.includes(a.sessao.papel) && a.sessao.papel !== Papel.TECNICO) {
    return { ok: false, motivo: 'Seu perfil não cadastra equipamento.' }
  }

  const bruto = Object.fromEntries(form)
  // Ano em branco é ausência, não zero.
  if (bruto.anoFabricacao === '') delete bruto.anoFabricacao

  const d = schemaEquipamento.safeParse(bruto)
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: v.clienteId }, select: { id: true } })
    if (!cliente) return { ok: false as const, motivo: 'Cliente não encontrado nesta empresa.' }

    // O número de série é a identidade física do aparelho: é ele que amarra o
    // histórico. Duplicá-lo no mesmo cliente quebraria essa amarração.
    if (v.numeroSerie) {
      const colide = await tx.equipamento.findFirst({
        where: {
          clienteId: v.clienteId,
          numeroSerie: v.numeroSerie,
          ...(v.id ? { NOT: { id: v.id } } : {}),
        },
        select: { id: true },
      })
      if (colide) {
        return { ok: false as const, motivo: 'Este cliente já tem um equipamento com esse número de série.' }
      }
    }

    const dados = {
      clienteId: v.clienteId,
      marca: v.marca,
      modelo: v.modelo,
      numeroSerie: v.numeroSerie || null,
      patrimonio: v.patrimonio || null,
      categoria: v.categoria || null,
      voltagem: v.voltagem || null,
      anoFabricacao: v.anoFabricacao ?? null,
      acessorios: v.acessorios || null,
      observacoes: v.observacoes || null,
    }

    const eq = v.id
      ? await tx.equipamento.update({ where: { id: v.id }, data: dados, select: { id: true } })
      : await tx.equipamento.create({ data: { tenantId: exigirEmpresa(a.ctx), ...dados }, select: { id: true } })

    return { ok: true as const, id: eq.id }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: v.id ? 'equipamento.editado' : 'equipamento.criado',
    entidade: 'equipamento',
    entidadeId: r.id,
  })
  revalidatePath('/painel/equipamentos')
  return { ok: true, mensagem: v.id ? 'Equipamento atualizado.' : 'Equipamento cadastrado.' }
}
