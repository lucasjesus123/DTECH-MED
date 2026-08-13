import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { TipoMovimentoEstoque as TM } from '@/generated/prisma/enums'
import { hashDocumento } from '@/lib/cripto'
import { novoToken } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { movimentar, reservarDoOrcamento, consumirNaExecucao, liberarReservas, abaixoDoMinimo } from '@/server/estoque/servico'
import { conferir, darBaixa, emitirFatura, estornar, proximoNumero } from './servico'
import { gerarPdfDaOrdem } from '@/server/documentos/gerar'

/**
 * Estoque, financeiro e documentos, contra o banco de verdade.
 *
 * O foco aqui são as situações que só aparecem com concorrência e com dinheiro
 * real passando: duas ordens disputando a última peça, dois operadores dando
 * baixa na mesma fatura, estorno depois da conferência.
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
const AUTOR = { id: null as string | null, nome: 'Teste' }

let ctx: ContextoAcesso
let tenantId: string
let clienteId: string
let ordemId: string
let ordem2Id: string
let pecaId: string

beforeAll(async () => {
  await limpar()
  const m = await comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.create({
      data: {
        slug: 'fin',
        nome: 'DTECH MED Lajeado',
        razaoSocial: 'DTECHMED Assistência Especializada LTDA',
        cnpj: '11222333000181',
        cidade: 'Lajeado',
        uf: 'RS',
      },
    })
    const c = await tx.cliente.create({
      data: {
        tenantId: t.id,
        nome: 'Clínica Bella Pelle',
        documento: '11111111000191',
        documentoHash: hashDocumento('11111111000191'),
        whatsapp: '5551980449274',
      },
    })
    const e = await tx.equipamento.create({
      data: { tenantId: t.id, clienteId: c.id, marca: 'Lavieen', modelo: 'Duo', numeroSerie: 'NS1' },
    })
    const o1 = await tx.ordem.create({
      data: { tenantId: t.id, numero: 1, clienteId: c.id, equipamentoId: e.id, defeitoRelatado: 'x', tokenPublico: novoToken() },
    })
    const o2 = await tx.ordem.create({
      data: { tenantId: t.id, numero: 2, clienteId: c.id, equipamentoId: e.id, defeitoRelatado: 'y', tokenPublico: novoToken() },
    })
    return { tenantId: t.id, clienteId: c.id, ordemId: o1.id, ordem2Id: o2.id }
  })
  tenantId = m.tenantId
  clienteId = m.clienteId
  ordemId = m.ordemId
  ordem2Id = m.ordem2Id
  ctx = { tenantId, userId: null, ehSuperAdmin: false }
})

afterAll(async () => {
  await limpar()
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Cada teste começa com a peça no mesmo estado, senão a ordem de execução
  // passa a importar e a suíte fica intermitente — que é o pior tipo de falha.
  //
  // A limpeza usa o usuário DONO: o papel da aplicação teve DELETE revogado em
  // movimentos de estoque, justamente para que o livro-razão não possa ser
  // reescrito por quem opera o sistema.
  const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
  await c.connect()
  // Depois do FORCE ROW LEVEL SECURITY, nem o dono das tabelas lê ou apaga
  // fora do escopo — é justamente o ponto dessa trava. A limpeza precisa
  // declarar a intenção, e não contar com o privilégio implícito de dono.
  await c.query(`SELECT set_config('app.is_super_admin', 'on', false)`)
  await c.query('DELETE FROM movimentos_estoque')
  await c.query('DELETE FROM pagamentos')
  await c.query('DELETE FROM faturas')
  await c.end()

  await comEscopo(ctx, async (tx) => {
    await tx.peca.deleteMany({ where: { tenantId } })
    const p = await tx.peca.create({
      data: {
        tenantId,
        sku: 'FT-24V10',
        nome: 'Fonte chaveada 24V 10A',
        saldo: new Prisma.Decimal(4),
        saldoReservado: new Prisma.Decimal(0),
        estoqueMinimo: new Prisma.Decimal(2),
        custoMedioCentavos: 50000,
        precoVendaCentavos: 68000,
      },
    })
    pecaId = p.id
  })
})

async function limpar() {
  const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
  await c.connect()
  await c.query(`TRUNCATE tenants, usuarios, sessoes, clientes, equipamentos, ordens,
    eventos_ordem, fotos, assinaturas, orcamentos, orcamento_itens, pecas,
    movimentos_estoque, faturas, pagamentos, agendamentos, documentos,
    outbox_jobs, mensagens_whatsapp, templates_mensagem, whatsapp_instances,
    leads, audit_logs, contadores RESTART IDENTITY CASCADE`)
  await c.end()
}

// ===========================================================================

describe('estoque: o saldo é consequência dos movimentos', () => {
  it('entrada soma e recalcula o custo médio ponderado', async () => {
    const r = await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, {
        pecaId,
        tipo: TM.ENTRADA,
        quantidade: 4,
        custoUnitCentavos: 70000,
      }),
    )
    expect(r.ok && r.saldo).toBe(8)
    const p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    // (4 x 500,00 + 4 x 700,00) / 8 = 600,00. Sem isso o relatório de margem
    // continuaria usando o custo da primeira compra para sempre.
    expect(p?.custoMedioCentavos).toBe(60000)
  })

  it('não deixa reservar mais do que está livre', async () => {
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 3 }),
    )
    const r = await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 2 }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/livre/i)
  })

  it('duas ordens não levam a mesma última peça', async () => {
    // O cenário que gera estoque negativo em sistema sem bloqueio de linha:
    // as duas leem saldo 1, as duas acham que dá.
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 3, ordemId }),
    )
    const [a, b] = await Promise.all([
      comEscopo(ctx, (tx) =>
        movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 1, ordemId }),
      ),
      comEscopo(ctx, (tx) =>
        movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 1, ordemId: ordem2Id }),
      ),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)

    const p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    expect(Number(p!.saldoReservado)).toBe(4)
    expect(Number(p!.saldo)).toBeGreaterThanOrEqual(Number(p!.saldoReservado))
  })

  it('saída consome a própria reserva, sem descontar duas vezes', async () => {
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 2, ordemId }),
    )
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.SAIDA, quantidade: 2, ordemId }),
    )
    const p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    expect(Number(p!.saldo)).toBe(2)
    expect(Number(p!.saldoReservado)).toBe(0)
  })

  it('o saldo nunca fica negativo', async () => {
    const r = await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.SAIDA, quantidade: 99 }),
    )
    expect(r.ok).toBe(false)
  })

  it('cada movimento guarda o saldo antes e depois', async () => {
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.SAIDA, quantidade: 1, motivo: 'teste' }),
    )
    const m = await comEscopo(ctx, (tx) =>
      tx.movimentoEstoque.findFirst({ where: { pecaId }, orderBy: { criadoEm: 'desc' } }),
    )
    // É o que permite auditar sem recalcular a série inteira.
    expect(Number(m!.saldoAnterior)).toBe(4)
    expect(Number(m!.saldoPosterior)).toBe(3)
    expect(m!.autorNome).toBe('Teste')
  })

  it('lista o que está abaixo do mínimo', async () => {
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.SAIDA, quantidade: 3 }),
    )
    const lista = await abaixoDoMinimo(ctx)
    expect(lista.map((p) => p.sku)).toContain('FT-24V10')
  })

  it('a reserva nasce da aprovação e some com a recusa', async () => {
    const orcId = await comEscopo(ctx, async (tx) => {
      const o = await tx.orcamento.create({
        data: { tenantId, ordemId, numero: 10, status: 'APROVADO', totalCentavos: 68000 },
      })
      await tx.orcamentoItem.create({
        data: {
          tenantId,
          orcamentoId: o.id,
          tipo: 'PECA',
          pecaId,
          descricao: 'Fonte',
          quantidade: new Prisma.Decimal(2),
          valorUnitCentavos: 68000,
          valorTotalCentavos: 136000,
        },
      })
      return o.id
    })

    const res = await reservarDoOrcamento(ctx, AUTOR, orcId)
    expect(res.ok).toBe(true)
    let p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    expect(Number(p!.saldoReservado)).toBe(2)

    const lib = await liberarReservas(ctx, AUTOR, ordemId)
    expect(lib).toBe(1)
    p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    expect(Number(p!.saldoReservado)).toBe(0)
    // A peça voltou para a prateleira: o saldo físico nunca foi tocado.
    expect(Number(p!.saldo)).toBe(4)
  })

  it('o consumo na execução tira a peça da prateleira', async () => {
    await comEscopo(ctx, (tx) =>
      movimentar(tx, tenantId, AUTOR, { pecaId, tipo: TM.RESERVA, quantidade: 2, ordemId }),
    )
    const r = await consumirNaExecucao(ctx, AUTOR, ordemId)
    expect(r.ok).toBe(true)
    const p = await comEscopo(ctx, (tx) => tx.peca.findUnique({ where: { id: pecaId } }))
    expect(Number(p!.saldo)).toBe(2)
    expect(Number(p!.saldoReservado)).toBe(0)
  })
})

describe('financeiro: pagamento fracionado', () => {
  async function novaFatura(total = 184000) {
    return comEscopo(ctx, async (tx) => {
      const f = await tx.fatura.create({
        data: {
          tenantId,
          ordemId,
          clienteId,
          numero: await proximoNumero(tx, tenantId, 'fatura'),
          valorTotalCentavos: total,
        },
      })
      return f.id
    })
  }

  it('recebe em três formas até quitar', async () => {
    const id = await novaFatura()
    let r = await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'PIX', valorCentavos: 80000 }],
    })
    expect(r.ok && r.quitada).toBe(false)

    r = await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'DINHEIRO', valorCentavos: 40000 }],
    })
    expect(r.ok && r.abertoCentavos).toBe(64000)

    r = await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'CARTAO_CREDITO', valorCentavos: 64000, parcelas: 2 }],
    })
    expect(r.ok && r.quitada).toBe(true)

    const f = await comEscopo(ctx, (tx) => tx.fatura.findUnique({ where: { id } }))
    expect(f!.status).toBe('QUITADA')
    expect(f!.valorPagoCentavos).toBe(184000)
  })

  it('dois operadores ao mesmo tempo não fazem pagamento sumir', async () => {
    // O bug clássico: os dois leem "pago = 0", cada um soma o seu, e o último
    // a gravar apaga o do outro. Aqui a leitura acontece dentro da transação,
    // com a linha bloqueada.
    const id = await novaFatura(100000)
    await Promise.all([
      darBaixa(ctx, { id: null, nome: 'Op1' }, {
        faturaId: id,
        pagamentos: [{ forma: 'PIX', valorCentavos: 30000 }],
      }),
      darBaixa(ctx, { id: null, nome: 'Op2' }, {
        faturaId: id,
        pagamentos: [{ forma: 'DINHEIRO', valorCentavos: 20000 }],
      }),
    ])
    const f = await comEscopo(ctx, (tx) => tx.fatura.findUnique({ where: { id } }))
    expect(f!.valorPagoCentavos).toBe(50000)
  })

  it('multa e juros ficam em coluna própria e somam ao devido', async () => {
    const id = await novaFatura(100000)
    const r = await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'PIX', valorCentavos: 100000 }],
      multaCentavos: 2000,
      jurosCentavos: 500,
      taxaCentavos: 3000,
    })
    expect(r.ok && r.quitada).toBe(false)
    const f = await comEscopo(ctx, (tx) => tx.fatura.findUnique({ where: { id } }))
    expect(f!.multaCentavos).toBe(2000)
    expect(f!.taxaCentavos).toBe(3000)
    // Recebido líquido = pago - taxa. Sem a taxa separada, não fecha com o
    // extrato da maquininha.
    expect(f!.valorPagoCentavos - f!.taxaCentavos).toBe(97000)
  })

  it('recusa valor zero ou negativo', async () => {
    const id = await novaFatura()
    const r = await darBaixa(ctx, { id: null, nome: 'x' }, {
      faturaId: id,
      pagamentos: [{ forma: 'PIX', valorCentavos: 0 }],
    })
    expect(r.ok).toBe(false)
  })
})

describe('conferência é uma segunda camada, separada de "pago"', () => {
  it('não confere fatura que ainda não foi quitada', async () => {
    const id = await comEscopo(ctx, async (tx) => {
      const f = await tx.fatura.create({
        data: { tenantId, ordemId, clienteId, numero: 900, valorTotalCentavos: 5000 },
      })
      return f.id
    })
    const r = await conferir(ctx, { id: 'u1', nome: 'Camila' }, id)
    expect(r.ok).toBe(false)
  })

  it('confere depois de quitada e guarda quem conferiu', async () => {
    const id = await comEscopo(ctx, async (tx) => {
      const f = await tx.fatura.create({
        data: { tenantId, ordemId, clienteId, numero: 901, valorTotalCentavos: 5000 },
      })
      return f.id
    })
    await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'PIX', valorCentavos: 5000 }],
    })
    const r = await conferir(ctx, { id: 'u1', nome: 'Camila Rocha' }, id)
    expect(r.ok).toBe(true)

    const f = await comEscopo(ctx, (tx) => tx.fatura.findUnique({ where: { id } }))
    expect(f!.conferido).toBe(true)
    expect(f!.conferidoPorNome).toBe('Camila Rocha')
  })

  it('o estorno derruba a conferência e mantém a linha do pagamento', async () => {
    const id = await comEscopo(ctx, async (tx) => {
      const f = await tx.fatura.create({
        data: { tenantId, ordemId, clienteId, numero: 902, valorTotalCentavos: 5000 },
      })
      return f.id
    })
    await darBaixa(ctx, { id: null, nome: 'Fábio' }, {
      faturaId: id,
      pagamentos: [{ forma: 'PIX', valorCentavos: 5000 }],
    })
    await conferir(ctx, { id: 'u1', nome: 'Camila' }, id)

    const pag = await comEscopo(ctx, (tx) => tx.pagamento.findFirst({ where: { faturaId: id } }))
    const r = await estornar(ctx, pag!.id, 'Pix não caiu')
    expect(r.ok).toBe(true)

    const f = await comEscopo(ctx, (tx) => tx.fatura.findUnique({ where: { id } }))
    expect(f!.valorPagoCentavos).toBe(0)
    expect(f!.status).toBe('ABERTA')
    // O gestor precisa olhar de novo: o que ele validou mudou.
    expect(f!.conferido).toBe(false)

    // A linha continua lá, marcada — apagar faria o caixa fechar sem explicar.
    const ainda = await comEscopo(ctx, (tx) => tx.pagamento.findUnique({ where: { id: pag!.id } }))
    expect(ainda).toBeTruthy()
    expect(ainda!.estornadoEm).toBeTruthy()
    expect(ainda!.motivoEstorno).toBe('Pix não caiu')
  })
})

describe('numeração por empresa', () => {
  it('é sequencial e não repete sob concorrência', async () => {
    const nums = await Promise.all(
      Array.from({ length: 20 }, () =>
        comEscopo(ctx, (tx) => proximoNumero(tx, tenantId, 'orcamento')),
      ),
    )
    expect(new Set(nums).size).toBe(20)
  })
})

describe('documento em PDF', () => {
  it('gera o arquivo, registra o hash e o tamanho', async () => {
    await comEscopo(ctx, async (tx) => {
      await tx.orcamento.create({
        data: {
          tenantId,
          ordemId: ordem2Id,
          numero: 77,
          status: 'APROVADO',
          totalCentavos: 184000,
          subtotalPecas: 77000,
          subtotalServicos: 107000,
          garantiaDias: 90,
          prazoExecucaoDias: 5,
        },
      })
    })
    const r = await gerarPdfDaOrdem({ ordemId: ordem2Id, documento: 'ORCAMENTO' }, tenantId)
    expect(r.bytes).toBeGreaterThan(1000)
    expect(r.hash).toHaveLength(64)

    const d = await comEscopo(ctx, (tx) =>
      tx.documento.findFirst({ where: { ordemId: ordem2Id, tipo: 'ORCAMENTO' } }),
    )
    // O hash guardado é o que denuncia PDF trocado depois.
    expect(d?.hash).toBe(r.hash)
    expect(d?.tokenAcesso).toBeTruthy()
  })
})
