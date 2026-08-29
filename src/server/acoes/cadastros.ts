'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { hashDocumento } from '@/lib/cripto'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { anexarFotoDeCatalogo } from '@/server/acoes/estoque'
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

  // A caixa marcada chega como 'on'; desmarcada não chega. Por isso o padrão é
  // `false` aqui e a leitura abaixo é explícita — `undefined` significa
  // "desmarcou", não "não mandou".
  coletaMesmoEndereco: z.union([z.literal('on'), z.literal('true')]).optional(),
  coletaCep: z.string().trim().nullish(),
  coletaLogradouro: z.string().trim().nullish(),
  coletaNumero: z.string().trim().nullish(),
  coletaComplemento: z.string().trim().nullish(),
  coletaBairro: z.string().trim().nullish(),
  coletaCidade: z.string().trim().nullish(),
  coletaUf: z.string().trim().nullish(),
  coletaObservacao: z.string().trim().nullish(),

  representanteNome: z.string().trim().nullish(),
  representanteTelefone: z.string().trim().nullish(),
  representanteEmail: z.string().trim().toLowerCase().email('E-mail do representante inválido.').nullish().or(z.literal('')),
  representanteVinculo: z.string().trim().nullish(),

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

    const mesmoEndereco = v.coletaMesmoEndereco === 'on' || v.coletaMesmoEndereco === 'true'
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

      /**
       * A COLETA.
       *
       * A caixa DESMARCADA não chega no FormData — é assim que HTML funciona.
       * Por isso a ausência é lida como "desmarcou", e não como "não informou":
       * este formulário sempre manda a caixa, então ela só falta quando alguém
       * a desmarcou de propósito.
       *
       * E quando é o mesmo endereço, os campos de coleta são ZERADOS. Sem isso,
       * quem desmarcasse, digitasse outro endereço e voltasse a marcar deixaria
       * um endereço fantasma gravado — invisível na tela, e lido pelo aplicativo
       * do motorista no dia em que alguém desmarcar de novo.
       */
      coletaMesmoEndereco: mesmoEndereco,
      coletaCep: mesmoEndereco ? null : v.coletaCep ? soDigitos(v.coletaCep) : null,
      coletaLogradouro: mesmoEndereco ? null : v.coletaLogradouro || null,
      coletaNumero: mesmoEndereco ? null : v.coletaNumero || null,
      coletaComplemento: mesmoEndereco ? null : v.coletaComplemento || null,
      coletaBairro: mesmoEndereco ? null : v.coletaBairro || null,
      coletaCidade: mesmoEndereco ? null : v.coletaCidade || null,
      coletaUf: mesmoEndereco ? null : v.coletaUf?.toUpperCase().slice(0, 2) || null,
      coletaObservacao: mesmoEndereco ? null : v.coletaObservacao || null,

      representanteNome: v.representanteNome || null,
      representanteTelefone: v.representanteTelefone ? soDigitos(v.representanteTelefone) : null,
      representanteEmail: v.representanteEmail || null,
      representanteVinculo: v.representanteVinculo || null,

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

  /**
   * A FOTO ENTRA NO CADASTRO, E NÃO NUM SEGUNDO PASSO.
   *
   * Marca e modelo não bastam para reconhecer um aparelho: o mesmo modelo muda
   * de cara entre gerações, e o cliente descreve o dele pela aparência, não
   * pelo número de série.
   *
   * A trilha é gravada ANTES desta parte de propósito. Se a foto falhar, o
   * cadastro continua feito e registrado — devolver erro faria a tela parecer
   * que nada foi salvo, e a pessoa cadastraria o mesmo aparelho de novo.
   */
  const foto = form.get('foto')
  if (foto instanceof File && foto.size > 0) {
    const f = await anexarFotoDeCatalogo(a, 'equipamento', r.id, foto)
    if (!f.ok) {
      return {
        ok: true,
        mensagem: `${v.id ? 'Equipamento atualizado' : 'Equipamento cadastrado'}, mas a foto não subiu: ${f.motivo}`,
      }
    }
  }

  return { ok: true, mensagem: v.id ? 'Equipamento atualizado.' : 'Equipamento cadastrado.' }
}
