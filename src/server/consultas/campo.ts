import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'

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

/** As paradas do dia do motorista logado, na ordem da rota. */
export async function rotaDoDia(ctx: ContextoAcesso, motoristaId: string): Promise<Parada[]> {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)

  const ags = await comEscopo(ctx, (tx) =>
    tx.agendamento.findMany({
      where: {
        motoristaId,
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
      },
    }),
  )

  const agora = Date.now()
  return ags.map((a) => ({
    id: a.id,
    ordemId: a.ordemId,
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

export { Papel }
