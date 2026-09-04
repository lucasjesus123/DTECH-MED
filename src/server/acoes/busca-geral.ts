'use server'

import { comEscopo } from '@/lib/db'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { podeAbrir } from '@/server/auth/telas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * A BUSCA DA BARRA — uma caixa que responde às três perguntas do balcão.
 *
 * =============================================================================
 * O QUE ELA CONSERTA
 * =============================================================================
 * O telefone toca e a pessoa do outro lado diz uma de três coisas: um número de
 * O.S., o nome da clínica, ou a marca do aparelho. Nenhuma delas tinha caminho
 * curto. Para o número era: menu → O.S. → filtrar → achar. Para o nome era pior,
 * porque a pergunta real quase nunca é "mostre-me este cliente" e sim **"em que
 * pé está a última O.S. dele"** — e isso eram quatro telas, com o cliente
 * esperando na linha.
 *
 * =============================================================================
 * NOME DE CLIENTE JÁ VEM COM A ÚLTIMA O.S.
 * =============================================================================
 * É a diferença entre um índice e um atendimento. Devolver a ficha do cliente
 * responderia "quem é ele"; quem liga quer saber "cadê meu aparelho". Por isso
 * cada cliente encontrado traz junto o número, a etapa e o aparelho da ordem
 * mais recente — e o Enter leva direto a ela.
 *
 * =============================================================================
 * A BUSCA NÃO É PORTA DOS FUNDOS
 * =============================================================================
 * Ela repete, exatamente, o que `telas.ts` já decide: quem não tem a aba de
 * Clientes não recebe clientes aqui; quem não tem a de Equipamentos não recebe
 * aparelhos. Uma caixa de busca que ignorasse isso seria a maneira mais discreta
 * de contornar a permissão — e a mais difícil de notar, porque ninguém audita
 * uma lupa.
 *
 * O escopo é o de sempre: `comEscopo`, RLS, e a franquia vizinha não aparece nem
 * digitando o número exato da O.S. dela. O termo vai como PARÂMETRO do Prisma,
 * nunca concatenado.
 */

export type AchadoOrdem = {
  tipo: 'ordem'
  id: string
  numero: number
  cliente: string
  equipamento: string
  etapa: string
}

export type AchadoCliente = {
  tipo: 'cliente'
  id: string
  nome: string
  cidade: string
  /** A ÚLTIMA O.S. dele — o que a pessoa queria de verdade ao digitar o nome. */
  ultima: { id: string; numero: number; etapa: string; equipamento: string } | null
  ordens: number
}

export type AchadoEquipamento = {
  tipo: 'equipamento'
  id: string
  nome: string
  serie: string
  dono: string | null
}

export type Achados = {
  ordens: AchadoOrdem[]
  clientes: AchadoCliente[]
  equipamentos: AchadoEquipamento[]
  /**
   * Para onde o Enter vai, decidido no SERVIDOR.
   *
   * Quem sabe qual resultado é o mais provável é quem fez as consultas. Deixar
   * a tela adivinhar faria a regra existir em dois lugares — e um dia os dois
   * discordariam justamente no caso raro.
   */
  atalho: string | null
}

const VAZIO: Achados = { ordens: [], clientes: [], equipamentos: [], atalho: null }

export async function buscaGeral(termo: string): Promise<Achados> {
  const sessao = await lerSessao()
  if (!sessao) return VAZIO

  const t = termo.trim()
  // Menos de duas letras traz meia empresa. Número é exceção: "7" é uma O.S.
  // legítima, e a casa numera do 1.
  const soDigitos = /^\d+$/.test(t)
  if (t.length < (soDigitos ? 1 : 2)) return VAZIO

  const podeCliente = podeAbrir(sessao.papel, sessao.telas, 'clientes')
  const podeEquipamento = podeAbrir(sessao.papel, sessao.telas, 'equipamentos')
  const podeOrdem = podeAbrir(sessao.papel, sessao.telas, 'ordens')
  const ctx = contextoDe(sessao)

  const numero = soDigitos ? Number(t) : null

  const [ordens, clientes, equipamentos] = await comEscopo(ctx, (tx) =>
    Promise.all([
      /**
       * A O.S. PELO NÚMERO — e também pelo nome de quem é dela.
       *
       * "#0042" é o caso principal, mas quem digita "Bella Pelle" também quer as
       * ordens dessa clínica, e não só a ficha dela. Buscar nos dois campos
       * evita que a pessoa tenha de saber de antemão em que gaveta procurar.
       */
      podeOrdem
        ? tx.ordem.findMany({
            where: numero === null
              ? { cliente: { nome: { contains: t, mode: 'insensitive' } } }
              : { numero },
            orderBy: { abertaEm: 'desc' },
            // Pelo número há no máximo uma; pelo nome, quatro chegam para
            // reconhecer o histórico recente sem empurrar o grupo de clientes
            // — que é onde mora a resposta que a pessoa veio buscar — para
            // baixo da rolagem.
            take: numero === null ? 4 : 6,
            select: {
              id: true,
              numero: true,
              etapa: true,
              cliente: { select: { nome: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          })
        : Promise.resolve([]),

      /**
       * O CLIENTE, COM A ÚLTIMA ORDEM JUNTO.
       *
       * A ordem vem por `take: 1` dentro do próprio `select` — uma consulta só.
       * Buscar as ordens depois, cliente por cliente, seria oito idas ao banco
       * para desenhar oito linhas de uma lista que aparece a cada tecla.
       */
      podeCliente
        ? tx.cliente.findMany({
            where: {
              ativo: true,
              OR: [
                { nome: { contains: t, mode: 'insensitive' } },
                ...(t.replace(/\D/g, '').length >= 4
                  ? [
                      { documento: { contains: t.replace(/\D/g, '') } },
                      { whatsapp: { contains: t.replace(/\D/g, '') } },
                    ]
                  : []),
              ],
            },
            orderBy: { nome: 'asc' },
            take: 5,
            select: {
              id: true,
              nome: true,
              cidade: true,
              _count: { select: { ordens: true } },
              ordens: {
                orderBy: { abertaEm: 'desc' },
                take: 1,
                select: {
                  id: true,
                  numero: true,
                  etapa: true,
                  equipamento: { select: { marca: true, modelo: true } },
                },
              },
            },
          })
        : Promise.resolve([]),

      // O aparelho pela MARCA, pelo MODELO ou pela SÉRIE. A série é o que está
      // gravado na etiqueta, e é por ela que o técnico procura.
      podeEquipamento && !soDigitos
        ? tx.equipamento.findMany({
            where: {
              OR: [
                { marca: { contains: t, mode: 'insensitive' } },
                { modelo: { contains: t, mode: 'insensitive' } },
                { numeroSerie: { contains: t, mode: 'insensitive' } },
              ],
            },
            orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
            take: 5,
            select: {
              id: true,
              marca: true,
              modelo: true,
              numeroSerie: true,
              cliente: { select: { nome: true } },
            },
          })
        : Promise.resolve([]),
    ]),
  )

  const achadosOrdens: AchadoOrdem[] = ordens.map((o) => ({
    tipo: 'ordem',
    id: o.id,
    numero: o.numero,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    // O rótulo é traduzido AQUI. A tabela de etapas é módulo de servidor, e
    // importá-la no navegador arrastaria as transições e quem pode o quê para
    // dentro do pacote público.
    etapa: ROTULO_ETAPA[o.etapa as keyof typeof ROTULO_ETAPA] ?? o.etapa,
  }))

  const achadosClientes: AchadoCliente[] = clientes.map((c) => {
    const u = c.ordens[0]
    return {
      tipo: 'cliente',
      id: c.id,
      nome: c.nome,
      cidade: c.cidade ?? '',
      ultima: u
        ? {
            id: u.id,
            numero: u.numero,
            etapa: ROTULO_ETAPA[u.etapa as keyof typeof ROTULO_ETAPA] ?? u.etapa,
            equipamento: `${u.equipamento.marca} ${u.equipamento.modelo}`.trim(),
          }
        : null,
      ordens: c._count.ordens,
    }
  })

  const achadosEquipamentos: AchadoEquipamento[] = equipamentos.map((e) => ({
    tipo: 'equipamento',
    id: e.id,
    nome: `${e.marca} ${e.modelo}`.trim(),
    serie: e.numeroSerie ?? '',
    dono: e.cliente?.nome ?? null,
  }))

  /**
   * A ORDEM DO ENTER, e ela segue a intenção de quem digitou.
   *
   * Número → a O.S. daquele número. Nome → a ÚLTIMA O.S. daquele cliente, que é
   * a pergunta de verdade; só quando o cliente nunca teve ordem é que o Enter
   * cai na ficha dele, porque aí não existe nada melhor para onde ir.
   */
  const atalho =
    achadosOrdens[0] !== undefined && (soDigitos || achadosClientes.length === 0)
      ? `/painel/ordens/${achadosOrdens[0].id}`
      : achadosClientes[0]?.ultima
        ? `/painel/ordens/${achadosClientes[0].ultima.id}`
        : achadosClientes[0]
          ? `/painel/clientes/${achadosClientes[0].id}`
          : achadosOrdens[0]
            ? `/painel/ordens/${achadosOrdens[0].id}`
            : achadosEquipamentos[0]
              ? `/painel/equipamentos/${achadosEquipamentos[0].id}`
              : null

  return {
    ordens: achadosOrdens,
    clientes: achadosClientes,
    equipamentos: achadosEquipamentos,
    atalho,
  }
}
