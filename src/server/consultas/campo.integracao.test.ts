import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Papel as P, Periodicidade, StatusVisita } from '@/generated/prisma/enums'
import { hashDocumento, novoToken } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { agendaDeCampo } from './campo'

/**
 * A AGENDA DE CAMPO, CONTRA O BANCO DE VERDADE.
 *
 * =============================================================================
 * O QUE ESTE ARQUIVO ESTÁ GUARDANDO
 * =============================================================================
 * `agendaDeCampo` tem três ramos — motorista, gestão e técnico — e o do técnico
 * perguntava só por ORDEM com prazo. A visita preventiva tem responsável, dia e
 * hora, e não é ordem nenhuma até alguém apertar "gerar a ordem".
 *
 * O resultado era mudo, que é o pior jeito de falhar: a central marcava a
 * revisão, escolhia o técnico e avisava o cliente; o aplicativo do técnico
 * escolhido dizia "0 compromissos"; e quem descobria era o cliente, no dia,
 * ligando para saber por que ninguém apareceu.
 *
 * Um teste de tela não pegaria isso — a tela estava certa, desenhando uma lista
 * vazia que a consulta devolveu. É a consulta que precisa ser interrogada.
 *
 * =============================================================================
 * POR QUE ESTE ARQUIVO NÃO USA O `limpar()` DO MOTOR
 * =============================================================================
 * Aquele helper dá TRUNCATE em vinte e quatro tabelas. Ele é legítimo lá, com a
 * trava de ambiente que tem. Mas um teste que só precisa de uma empresa não tem
 * por que poder apagar o banco inteiro: este cria a empresa dele e a remove no
 * fim, e o `onDelete: Cascade` do tenant leva junto contrato, visita, cliente e
 * equipamento. O banco volta exatamente como estava — inclusive com a
 * semeadura de quem estava usando a máquina para outra coisa.
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
const SLUG = 'teste-agenda-de-campo'

let tenantId: string
let ctx: ContextoAcesso
let tecnicoId: string
let outroTecnicoId: string

/** Meio-dia do fuso da casa, daqui a `dias` — longe das duas viradas. */
function emDias(dias: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(12, 0, 0, 0)
  return d
}

async function apagarEmpresa() {
  await comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } })
    if (t) await tx.tenant.delete({ where: { id: t.id } })
  })
}

beforeAll(async () => {
  await apagarEmpresa()

  const montado = await comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.create({ data: { slug: SLUG, nome: 'Empresa de teste da agenda' } })

    const tecnico = await tx.user.create({
      data: {
        tenantId: t.id,
        nome: 'Rafael Técnico',
        email: `tecnico@${SLUG}.test`,
        senhaHash: 'x',
        papel: P.TECNICO,
      },
      select: { id: true },
    })
    const outro = await tx.user.create({
      data: {
        tenantId: t.id,
        nome: 'Diego Técnico',
        email: `outro@${SLUG}.test`,
        senhaHash: 'x',
        papel: P.TECNICO,
      },
      select: { id: true },
    })

    const doc = '99888777000166'
    const cliente = await tx.cliente.create({
      data: {
        tenantId: t.id,
        nome: 'Odonto do Teste',
        documento: doc,
        documentoHash: hashDocumento(doc),
        logradouro: 'Rua Júlio de Castilhos, 455',
        cidade: 'Lajeado',
        uf: 'RS',
      },
      select: { id: true },
    })

    const equipamento = await tx.equipamento.create({
      data: {
        tenantId: t.id,
        clienteId: cliente.id,
        marca: 'Cristófoli',
        modelo: 'Vitale 21',
        numeroSerie: 'CR-TESTE',
      },
      select: { id: true },
    })

    const contrato = await tx.contratoManutencao.create({
      data: {
        tenantId: t.id,
        numero: 1,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        periodicidade: Periodicidade.SEMESTRAL,
        inicio: emDias(3),
        valorVisitaCentavos: 38_000,
      },
      select: { id: true },
    })

    // A VISITA QUE O TÉCNICO PRECISA VER: marcada, com dia, hora e dono.
    await tx.visitaPreventiva.create({
      data: {
        tenantId: t.id,
        contratoId: contrato.id,
        previstaPara: emDias(3),
        agendadaPara: emDias(3),
        hora: '09:00',
        status: StatusVisita.AGENDADA,
        responsavelId: tecnico.id,
      },
    })

    // A QUE ELE NÃO PODE VER: projeção do contrato, sem dia combinado e sem
    // dono. Encher a agenda de alguém com datas que ninguém marcou é pior que
    // a agenda vazia — e faria o técnico cobrar da central uma visita que não
    // foi combinada com cliente nenhum.
    await tx.visitaPreventiva.create({
      data: {
        tenantId: t.id,
        contratoId: contrato.id,
        previstaPara: emDias(5),
        status: StatusVisita.PREVISTA,
      },
    })

    // A DE OUTRO TÉCNICO: o filtro é por dono, e não "toda visita da empresa".
    await tx.visitaPreventiva.create({
      data: {
        tenantId: t.id,
        contratoId: contrato.id,
        previstaPara: emDias(4),
        agendadaPara: emDias(4),
        hora: '14:00',
        status: StatusVisita.AGENDADA,
        responsavelId: outro.id,
      },
    })

    // Uma ordem com prazo, para provar que o ramo antigo continua de pé e que
    // as duas fontes convivem ordenadas.
    await tx.contador.create({ data: { tenantId: t.id, chave: 'ordem', valor: 1 } })
    await tx.ordem.create({
      data: {
        tenantId: t.id,
        numero: 1,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        defeitoRelatado: 'Não completa o ciclo de secagem.',
        tokenPublico: novoToken(),
        tecnicoId: tecnico.id,
        prazoPrometido: emDias(1),
      },
    })

    return { tenantId: t.id, tecnicoId: tecnico.id, outroTecnicoId: outro.id }
  })

  tenantId = montado.tenantId
  tecnicoId = montado.tecnicoId
  outroTecnicoId = montado.outroTecnicoId
  ctx = { tenantId, userId: tecnicoId, ehSuperAdmin: false }
})

afterAll(async () => {
  await apagarEmpresa()
  await prisma.$disconnect()
})

describe('agendaDeCampo · o técnico e a visita preventiva', () => {
  it('mostra a visita marcada para ele, com dia, hora, cliente e endereço', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    const visita = itens.find((i) => i.tipo === 'PREVENTIVA')

    expect(visita, 'a visita marcada para este técnico tem de aparecer').toBeDefined()
    expect(visita!.hora).toBe('09:00')
    expect(visita!.cliente).toBe('Odonto do Teste')
    expect(visita!.equipamento).toBe('Cristófoli Vitale 21')
    // O endereço é o do cliente: é para lá que ele vai.
    expect(visita!.endereco).toBe('Rua Júlio de Castilhos, 455, Lajeado, RS')
    expect(visita!.etapaRotulo).toBe('Revisão preventiva')
  })

  it('numera a linha pelo CONTRATO, porque ainda não existe O.S.', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    const visita = itens.find((i) => i.tipo === 'PREVENTIVA')!
    expect(visita.numero).toBe(1)
  })

  it('deixa `ordemId` nulo enquanto a visita não virou ordem', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    const visita = itens.find((i) => i.tipo === 'PREVENTIVA')!
    // A tela lê isto para NÃO desenhar um toque que daria em erro.
    expect(visita.ordemId).toBeNull()
  })

  it('passa a apontar para a ordem assim que ela é gerada', async () => {
    const ordem = await comEscopo(ctx, async (tx) => {
      const o = await tx.ordem.create({
        data: {
          tenantId,
          numero: 2,
          clienteId: (await tx.cliente.findFirstOrThrow({ select: { id: true } })).id,
          equipamentoId: (await tx.equipamento.findFirstOrThrow({ select: { id: true } })).id,
          defeitoRelatado: 'Revisão preventiva semestral.',
          tokenPublico: novoToken(),
          tecnicoId,
        },
        select: { id: true },
      })
      const v = await tx.visitaPreventiva.findFirstOrThrow({
        where: { responsavelId: tecnicoId, status: StatusVisita.AGENDADA },
        select: { id: true },
      })
      await tx.visitaPreventiva.update({ where: { id: v.id }, data: { ordemId: o.id } })
      return o
    })

    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    const visita = itens.find((i) => i.tipo === 'PREVENTIVA')!
    expect(visita.ordemId).toBe(ordem.id)

    // Desfaz, para os outros testes não dependerem da ordem em que rodam.
    await comEscopo(ctx, async (tx) => {
      const v = await tx.visitaPreventiva.findFirstOrThrow({
        where: { ordemId: ordem.id },
        select: { id: true },
      })
      await tx.visitaPreventiva.update({ where: { id: v.id }, data: { ordemId: null } })
      await tx.ordem.delete({ where: { id: ordem.id } })
    })
  })

  it('não mostra a visita PREVISTA — ela não tem dia combinado nem dono', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    expect(itens.filter((i) => i.tipo === 'PREVENTIVA')).toHaveLength(1)
  })

  it('não mostra a visita marcada para OUTRO técnico', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)
    expect(itens.every((i) => i.cliente === 'Odonto do Teste')).toBe(true)
    expect(itens.filter((i) => i.tipo === 'PREVENTIVA')).toHaveLength(1)

    // E o outro vê a dele, e só a dele.
    const doOutro = await agendaDeCampo(
      { tenantId, userId: outroTecnicoId, ehSuperAdmin: false },
      P.TECNICO,
      outroTecnicoId,
    )
    const visitas = doOutro.filter((i) => i.tipo === 'PREVENTIVA')
    expect(visitas).toHaveLength(1)
    expect(visitas[0]!.hora).toBe('14:00')
  })

  it('mantém o prazo de bancada e devolve tudo em ordem cronológica', async () => {
    const itens = await agendaDeCampo(ctx, P.TECNICO, tecnicoId)

    expect(itens.some((i) => i.tipo === 'PRAZO')).toBe(true)
    expect(itens).toHaveLength(2)

    // O prazo é daqui a 1 dia e a visita daqui a 3: misturar as duas fontes sem
    // ordenar deixaria a tela agrupando por dia na ordem errada.
    const dias = itens.map((i) => i.dia)
    expect([...dias].sort()).toEqual(dias)
  })
})
