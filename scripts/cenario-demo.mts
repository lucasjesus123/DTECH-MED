import 'dotenv/config'
import sharp from 'sharp'
import { Prisma } from '../src/generated/prisma/client'
import { EtapaOrdem as E, Papel as P } from '../src/generated/prisma/enums'
import { novoToken } from '../src/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { avancarOrdem } from '../src/server/ordem/motor'
import { proximoNumero } from '../src/server/financeiro/servico'
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

  const roteiros: Array<{ ate: E; defeito: string }> = [
    { ate: E.RETIRADA_AGENDADA, defeito: 'Liga mas não dispara. Ontem senti cheiro de queimado.' },
    { ate: E.RECEBIDO_NA_EMPRESA, defeito: 'Autoclave não fecha o ciclo, para na secagem.' },
    { ate: E.ORCAMENTO_ENVIADO, defeito: 'Perde vácuo no aplicador e desliga sozinho.' },
    { ate: E.EM_MANUTENCAO, defeito: 'Bisturi sem corte no modo coagulação.' },
  ]

  for (let i = 0; i < roteiros.length && i < clientes.length; i++) {
    const cliente = clientes[i]!
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

    const pecas = await comEscopo(ctx, (tx) => tx.peca.findMany({ take: 2, orderBy: { sku: 'asc' } }))
    await comEscopo(ctx, async (tx) => {
      const orc = await tx.orcamento.create({
        data: {
          tenantId: t.id,
          ordemId,
          numero: await proximoNumero(tx, t.id, 'orcamento'),
          status: 'ENVIADO',
          laudoTecnico: 'Fonte de alimentação sem saída nos 24V. Capacitor C14 estufado.',
          subtotalPecas: 72500,
          subtotalServicos: 107000,
          totalCentavos: 179500,
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
      await tx.orcamentoItem.create({
        data: {
          tenantId: t.id,
          orcamentoId: orc.id,
          tipo: 'SERVICO',
          descricao: 'Mão de obra · reparo de placa e troca de fonte (4h)',
          quantidade: new Prisma.Decimal(1),
          valorUnitCentavos: 72000,
          valorTotalCentavos: 72000,
          ordem: ordem++,
        },
      })
      await tx.orcamentoItem.create({
        data: {
          tenantId: t.id,
          orcamentoId: orc.id,
          tipo: 'SERVICO',
          descricao: 'Calibração de potência e teste de disparo',
          quantidade: new Prisma.Decimal(1),
          valorUnitCentavos: 35000,
          valorTotalCentavos: 35000,
          ordem: ordem++,
        },
      })
    })
    await passo(E.ORCAMENTO_ENVIADO, de(P.GESTOR))
    if (roteiro.ate === E.ORCAMENTO_ENVIADO) continue

    await comEscopo(ctx, async (tx) => {
      await tx.orcamento.updateMany({ where: { ordemId }, data: { status: 'APROVADO' } })
    })
    await avancarOrdem(ctx, { id: null, nome: cliente.contatoNome ?? cliente.nome, papel: P.ATENDENTE }, {
      ordemId,
      para: E.ORCAMENTO_APROVADO,
      viaPortalCliente: true,
      autorExterno: cliente.contatoNome ?? cliente.nome,
    })
    await passo(E.EM_MANUTENCAO, de(P.TECNICO))
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
