import { comEscopo, type ContextoAcesso } from '@/lib/db'

/**
 * A LEITURA DO RASTRO — e por que ela NÃO mora em `acoes/`.
 *
 * ---------------------------------------------------------------------------
 * O ERRO QUE ESTE ARQUIVO EXISTE PARA NÃO COMETER
 * ---------------------------------------------------------------------------
 * Num arquivo marcado com `'use server'`, TODA função exportada vira um
 * endpoint que o navegador pode chamar — com os argumentos que ele quiser.
 *
 * Esta função recebe o `ContextoAcesso`, que é quem carrega a empresa da
 * sessão. Se ela morasse lá, qualquer pessoa poderia chamá-la passando o
 * contexto de OUTRA franquia — ou com a marca de super admin ligada — e ler as
 * posições ao vivo de quem não é dela. O isolamento inteiro cairia por uma
 * escolha de arquivo.
 *
 * Aqui, em módulo comum de servidor, ela só é alcançável por código do
 * servidor, que monta o contexto a partir da sessão de verdade. A regra geral:
 * função que RECEBE contexto nunca fica em `acoes/`; ação que deriva o contexto
 * da sessão, sim.
 */

export type ParadaAoVivo = {
  agendamentoId: string
  ordemId: string
  numero: number
  tipo: string
  cliente: string
  equipamento: string
  endereco: string
  motorista: string
  saiuEm: string | null
  posicao: {
    latitude: number
    longitude: number
    precisaoM: number | null
    velocidade: number | null
    quando: string
    /** Há quantos minutos veio esta posição. */
    minutosAtras: number
  } | null
}

/**
 * As paradas que estão na rua AGORA, com a última posição de cada uma.
 *
 * Só `EM_ROTA`. Uma tela de monitoramento que mostra parada concluída vira
 * lista, e lista já existe na Agenda.
 */
export async function paradasAoVivo(ctx: ContextoAcesso): Promise<ParadaAoVivo[]> {
  const agora = Date.now()

  return comEscopo(ctx, async (tx) => {
    const paradas = await tx.agendamento.findMany({
      where: { status: 'EM_ROTA' },
      orderBy: { iniciadoEm: 'asc' },
      take: 40,
      select: {
        id: true,
        tipo: true,
        iniciadoEm: true,
        enderecoSnapshot: true,
        motorista: { select: { nome: true } },
        ordem: {
          select: {
            id: true,
            numero: true,
            cliente: { select: { nome: true } },
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
        posicoes: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
          select: {
            latitude: true,
            longitude: true,
            precisaoM: true,
            velocidade: true,
            criadoEm: true,
            motoristaNome: true,
          },
        },
      },
    })

    return paradas.map((p) => {
      const u = p.posicoes[0]
      return {
        agendamentoId: p.id,
        ordemId: p.ordem.id,
        numero: p.ordem.numero,
        tipo: p.tipo,
        cliente: p.ordem.cliente.nome,
        equipamento: `${p.ordem.equipamento.marca} ${p.ordem.equipamento.modelo}`,
        endereco: p.enderecoSnapshot,
        motorista: p.motorista?.nome ?? u?.motoristaNome ?? 'sem motorista',
        saiuEm: p.iniciadoEm?.toISOString() ?? null,
        posicao: u
          ? {
              latitude: u.latitude,
              longitude: u.longitude,
              precisaoM: u.precisaoM,
              velocidade: u.velocidade,
              quando: u.criadoEm.toISOString(),
              minutosAtras: Math.max(0, Math.round((agora - u.criadoEm.getTime()) / 60_000)),
            }
          : null,
      }
    })
  })
}
