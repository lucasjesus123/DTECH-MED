import 'dotenv/config'
import sharp from 'sharp'
import { Prisma } from '../src/generated/prisma/client'
import { EtapaOrdem as E, Papel as P } from '../src/generated/prisma/enums'
import { novoToken } from '../src/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { avancarOrdem } from '../src/server/ordem/motor'
import { conferir, darBaixa, emitirFatura, proximoNumero } from '../src/server/financeiro/servico'
import { consumirNaExecucao, reservarDoOrcamento } from '../src/server/estoque/servico'
import { guardarAssinatura, guardarFoto } from '../src/server/arquivos/storage'

/**
 * Monta um cenário de demonstração levando ordens até etapas diferentes,
 * pelo MOTOR — nunca escrevendo a etapa direto no banco.
 *
 * Isso importa: uma ordem plantada com `UPDATE etapa = 'FATURADO'` fica sem
 * linha do tempo, sem eventos encadeados e sem os avisos na fila. Ela pareceria
 * certa na tela e mentiria em todo o resto.
 *
 * Pelo mesmo motivo, as fotos e as assinaturas são ARQUIVOS DE VERDADE, gravados
 * pelo mesmo storage que o app usa. A primeira versão deste script só inseria a
 * linha no banco apontando para `demo/f0.jpg` — e o prontuário abria com seis
 * imagens quebradas, porque o arquivo nunca existiu. Dado de demonstração que
 * quebra na tela é pior que demonstração nenhuma: ensina a desconfiar do que
 * está certo.
 */

/** Placeholder legível: um retângulo com o texto no meio, gerado na hora. */
async function imagemDemo(texto: string, cor: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="${cor}"/>
    <text x="600" y="470" font-family="sans-serif" font-size="64" fill="#ffffff"
          text-anchor="middle" opacity="0.85">${texto}</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
}

/** PNG de traço, no formato que o quadro de assinatura produz. */
async function assinaturaDemo(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
    <rect width="600" height="200" fill="#ffffff"/>
    <path d="M40 150 C 120 40, 200 190, 280 110 S 440 60, 560 130"
          stroke="#101010" stroke-width="5" fill="none" stroke-linecap="round"/>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}
async function main() {
  // Precisa do contexto de Super Admin: sem ele o RLS filtra a consulta e a
  // empresa "não existe" — que é exatamente o comportamento esperado.
  const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
  const t = await comEscopo(SUPER, (tx) => tx.tenant.findUnique({ where: { slug: 'dtechmed-lajeado' } }))
  if (!t) throw new Error('Rode antes: npm run db:seed -- --demo')

  const ctx: ContextoAcesso = { tenantId: t.id, userId: null, ehSuperAdmin: false }

  const equipe = await comEscopo(ctx, (tx) => tx.user.findMany({ select: { id: true, nome: true, papel: true } }))
  const de = (p: P) => {
    const u = equipe.find((x) => x.papel === p)!
    return { id: u.id, nome: u.nome, papel: u.papel }
  }

  const clientes = await comEscopo(ctx, (tx) =>
    tx.cliente.findMany({ include: { equipamentos: true }, orderBy: { criadoEm: 'asc' } }),
  )

  /**
   * O movimento de uma assistência que já roda, e não uma etapa de amostra.
   *
   * A proporção não é aleatória. Num negócio de manutenção, a maior parte do
   * volume está ATRÁS — serviço já entregue, faturado, fechado — e só uma
   * fatia está em andamento agora. Um cenário com uma ordem por etapa mostra a
   * esteira bonita e não tem o que somar: relatório de faturamento com uma
   * linha não é relatório, é exemplo.
   *
   * Por isso são 10 ordens finalizadas e 3 faturadas contra 9 em andamento.
   * O painel do dia mostra o trabalho vivo, e o financeiro tem histórico para
   * fechar mês.
   */
  const roteiros: Array<{ ate: E; defeito: string }> = [
    // --- Fechadas: o histórico que alimenta relatório ----------------------
    { ate: E.FINALIZADO, defeito: 'Cadeira não sobe. Barulho de bomba forçando.' },
    { ate: E.FINALIZADO, defeito: 'Autoclave para no meio do ciclo e apita três vezes.' },
    { ate: E.FINALIZADO, defeito: 'Aplicador esquenta demais e desarma na metade da sessão.' },
    { ate: E.FINALIZADO, defeito: 'Painel não responde ao toque no canto direito.' },
    { ate: E.FINALIZADO, defeito: 'Perda de pressão. Não sustenta o vácuo por mais de um minuto.' },
    { ate: E.FINALIZADO, defeito: 'Ruído alto no compressor desde a última manutenção.' },
    { ate: E.FINALIZADO, defeito: 'Display apaga sozinho depois de vinte minutos ligado.' },
    { ate: E.FINALIZADO, defeito: 'Não aquece. A resistência parece não estar recebendo carga.' },
    { ate: E.FINALIZADO, defeito: 'Pedal sem resposta. Testei outro pedal e funcionou.' },
    { ate: E.FINALIZADO, defeito: 'Vaza água pela base quando enche o reservatório.' },

    // --- Faturadas: pagas, esperando a entrega -----------------------------
    { ate: E.FATURADO, defeito: 'Autoclave desarma o disjuntor ao iniciar o ciclo.' },
    { ate: E.FATURADO, defeito: 'Ponteira sem emissão. A luz acende mas não sai o disparo.' },
    { ate: E.FATURADO, defeito: 'Erro E-04 na tela toda vez que passa de 60% de potência.' },

    // --- Em andamento: o que o painel do dia mostra ------------------------
    { ate: E.RETIRADA_AGENDADA, defeito: 'Liga mas não dispara. Ontem senti cheiro de queimado.' },
    { ate: E.RETIRADA_AGENDADA, defeito: 'Parou de vez. Não liga nem na tomada da sala ao lado.' },
    { ate: E.RECEBIDO_NA_EMPRESA, defeito: 'Autoclave não fecha o ciclo, para na secagem.' },
    { ate: E.RECEBIDO_NA_EMPRESA, defeito: 'Bomba fazendo barulho e o braço descendo sozinho.' },
    { ate: E.ORCAMENTO_ENVIADO, defeito: 'Perde vácuo no aplicador e desliga sozinho.' },
    { ate: E.ORCAMENTO_ENVIADO, defeito: 'Tela riscada por dentro e toque falhando na lateral.' },
    { ate: E.EM_MANUTENCAO, defeito: 'Bisturi sem corte no modo coagulação.' },
    { ate: E.EM_MANUTENCAO, defeito: 'Cabo de força esquentando junto ao conector do aparelho.' },
    { ate: E.EM_MANUTENCAO, defeito: 'Refrigeração fraca. O gel esquenta no meio do procedimento.' },
  ]

  if (clientes.length === 0) throw new Error('Sem clientes. Rode antes: npm run db:seed -- --demo')

  for (let i = 0; i < roteiros.length; i++) {
    // Mais roteiros que clientes: o mesmo cliente volta com outro aparelho, o
    // que também é realista — clínica que já é cliente manda o próximo.
    const cliente = clientes[i % clientes.length]!
    const eq = cliente.equipamentos[0]
    if (!eq) continue
    const roteiro = roteiros[i]!

    const ordemId = await comEscopo(ctx, async (tx) => {
      const o = await tx.ordem.create({
        data: {
          tenantId: t.id,
          numero: await proximoNumero(tx, t.id, 'ordem'),
          clienteId: cliente.id,
          equipamentoId: eq.id,
          defeitoRelatado: roteiro.defeito,
          tokenPublico: novoToken(),
          tecnicoId: de(P.TECNICO).id,
          atendenteId: de(P.ATENDENTE).id,
          prazoPrometido: new Date(Date.now() + 7 * 86_400_000),
        },
        select: { id: true },
      })
      return o.id
    })

    const passo = async (para: E, ator: ReturnType<typeof de>) => {
      const r = await avancarOrdem(ctx, ator, { ordemId, para })
      if (!r.ok) throw new Error(`${para}: ${r.motivo}`)
    }

    await passo(E.ORDEM_RETIRADA_GERADA, de(P.ATENDENTE))
    if (roteiro.ate === E.ORDEM_RETIRADA_GERADA) continue

    await comEscopo(ctx, async (tx) => {
      await tx.agendamento.create({
        data: {
          tenantId: t.id,
          ordemId,
          tipo: 'RETIRADA',
          status: 'ATRIBUIDO',
          motoristaId: de(P.MOTORISTA).id,
          previstoPara: new Date(),
          enderecoSnapshot: `${cliente.logradouro ?? 'Endereço não informado'} · ${cliente.cidade ?? 'Lajeado'}/RS`,
          contatoNome: cliente.contatoNome,
          contatoTelefone: cliente.whatsapp,
          posicaoRota: i + 1,
        },
      })
    })
    await passo(E.RETIRADA_AGENDADA, de(P.ATENDENTE))
    if (roteiro.ate === E.RETIRADA_AGENDADA) continue

    await passo(E.EM_ROTA_RETIRADA, de(P.MOTORISTA))
    const traco = await guardarAssinatura({ tenantId: t.id, ordemId, dataUrl: await assinaturaDemo() })
    if (!traco.ok) throw new Error(`assinatura de demonstração: ${traco.motivo}`)
    await comEscopo(ctx, async (tx) => {
      await tx.assinatura.create({
        data: {
          tenantId: t.id,
          ordemId,
          tipo: 'RETIRADA',
          assinanteNome: cliente.contatoNome ?? cliente.nome,
          caminhoImagem: traco.caminho,
          hashImagem: traco.hash,
          latitude: -29.4669,
          longitude: -51.9611,
          precisaoM: 12,
        },
      })
    })
    await passo(E.COLETADO, de(P.MOTORISTA))

    const angulos = ['Frente', 'Traseira', 'Etiqueta', 'Lateral', 'Painel', 'Acessórios']
    for (let n = 0; n < angulos.length; n++) {
      const bytes = await imagemDemo(angulos[n]!, ['#2C1A47', '#1D1030', '#150B24'][n % 3]!)
      const arquivo = new File([new Uint8Array(bytes)], `${angulos[n]}.jpg`, { type: 'image/jpeg' })
      const r = await guardarFoto({ tenantId: t.id, ordemId, arquivo })
      if (!r.ok) throw new Error(`foto de demonstração: ${r.motivo}`)

      await comEscopo(ctx, async (tx) => {
        await tx.foto.create({
          data: {
            tenantId: t.id,
            ordemId,
            categoria: 'RECEBIMENTO',
            caminho: r.caminho,
            caminhoThumb: r.caminhoThumb,
            hashArquivo: r.hash,
            larguraPx: r.largura,
            alturaPx: r.altura,
            tamanhoBytes: r.bytes,
            legenda: angulos[n],
            autorNome: de(P.TECNICO).nome,
          },
        })
      })
    }
    await passo(E.RECEBIDO_NA_EMPRESA, de(P.TECNICO))
    if (roteiro.ate === E.RECEBIDO_NA_EMPRESA) continue

    await passo(E.EM_ANALISE, de(P.TECNICO))
    await comEscopo(ctx, async (tx) => {
      await tx.ordem.update({
        where: { id: ordemId },
        data: {
          diagnostico: 'Fonte de alimentação sem saída nos 24V. Capacitor C14 estufado e trilha com sinal de sobreaquecimento.',
          parecerTecnico: 'Reparo viável. Recomendo trocar a fonte inteira em vez de recuperar a placa.',
        },
      })
    })
    await passo(E.ORCAMENTO_INTERNO, de(P.TECNICO))

    /**
     * As peças do orçamento são as que o LAUDO menciona, escolhidas pelo SKU.
     *
     * Era `findMany({ take: 2, orderBy: { sku: 'asc' } })`, e as duas primeiras
     * por ordem alfabética são o cabo de força e o capacitor. O laudo, logo
     * acima, diz "recomendo trocar a fonte inteira" — e a fonte não entrava.
     *
     * O defeito só apareceu na tela: o orçamento listava R$ 35,00 de cabo e
     * R$ 45,00 de capacitor, e somava R$ 725,00 em peças. Os R$ 725,00 estavam
     * cravados no código, e são exatamente fonte + capacitor: o valor sabia
     * quais peças deviam estar ali, a seleção é que não.
     *
     * Um orçamento cujos itens não fecham com o total é o pior tipo de dado de
     * demonstração — ele ensina a desconfiar da conta do sistema, que está
     * certa.
     */
    const SKUS_DO_REPARO = ['FT-24V10', 'CP-450220'] // fonte chaveada + capacitor
    const pecas = await comEscopo(ctx, (tx) =>
      tx.peca.findMany({ where: { sku: { in: SKUS_DO_REPARO } }, orderBy: { precoVendaCentavos: 'desc' } }),
    )

    const servicos = [
      { descricao: 'Mão de obra · reparo de placa e troca de fonte (4h)', centavos: 72000 },
      { descricao: 'Calibração de potência e teste de disparo', centavos: 35000 },
    ]

    // Somados dos itens, nunca digitados. É o que impede o total de divergir de
    // novo quando alguém trocar uma peça ou um serviço aqui.
    const subtotalPecas = pecas.reduce((s, p) => s + p.precoVendaCentavos, 0)
    const subtotalServicos = servicos.reduce((s, x) => s + x.centavos, 0)

    const orcamentoId = await comEscopo(ctx, async (tx) => {
      const orc = await tx.orcamento.create({
        data: {
          tenantId: t.id,
          ordemId,
          numero: await proximoNumero(tx, t.id, 'orcamento'),
          status: 'ENVIADO',
          laudoTecnico: 'Fonte de alimentação sem saída nos 24V. Capacitor C14 estufado.',
          subtotalPecas,
          subtotalServicos,
          totalCentavos: subtotalPecas + subtotalServicos,
          garantiaDias: 90,
          prazoExecucaoDias: 5,
          enviadoEm: new Date(),
          tecnicoId: de(P.TECNICO).id,
          validoAte: new Date(Date.now() + 15 * 86_400_000),
        },
      })
      let ordem = 0
      for (const p of pecas) {
        await tx.orcamentoItem.create({
          data: {
            tenantId: t.id,
            orcamentoId: orc.id,
            tipo: 'PECA',
            pecaId: p.id,
            descricao: p.nome,
            quantidade: new Prisma.Decimal(1),
            valorUnitCentavos: p.precoVendaCentavos,
            valorTotalCentavos: p.precoVendaCentavos,
            ordem: ordem++,
          },
        })
      }
      for (const s of servicos) {
        await tx.orcamentoItem.create({
          data: {
            tenantId: t.id,
            orcamentoId: orc.id,
            tipo: 'SERVICO',
            descricao: s.descricao,
            quantidade: new Prisma.Decimal(1),
            valorUnitCentavos: s.centavos,
            valorTotalCentavos: s.centavos,
            ordem: ordem++,
          },
        })
      }
      return orc.id
    })
    await passo(E.ORCAMENTO_ENVIADO, de(P.GESTOR))
    if (roteiro.ate === E.ORCAMENTO_ENVIADO) continue

    await comEscopo(ctx, async (tx) => {
      await tx.orcamento.updateMany({ where: { ordemId }, data: { status: 'APROVADO' } })
    })

    /**
     * Aprovou o orçamento, RESERVA a peça na prateleira.
     *
     * Sem este par de chamadas o estoque da demonstração ficava parado: sete
     * peças com saldo e nenhum movimento, enquanto treze ordens trocavam uma
     * fonte cada. A tela de estoque era a única sem história para contar, e o
     * relatório dela nascia vazio.
     */
    const res = await reservarDoOrcamento(ctx, de(P.GESTOR), orcamentoId)
    if (!res.ok) throw new Error(`reserva de peças: ${res.motivo}`)
    await avancarOrdem(ctx, { id: null, nome: cliente.contatoNome ?? cliente.nome, papel: P.ATENDENTE }, {
      ordemId,
      para: E.ORCAMENTO_APROVADO,
      viaPortalCliente: true,
      autorExterno: cliente.contatoNome ?? cliente.nome,
    })
    await passo(E.EM_MANUTENCAO, de(P.TECNICO))

    // Começou o serviço, a peça SAI da prateleira. É aqui que ela deixa de
    // estar reservada e vira consumo — o que o livro-razão registra.
    const con = await consumirNaExecucao(ctx, de(P.TECNICO), ordemId)
    if (!con.ok) throw new Error(`consumo de peças: ${con.motivo}`)

    if (roteiro.ate === E.EM_MANUTENCAO) continue

    // ---- execução concluída e conferida pela gestão ----------------------
    await comEscopo(ctx, async (tx) => {
      await tx.ordem.update({
        where: { id: ordemId },
        data: {
          servicoExecutado:
            'Fonte substituída por equivalente original. Capacitor C14 trocado e trilha refeita.',
          testesFinais:
            'Ciclo completo em vazio e com carga. Potência aferida em 24,1V. Sem oscilação em 40 minutos.',
        },
      })
    })
    await passo(E.MANUTENCAO_CONCLUIDA, de(P.TECNICO))
    await passo(E.APROVACAO_GESTAO, de(P.TECNICO))
    await passo(E.FATURAMENTO, de(P.GESTOR))

    // ---- financeiro: emite e recebe em duas formas -----------------------
    const fat = await emitirFatura(ctx, ordemId, new Date(Date.now() + 5 * 86_400_000))
    if (!fat.ok) throw new Error(`fatura: ${fat.motivo}`)

    /**
     * Pagamento fracionado, como acontece no balcão: parte no pix, o resto em
     * dinheiro. Os valores saem do TOTAL do orçamento, e não digitados.
     *
     * Digitados, eles quitavam por coincidência: R$ 1.000,00 + R$ 795,00 dava
     * exatamente o total de então. Trocar o preço de uma peça no seed quebraria
     * a quitação de todas as 13 ordens faturadas, e o erro apareceria como
     * "baixa recusada" no meio do cenário — longe da linha que o causou.
     */
    const total = subtotalPecas + subtotalServicos
    const noPix = Math.round(total * 0.56)
    const baixa = await darBaixa(ctx, { id: de(P.FINANCEIRO).id, nome: de(P.FINANCEIRO).nome }, {
      faturaId: fat.faturaId,
      pagamentos: [
        { forma: 'PIX', valorCentavos: noPix, autorizacao: 'E2E' + ordemId.slice(-10) },
        { forma: 'DINHEIRO', valorCentavos: total - noPix },
      ],
      taxaCentavos: 1200,
    })
    if (!baixa.ok) throw new Error(`baixa: ${baixa.motivo}`)
    await passo(E.FATURADO, de(P.FINANCEIRO))

    // A conferência da gestão é a etapa 16 — separada de "pago".
    await conferir(ctx, { id: de(P.GESTOR).id!, nome: de(P.GESTOR).nome }, fat.faturaId)
    if (roteiro.ate === E.FATURADO) continue

    // ---- a volta ---------------------------------------------------------
    await comEscopo(ctx, async (tx) => {
      await tx.agendamento.create({
        data: {
          tenantId: t.id,
          ordemId,
          tipo: 'ENTREGA',
          status: 'ATRIBUIDO',
          motoristaId: de(P.MOTORISTA).id,
          previstoPara: new Date(),
          enderecoSnapshot: `${cliente.logradouro ?? 'Endereço não informado'} · ${cliente.cidade ?? 'Lajeado'}/RS`,
          contatoNome: cliente.contatoNome,
          contatoTelefone: cliente.whatsapp,
          posicaoRota: i + 1,
        },
      })
    })
    await passo(E.EM_ROTA_ENTREGA, de(P.MOTORISTA))

    const tracoEntrega = await guardarAssinatura({ tenantId: t.id, ordemId, dataUrl: await assinaturaDemo() })
    if (!tracoEntrega.ok) throw new Error(`assinatura de entrega: ${tracoEntrega.motivo}`)
    await comEscopo(ctx, async (tx) => {
      await tx.assinatura.create({
        data: {
          tenantId: t.id,
          ordemId,
          tipo: 'ENTREGA',
          assinanteNome: cliente.contatoNome ?? cliente.nome,
          caminhoImagem: tracoEntrega.caminho,
          hashImagem: tracoEntrega.hash,
          latitude: -29.4669,
          longitude: -51.9611,
          precisaoM: 9,
        },
      })
    })
    await passo(E.ENTREGUE, de(P.MOTORISTA))
    await passo(E.FINALIZADO, de(P.GESTOR))
  }

  const resumo = await comEscopo(ctx, (tx) =>
    tx.ordem.groupBy({ by: ['etapa'], _count: { _all: true } }),
  )
  const aguardando = await comEscopo(ctx, (tx) =>
    tx.ordem.findFirst({ where: { etapa: E.ORCAMENTO_ENVIADO }, select: { tokenPublico: true, numero: true } }),
  )

  console.log('\nCenário montado:')
  for (const r of resumo) console.log(`  ${r.etapa.padEnd(24)} ${r._count._all}`)
  if (aguardando) {
    console.log(`\n  Portal do cliente (ordem ${aguardando.numero}):`)
    console.log(`  http://localhost:3000/os/${aguardando.tokenPublico}`)
    console.log('  CNPJ para confirmar: 33666999000183\n')
  }
}

main()
  .catch((e) => {
    console.error('Falhou:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
