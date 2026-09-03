'use server'

import { comEscopo } from '@/lib/db'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * ACHAR O APARELHO NO CATÁLOGO, ENQUANTO A PESSOA DIGITA.
 *
 * =============================================================================
 * O QUE ISTO CONSERTA
 * =============================================================================
 * O cadastro de equipamento existia, com foto, série, patrimônio, voltagem e
 * acessórios — e a abertura da O.S. não o usava. Quem abria uma ordem digitava
 * marca e modelo de novo, num campo de texto livre, e o sistema criava um
 * equipamento NOVO a cada vez que a série não batesse (ou não fosse digitada).
 *
 * O resultado é o mesmo laser aparecendo quatro vezes no catálogo, cada linha
 * com um pedaço do histórico e nenhuma com a foto. E o prontuário do
 * equipamento — que é o que responde "já consertamos isso três vezes, é hora de
 * trocar" — perdia o sentido.
 *
 * =============================================================================
 * A BUSCA É POR TUDO QUE ALGUÉM TEM NA MÃO
 * =============================================================================
 * Quem está no balcão tem o aparelho na frente: lê a MARCA e o MODELO da
 * carcaça, ou a SÉRIE da etiqueta, ou o PATRIMÔNIO da plaquinha que a clínica
 * colou. Obrigar os quatro a procurar pelo mesmo campo faz três deles não
 * acharem — e quem não acha, cadastra de novo, que é exatamente o defeito.
 *
 * Duas letras bastam: séries e patrimônios são curtos ("A7", "1042"), e o
 * mínimo de três do cliente deixaria essas duas pontas de fora.
 *
 * =============================================================================
 * O DONO VAI JUNTO NA RESPOSTA, E ISSO É DE PROPÓSITO
 * =============================================================================
 * Um aparelho pode estar sem dono (catálogo puro) ou já no nome de um cliente.
 * A tela precisa dizer qual é o caso ANTES da escolha: puxar o aparelho de
 * outra clínica para esta O.S. é recusado no servidor, e descobrir isso só ao
 * salvar seria fazer a pessoa preencher a ficha inteira para levar um não.
 *
 * =============================================================================
 * POR QUE ISTO NÃO ABRE PORTA
 * =============================================================================
 * Roda por `comEscopo`: o RLS só devolve aparelho DA EMPRESA de quem pergunta.
 * O piso é o mesmo de quem abre O.S. — para motorista e técnico a resposta é
 * vazia, indistinguível de "não achei".
 *
 * O termo vai como PARÂMETRO do Prisma, nunca concatenado.
 */

export type EquipamentoAchado = {
  id: string
  marca: string
  modelo: string
  numeroSerie: string | null
  categoria: string | null
  acessorios: string | null
  /** Nulo quando o aparelho está só no catálogo, sem dono ainda. */
  donoId: string | null
  donoNome: string | null
  /** Quantas ordens este aparelho já teve. É o peso do prontuário. */
  ordens: number
}

const PODE_BUSCAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.ATENDENTE,
]

export async function acharEquipamento(termo: string): Promise<EquipamentoAchado[]> {
  const sessao = await lerSessao()
  if (!sessao || !PODE_BUSCAR.includes(sessao.papel)) return []

  const t = termo.trim()
  if (t.length < 2) return []

  const ctx = contextoDe(sessao)

  const linhas = await comEscopo(ctx, (tx) =>
    tx.equipamento.findMany({
      where: {
        OR: [
          { marca: { contains: t, mode: 'insensitive' } },
          { modelo: { contains: t, mode: 'insensitive' } },
          { numeroSerie: { contains: t, mode: 'insensitive' } },
          { patrimonio: { contains: t, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
      take: 8,
      select: {
        id: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        categoria: true,
        acessorios: true,
        cliente: { select: { id: true, nome: true } },
        _count: { select: { ordens: true } },
      },
    }),
  )

  return linhas.map((e) => ({
    id: e.id,
    marca: e.marca,
    modelo: e.modelo,
    numeroSerie: e.numeroSerie,
    categoria: e.categoria,
    acessorios: e.acessorios,
    donoId: e.cliente?.id ?? null,
    donoNome: e.cliente?.nome ?? null,
    ordens: e._count.ordens,
  }))
}
