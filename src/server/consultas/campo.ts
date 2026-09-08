import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { diaLocal, horaLocal, janelaDoDia } from '@/lib/datas'
import { ROTULO_ETAPA, TERMINAIS } from '@/server/ordem/maquina-estados'

/**
 * Consultas dos apps de campo.
 *
 * A regra que vale para as duas: **cada um só enxerga o que é dele**. O filtro
 * por motorista não é conforto de tela — um entregador fechando a parada de
 * outro bagunça a operação e a comissão. E a restrição vive aqui, no servidor,
 * não num filtro do componente.
 */

export type Parada = {
  id: string
  ordemId: string
  /** De quem é a parada. Só o modo gestão desenha isto. */
  motorista: string | null
  tipo: 'RETIRADA' | 'ENTREGA'
  numero: number
  cliente: string
  contato: string | null
  telefone: string | null
  equipamento: string
  endereco: string
  referencia: string | null
  previstoPara: Date
  status: string
  concluida: boolean
  atrasada: boolean
  /** Já saiu para esta parada? É o que decide qual botão a tela oferece. */
  emRota: boolean
}

/**
 * As paradas do dia, na ordem da rota.
 *
 * =============================================================================
 * `motoristaId: null` É O MODO GESTÃO, E NÃO UM DESCUIDO
 * =============================================================================
 * Quem administra a empresa precisava ver o aplicativo de campo e não
 * conseguia: a tela recusava qualquer papel que não fosse MOTORISTA, e mesmo
 * atravessando essa recusa ela mostraria a rota DELE — que é vazia, porque ele
 * não dirige.
 *
 * O efeito prático era que ninguém acima do motorista sabia o que o aplicativo
 * mostra. Não dava para conferir se uma parada chegou, não dava para explicar
 * por telefone o que o motorista está vendo, e não dava para descobrir que o
 * endereço saiu errado antes de o cliente reclamar.
 *
 * Com `null`, vêm as paradas de TODA a empresa, e cada uma diz de quem é. É
 * leitura: quem age na parada continua sendo o motorista dela, porque a máquina
 * de estados confere o dono na hora da assinatura — não é a tela que decide
 * isso, e por isso abrir a tela não abre a ação.
 */
export async function rotaDoDia(
  ctx: ContextoAcesso,
  motoristaId: string | null,
): Promise<Parada[]> {
  // A janela do dia DE LAJEADO, e não a do fuso do processo. Ver `@/lib/datas`:
  // com `setHours` numa máquina em UTC, o "dia" corria das 21h às 21h e a rota
  // perdia toda parada marcada para depois das 21h.
  const { inicio, fim } = janelaDoDia()

  const ags = await comEscopo(ctx, (tx) =>
    tx.agendamento.findMany({
      where: {
        // Sem motorista: a rota da empresa inteira (modo gestão).
        ...(motoristaId ? { motoristaId } : {}),
        previstoPara: { gte: inicio, lt: fim },
        status: { in: ['ATRIBUIDO', 'EM_ROTA', 'CONCLUIDO'] },
      },
      orderBy: [{ posicaoRota: 'asc' }, { previstoPara: 'asc' }],
      include: {
        ordem: {
          include: {
            cliente: { select: { nome: true, contatoNome: true, telefone: true, whatsapp: true } },
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
        // Só interessa no modo gestão, onde a lista mistura motoristas.
        motorista: { select: { nome: true } },
      },
    }),
  )

  const agora = Date.now()
  return ags.map((a) => ({
    id: a.id,
    ordemId: a.ordemId,
    motorista: a.motorista?.nome ?? null,
    tipo: a.tipo as 'RETIRADA' | 'ENTREGA',
    numero: a.ordem.numero,
    cliente: a.ordem.cliente.nome,
    contato: a.ordem.cliente.contatoNome,
    telefone: a.ordem.cliente.whatsapp ?? a.ordem.cliente.telefone,
    equipamento: `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`.trim(),
    endereco: a.enderecoSnapshot,
    referencia: a.pontoReferencia,
    previstoPara: a.previstoPara,
    status: a.status,
    concluida: a.status === 'CONCLUIDO',
    atrasada: a.status !== 'CONCLUIDO' && a.previstoPara.getTime() < agora,
    // A verdade está na etapa da ordem, não no status do agendamento: é ela
    // que a máquina de estados consulta na hora de aceitar a assinatura.
    emRota:
      a.ordem.etapa === 'EM_ROTA_RETIRADA' || a.ordem.etapa === 'EM_ROTA_ENTREGA',
  }))
}

/** A ordem de uma parada, já conferindo que ela pertence a este motorista. */
export async function paradaDoMotorista(ctx: ContextoAcesso, motoristaId: string, ordemId: string) {
  return comEscopo(ctx, async (tx) => {
    const ag = await tx.agendamento.findFirst({
      where: { ordemId, motoristaId, status: { in: ['ATRIBUIDO', 'EM_ROTA'] } },
      include: {
        ordem: {
          include: {
            cliente: true,
            equipamento: true,
            assinaturas: { select: { tipo: true } },
            // Quantas fotos de campo já subiram, para a tela não pedir de novo
            // as que a pessoa já tirou.
            fotos: { select: { categoria: true } },
          },
        },
      },
    })
    // Nulo tanto para ordem inexistente quanto para ordem de outro motorista:
    // quem tenta o id alheio não descobre sequer que ele existe.
    return ag
  })
}

export type NaBancada = {
  ordemId: string
  numero: number
  etapa: EtapaOrdem
  cliente: string
  equipamento: string
  numeroSerie: string | null
  defeito: string
  fotosRecebimento: number
  desdeQuando: Date
}

/**
 * A fila do técnico.
 *
 * Inclui o que está chegando (para dar entrada) e o que já está com ele. Um
 * técnico vê o trabalho da oficina inteira de propósito: diferente do
 * motorista, aqui a bancada é compartilhada e esconder atrapalha.
 */
export async function bancada(ctx: ContextoAcesso, tecnicoId: string): Promise<NaBancada[]> {
  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: {
        OR: [
          { etapa: { in: [EtapaOrdem.COLETADO, EtapaOrdem.RECEBIDO_NA_EMPRESA] } },
          {
            tecnicoId,
            etapa: {
              in: [EtapaOrdem.EM_ANALISE, EtapaOrdem.ORCAMENTO_APROVADO, EtapaOrdem.EM_MANUTENCAO],
            },
          },
        ],
      },
      orderBy: { atualizadoEm: 'asc' },
      include: {
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
        _count: { select: { fotos: true } },
      },
    }),
  )

  const contagens = await comEscopo(ctx, (tx) =>
    tx.foto.groupBy({
      by: ['ordemId'],
      where: { ordemId: { in: ordens.map((o) => o.id) }, categoria: 'RECEBIMENTO' },
      _count: { _all: true },
    }),
  )
  const porOrdem = new Map(contagens.map((c) => [c.ordemId, c._count._all]))

  return ordens.map((o) => ({
    ordemId: o.id,
    numero: o.numero,
    etapa: o.etapa,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    numeroSerie: o.equipamento.numeroSerie,
    defeito: o.defeitoRelatado,
    fotosRecebimento: porOrdem.get(o.id) ?? 0,
    desdeQuando: o.atualizadoEm,
  }))
}

/**
 * A AGENDA DE QUEM TRABALHA NA RUA E NA BANCADA — a semana dela, não o dia.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É A MESMA COISA QUE A TELA DE HOJE
 * =============================================================================
 * O aplicativo abre no HOJE de propósito: quem está na rua com uma mão só
 * precisa da próxima parada, não de um calendário. Só que hoje era tudo o que
 * existia, e o efeito é uma pessoa que não consegue responder a pergunta mais
 * banal do trabalho dela — "amanhã eu tenho o quê?". Para saber, tinha de ligar
 * para a central.
 *
 * =============================================================================
 * O MOTORISTA E O TÉCNICO NÃO TÊM A MESMA AGENDA, E FORÇAR ISSO SERIA MENTIR
 * =============================================================================
 * A agenda do motorista é feita de PARADAS: hora marcada, endereço, alguém
 * esperando. A do técnico é feita de PRAZOS: a ordem não tem hora, tem um dia
 * em que precisa estar pronta. Espremer as duas no mesmo formato daria ao
 * técnico uma agenda de compromissos que ele não tem, e ao motorista uma lista
 * de prazos que não diz para onde ir.
 *
 * Então cada um recebe o que é dele, e o tipo de item diz qual é qual.
 *
 * O atrasado vem junto, e vem primeiro: prazo vencido não é passado, é a coisa
 * mais urgente que aquela pessoa tem.
 */
export type ItemDaAgenda = {
  id: string
  ordemId: string
  /** 'AAAA-MM-DD' em Lajeado — a chave que agrupa a tela. */
  dia: string
  /** 'HH:MM' quando existe hora marcada; o prazo do técnico não tem. */
  hora: string | null
  tipo: 'RETIRADA' | 'ENTREGA' | 'PRAZO'
  numero: number
  cliente: string
  equipamento: string
  /** Endereço só na parada — prazo de bancada não tem para onde ir. */
  endereco: string | null
  etapaRotulo: string
  /** Passou da data e continua em aberto. */
  atrasado: boolean
}

export async function agendaDeCampo(
  ctx: ContextoAcesso,
  papel: Papel,
  userId: string,
  dias = 14,
): Promise<ItemDaAgenda[]> {
  const { inicio } = janelaDoDia()
  const fim = new Date(inicio.getTime() + dias * 86_400_000)
  const agora = new Date()

  if (papel === Papel.MOTORISTA) {
    const paradas = await comEscopo(ctx, (tx) =>
      tx.agendamento.findMany({
        where: {
          motoristaId: userId,
          status: { notIn: ['CANCELADO'] },
          // O atrasado entra pela porta de baixo: sem `gte`, tudo o que ficou
          // para trás e não foi concluído continua aparecendo.
          OR: [
            { previstoPara: { gte: inicio, lt: fim } },
            { previstoPara: { lt: inicio }, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
          ],
        },
        orderBy: [{ previstoPara: 'asc' }],
        take: 200,
        select: {
          id: true,
          tipo: true,
          status: true,
          previstoPara: true,
          janelaInicio: true,
          enderecoSnapshot: true,
          ordem: {
            select: {
              id: true,
              numero: true,
              etapa: true,
              cliente: { select: { nome: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          },
        },
      }),
    )

    return paradas.map((a) => ({
      id: a.id,
      ordemId: a.ordem.id,
      dia: diaLocal(a.previstoPara),
      hora: a.janelaInicio ? horaLocal(a.janelaInicio) : null,
      tipo: a.tipo as 'RETIRADA' | 'ENTREGA',
      numero: a.ordem.numero,
      cliente: a.ordem.cliente.nome,
      equipamento: `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`.trim(),
      endereco: a.enderecoSnapshot,
      etapaRotulo: ROTULO_ETAPA[a.ordem.etapa] ?? a.ordem.etapa,
      atrasado: a.status !== 'CONCLUIDO' && a.previstoPara < agora,
    }))
  }

  // TÉCNICO — o que ele tem para entregar, e quando.
  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: {
        tecnicoId: userId,
        etapa: { notIn: TERMINAIS },
        prazoPrometido: { not: null, lt: fim },
      },
      orderBy: [{ prazoPrometido: 'asc' }],
      take: 200,
      select: {
        id: true,
        numero: true,
        etapa: true,
        prazoPrometido: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true } },
      },
    }),
  )

  return ordens.map((o) => ({
    id: o.id,
    ordemId: o.id,
    dia: diaLocal(o.prazoPrometido!),
    hora: null,
    tipo: 'PRAZO' as const,
    numero: o.numero,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    endereco: null,
    etapaRotulo: ROTULO_ETAPA[o.etapa] ?? o.etapa,
    atrasado: o.prazoPrometido! < agora,
  }))
}

export { Papel }
