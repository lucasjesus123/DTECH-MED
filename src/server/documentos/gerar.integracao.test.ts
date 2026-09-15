import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TipoDocumento } from '@/generated/prisma/enums'
import { hashDocumento, novoToken } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { gerarPdfDaOrdem } from './gerar'

/**
 * RECARREGAR A PÁGINA NÃO É EMITIR UM DOCUMENTO.
 *
 * =============================================================================
 * O QUE ESTE ARQUIVO GUARDA
 * =============================================================================
 * `/painel/ordens/[id]/os.pdf` gera o PDF a cada pedido, de propósito: a O.S.
 * muda enquanto a ordem anda, e quem clica quer a de agora. Cada emissão virava
 * uma linha em `documentos` — inclusive quando nada tinha mudado.
 *
 * Medido antes do conserto: três buscas seguidas do mesmo endereço, três
 * documentos, três hashes diferentes. Os hashes diferiam por catorze dígitos
 * invisíveis — o `CreationDate` que o PDFKit carimbava com `new Date()`.
 *
 * Isso vaza para dois lugares que não podem mentir: a página do CLIENTE, que
 * lista o mesmo documento quatro vezes com a mesma data, e a FOLHA DE
 * RASTREABILIDADE, que conta quantas provas existem e de que dia são — ela
 * responde ao cliente, ao fabricante e à vigilância sanitária.
 *
 * As duas metades precisam de teste, e a segunda é a que importa mais: um
 * "conserto" que passasse a reaproveitar SEMPRE apagaria o histórico de
 * verdade, que é o que a emissão de terça e a de quinta contam.
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
const SLUG = 'teste-emissao-de-documento'

let tenantId: string
let ordemId: string

async function apagarEmpresa() {
  await comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } })
    if (t) await tx.tenant.delete({ where: { id: t.id } })
  })
}

const contar = () =>
  comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, (tx) =>
    tx.documento.findMany({
      where: { ordemId, tipo: TipoDocumento.ORDEM_SERVICO },
      orderBy: { geradoEm: 'asc' },
      select: { id: true, hash: true, tokenAcesso: true },
    }),
  )

beforeAll(async () => {
  await apagarEmpresa()

  const montado = await comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.create({
      data: { slug: SLUG, nome: 'Empresa de teste da emissão', cidade: 'Lajeado', uf: 'RS' },
    })

    const doc = '77666555000144'
    const cliente = await tx.cliente.create({
      data: {
        tenantId: t.id,
        nome: 'Clínica do Teste',
        documento: doc,
        documentoHash: hashDocumento(doc),
        logradouro: 'Av. Benjamin Constant, 1180',
        cidade: 'Lajeado',
        uf: 'RS',
      },
      select: { id: true },
    })

    const equipamento = await tx.equipamento.create({
      data: {
        tenantId: t.id,
        clienteId: cliente.id,
        marca: 'Lavieen',
        modelo: 'Duo',
        numeroSerie: 'LA-TESTE',
      },
      select: { id: true },
    })

    await tx.contador.create({ data: { tenantId: t.id, chave: 'ordem', valor: 1 } })
    const o = await tx.ordem.create({
      data: {
        tenantId: t.id,
        numero: 1,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        defeitoRelatado: 'Liga mas a ponteira não dispara.',
        tokenPublico: novoToken(),
      },
      select: { id: true },
    })

    return { tenantId: t.id, ordemId: o.id }
  })

  tenantId = montado.tenantId
  ordemId = montado.ordemId
})

afterAll(async () => {
  await apagarEmpresa()
  await prisma.$disconnect()
})

describe('gerarPdfDaOrdem · uma emissão por conteúdo', () => {
  it('três pedidos sem nada mudar deixam UM documento', async () => {
    for (let i = 0; i < 3; i++) {
      await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)
    }

    const docs = await contar()
    expect(docs).toHaveLength(1)
  })

  it('devolve o MESMO token nos três — e não três credenciais para um arquivo', async () => {
    const a = await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)
    const b = await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)

    expect(a.hash).toBe(b.hash)
    expect(a.documentoId).toBe(b.documentoId)
    // Se cada emissão idêntica cunhasse um token, o link que o cliente tem no
    // WhatsApp deixaria de ser "o" link — passariam a existir vários vivos.
    expect(a.tokenAcesso).toBe(b.tokenAcesso)
  })

  it('o PDF é byte a byte o mesmo enquanto a ordem não muda', async () => {
    const a = await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)
    await new Promise((r) => setTimeout(r, 1100)) // atravessa a virada do segundo
    const b = await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)

    // Era aqui que quebrava: o `CreationDate` do PDFKit mudava com o relógio, e
    // um segundo de diferença bastava para o hash divergir.
    expect(a.hash).toBe(b.hash)
    expect(a.bytes).toBe(b.bytes)
  })

  it('MUDOU a ordem, nasce documento novo — o histórico continua sendo histórico', async () => {
    const antes = await contar()

    await comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, (tx) =>
      tx.ordem.update({
        where: { id: ordemId },
        data: { defeitoRelatado: 'Liga, a ponteira não dispara, e agora desliga sozinho.' },
      }),
    )

    await gerarPdfDaOrdem({ ordemId, documento: TipoDocumento.ORDEM_SERVICO }, tenantId)
    const depois = await contar()

    expect(depois.length).toBe(antes.length + 1)
    // Hashes distintos entre si: dois documentos, dois conteúdos, duas provas.
    expect(new Set(depois.map((d) => d.hash)).size).toBe(depois.length)
  })

  it('o documento antigo NÃO é apagado nem reescrito', async () => {
    const docs = await contar()
    expect(docs.length).toBeGreaterThanOrEqual(2)

    // O primeiro continua com o id e o token dele. Um "conserto" que
    // sobrescrevesse a linha antiga trocaria a prova de terça pela de quinta —
    // e o hash guardado deixaria de descrever o arquivo que o cliente recebeu.
    const primeiro = docs[0]!
    const ainda = await comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, (tx) =>
      tx.documento.findUnique({
        where: { id: primeiro.id },
        select: { hash: true, tokenAcesso: true },
      }),
    )
    expect(ainda?.hash).toBe(primeiro.hash)
    expect(ainda?.tokenAcesso).toBe(primeiro.tokenAcesso)
  })
})
