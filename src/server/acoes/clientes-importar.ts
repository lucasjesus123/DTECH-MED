'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel } from '@/generated/prisma/enums'
import { hashDocumento } from '@/lib/cripto'
import { lerCsv } from '@/lib/csv'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Importar a carteira de clientes de uma planilha.
 *
 * ---------------------------------------------------------------------------
 * A DECISÃO CENTRAL: NÃO PARAR NO PRIMEIRO ERRO
 * ---------------------------------------------------------------------------
 * A planilha vem de fora — do sistema antigo, do contador, de um caderno
 * digitado às pressas. Ela VAI ter linha ruim: CPF com um dígito a menos,
 * telefone em branco, nome vazio na linha 340 de 600.
 *
 * Parar na primeira e recusar o arquivo inteiro é a implementação fácil e a
 * pior de usar: a pessoa corrige uma linha, sobe de novo, descobre a próxima,
 * e repete quarenta vezes.
 *
 * Aqui cada linha é julgada sozinha. As boas entram, as ruins voltam com o
 * NÚMERO DA LINHA e o motivo, do jeito que se lê. Uma passada, uma lista de
 * correções.
 *
 * ---------------------------------------------------------------------------
 * O QUE ACONTECE COM QUEM JÁ EXISTE
 * ---------------------------------------------------------------------------
 * O CPF/CNPJ é a identidade. Já cadastrado, o cliente é ATUALIZADO com o que
 * veio preenchido na planilha — e o que veio em branco NÃO apaga o que já
 * estava. Uma planilha sem a coluna de e-mail não pode limpar o e-mail de
 * trezentos clientes; a ausência de um dado não é a informação de que ele não
 * existe.
 *
 * ---------------------------------------------------------------------------
 * A CONFERÊNCIA ANTES DE GRAVAR
 * ---------------------------------------------------------------------------
 * A ação roda em dois modos. Em `conferir`, ela faz tudo e não grava nada:
 * devolve quantos entrariam, quantos seriam atualizados e a lista de recusas.
 * É o que permite ver o estrago antes de causá-lo. Só com `gravar` o banco é
 * tocado.
 */

const PODE_IMPORTAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

/** 4 MB. Uma planilha de dez mil clientes não passa de 2. */
const LIMITE_BYTES = 4 * 1024 * 1024
/** Teto de linhas por arquivo, para uma planilha errada não travar o servidor. */
const LIMITE_LINHAS = 5000

export type Recusa = { linha: number; nome: string; motivo: string }

export type RelatorioImportacao = {
  ok: boolean
  motivo?: string
  modo: 'conferir' | 'gravar'
  lidas: number
  novos: number
  atualizados: number
  recusadas: Recusa[]
}

const soDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * Os nomes de coluna aceitos, do mais provável ao mais improvável.
 *
 * Cada campo aceita vários: quem exporta de outro sistema não vai renomear
 * cabeçalho para agradar o nosso. `documento`, `cpf`, `cnpj` e `cpf_cnpj` são a
 * mesma coisa; recusar por causa do título seria recusar por nada.
 */
const APELIDOS: Record<string, string[]> = {
  nome: ['nome', 'cliente', 'nome_cliente', 'nome_fantasia', 'razao_social'],
  razaoSocial: ['razao_social', 'razao'],
  documento: ['documento', 'cpf_cnpj', 'cnpj', 'cpf', 'doc'],
  email: ['e_mail', 'email'],
  whatsapp: ['whatsapp', 'zap', 'celular', 'telefone_whatsapp'],
  telefone: ['telefone', 'fone', 'telefone_fixo'],
  contatoNome: ['contato', 'contato_nome', 'responsavel'],
  cep: ['cep'],
  logradouro: ['logradouro', 'endereco', 'rua'],
  numero: ['numero', 'num', 'nro'],
  complemento: ['complemento', 'compl'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio'],
  uf: ['uf', 'estado'],
  pontoReferencia: ['ponto_de_referencia', 'referencia', 'ponto_referencia'],
  observacoes: ['observacoes', 'observacao', 'obs'],
}

function campo(linha: Record<string, string>, nome: keyof typeof APELIDOS): string {
  for (const apelido of APELIDOS[nome]!) {
    const v = linha[apelido]
    if (v !== undefined && v.trim() !== '') return v.trim()
  }
  return ''
}

const esquemaLinha = z.object({
  nome: z.string().trim().min(3, 'nome muito curto'),
  documento: z
    .string()
    .transform(soDigitos)
    .refine((v) => v.length === 11 || v.length === 14, 'CPF ou CNPJ com quantidade de dígitos errada'),
  whatsapp: z.string().trim(),
  email: z.string().trim(),
})

export async function importarClientes(
  entrada: { arquivo: File; modo: 'conferir' | 'gravar' },
): Promise<RelatorioImportacao> {
  const vazio = { modo: entrada.modo, lidas: 0, novos: 0, atualizados: 0, recusadas: [] }

  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.', ...vazio }
  if (!PODE_IMPORTAR.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não importa clientes.', ...vazio }
  }
  const ctx = contextoDe(sessao)

  const arq = entrada.arquivo
  if (!arq || arq.size === 0) return { ok: false, motivo: 'Escolha um arquivo.', ...vazio }
  if (arq.size > LIMITE_BYTES) {
    return {
      ok: false,
      motivo: `Arquivo de ${(arq.size / 1024 / 1024).toFixed(1)} MB. O limite é 4 MB.`,
      ...vazio,
    }
  }

  const texto = await arq.text()
  let linhas: Array<Record<string, string>>
  try {
    linhas = lerCsv(texto)
  } catch {
    return { ok: false, motivo: 'Não consegui ler o arquivo como planilha CSV.', ...vazio }
  }

  if (linhas.length === 0) {
    return { ok: false, motivo: 'A planilha não tem nenhuma linha além do cabeçalho.', ...vazio }
  }
  if (linhas.length > LIMITE_LINHAS) {
    return {
      ok: false,
      motivo: `A planilha tem ${linhas.length} linhas. O limite por vez é ${LIMITE_LINHAS}.`,
      ...vazio,
    }
  }

  // Primeira passada: julgar cada linha, sem tocar no banco.
  const recusadas: Recusa[] = []
  type DadosCliente = {
    nome: string
    razaoSocial: string | null
    tipo: 'PF' | 'PJ'
    documento: string
    documentoHash: string
    email: string | null
    whatsapp: string | null
    telefone: string | null
    contatoNome: string | null
    cep: string | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
    pontoReferencia: string | null
    observacoes: string | null
  }
  const aceitas: Array<{ linha: number; dados: DadosCliente; documento: string }> = []
  const jaVistos = new Map<string, number>()

  linhas.forEach((bruta, i) => {
    // +2: a primeira linha da planilha é o cabeçalho, e a contagem começa em 1.
    const numero = i + 2
    const nome = campo(bruta, 'nome')

    const c = esquemaLinha.safeParse({
      nome,
      documento: campo(bruta, 'documento'),
      whatsapp: campo(bruta, 'whatsapp'),
      email: campo(bruta, 'email'),
    })
    if (!c.success) {
      recusadas.push({ linha: numero, nome: nome || '(sem nome)', motivo: c.error.issues[0]!.message })
      return
    }

    // O mesmo CPF/CNPJ duas vezes NA PLANILHA. Sem esta conferência, a segunda
    // linha sobrescreveria a primeira em silêncio, e o total bateria — dando a
    // impressão de que tudo entrou.
    const repetida = jaVistos.get(c.data.documento)
    if (repetida) {
      recusadas.push({
        linha: numero,
        nome: c.data.nome,
        motivo: `CPF/CNPJ repetido na planilha (já apareceu na linha ${repetida})`,
      })
      return
    }
    jaVistos.set(c.data.documento, numero)

    const email = c.data.email
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      recusadas.push({ linha: numero, nome: c.data.nome, motivo: `e-mail inválido: ${email}` })
      return
    }

    const zap = soDigitos(c.data.whatsapp)
    const tel = soDigitos(campo(bruta, 'telefone'))

    aceitas.push({
      linha: numero,
      documento: c.data.documento,
      dados: {
        nome: c.data.nome,
        razaoSocial: campo(bruta, 'razaoSocial') || null,
        tipo: c.data.documento.length === 11 ? ('PF' as const) : ('PJ' as const),
        documento: c.data.documento,
        documentoHash: hashDocumento(c.data.documento),
        email: email || null,
        whatsapp: zap || null,
        telefone: tel || zap || null,
        contatoNome: campo(bruta, 'contatoNome') || null,
        cep: soDigitos(campo(bruta, 'cep')) || null,
        logradouro: campo(bruta, 'logradouro') || null,
        numero: campo(bruta, 'numero') || null,
        complemento: campo(bruta, 'complemento') || null,
        bairro: campo(bruta, 'bairro') || null,
        cidade: campo(bruta, 'cidade') || null,
        uf: campo(bruta, 'uf').toUpperCase().slice(0, 2) || null,
        pontoReferencia: campo(bruta, 'pontoReferencia') || null,
        observacoes: campo(bruta, 'observacoes') || null,
      },
    })
  })

  // Segunda passada: quem já existe. Uma consulta só, e não uma por linha.
  const existentes = await comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      where: { documento: { in: aceitas.map((a) => a.documento) } },
      select: { id: true, documento: true },
    }),
  )
  const porDocumento = new Map(existentes.map((e) => [e.documento, e.id]))
  const novos = aceitas.filter((a) => !porDocumento.has(a.documento)).length
  const atualizados = aceitas.length - novos

  if (entrada.modo === 'conferir') {
    return {
      ok: true,
      modo: 'conferir',
      lidas: linhas.length,
      novos,
      atualizados,
      recusadas,
    }
  }

  // Gravação. Tudo numa transação só: ou a planilha inteira entra, ou nenhuma
  // linha entra. Meia importação é o pior dos mundos — ninguém sabe onde parou.
  const empresa = exigirEmpresa(ctx, 'A importação de clientes')
  await comEscopo(ctx, async (tx) => {
    for (const a of aceitas) {
      const id = porDocumento.get(a.documento)
      if (id) {
        // `Object.fromEntries(...filter)` tira os campos vazios ANTES de gravar:
        // é o que impede uma planilha sem a coluna de e-mail de apagar o e-mail
        // de todo mundo.
        const preenchidos = Object.fromEntries(
          Object.entries(a.dados).filter(([, v]) => v !== null && v !== ''),
        )
        await tx.cliente.update({ where: { id }, data: preenchidos })
      } else {
        await tx.cliente.create({ data: { tenantId: empresa, ...a.dados } })
      }
    }
  })

  await auditar(ctx, sessao, {
    acao: 'clientes.importados',
    entidade: 'cliente',
    detalhes: { lidas: linhas.length, novos, atualizados, recusadas: recusadas.length },
  })

  revalidatePath('/painel/clientes')
  return { ok: true, modo: 'gravar', lidas: linhas.length, novos, atualizados, recusadas }
}
