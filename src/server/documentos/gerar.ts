import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import type { TipoDocumento } from '@/generated/prisma/enums'
import { hashArquivo, novoToken } from '@/lib/cripto'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { env } from '@/lib/env'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * Geração dos documentos em PDF.
 *
 * O que sai daqui vai para o WhatsApp do cliente e, no caso do contrato, tem
 * valor jurídico. Duas consequências práticas:
 *
 *  • Todo arquivo gerado é registrado com o SHA-256 do conteúdo. Se o PDF que
 *    o cliente apresentar não bater com o hash guardado, ele foi trocado.
 *  • O cabeçalho traz razão social, CNPJ e endereço da franquia — cada empresa
 *    emite em nome dela, o que é o que a operação de franquia exige.
 */

type PedidoPdf = { ordemId: string; documento: TipoDocumento; eventoId?: string }

const RAIZ = () => path.resolve(env.STORAGE_LOCAL_PATH)

const TITULO: Record<string, string> = {
  ORDEM_RETIRADA: 'ORDEM DE RETIRADA',
  LAUDO_TECNICO: 'LAUDO TÉCNICO',
  ORCAMENTO: 'ORÇAMENTO DE SERVIÇO',
  CONTRATO_MANUTENCAO: 'CONTRATO DE MANUTENÇÃO',
  ORDEM_SERVICO: 'ORDEM DE SERVIÇO',
  RECIBO_PAGAMENTO: 'RECIBO DE PAGAMENTO',
  COMPROVANTE_ENTREGA: 'COMPROVANTE DE ENTREGA',
}

export async function gerarPdfDaOrdem(pedido: PedidoPdf, tenantId: string) {
  const ctx = { tenantId, userId: null, ehSuperAdmin: false }

  const dados = await comEscopo(ctx, async (tx) => {
    const o = await tx.ordem.findUnique({
      where: { id: pedido.ordemId },
      include: {
        tenant: true,
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        eventos: { orderBy: { sequencia: 'asc' } },
        assinaturas: true,
        orcamentos: {
          orderBy: { versao: 'desc' },
          take: 1,
          include: { itens: { orderBy: { ordem: 'asc' } } },
        },
        fatura: { include: { pagamentos: { where: { estornadoEm: null } } } },
      },
    })
    return o
  })
  if (!dados) throw new Error('Ordem não encontrada para gerar o documento.')

  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true })
  const pedacos: Buffer[] = []
  doc.on('data', (c: Buffer) => pedacos.push(c))
  const pronto = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(pedacos))))

  const VIO = '#4A0D8F'
  const TINTA = '#14071F'
  const CINZA = '#6C6079'

  // ---- cabeçalho ----------------------------------------------------------
  doc.fillColor(VIO).fontSize(20).font('Helvetica-Bold').text(dados.tenant.nome, { continued: false })
  doc.moveDown(0.15)
  doc.fillColor(CINZA).fontSize(8).font('Helvetica')
  const linhaEmpresa = [
    dados.tenant.razaoSocial,
    dados.tenant.cnpj && `CNPJ ${dados.tenant.cnpj}`,
    [dados.tenant.logradouro, dados.tenant.numero].filter(Boolean).join(', '),
    [dados.tenant.cidade, dados.tenant.uf].filter(Boolean).join('/'),
    dados.tenant.telefone,
  ]
    .filter(Boolean)
    .join('  ·  ')
  if (linhaEmpresa) doc.text(linhaEmpresa)

  doc.moveDown(0.8)
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(VIO).lineWidth(2).stroke()
  doc.moveDown(0.9)

  doc
    .fillColor(TINTA)
    .fontSize(15)
    .font('Helvetica-Bold')
    .text(TITULO[pedido.documento] ?? 'DOCUMENTO')
  doc
    .fillColor(CINZA)
    .fontSize(9)
    .font('Courier')
    .text(
      `Nº ${String(dados.numero).padStart(5, '0')}   ·   emitido em ${agora()}   ·   etapa: ${ROTULO_ETAPA[dados.etapa]}`,
    )
  doc.moveDown(1)

  // ---- cliente e equipamento ---------------------------------------------
  bloco(doc, 'CLIENTE', [
    ['Nome', dados.cliente.nome],
    ['Documento', formatarDoc(dados.cliente.documento)],
    ['Contato', dados.cliente.contatoNome ?? '—'],
    ['Telefone', dados.cliente.telefone ?? dados.cliente.whatsapp ?? '—'],
    [
      'Endereço',
      [dados.cliente.logradouro, dados.cliente.numero, dados.cliente.bairro, dados.cliente.cidade]
        .filter(Boolean)
        .join(', ') || '—',
    ],
  ])

  bloco(doc, 'EQUIPAMENTO', [
    ['Marca / modelo', `${dados.equipamento.marca} ${dados.equipamento.modelo}`],
    ['Nº de série', dados.equipamento.numeroSerie ?? '—'],
    ['Categoria', dados.equipamento.categoria ?? '—'],
    ['Voltagem', dados.equipamento.voltagem ?? '—'],
    ['Acessórios', dados.equipamento.acessorios ?? '—'],
    ['Defeito relatado', dados.defeitoRelatado],
  ])

  // ---- corpo específico ---------------------------------------------------
  const orc = dados.orcamentos[0]

  if ((pedido.documento === 'ORCAMENTO' || pedido.documento === 'CONTRATO_MANUTENCAO') && orc) {
    doc.moveDown(0.4)
    rotulo(doc, 'ITENS')
    const larguras = [246, 48, 88, 88]
    linhaTabela(doc, ['Descrição', 'Qtd', 'Unitário', 'Total'], larguras, true)
    for (const i of orc.itens) {
      linhaTabela(
        doc,
        [
          i.descricao,
          String(Number(i.quantidade)),
          formatarBRL(i.valorUnitCentavos),
          formatarBRL(i.valorTotalCentavos),
        ],
        larguras,
      )
    }
    doc.moveDown(0.5)
    doc
      .fillColor(TINTA)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(`TOTAL: ${formatarBRL(orc.totalCentavos)}`, { align: 'right' })
    doc.moveDown(0.3)
    doc
      .fillColor(CINZA)
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Prazo de execução: ${orc.prazoExecucaoDias} dias úteis  ·  Garantia: ${orc.garantiaDias} dias  ·  ` +
          `Validade da proposta: ${orc.validoAte ? orc.validoAte.toLocaleDateString('pt-BR') : '15 dias'}`,
        { align: 'right' },
      )

    if (pedido.documento === 'CONTRATO_MANUTENCAO') {
      doc.moveDown(1)
      rotulo(doc, 'CONDIÇÕES')
      doc.fillColor(TINTA).fontSize(8).font('Helvetica').text(
        `Ao aprovar este orçamento, o CONTRATANTE autoriza a execução dos serviços e a aplicação das peças ` +
          `descritas acima, pelo valor total de ${formatarBRL(orc.totalCentavos)}. A CONTRATADA garante o serviço ` +
          `executado e as peças aplicadas pelo prazo de ${orc.garantiaDias} dias, contados da entrega do equipamento. ` +
          `A garantia não cobre mau uso, oscilação da rede elétrica, intervenção de terceiros nem desgaste natural. ` +
          `Serviço adicional identificado durante a execução será submetido a nova aprovação antes de ser realizado. ` +
          `O equipamento será devolvido ao endereço indicado no cadastro, mediante assinatura de recebimento.`,
        { align: 'justify', lineGap: 1.5 },
      )
    }
  }

  if (pedido.documento === 'LAUDO_TECNICO') {
    bloco(doc, 'DIAGNÓSTICO', [
      ['Técnico', dados.tecnico?.nome ?? '—'],
      ['Constatação', dados.diagnostico ?? '—'],
      ['Parecer', dados.parecerTecnico ?? '—'],
    ])
  }

  if (pedido.documento === 'RECIBO_PAGAMENTO' && dados.fatura) {
    rotulo(doc, 'RECEBIMENTOS')
    const larguras = [200, 130, 140]
    linhaTabela(doc, ['Forma', 'Data', 'Valor'], larguras, true)
    for (const p of dados.fatura.pagamentos) {
      linhaTabela(
        doc,
        [
          p.forma.replace(/_/g, ' '),
          p.recebidoEm.toLocaleDateString('pt-BR'),
          formatarBRL(p.valorCentavos),
        ],
        larguras,
      )
    }
    doc.moveDown(0.5)
    doc
      .fillColor(TINTA)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`RECEBIDO: ${formatarBRL(dados.fatura.valorPagoCentavos)}`, { align: 'right' })
  }

  // ---- assinaturas --------------------------------------------------------
  const tipoAssin =
    pedido.documento === 'COMPROVANTE_ENTREGA'
      ? 'ENTREGA'
      : pedido.documento === 'CONTRATO_MANUTENCAO'
        ? 'APROVACAO_ORCAMENTO'
        : 'RETIRADA'
  const assin = dados.assinaturas.find((a) => a.tipo === tipoAssin)

  if (assin) {
    doc.moveDown(1.4)
    rotulo(doc, 'ASSINATURA')
    doc.moveDown(1.6)
    doc.moveTo(48, doc.y).lineTo(300, doc.y).strokeColor('#CFCBD9').lineWidth(1).stroke()
    doc.moveDown(0.3)
    doc.fillColor(TINTA).fontSize(9).font('Helvetica-Bold').text(assin.assinanteNome)
    doc.fillColor(CINZA).fontSize(7.5).font('Courier')
    doc.text(
      [
        assin.assinanteDocumento && `Doc. ${mascararDoc(assin.assinanteDocumento)}`,
        assin.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        assin.latitude != null &&
          `Local ${assin.latitude.toFixed(4)}, ${assin.longitude?.toFixed(4)}` +
            (assin.precisaoM ? ` (±${Math.round(assin.precisaoM)}m)` : ''),
        assin.ip && `IP ${assin.ip}`,
      ]
        .filter(Boolean)
        .join('   ·   '),
    )
  }

  // ---- rodapé de verificação ---------------------------------------------
  const faixa = doc.bufferedPageRange()
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i)
    doc.fillColor(CINZA).fontSize(6.5).font('Courier')
    doc.text(
      `Documento gerado por ${dados.tenant.nome}  ·  Ordem ${dados.numero}  ·  ` +
        `Acompanhe em ${env.APP_URL}/os/${dados.tokenPublico}  ·  página ${i + 1} de ${faixa.count}`,
      48,
      792,
      { width: 499, align: 'center' },
    )
  }

  doc.end()
  const buffer = await pronto

  // ---- grava e registra ---------------------------------------------------
  const hash = hashArquivo(buffer)
  const relativo = path.join(tenantId, dados.id, `${pedido.documento}-${hash.slice(0, 12)}.pdf`)
  const destino = path.join(RAIZ(), relativo)
  await mkdir(path.dirname(destino), { recursive: true })
  await writeFile(destino, buffer)

  await comEscopo(ctx, async (tx) => {
    await tx.documento.create({
      data: {
        tenantId,
        ordemId: dados.id,
        tipo: pedido.documento,
        numero: `${pedido.documento}-${String(dados.numero).padStart(5, '0')}`,
        caminho: relativo,
        hash,
        tamanhoBytes: buffer.length,
        // 256 bits de randomBytes. O link vai para o WhatsApp do cliente e o
        // token é a única credencial — não pode ser derivado do relógio.
        tokenAcesso: novoToken(),
      },
    })
  })

  return { caminho: relativo, hash, bytes: buffer.length }
}

// ---------------------------------------------------------------------------

type Doc = InstanceType<typeof PDFDocument>

function rotulo(doc: Doc, texto: string) {
  doc.fillColor('#4A0D8F').fontSize(8).font('Helvetica-Bold').text(texto)
  doc.moveDown(0.25)
}

function bloco(doc: Doc, titulo: string, linhas: Array<[string, string]>) {
  rotulo(doc, titulo)
  for (const [k, v] of linhas) {
    doc.fillColor('#6C6079').fontSize(8).font('Helvetica').text(`${k}: `, { continued: true })
    doc.fillColor('#14071F').font('Helvetica-Bold').text(v || '—')
  }
  doc.moveDown(0.7)
}

function linhaTabela(doc: Doc, celulas: string[], larguras: number[], cabecalho = false) {
  const y = doc.y
  let x = 48
  doc
    .fontSize(cabecalho ? 7.5 : 8)
    .font(cabecalho ? 'Helvetica-Bold' : 'Helvetica')
    .fillColor(cabecalho ? '#6C6079' : '#14071F')
  celulas.forEach((c, i) => {
    doc.text(c, x, y, {
      width: larguras[i]! - 8,
      align: i === 0 ? 'left' : 'right',
      lineBreak: false,
      ellipsis: true,
    })
    x += larguras[i]!
  })
  doc.y = y + (cabecalho ? 14 : 13)
  if (cabecalho) {
    doc.moveTo(48, doc.y - 4).lineTo(547, doc.y - 4).strokeColor('#E4E1EC').lineWidth(0.5).stroke()
  }
}

const agora = () =>
  new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

function formatarDoc(d: string) {
  const n = d.replace(/\D/g, '')
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d
}

/** No documento assinado, só os últimos dígitos — o resto é dado pessoal. */
function mascararDoc(d: string) {
  const n = d.replace(/\D/g, '')
  return n.length > 4 ? `•••${n.slice(-4)}` : n
}
