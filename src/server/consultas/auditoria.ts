import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * A LEITURA DA TRILHA DE AUDITORIA.
 *
 * =============================================================================
 * POR QUE ISTO FALTAVA
 * =============================================================================
 * O sistema gravava a trilha desde o primeiro dia e nunca a mostrou. Toda ação
 * que muda dinheiro, acesso ou o rumo de uma ordem passa por `auditar()` — com
 * autor, papel, hora, IP e o que foi tocado. Estava tudo lá, e a única forma de
 * ler era abrir o banco pelo terminal.
 *
 * Uma trilha que só o desenvolvedor consegue ler não protege o dono do sistema:
 * protege contra ele. "Quem apagou esse cliente?", "quem baixou aquele
 * pagamento?", "alguém andou tentando entrar onde não devia?" são perguntas de
 * dono, e precisam de resposta sem intermediário.
 *
 * =============================================================================
 * O QUE CADA UM ENXERGA
 * =============================================================================
 * O recorte não é feito aqui. `comEscopo` instala o contexto e a política do
 * Postgres decide:
 *
 *     USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
 *
 * O administrador da empresa vê a trilha DELE. As linhas de plataforma — as que
 * nascem sem empresa, como "empresa criada" — têm `tenantId` nulo, e `NULL =
 * qualquer coisa` não é verdadeiro: elas não aparecem para ele nem por engano.
 * O dono da plataforma vê tudo; quando ele ENTRA numa empresa, o escape hatch
 * desliga e ele passa a ver o que a empresa vê. É a mesma regra de todas as
 * outras telas, e é por isso que ela não precisa ser reescrita aqui.
 *
 * =============================================================================
 * POR QUE A TABELA NÃO PODE SER APAGADA POR NINGUÉM
 * =============================================================================
 * `REVOKE UPDATE, DELETE` na migração de RLS. Nem o administrador da empresa,
 * nem esta tela, nem uma ação futura escrita com pressa. Trilha que se apaga é
 * trilha que não vale como prova — e a única serventia dela é justamente valer
 * como prova no dia em que alguém disser "não fui eu".
 */

/** Quantas linhas a tela carrega de uma vez. Trilha cresce rápido. */
const LIMITE = 200

/**
 * As FAMÍLIAS de ação — o prefixo antes do primeiro ponto.
 *
 * A trilha usa nomes como `financeiro.recebimento` e `ordem.transicao.ENTREGUE`.
 * Agrupar pelo prefixo dá um filtro que continua funcionando quando ações novas
 * entrarem: nasce dentro de uma família que já existe e já aparece no filtro.
 *
 * A lista é fechada de propósito. O valor vem da URL, e mesmo indo como
 * parâmetro (nunca concatenado), aceitar só o que se conhece evita uma consulta
 * inútil disparada por qualquer texto colado na barra de endereço.
 */
export const FAMILIAS = [
  { chave: 'ordem', rotulo: 'Ordens e etapas' },
  { chave: 'financeiro', rotulo: 'Dinheiro' },
  { chave: 'orcamento', rotulo: 'Orçamentos' },
  { chave: 'estoque', rotulo: 'Estoque' },
  { chave: 'agenda', rotulo: 'Agenda e rota' },
  { chave: 'rota', rotulo: 'Saídas de rota' },
  { chave: 'preventiva', rotulo: 'Preventiva' },
  { chave: 'assinatura', rotulo: 'Assinaturas' },
  { chave: 'portal', rotulo: 'Portal do cliente' },
  { chave: 'senha', rotulo: 'Senhas' },
  { chave: 'sessoes', rotulo: 'Sessões' },
  { chave: 'usuario', rotulo: 'Pessoas' },
  { chave: 'empresa', rotulo: 'Empresas' },
  { chave: 'plataforma', rotulo: 'Plataforma' },
  { chave: 'whatsapp', rotulo: 'WhatsApp' },
  { chave: 'site', rotulo: 'Site' },
  { chave: 'clientes', rotulo: 'Clientes' },
] as const

const CHAVES_FAMILIA = new Set<string>(FAMILIAS.map((f) => f.chave))

/** Janelas de tempo oferecidas. Fechada pelo mesmo motivo das famílias. */
export const PERIODOS = [1, 7, 30, 90] as const

export type FiltroAuditoria = {
  /** Dias para trás. Fora da lista, cai em 7. */
  dias?: number
  /** Prefixo da ação. Fora da lista, ignorado. */
  familia?: string
  /** `negadas` deixa só as tentativas barradas. */
  so?: string
  /** Texto livre: nome de quem fez, nome da ação, ou o id do que foi tocado. */
  busca?: string
}

export type LinhaAuditoria = {
  id: string
  acao: string
  entidade: string | null
  entidadeId: string | null
  detalhes: unknown
  userNome: string | null
  userPapel: string | null
  ip: string | null
  negado: boolean
  criadoEm: Date
  empresa: string | null
}

export type Trilha = {
  linhas: LinhaAuditoria[]
  /** Quantas linhas o período tem no total — mostra se o limite cortou. */
  total: number
  /** Quantas foram tentativas barradas. É o número que se olha primeiro. */
  negadas: number
  /** As ações mais frequentes do período, para dar o retrato sem ler tudo. */
  maisFrequentes: { acao: string; quantidade: number }[]
  /** O que de fato foi aplicado, já normalizado — a tela desenha a partir disto. */
  aplicado: { dias: number; familia: string; so: string; busca: string }
}

export async function lerTrilha(ctx: ContextoAcesso, f: FiltroAuditoria): Promise<Trilha> {
  const dias = PERIODOS.includes(f.dias as (typeof PERIODOS)[number]) ? (f.dias as number) : 7
  const familia = f.familia && CHAVES_FAMILIA.has(f.familia) ? f.familia : ''
  const so = f.so === 'negadas' ? 'negadas' : 'tudo'
  const busca = (f.busca ?? '').trim().slice(0, 120)

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

  // O texto da busca vai sempre como PARÂMETRO. Um nome com aspas ou um id
  // colado com lixo junto devolve lista vazia — nunca derruba a tela.
  const where = {
    criadoEm: { gte: desde },
    ...(so === 'negadas' ? { negado: true } : {}),
    ...(familia ? { acao: { startsWith: `${familia}.` } } : {}),
    ...(busca
      ? {
          OR: [
            { userNome: { contains: busca, mode: 'insensitive' as const } },
            { acao: { contains: busca, mode: 'insensitive' as const } },
            { entidadeId: { equals: busca } },
          ],
        }
      : {}),
  }

  return comEscopo(ctx, async (tx) => {
    const [linhas, total, negadas, agrupadas] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        take: LIMITE,
        select: {
          id: true,
          acao: true,
          entidade: true,
          entidadeId: true,
          detalhes: true,
          userNome: true,
          userPapel: true,
          ip: true,
          negado: true,
          criadoEm: true,
          tenant: { select: { nome: true } },
        },
      }),
      tx.auditLog.count({ where }),
      // A contagem de barradas ignora o filtro de "só negadas" — senão ela
      // repetiria o total e não informaria nada.
      tx.auditLog.count({
        where: {
          criadoEm: { gte: desde },
          negado: true,
          ...(familia ? { acao: { startsWith: `${familia}.` } } : {}),
        },
      }),
      tx.auditLog.groupBy({
        by: ['acao'],
        where,
        _count: { acao: true },
        orderBy: { _count: { acao: 'desc' } },
        take: 5,
      }),
    ])

    return {
      linhas: linhas.map((l) => ({
        id: l.id,
        acao: l.acao,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        detalhes: l.detalhes,
        userNome: l.userNome,
        userPapel: l.userPapel,
        ip: l.ip,
        negado: l.negado,
        criadoEm: l.criadoEm,
        empresa: l.tenant?.nome ?? null,
      })),
      total,
      negadas,
      maisFrequentes: agrupadas.map((g) => ({ acao: g.acao, quantidade: g._count.acao })),
      aplicado: { dias, familia, so, busca },
    }
  })
}
