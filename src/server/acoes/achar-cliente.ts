'use server'

import { comEscopo } from '@/lib/db'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * ACHAR O CLIENTE ENQUANTO A PESSOA DIGITA.
 *
 * =============================================================================
 * O QUE ISTO CONSERTA
 * =============================================================================
 * Abrir uma O.S. exigia digitar nome, CPF/CNPJ, WhatsApp, endereço e cidade —
 * de novo — mesmo para um cliente que já está na carteira há dois anos. O
 * sistema até reaproveitava o cadastro, mas só AO SALVAR, e pelo documento:
 * quem digitasse o CNPJ com um dígito trocado criava um cliente duplicado sem
 * que nada avisasse.
 *
 * Digitar o que o sistema já sabe é o tipo de trabalho que faz alguém preferir
 * o caderno. E cada redigitação é uma chance de o endereço da retirada sair
 * diferente do que está no cadastro — que é o motorista atravessando a cidade
 * para o lugar errado.
 *
 * =============================================================================
 * TRÊS CAMPOS NA MESMA BUSCA, PORQUE CADA UM SABE DE UM
 * =============================================================================
 * Quem atende o telefone tem o NOME. Quem recebe a nota tem o DOCUMENTO. Quem
 * atende o WhatsApp tem o TELEFONE. Obrigar os três a procurar pelo mesmo campo
 * faz dois deles não acharem — e quem não acha, cadastra de novo.
 *
 * O documento e o telefone são comparados só pelos DÍGITOS: o cadastro guarda
 * "51992668095" e a pessoa digita "(51) 99266-8095". Comparar como texto faria
 * a busca falhar exatamente para quem copiou do WhatsApp.
 *
 * =============================================================================
 * POR QUE ISTO NÃO ABRE PORTA
 * =============================================================================
 * Roda por `comEscopo`, então o RLS só devolve cliente DA EMPRESA de quem
 * pergunta — a franquia vizinha não aparece nem digitando o CNPJ exato dela.
 *
 * O piso é ATENDENTE: é quem abre O.S. Motorista e técnico não abrem ordem e
 * não recebem lista de clientes por aqui; para eles a resposta é vazia, que é
 * indistinguível de "não achei" e não confirma a existência de ninguém.
 *
 * O termo vai como PARÂMETRO do Prisma, nunca concatenado. Um nome com aspas
 * devolve lista vazia; nunca derruba a tela nem alcança o banco como comando.
 */

export type ClienteAchado = {
  id: string
  nome: string
  documento: string
  /** Pode faltar no cadastro antigo — a tela precisa saber disso. */
  whatsapp: string
  contatoNome: string | null
  /** O endereço da retirada, já montado — é ele que vai para o motorista. */
  endereco: string
  cidade: string
  /** Quantas ordens este cliente já teve. Desempata homônimos. */
  ordens: number
}

const PODE_BUSCAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.FINANCEIRO,
  Papel.ATENDENTE,
]

export async function acharCliente(termo: string): Promise<ClienteAchado[]> {
  const sessao = await lerSessao()
  if (!sessao || !PODE_BUSCAR.includes(sessao.papel)) return []

  const t = termo.trim()
  // Menos de três letras traz meia carteira e não ajuda ninguém a escolher.
  if (t.length < 3) return []

  const digitos = t.replace(/\D/g, '')
  const ctx = contextoDe(sessao)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      where: {
        ativo: true,
        OR: [
          { nome: { contains: t, mode: 'insensitive' } },
          // Só busca por número quando há número suficiente para distinguir.
          // Com dois ou três dígitos, "51" casaria com meia carteira.
          ...(digitos.length >= 4
            ? [{ documento: { contains: digitos } }, { whatsapp: { contains: digitos } }]
            : []),
        ],
      },
      orderBy: { nome: 'asc' },
      take: 8,
      select: {
        id: true,
        nome: true,
        documento: true,
        whatsapp: true,
        contatoNome: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        coletaMesmoEndereco: true,
        coletaLogradouro: true,
        coletaNumero: true,
        coletaComplemento: true,
        coletaBairro: true,
        coletaCidade: true,
        coletaUf: true,
        _count: { select: { ordens: true } },
      },
    }),
  )

  return linhas.map((c) => {
    /**
     * O ENDEREÇO QUE VAI PARA A O.S. É O DA COLETA, quando existe.
     *
     * O cadastro guarda dois: a sede e o lugar onde o aparelho é buscado. A
     * clínica tem endereço fiscal num prédio e a sala no outro; o hospital
     * recebe pela doca dos fundos. Preencher a retirada com a sede é o
     * motorista chegando no lugar certo do papel e errado da rua.
     */
    const daColeta = !c.coletaMesmoEndereco && c.coletaLogradouro
    const partes = daColeta
      ? [c.coletaLogradouro, c.coletaNumero, c.coletaComplemento, c.coletaBairro]
      : [c.logradouro, c.numero, c.complemento, c.bairro]

    return {
      id: c.id,
      nome: c.nome,
      documento: c.documento,
      whatsapp: c.whatsapp ?? '',
      contatoNome: c.contatoNome,
      endereco: partes.filter(Boolean).join(', '),
      cidade: daColeta ? (c.coletaCidade ?? c.cidade ?? '') : (c.cidade ?? ''),
      ordens: c._count.ordens,
    }
  })
}
