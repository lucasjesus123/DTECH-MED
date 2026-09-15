import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import type { TipoDocumento } from '@/generated/prisma/enums'
import { hashArquivo, novoToken } from '@/lib/cripto'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { formatarTelefone } from '@/lib/documentos'
import { renderizarModelo } from '@/lib/variaveis-documento'
import { valoresDaOrdem } from './valores'
import { reaisPorExtenso } from '@/lib/extenso'
import { env } from '@/lib/env'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { corpoDaOrdemDeServico } from './ordem-de-servico'

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

type PedidoPdf = {
  ordemId: string
  documento: TipoDocumento
  eventoId?: string
  /**
   * QUAL modelo escrever, quando não é o padrão.
   *
   * O disparo automático nomeia o molde: a empresa pode ter cinco ordens de
   * serviço e escolher que a do recebimento saia com uma e a da entrega com
   * outra. Sem isto, as cinco sairiam com o texto do padrão e a escolha da
   * etapa não significaria nada.
   */
  modeloId?: string
  /** Mandar ao cliente assim que o arquivo existir. Ver o worker. */
  enviarAoCliente?: boolean
}

const RAIZ = () => path.resolve(env.STORAGE_LOCAL_PATH)

/**
 * A COR IMPRESSA DA MARCA — #34005E, e não um roxo parecido.
 *
 * Vem do PDF oficial (CMYK 87/96/11/58), e está escrita no
 * `public/marca/LEIA-ME.md` com a advertência de não confundir com o violeta da
 * interface: aquele é cor de tela, este é o do cartão e o da van.
 */
const MARCA_IMPRESSA = '#34005E'

/** O arquivo vetorial da marca, o mesmo que o site usa no topo. */
const ARQUIVO_DA_MARCA = path.join(process.cwd(), 'public', 'marca', 'dtechmed.svg')

/**
 * A MARCA DA CASA, RASTERIZADA NA COR DO TIMBRE.
 *
 * O PDFKit desenha PNG e JPG; SVG não. E o arquivo da marca usa
 * `fill="currentColor"` de propósito — ele não tem cor própria, herda a de quem
 * o usa (ver o LEIA-ME). Então aqui a cor entra antes da rasterização, e a logo
 * sai exatamente na cor da régua e dos títulos do documento.
 *
 * O cache é POR COR, e não global: numa rede de franquias cada empresa pode ter
 * escolhido a sua, e um cache de uma posição só devolveria a logo da franquia
 * anterior para a seguinte. São alguns kilobytes por cor, contra uma
 * rasterização por documento emitido.
 *
 * `null` quando o arquivo não está lá. Quem chama trata isso como "sem logo" e
 * emite o documento com o nome, o CNPJ e o endereço — que é o que sempre houve.
 */
const cacheDaMarca = new Map<string, Buffer | null>()

async function logoDaCasa(cor: string): Promise<Buffer | null> {
  const guardado = cacheDaMarca.get(cor)
  if (guardado !== undefined) return guardado

  let png: Buffer | null = null
  try {
    const svg = await readFile(ARQUIVO_DA_MARCA, 'utf8')
    // 900px de largura para a logo impressa a 150pt não sair serrilhada: o PDF
    // é vetorial, mas a imagem dentro dele não — ela vai com os pixels que tiver.
    png = await sharp(Buffer.from(svg.replaceAll('currentColor', cor)))
      .resize({ width: 900 })
      .png()
      .toBuffer()
  } catch {
    png = null
  }

  cacheDaMarca.set(cor, png)
  return png
}

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
        // `marca` junto do tenant: é o papel timbrado, e ele é lido em TODO
        // documento. Uma segunda consulta por fora custaria uma ida ao banco
        // por PDF emitido para buscar um caminho de arquivo.
        tenant: { include: { marca: true } },
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        eventos: { orderBy: { sequencia: 'asc' } },
        assinaturas: true,
        /**
         * AS FOTOS ENTRAM NO DOCUMENTO.
         *
         * Antes o PDF só CITAVA fotografia — "documentada por fotografia na
         * retirada e na entrega" — e o cliente recebia a frase sem a prova. A
         * foto existia, gravada e com hash desde sempre; faltava pô-la na
         * folha, exatamente como faltava com a assinatura.
         *
         * Em ordem cronológica porque a folha conta uma história: como o
         * aparelho saiu da clínica, o que o técnico achou, como ele voltou.
         */
        fotos: { orderBy: { criadoEm: 'asc' } },
        /**
         * TODOS os orçamentos, e não só o mais recente.
         *
         * A ordem de serviço precisa do APROVADO — o que o cliente assinou pelo
         * link. Uma versão 2 aberta em rascunho para reorçar uma peça extra é a
         * mais recente e não foi combinada com ninguém; imprimi-la seria pôr no
         * papel um valor que o cliente leria como cobrança.
         *
         * Os demais documentos seguem usando `orcamentos[0]`, que continua
         * sendo o mais recente pela ordenação abaixo.
         */
        orcamentos: {
          orderBy: { versao: 'desc' },
          include: { itens: { orderBy: { ordem: 'asc' } } },
        },
        fatura: { include: { pagamentos: { where: { estornadoEm: null } } } },
      },
    })
    return o
  })
  if (!dados) throw new Error('Ordem não encontrada para gerar o documento.')

  /**
   * ===========================================================================
   * A DATA INTERNA DO PDF É A DA ORDEM, E NÃO A DO RELÓGIO
   * ===========================================================================
   * O PDFKit carimba um `CreationDate` com `new Date()` quando ninguém diz o
   * contrário. São catorze dígitos dentro do arquivo, invisíveis na tela — e
   * eles bastavam para fazer DOIS PDFs de conteúdo idêntico terem hashes
   * diferentes.
   *
   * O efeito não era cosmético. Cada emissão vira uma linha em `documentos`, e
   * a única maneira de saber que a segunda emissão é a mesma coisa que a
   * primeira é comparar o hash. Com o relógio lá dentro, nunca batia: recarregar
   * a página do PDF criava um documento novo, e o cliente passava a ver "Ordem
   * de serviço nº 6" repetida na página dele, com a mesma data. Medido: três
   * buscas seguidas, três documentos, três hashes.
   *
   * `atualizadoEm` da ordem é a data honesta para este carimbo: ele diz de que
   * momento da ordem este papel fala. Duas emissões sem nada ter mudado no meio
   * descrevem o mesmo momento e produzem o mesmo arquivo; qualquer mudança real
   * na ordem move a data, muda os bytes e faz nascer um documento novo — que é
   * exatamente o histórico que se quer guardar.
   */
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: { CreationDate: dados.atualizadoEm },
  })
  const pedacos: Buffer[] = []
  doc.on('data', (c: Buffer) => pedacos.push(c))
  const pronto = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(pedacos))))

  /**
   * A COR É DA EMPRESA, e não do código.
   *
   * A ordem de precedência é: a cor que o FRANQUEADO escolheu no papel
   * timbrado, depois a que está no cadastro da franquia (escrita pelo dono da
   * plataforma), depois o roxo de origem — que é exatamente o que estava
   * escrito aqui à mão. Quem nunca mexeu em cor nenhuma não vê diferença.
   *
   * A conferência do formato não é paranoia: este texto vai direto para o
   * PDFKit, e um valor estranho ali derruba a geração do documento inteiro —
   * o contrato não sai, e ninguém liga a falha à cor que alguém digitou.
   */
  /**
   * O PADRÃO É A COR IMPRESSA DA MARCA, e não um roxo aproximado.
   *
   * Era `#4A0D8F`, escrito à mão aqui. O `public/marca/LEIA-ME.md` diz qual é a
   * cor de verdade e por que ela importa: **#34005E**, que no PDF oficial é
   * CMYK 87/96/11/58 — "a cor impressa, a que está no cartão e na van". O outro
   * violeta do sistema é cor de instrumento, calibrado para brilhar em tela.
   *
   * Documento é papel. Sai na cor do cartão.
   */
  const VIO =
    corSegura(dados.tenant.marca?.corPrimaria) ?? corSegura(dados.tenant.corPrimaria) ?? MARCA_IMPRESSA
  const TINTA = '#14071F'
  const CINZA = '#6C6079'

  /* =========================================================================
     O CABEÇALHO — PAPEL TIMBRADO DE VERDADE
     =========================================================================
     `tenant.logoUrl` existia no banco desde o primeiro dia, com o comentário
     "identidade visual da franquia nos documentos". Nada no sistema escrevia
     nela, e este gerador nunca a procurou: toda franquia emitia sob o mesmo
     cabeçalho de texto puro.

     Agora a logo entra à ESQUERDA e os dados da empresa à direita dela, como
     num timbre impresso. Sem logo, o nome volta para a margem e o cabeçalho é
     exatamente o que era — quem nunca enviou marca nenhuma não vê diferença.

     Dentro de `try`, como a assinatura e as fotos: um arquivo que sumiu do
     disco não pode impedir a emissão de um contrato. Sem a imagem o documento
     continua válido, com o nome, o CNPJ e o endereço no lugar.
     ========================================================================= */
  const ALTURA_LOGO = 46
  const LARGURA_LOGO = 150
  let recuo = 48

  /**
   * =========================================================================
   * A LOGO DA CASA ENTRA QUANDO A EMPRESA NÃO ENVIOU A DELA
   * =========================================================================
   * O cabeçalho só desenhava imagem se alguém tivesse subido um arquivo pelo
   * painel. Ninguém subiu, e o timbrado saía como texto: "DTECH MED" escrito
   * com a fonte do PDF, sem marca nenhuma. Não era o papel timbrado que foi
   * pedido — era o nome da empresa em negrito.
   *
   * E a marca estava aqui o tempo todo. O `public/marca/LEIA-ME.md` descreve os
   * três arquivos, extraídos do PDF oficial, e a tabela diz onde cada um vai:
   * `dtechmed.svg`, proporção 6,02:1, **"topo do site, rodapé, cabeçalho de
   * PDF"**. O cabeçalho de PDF era o único dos três que nunca recebeu.
   *
   * A ordem de precedência é a mesma da cor: o que o FRANQUEADO enviou primeiro,
   * a marca da rede depois. Quem sobe a própria logo continua emitindo com ela.
   *
   * POR QUE RASTERIZAR, e por que isso não congela nada: o PDFKit desenha PNG e
   * JPG, não SVG. E o arquivo da marca usa `fill="currentColor"` — ele não tem
   * cor própria, herda a de quem o usa. Então a cor do timbre é injetada antes
   * de virar imagem, e a logo sai na mesma cor da régua e dos títulos. Trocar o
   * SVG continua bastando, como o LEIA-ME promete: nada aqui aponta para um PNG
   * gravado em disco.
   * ========================================================================= */
  const enviada = dados.tenant.marca?.logoCaminho ?? null
  let desenhou = false

  if (enviada) {
    try {
      doc.image(path.join(RAIZ(), enviada), 48, doc.y, {
        // Só `fit`: `align: 'left'` e `valign: 'top'` são o padrão do PDFKit
        // e os tipos dele nem os aceitam — a assinatura só admite os desvios.
        fit: [LARGURA_LOGO, ALTURA_LOGO],
      })
      desenhou = true
    } catch {
      desenhou = false
    }
  }

  if (!desenhou) {
    try {
      const png = await logoDaCasa(VIO)
      if (png) {
        doc.image(png, 48, doc.y, { fit: [LARGURA_LOGO, ALTURA_LOGO] })
        desenhou = true
      }
    } catch {
      // Marca que não desenha não impede a emissão de um contrato. O nome, o
      // CNPJ e o endereço seguem no cabeçalho, como sempre seguiram.
      desenhou = false
    }
  }

  const logo = desenhou
  if (desenhou) recuo = 48 + LARGURA_LOGO + 16

  const topoDoTimbre = doc.y
  const larguraDoTexto = 547 - recuo

  doc
    .fillColor(VIO)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(dados.tenant.nome, recuo, topoDoTimbre, { width: larguraDoTexto })
  doc.moveDown(0.15)
  doc.fillColor(CINZA).fontSize(8).font('Helvetica')
  const linhaEmpresa = [
    dados.tenant.razaoSocial,
    dados.tenant.cnpj && `CNPJ ${formatarDoc(dados.tenant.cnpj)}`,
    [dados.tenant.logradouro, dados.tenant.numero].filter(Boolean).join(', '),
    [dados.tenant.cidade, dados.tenant.uf].filter(Boolean).join('/'),
    dados.tenant.telefone && formatarTelefone(dados.tenant.telefone),
  ]
    .filter(Boolean)
    .join('  ·  ')
  if (linhaEmpresa) doc.text(linhaEmpresa, recuo, doc.y, { width: larguraDoTexto })

  // A régua desce abaixo do MAIS BAIXO dos dois — a logo ou o texto. Sem esta
  // conta, uma logo mais alta que as duas linhas de texto atravessava a régua.
  const fundoDoTimbre = Math.max(doc.y, logo ? topoDoTimbre + ALTURA_LOGO : 0)
  doc.x = 48
  doc.y = fundoDoTimbre
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
  ], VIO)

  bloco(doc, 'EQUIPAMENTO', [
    ['Marca / modelo', `${dados.equipamento.marca} ${dados.equipamento.modelo}`],
    ['Nº de série', dados.equipamento.numeroSerie ?? '—'],
    ['Categoria', dados.equipamento.categoria ?? '—'],
    ['Voltagem', dados.equipamento.voltagem ?? '—'],
    ['Acessórios', dados.equipamento.acessorios ?? '—'],
    ['Defeito relatado', dados.defeitoRelatado],
  ], VIO)

  // ---- corpo específico ---------------------------------------------------
  const orc = dados.orcamentos[0]

  if ((pedido.documento === 'ORCAMENTO' || pedido.documento === 'CONTRATO_MANUTENCAO') && orc) {
    doc.moveDown(0.4)
    rotulo(doc, 'ITENS', VIO)
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
      rotulo(doc, 'CONDIÇÕES', VIO)
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
     O MODELO DA EMPRESA, QUANDO EXISTE UM
     =========================================================================
     Aqui é onde o molde escrito na tela toma o lugar do texto embutido abaixo.

     A ORDEM IMPORTA: o modelo é procurado ANTES dos blocos fixos, e quando ele
     existe os blocos são pulados. O contrário — imprimir os dois — sairia com o
     texto duplicado, e é o tipo de erro que só se percebe no papel.

     E QUANDO NÃO HÁ MODELO, NADA MUDA. `modeloPadrao` devolvendo `null` é o
     caminho normal de quem nunca abriu a tela de modelos, e é isso que faz esta
     mudança não quebrar o sistema de ninguém: o texto embutido continua sendo
     impresso exatamente como antes.

     O cabeçalho, o rodapé e os blocos de cliente e equipamento continuam vindo
     do sistema em qualquer caso — eles são a identidade do documento, não o
     conteúdo dele. O modelo escreve o CORPO.
     ========================================================================= */
  const podeTerModelo =
    pedido.documento === 'CONTRATO_PRESTACAO' ||
    pedido.documento === 'NOTA_PROMISSORIA' ||
    pedido.documento === 'ORDEM_SERVICO'

  let usouModelo = false
  if (podeTerModelo) {
    // O modelo NOMEADO tem precedência sobre o padrão — mas continua tendo de
    // ser do tipo certo e estar ativo. Um id vindo de fora não escolhe texto de
    // outra categoria nem ressuscita um molde aposentado.
    const modelo = await comEscopo(ctx, (tx) =>
      tx.modeloDocumento.findFirst({
        where: pedido.modeloId
          ? { id: pedido.modeloId, tipo: pedido.documento, ativo: true }
          : { tipo: pedido.documento, padrao: true, ativo: true },
        select: { nome: true, corpo: true },
      }),
    )
    if (modelo) {
      usouModelo = true
      const valores = valoresDaOrdem(dados, formatarDoc)
      const { texto } = renderizarModelo(modelo.corpo, valores)

      doc.fillColor(TINTA).fontSize(9).font('Helvetica').text(texto, {
        align: 'justify',
        lineGap: 2,
      })
      doc.moveDown(1.4)

      // A linha de assinatura vem do sistema, e não do modelo, de propósito:
      // ela é o que faz o papel valer, e depender de alguém lembrar de escrevê-la
      // no texto produziria mais cedo ou mais tarde um contrato sem onde assinar.
      const y = doc.y + 26
      doc.moveTo(120, y).lineTo(475, y).strokeColor(CINZA).lineWidth(0.8).stroke()
      doc.moveDown(2.4)
      doc
        .fillColor(CINZA)
        .fontSize(8)
        .font('Helvetica')
        .text(dados.cliente.nome, { align: 'center' })
      doc.text(formatarDoc(dados.cliente.documento), { align: 'center' })
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
  if (pedido.documento === 'CONTRATO_PRESTACAO' && !usouModelo) {
    const valor = dados.fatura?.valorTotalCentavos ?? orc?.totalCentavos ?? 0

    rotulo(doc, 'AS PARTES', VIO)
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
    rotulo(doc, 'OBJETO', VIO)
    doc.fillColor(TINTA).fontSize(8.5).font('Helvetica').text(
      `Prestação de serviço técnico especializado no equipamento ${dados.equipamento.marca} ` +
        `${dados.equipamento.modelo}${dados.equipamento.numeroSerie ? `, série ${dados.equipamento.numeroSerie}` : ''}, ` +
        `conforme a ordem de serviço nº ${String(dados.numero).padStart(5, '0')} e o orçamento aprovado pelo ` +
        `CONTRATANTE, no valor de ${formatarBRL(valor)} (${reaisPorExtenso(valor)}).`,
      { align: 'justify', lineGap: 1.5 },
    )

    doc.moveDown(1)
    rotulo(doc, 'CLÁUSULAS', VIO)
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
  if (pedido.documento === 'NOTA_PROMISSORIA' && !usouModelo) {
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

  /* =========================================================================
     ORDEM DE SERVIÇO — o papel que vai para a mão do cliente
     =========================================================================
     O QUE ele imprime é decidido em `ordem-de-servico.ts`, que é puro e
     testado. Aqui só se desenha o que aquele módulo devolveu.

     A separação não é preciosismo de arquitetura: a regra mais importante
     desta folha é uma OMISSÃO — o `parecerTecnico` não pode sair aqui — e
     omissão não se enxerga lendo código de desenho. Enquanto a decisão morasse
     no meio do PDFKit, ela seria uma linha que alguém acrescenta sem querer.

     Antes disto, a ORDEM_SERVICO sem modelo cadastrado saía como capa vazia:
     cabeçalho, cliente, equipamento, e acabou. Sem laudo e sem valores — que é
     justamente o que o cliente abre o documento para ver.
     ========================================================================= */
  if (pedido.documento === 'ORDEM_SERVICO' && !usouModelo) {
    for (const secao of corpoDaOrdemDeServico(dados)) {
      if (secao.tipo === 'bloco') {
        bloco(doc, secao.titulo, secao.linhas, VIO)
        continue
      }
      doc.moveDown(0.4)
      rotulo(doc, 'VALORES', VIO)
      const larguras = [246, 48, 88, 88]
      linhaTabela(doc, ['Descrição', 'Qtd', 'Unitário', 'Total'], larguras, true)
      for (const i of secao.itens) {
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
        .text(`TOTAL: ${formatarBRL(secao.totalCentavos)}`, { align: 'right' })
      doc.moveDown(0.3)
      doc.fillColor(CINZA).fontSize(8).font('Helvetica').text(secao.rodape, { align: 'right' })
      doc.moveDown(0.6)
    }
  }

  if (pedido.documento === 'LAUDO_TECNICO') {
    bloco(doc, 'DIAGNÓSTICO', [
      ['Técnico', dados.tecnico?.nome ?? '—'],
      ['Constatação', dados.diagnostico ?? '—'],
      ['Parecer', dados.parecerTecnico ?? '—'],
    ], VIO)
  }

  if (pedido.documento === 'RECIBO_PAGAMENTO' && dados.fatura) {
    rotulo(doc, 'RECEBIMENTOS', VIO)
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
    rotulo(doc, 'ASSINATURA', VIO)
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

  // ---- as fotos -----------------------------------------------------------
  /**
   * AS FOTOS DO APARELHO, NA FOLHA — e é isto que faz o documento se ATUALIZAR.
   *
   * ===========================================================================
   * POR QUE ELE PARECE "INTELIGENTE"
   * ===========================================================================
   * O PDF é gerado de novo a cada etapa que emite documento, e sempre a partir
   * do que está no banco NAQUELE momento. Como as fotos entram por aqui, o
   * documento da retirada sai com as fotos da retirada; o da entrega sai com
   * essas MAIS as da bancada e as da entrega. Não há mágica e não há um
   * "atualizador": há um gerador que lê o presente toda vez que roda.
   *
   * ===========================================================================
   * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO
   * ===========================================================================
   * CADA FOTO CARREGA CATEGORIA, DATA E AUTOR. Uma grade de fotos sem carimbo
   * não prova nada: numa discussão de garantia, "esse arranhão já existia" só
   * se responde com a data e o nome de quem fotografou.
   *
   * O ARQUIVO QUE SUMIU NÃO DERRUBA O DOCUMENTO. Cada imagem entra dentro de
   * `try`, como a assinatura: um PDF que falha inteiro porque uma foto se
   * perdeu é pior que um PDF com uma foto a menos.
   */
  const FOTOS_NA_FOLHA = 8
  if (dados.fotos.length > 0) {
    doc.moveDown(1.4)
    rotulo(doc, `FOTOS DO APARELHO (${dados.fotos.length})`, VIO)
    doc.moveDown(0.5)

    const LARG = 118
    const ALT = 88
    const VAO = 8
    const POR_LINHA = 4
    let col = 0
    let topo = doc.y

    for (const f of dados.fotos.slice(0, FOTOS_NA_FOLHA)) {
      // Antes de desenhar a linha: ela cabe no que sobra da página?
      if (col === 0 && topo + ALT + 26 > doc.page.height - 60) {
        doc.addPage()
        topo = doc.y
      }
      const x = 48 + col * (LARG + VAO)
      try {
        doc.image(path.join(RAIZ(), f.caminhoThumb ?? f.caminho), x, topo, {
          fit: [LARG, ALT],
          align: 'center',
          valign: 'center',
        })
      } catch {
        doc
          .rect(x, topo, LARG, ALT)
          .strokeColor('#CFCBD9')
          .lineWidth(1)
          .stroke()
          .fillColor(CINZA)
          .fontSize(6.5)
          .font('Helvetica')
          .text('arquivo não encontrado', x, topo + ALT / 2 - 4, { width: LARG, align: 'center' })
      }
      doc.fillColor(TINTA).fontSize(6.5).font('Helvetica-Bold')
      doc.text(f.categoria.replace(/_/g, ' ').toLowerCase(), x, topo + ALT + 3, {
        width: LARG,
        lineBreak: false,
      })
      doc.fillColor(CINZA).fontSize(6).font('Courier')
      doc.text(
        `${f.criadoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${f.autorNome}`,
        x,
        topo + ALT + 12,
        { width: LARG, lineBreak: false },
      )

      col++
      if (col === POR_LINHA) {
        col = 0
        topo += ALT + 26
      }
    }
    doc.y = col === 0 ? topo : topo + ALT + 26
    doc.x = 48

    if (dados.fotos.length > FOTOS_NA_FOLHA) {
      // O QUE NÃO COUBE PRECISA SER DITO. Cortar em silêncio faria o documento
      // afirmar, por omissão, que existiam oito fotos.
      doc.moveDown(0.4)
      doc.fillColor(CINZA).fontSize(7).font('Helvetica')
      doc.text(
        `Mais ${dados.fotos.length - FOTOS_NA_FOLHA} foto(s) no acompanhamento em ` +
          `${env.APP_URL}/os/${dados.tokenPublico}`,
        48,
        doc.y,
        { width: 499 },
      )
    }
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

  /**
   * ===========================================================================
   * CONTEÚDO IGUAL NÃO É EMISSÃO NOVA — e era
   * ===========================================================================
   * Esta rota gera o PDF a cada pedido, de propósito: a O.S. muda enquanto a
   * ordem anda, e quem pede "o PDF" quer a de agora. Cada emissão virava uma
   * linha em `documentos`, com hora e hash, e o comentário lá em cima defende
   * isso com razão — apagar o de terça para deixar só o de hoje seria reescrever
   * o histórico da ordem.
   *
   * Só que RECARREGAR A PÁGINA também virava linha. Três aberturas do mesmo PDF,
   * no mesmo minuto, com os mesmos bytes, viravam três "emissões". Medido: três
   * buscas, três documentos, hash idêntico nos três.
   *
   * Isso não é histórico, é contador de cliques — e ele sai em dois lugares que
   * não podem mentir:
   *
   *   · a página do CLIENTE, que passa a listar "Ordem de serviço nº 6" quatro
   *     vezes, com a mesma data, e ninguém sabe qual abrir;
   *   · a FOLHA DE RASTREABILIDADE, que conta quantas provas existem e de que
   *     dia são. Ela responde ao cliente, ao fabricante e à vigilância — e
   *     inflar essa contagem com recarga de página é dizer que houve prova onde
   *     houve F5.
   *
   * O hash já estava sendo calculado e o arquivo em disco já era o mesmo (o nome
   * dele contém o hash). Faltava a pergunta: se o último documento deste tipo,
   * nesta ordem, tem este hash, ele É este documento. Devolvemos o que existe.
   *
   * O TOKEN DE ACESSO TAMBÉM É O MESMO, e isso é parte do conserto: emitir um
   * token novo para conteúdo idêntico deixaria dois links vivos apontando para
   * o mesmo arquivo, e o que o cliente tem no WhatsApp deixaria de ser "o" link.
   *
   * Conteúdo DIFERENTE continua nascendo linha nova, com hora e hash próprios —
   * que é exatamente o caso que o comentário de cima protege.
   */
  const criado = await comEscopo(ctx, async (tx) => {
    const igual = await tx.documento.findFirst({
      where: { ordemId: dados.id, tipo: pedido.documento, hash },
      orderBy: { geradoEm: 'desc' },
      select: { id: true, tokenAcesso: true },
    })
    if (igual) return igual

    return tx.documento.create({
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
      select: { id: true, tokenAcesso: true },
    })
  })

  // O TOKEN VOLTA porque quem chamou pode precisar mandar o link ao cliente, e
  // procurá-lo depois por "o último documento desta ordem" acertaria o
  // documento errado no dia em que dois nascessem no mesmo segundo.
  return {
    caminho: relativo,
    hash,
    bytes: buffer.length,
    documentoId: criado.id,
    tokenAcesso: criado.tokenAcesso,
  }
}

// ---------------------------------------------------------------------------

type Doc = InstanceType<typeof PDFDocument>

function rotulo(doc: Doc, texto: string, cor = '#4A0D8F') {
  doc.fillColor(cor).fontSize(8).font('Helvetica-Bold').text(texto)
  doc.moveDown(0.25)
}

/**
 * A COR QUE PODE ENTRAR NO PDF, e nada mais.
 *
 * O valor vem do cadastro da franquia, ou seja, de um campo de texto que
 * alguém digita. O PDFKit aceita `fillColor` e estoura com o que não entende —
 * e o estouro não aparece como "cor inválida": aparece como o contrato que não
 * foi emitido, na etapa em que o cliente estava esperando o documento.
 *
 * Seis dígitos com a cerquilha, ou nada. Três dígitos (`#abc`) ficam de fora
 * de propósito: aceitar duas gramáticas para o mesmo campo é convidar a
 * terceira.
 */
function corSegura(valor: string | null | undefined): string | null {
  if (!valor) return null
  return /^#[0-9a-fA-F]{6}$/.test(valor.trim()) ? valor.trim() : null
}

function bloco(doc: Doc, titulo: string, linhas: Array<[string, string]>, cor = '#4A0D8F') {
  rotulo(doc, titulo, cor)
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
