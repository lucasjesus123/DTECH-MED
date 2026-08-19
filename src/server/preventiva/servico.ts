import { Periodicidade, StatusVisita } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa, type ContextoAcesso, type Transacao } from '@/lib/db'
import { diaLocal } from '@/lib/datas'

/**
 * A manutenção preventiva.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO É O MAIS VALIOSO DO SISTEMA
 * ---------------------------------------------------------------------------
 * Uma assistência que só conserta o que quebra vive de sobressalto: o mês bom
 * depende de o cliente ter um problema. A revisão periódica inverte isso —
 * autoclave, laser e compressor precisam de revisão com hora marcada, e o
 * contrato transforma isso em receita que se sabe de antemão. Para uma rede que
 * vai virar franquia, é a diferença entre vender conserto e vender contrato.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO, E O QUE FOI MUDADO
 * ---------------------------------------------------------------------------
 * A ideia vem do Maintenance Schedule do ERPNext: um contrato com periodicidade
 * que gera as visitas previstas. A tradução importante é a última milha — lá a
 * visita é um documento próprio, com o próprio ciclo de vida. Aqui ela vira uma
 * ORDEM DE SERVIÇO comum quando chega a hora.
 *
 * Não é detalhe de implementação. A esteira de 18 etapas já sabe cobrar
 * assinatura, exigir foto, guardar laudo, faturar e travar entrega sem
 * pagamento. Uma preventiva que corresse por fora teria de reaprender tudo
 * isso, mal — e no fim seriam dois sistemas dentro de um.
 */

/** Quantos meses cada periodicidade pula. */
const MESES: Record<Periodicidade, number> = {
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
}

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  MENSAL: 'todo mês',
  BIMESTRAL: 'a cada 2 meses',
  TRIMESTRAL: 'a cada 3 meses',
  SEMESTRAL: 'a cada 6 meses',
  ANUAL: 'uma vez por ano',
}

/**
 * As datas das visitas de um contrato.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A CONTA É EM MÊS, E NÃO EM DIAS
 * ---------------------------------------------------------------------------
 * "Trimestral" para quem assina significa "todo dia 10, de três em três meses",
 * e não "a cada 90 dias". Somar 90 dias faz a visita andar no calendário: a de
 * janeiro cai dia 10, a de abril dia 10, a de julho dia 9, a de outubro dia 7.
 * Em dois anos o contrato está uma semana fora do combinado, e ninguém sabe
 * dizer por quê.
 *
 * `setMonth` do JavaScript resolve isso e traz um efeito conhecido: 31 de
 * janeiro mais um mês vira 3 de março, porque fevereiro não tem 31. Para
 * revisão de equipamento isso é aceitável — e travar no último dia do mês seria
 * pior, porque empurraria todo contrato que começa dia 29, 30 ou 31 para o fim
 * do mês para sempre.
 */
export function datasDasVisitas(
  inicio: Date,
  periodicidade: Periodicidade,
  fim: Date | null,
  teto = 60,
): Date[] {
  const passo = MESES[periodicidade]
  const datas: Date[] = []
  /**
   * O horizonte automático nasce DO PRÓPRIO INÍCIO, e não de um `new Date` novo.
   *
   * Montar `new Date(ano+2, mês, dia)` cria meia-noite na hora do PROCESSO, e o
   * processo roda em UTC no servidor. Em Lajeado isso é 21h do dia anterior — e
   * a última visita do contrato sumia por causa de um fuso que ninguém digitou.
   * Copiando o início, o limite carrega o mesmo horário das visitas.
   */
  const limite = fim ?? (() => {
    const l = new Date(inicio)
    l.setFullYear(l.getFullYear() + 2)
    return l
  })()

  /**
   * A comparação é por DIA, e não por instante.
   *
   * "O contrato vai até 15 de janeiro de 2028" é uma data no calendário, não um
   * horário. Comparando instantes, a visita do próprio dia 15 entra ou não
   * conforme a HORA em que cada uma das duas datas foi construída: o começo do
   * contrato vem do formulário ao meio-dia, o limite automático nasce à
   * meia-noite, e a última visita do contrato desaparece por doze horas de
   * diferença que ninguém digitou.
   */
  const ate = diaLocal(limite)
  for (let i = 0; i < teto; i++) {
    const d = new Date(inicio)
    d.setMonth(d.getMonth() + passo * i)
    if (diaLocal(d) > ate) break
    datas.push(d)
  }
  return datas
}

/**
 * Cria as visitas que faltam para um contrato.
 *
 * Idempotente: compara pelo DIA de Lajeado, não pelo instante. Rodar de novo
 * não duplica — e vai rodar de novo, porque o contrato pode ganhar data de fim
 * depois de criado.
 */
export async function gerarVisitas(
  tx: Transacao,
  tenantId: string,
  contratoId: string,
): Promise<number> {
  const c = await tx.contratoManutencao.findUnique({
    where: { id: contratoId },
    select: { inicio: true, fim: true, periodicidade: true, ativo: true },
  })
  if (!c || !c.ativo) return 0

  const existentes = await tx.visitaPreventiva.findMany({
    where: { contratoId },
    select: { previstaPara: true },
  })
  const jaTem = new Set(existentes.map((v) => diaLocal(v.previstaPara)))

  const novas = datasDasVisitas(c.inicio, c.periodicidade, c.fim).filter(
    (d) => !jaTem.has(diaLocal(d)),
  )
  if (novas.length === 0) return 0

  await tx.visitaPreventiva.createMany({
    data: novas.map((previstaPara) => ({ tenantId, contratoId, previstaPara })),
  })
  return novas.length
}

/**
 * As visitas que já deveriam ter acontecido, ou estão perto.
 *
 * É a lista que responde "o que eu tenho de vender este mês sem esperar
 * ninguém ligar". Sem ela, o contrato existe no papel e a visita não acontece —
 * que é como contrato de manutenção morre na prática.
 */
export async function visitasAVencer(ctx: ContextoAcesso, dias = 30) {
  const ate = new Date(Date.now() + dias * 86_400_000)
  return comEscopo(ctx, (tx) =>
    tx.visitaPreventiva.findMany({
      where: { status: StatusVisita.PREVISTA, previstaPara: { lte: ate } },
      orderBy: { previstaPara: 'asc' },
      take: 50,
      select: {
        id: true,
        previstaPara: true,
        contrato: {
          select: {
            id: true,
            numero: true,
            valorVisitaCentavos: true,
            periodicidade: true,
            cliente: { select: { id: true, nome: true, whatsapp: true } },
            equipamento: { select: { id: true, marca: true, modelo: true, numeroSerie: true } },
          },
        },
      },
    }),
  )
}

/** Cria o contrato e já deixa o calendário de visitas montado. */
export async function criarContrato(
  ctx: ContextoAcesso,
  dados: {
    clienteId: string
    equipamentoId: string
    periodicidade: Periodicidade
    inicio: Date
    fim: Date | null
    valorVisitaCentavos: number
    observacoes?: string | null
  },
): Promise<{ ok: true; id: string; numero: number; visitas: number } | { ok: false; motivo: string }> {
  const tenantId = exigirEmpresa(ctx)

  return comEscopo(ctx, async (tx) => {
    // Um equipamento não tem dois contratos ativos: se tem, alguém duplicou, e
    // o segundo geraria visita em cima da do primeiro.
    const jaAtivo = await tx.contratoManutencao.findFirst({
      where: { equipamentoId: dados.equipamentoId, ativo: true },
      select: { numero: true },
    })
    if (jaAtivo) {
      return {
        ok: false as const,
        motivo: `Este equipamento já tem o contrato #${String(jaAtivo.numero).padStart(4, '0')} ativo. Encerre o anterior antes de abrir outro.`,
      }
    }

    const ultimo = await tx.contratoManutencao.aggregate({ _max: { numero: true } })
    const numero = (ultimo._max.numero ?? 0) + 1

    const c = await tx.contratoManutencao.create({
      data: { tenantId, numero, ...dados },
      select: { id: true },
    })
    const visitas = await gerarVisitas(tx, tenantId, c.id)
    return { ok: true as const, id: c.id, numero, visitas }
  }).catch((e: Error) => ({ ok: false as const, motivo: e.message }))
}
