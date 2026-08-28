import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import type { TipoDocumento } from '@/generated/prisma/enums'
import { hashArquivo, novoToken } from '@/lib/cripto'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { reaisPorExtenso } from '@/lib/extenso'
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
  COMPROVANTE_RETIRADA: 'COMPROVANTE DE RETIRADA',
  LAUDO_TECNICO: 'LAUDO TÉCNICO',
  ORCAMENTO: 'ORÇAMENTO DE SERVIÇO',
  CONTRATO_MANUTENCAO: 'CONTRATO DE MANUTENÇÃO',
  ORDEM_SERVICO: 'ORDEM DE SERVIÇO',
  RECIBO_PAGAMENTO: 'RECIBO DE PAGAMENTO',
  COMPROVANTE_ENTREGA: 'COMPROVANTE DE ENTREGA',
  CONTRATO_PRESTACAO: 'CONTRATO DE PRESTAÇÃO DE SERVIÇO',
  NOTA_PROMISSORIA: 'NOTA PROMISSÓRIA',
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

  /* =========================================================================
     CONTRATO DE PRESTAÇÃO DE SERVIÇO
     =========================================================================
     Diferente do CONTRATO_MANUTENCAO, que é o contrato daquele CONSERTO e
     carrega as cláusulas de garantia. Este é o instrumento formal: qualifica as
     duas partes com documento e endereço, define prazo de pagamento e foro, e é
     o que o departamento de compras de um hospital arquiva antes de liberar a
     nota.
     ========================================================================= */
  if (pedido.documento === 'CONTRATO_PRESTACAO') {
    const valor = dados.fatura?.valorTotalCentavos ?? orc?.totalCentavos ?? 0

    rotulo(doc, 'AS PARTES')
    doc.fillColor(TINTA).fontSize(8.5).font('Helvetica').text(
      `CONTRATADA: ${dados.tenant.razaoSocial ?? dados.tenant.nome}, inscrita no CNPJ sob o nº ` +
        `${dados.tenant.cnpj ? formatarDoc(dados.tenant.cnpj) : '—'}, com sede em ` +
        `${[dados.tenant.logradouro, dados.tenant.numero].filter(Boolean).join(', ') || '—'}, ` +
        `${[dados.tenant.cidade, dados.tenant.uf].filter(Boolean).join('/') || '—'}.`,
      { align: 'justify', lineGap: 1.5 },
    )
    doc.moveDown(0.5)
    doc.text(
      `CONTRATANTE: ${dados.cliente.razaoSocial ?? dados.cliente.nome}, inscrito no ` +
        `${dados.cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF'} sob o nº ${formatarDoc(dados.cliente.documento)}, ` +
        `com endereço em ${[dados.cliente.logradouro, dados.cliente.numero].filter(Boolean).join(', ') || '—'}, ` +
        `${[dados.cliente.cidade, dados.cliente.uf].filter(Boolean).join('/') || '—'}.`,
      { align: 'justify', lineGap: 1.5 },
    )

    doc.moveDown(1)
    rotulo(doc, 'OBJETO')
    doc.fillColor(TINTA).fontSize(8.5).font('Helvetica').text(
      `Prestação de serviço técnico especializado no equipamento ${dados.equipamento.marca} ` +
        `${dados.equipamento.modelo}${dados.equipamento.numeroSerie ? `, série ${dados.equipamento.numeroSerie}` : ''}, ` +
        `conforme a ordem de serviço nº ${String(dados.numero).padStart(5, '0')} e o orçamento aprovado pelo ` +
        `CONTRATANTE, no valor de ${formatarBRL(valor)} (${reaisPorExtenso(valor)}).`,
      { align: 'justify', lineGap: 1.5 },
    )

    doc.moveDown(1)
    rotulo(doc, 'CLÁUSULAS')
    doc.fillColor(TINTA).fontSize(8).font('Helvetica').text(
      `1. PRAZO. A CONTRATADA executará o serviço em até ${orc?.prazoExecucaoDias ?? 7} dias úteis, ` +
        `contados da aprovação do orçamento, salvo atraso de fornecedor de peça, comunicado ao CONTRATANTE.\n\n` +
        `2. PAGAMENTO. O valor é devido na entrega do equipamento, salvo condição diversa combinada por escrito ` +
        `entre as partes e registrada na ordem de serviço.\n\n` +
        `3. GARANTIA. A CONTRATADA garante o serviço executado e as peças aplicadas por ` +
        `${orc?.garantiaDias ?? 90} dias, contados da entrega. A garantia não cobre mau uso, oscilação da rede ` +
        `elétrica, intervenção de terceiros nem desgaste natural.\n\n` +
        `4. SERVIÇO ADICIONAL. Serviço não previsto, identificado durante a execução, será submetido a nova ` +
        `aprovação do CONTRATANTE antes de ser realizado — nada é executado sem autorização.\n\n` +
        `5. GUARDA DO EQUIPAMENTO. A CONTRATADA responde pelo equipamento enquanto ele estiver sob sua guarda, ` +
        `documentada por fotografia na retirada e na entrega.\n\n` +
        `6. FORO. Fica eleito o foro da comarca de ${dados.tenant.cidade ?? 'Lajeado'}/${dados.tenant.uf ?? 'RS'} ` +
        `para dirimir dúvidas oriundas deste contrato.`,
      { align: 'justify', lineGap: 2 },
    )
  }

  /* =========================================================================
     NOTA PROMISSÓRIA
     =========================================================================
     Um TÍTULO, e não um comprovante. O recibo prova o que já foi pago; esta é
     promessa do que será — e o que a torna título é o valor POR EXTENSO sobre a
     assinatura de quem emite.
     ========================================================================= */
  if (pedido.documento === 'NOTA_PROMISSORIA') {
    const valor =
      dados.fatura
        ? dados.fatura.valorTotalCentavos +
          dados.fatura.multaCentavos +
          dados.fatura.jurosCentavos -
          dados.fatura.valorPagoCentavos
        : (orc?.totalCentavos ?? 0)
    const vence = dados.fatura?.vencimento ?? null

    doc.moveDown(0.5)
    // O VALOR EM ALGARISMO, grande e no alto, como manda o formato do título.
    doc
      .fillColor(VIO)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(formatarBRL(valor), { align: 'right' })
    doc.moveDown(0.8)

    doc.fillColor(TINTA).fontSize(9.5).font('Helvetica').text(
      `Aos ${vence ? vence.toLocaleDateString('pt-BR') : '____/____/______'}, pagarei por esta única via de ` +
        `NOTA PROMISSÓRIA a ${dados.tenant.razaoSocial ?? dados.tenant.nome}, ` +
        `CNPJ ${dados.tenant.cnpj ? formatarDoc(dados.tenant.cnpj) : '—'}, ou à sua ordem, ` +
        `a quantia de ${reaisPorExtenso(valor)}, em moeda corrente deste país.`,
      { align: 'justify', lineGap: 3 },
    )

    doc.moveDown(0.9)
    /**
     * O EXTENSO REPETIDO, em destaque.
     *
     * Não é redundância: quando o algarismo e o extenso discordam, é o extenso
     * que prevalece — a regra existe porque o algarismo é o que se altera com
     * um traço de caneta. Deixá-lo escondido no meio do parágrafo enfraquece
     * justamente a parte que defende o valor.
     */
    doc.fillColor(VIO).fontSize(10).font('Helvetica-Bold')
    doc.text(reaisPorExtenso(valor).toUpperCase(), { align: 'center' })
    doc.moveDown(0.8)

    doc.fillColor(TINTA).fontSize(8.5).font('Helvetica').text(
      `Emitente: ${dados.cliente.razaoSocial ?? dados.cliente.nome} · ` +
        `${dados.cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF'} ${formatarDoc(dados.cliente.documento)}\n` +
        `Endereço: ${[dados.cliente.logradouro, dados.cliente.numero].filter(Boolean).join(', ') || '—'}, ` +
        `${[dados.cliente.cidade, dados.cliente.uf].filter(Boolean).join('/') || '—'}\n` +
        `Referente à ordem de serviço nº ${String(dados.numero).padStart(5, '0')}`,
      { lineGap: 2 },
    )

    doc.moveDown(1.4)
    // A linha de assinatura do EMITENTE. Sem ela a nota não é nada: título de
    // crédito sem assinatura de quem promete pagar não obriga ninguém.
    doc.moveTo(48, doc.y + 26).lineTo(320, doc.y + 26).strokeColor('#CFCBD9').lineWidth(1).stroke()
    doc.y += 30
    doc.fillColor(CINZA).fontSize(8).font('Helvetica').text('Assinatura do emitente')
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
    doc.moveDown(0.4)

    /**
     * O TRAÇO que o cliente desenhou, e não só o nome dele.
     *
     * O documento trazia uma linha decorativa, o nome, o CPF mascarado, a hora
     * e o IP — tudo menos a assinatura. Quem abrisse o contrato via um risco
     * vazio sobre um nome digitado. O PNG já estava gravado e com hash desde a
     * primeira versão; faltava colocá-lo na folha.
     *
     * Dentro de `try`: um arquivo que sumiu do disco não pode impedir a emissão
     * do contrato. Sem a imagem ele continua válido — nome, documento
     * conferido, horário e IP seguem lá.
     */
    if (assin.caminhoImagem) {
      try {
        doc.image(path.join(RAIZ(), assin.caminhoImagem), 48, doc.y, { fit: [190, 62] })
        doc.y += 64
      } catch {
        doc.moveDown(1.2)
      }
    } else {
      doc.moveDown(1.2)
    }

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
  /**
   * O rodapé, sem inventar uma página em branco no fim.
   *
   * Escrever em y=792 com margem inferior de 48 numa folha A4 (842pt de altura)
   * ultrapassa a área útil, e o PDFKit responde criando uma página nova para
   * caber o que não coube. O contrato saía com duas páginas e a segunda tinha
   * só o rodapé — que é exatamente o texto que causou a página.
   *
   * Zerar a margem inferior enquanto se escreve o rodapé desliga a quebra
   * automática. Ela é restaurada em seguida, porque a margem vale para o resto.
   */
  const faixa = doc.bufferedPageRange()
  for (let i = 0; i < faixa.count; i++) {
    doc.switchToPage(faixa.start + i)
    const margemDeBaixo = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.fillColor(CINZA).fontSize(6.5).font('Courier')
    doc.text(
      `Documento gerado por ${dados.tenant.nome}  ·  Ordem ${dados.numero}  ·  ` +
        `Acompanhe em ${env.APP_URL}/os/${dados.tokenPublico}  ·  página ${i + 1} de ${faixa.count}`,
      48,
      doc.page.height - 32,
      { width: 499, align: 'center', lineBreak: false },
    )
    doc.page.margins.bottom = margemDeBaixo
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
