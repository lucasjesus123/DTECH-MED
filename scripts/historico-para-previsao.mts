import 'dotenv/config'
import { EtapaOrdem, Papel } from '../src/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '../src/lib/db'
import { novoToken } from '../src/lib/cripto'

/**
 * =============================================================================
 * HISTÓRICO SINTÉTICO PARA A PREVISÃO DE PRAZO
 * =============================================================================
 * O modelo de prazo só abre a boca com oito O.S. concluídas no histórico, e o
 * cenário de demonstração não conclui nenhuma. Sem isto, a única coisa que dá
 * para ver na tela é a RECUSA — que é o comportamento certo, e é metade da
 * história.
 *
 * Este script escreve a outra metade: O.S. já finalizadas, com a linha do tempo
 * de eventos que o estimador lê, para dar para conferir a previsão com número,
 * confiança e fontes clicáveis.
 *
 * =============================================================================
 * O QUE ELE PROVA, E O QUE ELE NÃO PROVA
 * =============================================================================
 * Ele prova que a fiação está certa: a consulta encontra o histórico, a conta
 * roda, a confiança sai da amostra e a tela mostra as três obrigações.
 *
 * Ele NÃO prova que a previsão é boa. Os tempos aqui saem de uma distribuição
 * que eu inventei; o número resultante é aritmeticamente correto e
 * operacionalmente sem significado. Previsão boa depende de meses de DTECH MED
 * rodando de verdade — e é justamente por isso que o modelo recusa em vez de
 * inventar enquanto esse histórico não existe.
 *
 * NÃO RODE ISTO CONTRA PRODUÇÃO. Ele cria dado falso. A guarda abaixo recusa
 * qualquer banco que não seja o de ensaio.
 */

const url = process.env.DATABASE_URL ?? ''
if (!/127\.0\.0\.1:5599|localhost:5599/.test(url)) {
  console.error(
    'Recusando: este script escreve histórico FALSO e só roda no banco de ensaio (porta 5599).',
  )
  process.exit(1)
}

// Tempos, em dias, que cada etapa costuma levar até a conclusão. Espalhados de
// propósito: se todos fossem iguais, a amostra concordaria demais e a confiança
// sairia alta por um motivo que não existe na vida real.
const DIAS_ATE_O_FIM: Partial<Record<EtapaOrdem, number[]>> = {
  [EtapaOrdem.RECEBIDO_NA_EMPRESA]: [18, 22, 26, 31, 12, 40, 24, 29, 35, 20, 27, 16],
  [EtapaOrdem.EM_ANALISE]: [16, 20, 24, 28, 10, 36, 21, 26, 32, 18, 23, 14],
  [EtapaOrdem.ORCAMENTO_ENVIADO]: [12, 15, 19, 23, 8, 30, 17, 21, 27, 13, 18, 11],
  [EtapaOrdem.EM_MANUTENCAO]: [7, 9, 12, 15, 5, 21, 11, 14, 18, 8, 13, 6],
  [EtapaOrdem.FATURADO]: [2, 3, 4, 5, 1, 7, 3, 4, 6, 2, 4, 2],
}

const DIA = 86_400_000

async function main() {
  // O cliente nu não enxerga NADA: `FORCE ROW LEVEL SECURITY` vale também para
  // o dono da tabela, e sem contexto plantado a consulta volta vazia — não com
  // erro. É por isso que tudo aqui passa por `comEscopo`.
  const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
  const tenant = await comEscopo(SUPER, (tx) => tx.tenant.findFirst({ orderBy: { criadoEm: 'asc' } }))
  if (!tenant) throw new Error('Nenhuma empresa no banco. Rode a semeadura antes.')

  const ctx: ContextoAcesso = { tenantId: tenant.id, userId: null, ehSuperAdmin: false }

  const { cliente, equipamento, autor, ultimo } = await comEscopo(ctx, async (tx) => ({
    cliente: await tx.cliente.findFirst(),
    equipamento: await tx.equipamento.findFirst(),
    autor: await tx.user.findFirst({ where: { papel: Papel.TECNICO } }),
    ultimo: await tx.ordem.aggregate({ _max: { numero: true } }),
  }))
  if (!cliente || !equipamento || !autor) {
    throw new Error('Cenário incompleto: rode o cenario-demo antes.')
  }

  const quantas = Number(process.argv[2] ?? 12)
  let numero = (ultimo._max.numero ?? 0) + 1

  const agora = Date.now()
  let criadas = 0

  for (let i = 0; i < quantas; i++) {
    // Cada O.S. sintética conclui num dia diferente do passado, para a janela
    // do histórico não ficar toda empilhada numa data só.
    const fim = new Date(agora - (5 + i * 3) * DIA)

    const ordem = await comEscopo(ctx, (tx) => tx.ordem.create({
      data: {
        tenantId: tenant.id,
        numero: numero++,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        etapa: EtapaOrdem.FINALIZADO,
        tokenPublico: novoToken(),
        defeitoRelatado: 'Histórico sintético para calibrar a previsão de prazo.',
      },
    }))

    // AS DATAS VÃO POR SQL CRU, e não pelo `create`.
    // `criadoEm` e `atualizadoEm` são geridos pelo Prisma — ele recusa recebê-los
    // no create e sobrescreveria o `atualizadoEm` de qualquer jeito. E é
    // justamente `atualizadoEm` da ordem concluída que o estimador lê como "o
    // fim": sem recuar essa data, as doze O.S. sintéticas teriam concluído
    // todas agora e o histórico não teria distribuição nenhuma.
    await comEscopo(ctx, (tx) => tx.$executeRaw`
      UPDATE ordens
         SET "abertaEm" = ${new Date(fim.getTime() - 60 * DIA)},
             "atualizadoEm" = ${fim}
       WHERE id = ${ordem.id}
    `)

    // A linha do tempo que o estimador lê: uma entrada por etapa, com a data
    // recuada pelo tempo que aquela etapa costuma levar até o fim.
    let sequencia = 1
    for (const [etapa, tempos] of Object.entries(DIAS_ATE_O_FIM)) {
      const dias = tempos![i % tempos!.length]!
      await comEscopo(ctx, (tx) => tx.eventoOrdem.create({
        data: {
          tenantId: tenant.id,
          ordemId: ordem.id,
          sequencia: sequencia++,
          etapaNova: etapa as EtapaOrdem,
          tipo: 'historico.sintetico',
          titulo: `Entrou em ${etapa}`,
          autorId: autor.id,
          autorNome: autor.nome,
          autorPapel: autor.papel,
          // A DATA VAI NO INSERT, e não num UPDATE depois — a trilha RECUSA
          // ser reescrita. `eventos_ordem` nega UPDATE por política do banco,
          // e isso é o sistema funcionando: linha do tempo que se pode editar
          // não é prova de nada. Tentar corrigir a data depois devolve
          // "permission denied", que é a resposta certa.
          criadoEm: new Date(fim.getTime() - dias * DIA),
          // O encadeamento por hash é do motor de verdade; aqui o campo é
          // preenchido só para satisfazer o schema. Estes eventos não entram
          // na trilha de auditoria de nada.
          hash: `sintetico-${ordem.id}-${sequencia}`,
        },
      }))
    }
    criadas++
  }

  console.log(`  ${criadas} O.S. concluídas com linha do tempo — histórico pronto para a previsão.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
