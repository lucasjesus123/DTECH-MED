import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * =============================================================================
 * QUEM MEXEU EM QUÊ — a folha que se entrega
 * =============================================================================
 * O sistema já sabia tudo isto; o que faltava era juntar.
 *
 * A informação estava em três lugares que nunca se encontravam:
 *
 *   · `eventos_ordem` — quem moveu cada etapa, e quando. Encadeado por hash,
 *     e o banco RECUSA UPDATE nele: é a parte que não se reescreve.
 *   · `audit_logs`   — cada ação do sistema, inclusive as NEGADAS. É onde
 *     aparece quem tentou fazer o que não podia.
 *   · fotos, assinaturas e documentos — a prova material de cada passo.
 *
 * Para responder "quem mexeu neste aparelho" era preciso abrir a ficha do
 * equipamento, depois cada O.S., depois a trilha de cada uma, e cruzar de
 * cabeça com a tela de auditoria filtrando por id. Ninguém faz isso com um
 * cliente no telefone perguntando quem quebrou o aparelho dele.
 *
 * =============================================================================
 * É POR EQUIPAMENTO, E NÃO POR O.S. — e essa é a mudança
 * =============================================================================
 * O aparelho é que volta. Um tomógrafo que passou cinco vezes pela assistência
 * tem cinco O.S., e a pergunta que importa — "sempre o mesmo técnico?", "o que
 * fizeram nele da última vez?" — só se responde vendo as cinco juntas, em
 * ordem, com nome em cada linha.
 *
 * =============================================================================
 * O QUE ESTA CONSULTA NÃO FAZ
 * =============================================================================
 * Ela NÃO decide quem errou. Ela mostra o que ficou registrado, com data, nome
 * e papel, e deixa a leitura para quem sabe do assunto. Um sistema que
 * apontasse culpado a partir de log estaria inventando intenção a partir de
 * carimbo de tempo.
 */

/** Uma linha da folha: uma coisa que aconteceu, e quem fez. */
export type PassoDaTrilha = {
  quando: Date
  /** `etapa` veio da trilha da O.S.; `acao` veio do log de auditoria. */
  origem: 'etapa' | 'acao'
  ordemNumero: number
  ordemId: string
  /** O que aconteceu, em português. */
  titulo: string
  quem: string
  papel: Papel | null
  /** Só para o log: a tentativa foi barrada pelo sistema. */
  negado: boolean
  /** Fotos, assinaturas e documentos que nasceram deste passo. */
  provas: string[]
}

export type OrdemDaTrilha = {
  id: string
  numero: number
  etapa: EtapaOrdem
  abertaEm: Date
  entregueEm: Date | null
  defeito: string | null
  emGarantia: boolean
  passos: PassoDaTrilha[]
}

export type Rastreabilidade = {
  equipamento: {
    id: string
    marca: string
    modelo: string
    numeroSerie: string | null
    cliente: string
  }
  ordens: OrdemDaTrilha[]
  /** Quem tocou o aparelho, e quantas vezes. Ordenado pelo que mais mexeu. */
  pessoas: Array<{ nome: string; papel: Papel | null; passos: number }>
  /** Tentativas barradas — vazio é a resposta boa. */
  negadas: number
  /** Quantas provas materiais existem no total. */
  provas: number
  geradoEm: Date
}

export async function rastreabilidade(
  ctx: ContextoAcesso,
  equipamentoId: string,
): Promise<Rastreabilidade | null> {
  return comEscopo(ctx, async (tx) => {
    const eq = await tx.equipamento.findUnique({
      where: { id: equipamentoId },
      select: {
        id: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        cliente: { select: { nome: true } },
        ordens: {
          orderBy: { numero: 'asc' },
          select: {
            id: true,
            numero: true,
            etapa: true,
            abertaEm: true,
            entregueEm: true,
            defeitoRelatado: true,
            emGarantia: true,
            eventos: {
              orderBy: { sequencia: 'asc' },
              select: {
                criadoEm: true,
                titulo: true,
                etapaNova: true,
                autorNome: true,
                autorPapel: true,
              },
            },
            // As provas, amarradas ao passo pela data: foto tirada na entrada,
            // assinatura colhida na coleta, documento emitido na aprovação.
            fotos: { select: { criadoEm: true, categoria: true } },
            assinaturas: { select: { criadoEm: true, tipo: true, assinanteNome: true } },
            documentos: { select: { geradoEm: true, tipo: true } },
          },
        },
      },
    })
    if (!eq) return null

    const idsDasOrdens = eq.ordens.map((o) => o.id)

    /**
     * O LOG DE AUDITORIA DAS O.S. DESTE APARELHO.
     *
     * `entidadeId` guarda o id do que foi tocado. Filtrar por ele é o que
     * amarra a auditoria — que é do sistema inteiro — a este equipamento.
     *
     * As NEGADAS entram junto, e de propósito: uma tentativa barrada é
     * exatamente o tipo de coisa que um relatório de rastreabilidade existe
     * para mostrar. Esconder o que o sistema recusou seria contar metade.
     */
    const logs =
      idsDasOrdens.length === 0
        ? []
        : await tx.auditLog.findMany({
            // `'ordem'` em MINÚSCULA. A primeira versão desta consulta filtrava
            // por `'Ordem'`, e o resultado era pior do que um erro: a metade de
            // auditoria da folha vinha vazia para sempre, sem reclamar. O
            // sistema inteiro grava esse campo em minúscula — são catorze
            // lugares, e o único fora do padrão era esta linha.
            where: { entidade: 'ordem', entidadeId: { in: idsDasOrdens } },
            orderBy: { criadoEm: 'asc' },
            select: {
              criadoEm: true,
              acao: true,
              entidadeId: true,
              userNome: true,
              userPapel: true,
              negado: true,
            },
          })

    const porOrdem = new Map<string, typeof logs>()
    for (const l of logs) {
      if (!l.entidadeId) continue
      const lista = porOrdem.get(l.entidadeId) ?? []
      lista.push(l)
      porOrdem.set(l.entidadeId, lista)
    }

    const pessoas = new Map<string, { nome: string; papel: Papel | null; passos: number }>()
    let negadas = 0
    let provas = 0

    const ordens: OrdemDaTrilha[] = eq.ordens.map((o) => {
      const passos: PassoDaTrilha[] = []

      /**
       * AS PROVAS SÃO AGRUPADAS PELO DIA em que nasceram. Amarrar pelo instante
       * exato falharia: a foto é gravada segundos depois do evento que a pediu,
       * e o par nunca bateria.
       *
       * Elas são CONTADAS, e não listadas uma a uma. A primeira versão desta
       * folha imprimia `foto (recebimento)` seis vezes seguidas em cada linha —
       * seis fotos do mesmo recebimento são um fato só, e escrever o mesmo
       * rótulo seis vezes não acrescenta nada a quem lê. Vira "6 fotos de
       * recebimento".
       */
      const provasDoDia = new Map<string, Map<string, { um: string; varios: string; n: number }>>()
      const guardar = (quando: Date, um: string, varios: string) => {
        const dia = quando.toISOString().slice(0, 10)
        const doDia = provasDoDia.get(dia) ?? new Map()
        const atual = doDia.get(um) ?? { um, varios, n: 0 }
        atual.n++
        doDia.set(um, atual)
        provasDoDia.set(dia, doDia)
        provas++
      }
      for (const f of o.fotos) {
        const c = f.categoria.toLowerCase()
        guardar(f.criadoEm, `foto de ${c}`, `fotos de ${c}`)
      }
      for (const a of o.assinaturas)
        guardar(a.criadoEm, `assinatura de ${a.assinanteNome}`, `assinaturas de ${a.assinanteNome}`)
      for (const d of o.documentos) {
        const t = d.tipo.toLowerCase()
        guardar(d.geradoEm, `documento ${t}`, `documentos ${t}`)
      }

      const rotulosDoDia = (dia: string) =>
        [...(provasDoDia.get(dia)?.values() ?? [])].map((p) =>
          p.n === 1 ? p.um : `${p.n} ${p.varios}`,
        )

      for (const e of o.eventos) {
        passos.push({
          quando: e.criadoEm,
          origem: 'etapa',
          ordemNumero: o.numero,
          ordemId: o.id,
          titulo: e.titulo,
          quem: e.autorNome,
          papel: e.autorPapel,
          negado: false,
          provas: [],
        })
        const chave = `${e.autorNome}|${e.autorPapel}`
        const p = pessoas.get(chave) ?? { nome: e.autorNome, papel: e.autorPapel, passos: 0 }
        p.passos++
        pessoas.set(chave, p)
      }

      for (const l of porOrdem.get(o.id) ?? []) {
        if (l.negado) negadas++
        passos.push({
          quando: l.criadoEm,
          origem: 'acao',
          ordemNumero: o.numero,
          ordemId: o.id,
          titulo: l.acao,
          quem: l.userNome ?? 'sistema',
          papel: l.userPapel,
          negado: l.negado,
          provas: [],
        })
        if (l.userNome) {
          const chave = `${l.userNome}|${l.userPapel}`
          const p = pessoas.get(chave) ?? { nome: l.userNome, papel: l.userPapel, passos: 0 }
          p.passos++
          pessoas.set(chave, p)
        }
      }

      passos.sort((a, b) => a.quando.getTime() - b.quando.getTime())

      /**
       * O BLOCO DE PROVAS APARECE UMA VEZ POR DIA, na ÚLTIMA linha daquele dia.
       *
       * Antes ele saía repetido em todas as linhas do dia, porque toda linha
       * daquele dia perguntava pelo mesmo balde. Numa O.S. que anda inteira num
       * dia — que é o caso normal aqui — isso imprimia as mesmas oito provas
       * dezessete vezes, e a folha de UM aparelho passava de onze mil pixels.
       *
       * Na última linha, e não na primeira, porque a prova é o rastro do que já
       * aconteceu: quando o leitor chega nela, já leu o que ela comprova.
       */
      const ultimaDoDia = new Map<string, number>()
      passos.forEach((p, i) => ultimaDoDia.set(p.quando.toISOString().slice(0, 10), i))
      for (const [dia, i] of ultimaDoDia) {
        const passo = passos[i]
        if (passo) passo.provas = rotulosDoDia(dia)
      }

      return {
        id: o.id,
        numero: o.numero,
        etapa: o.etapa,
        abertaEm: o.abertaEm,
        entregueEm: o.entregueEm,
        defeito: o.defeitoRelatado,
        emGarantia: o.emGarantia,
        passos,
      }
    })

    return {
      equipamento: {
        id: eq.id,
        marca: eq.marca,
        modelo: eq.modelo,
        numeroSerie: eq.numeroSerie,
        cliente: eq.cliente?.nome ?? 'sem cliente',
      },
      ordens,
      pessoas: [...pessoas.values()].sort((a, b) => b.passos - a.passos),
      negadas,
      provas,
      geradoEm: new Date(),
    }
  })
}
