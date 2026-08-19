import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * APAGA O RASTRO ANTIGO DAS ROTAS.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE, SE NADA MAIS NO SISTEMA APAGA
 * ---------------------------------------------------------------------------
 * Aqui tudo é feito para NÃO sumir: evento, assinatura, movimento de estoque e
 * trilha de auditoria são prova, e o banco nem concede DELETE neles.
 *
 * A posição da rota é a exceção, e é uma exceção deliberada. Ela não prova
 * nada: a prova da entrega é a assinatura, com a coordenada do momento em que
 * foi colhida, e essa fica para sempre. O rastro serve enquanto o caminho está
 * acontecendo — para a central responder ao cliente sem ligar para quem está
 * dirigindo.
 *
 * Depois disso, ele é o histórico minuto a minuto de por onde uma PESSOA andou.
 * Guardar isso indefinidamente não ajuda a operação em nada e acumula um risco
 * que só cresce: é o tipo de base que, vazando, expõe a rotina de quem trabalha
 * aqui. Dado que não serve mais e não é prova deve sumir.
 *
 * ---------------------------------------------------------------------------
 * USO
 * ---------------------------------------------------------------------------
 *   bash infra/migrador.sh npx tsx scripts/limpar-rastros.mts          # relatório
 *   bash infra/migrador.sh npx tsx scripts/limpar-rastros.mts --apagar
 *   bash infra/migrador.sh npx tsx scripts/limpar-rastros.mts --apagar --dias 15
 *
 * Sem `--apagar` ele só conta. Rodar todo mês, junto com a conferência do
 * dinheiro, é o suficiente.
 */

const DIAS_PADRAO = 30

const argumentos = process.argv.slice(2)
const APAGAR = argumentos.includes('--apagar')
const iDias = argumentos.indexOf('--dias')
const DIAS = iDias >= 0 ? Number(argumentos[iDias + 1]) : DIAS_PADRAO

if (!Number.isFinite(DIAS) || DIAS < 1) {
  console.error('  --dias precisa ser um número de dias maior que zero.')
  process.exit(1)
}

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('  Faltou DIRECT_DATABASE_URL (ou DATABASE_URL) no ambiente.')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: ['error'] })

/**
 * O dono da tabela também é barrado pela política — `FORCE ROW LEVEL SECURITY`
 * existe exatamente para isso. Sem declarar o contexto, o DELETE não enxerga
 * linha nenhuma, responde "0" e parece ter dado certo. Já derrubou a
 * conferência do dinheiro uma vez.
 */
async function comoDono<T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`
    return fn(tx as unknown as typeof prisma)
  })
}

const corte = new Date(Date.now() - DIAS * 86_400_000)

const { total, antigas, maisVelha } = await comoDono(async (tx) => {
  const total = await tx.posicaoRota.count()
  const antigas = await tx.posicaoRota.count({ where: { criadoEm: { lt: corte } } })
  const primeira = await tx.posicaoRota.findFirst({
    orderBy: { criadoEm: 'asc' },
    select: { criadoEm: true },
  })
  return { total, antigas, maisVelha: primeira?.criadoEm ?? null }
})

const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

console.log('')
console.log('  RASTRO DAS ROTAS')
console.log('  ' + '-'.repeat(56))
console.log(`  posições guardadas .... ${total}`)
console.log(`  mais antiga .......... ${maisVelha ? dia(maisVelha) : '—'}`)
console.log(`  a apagar (> ${DIAS} dias) . ${antigas}`)
console.log(`  a manter ............. ${total - antigas}`)
console.log('')

if (antigas === 0) {
  console.log('  Nada a fazer.')
  console.log('')
  await prisma.$disconnect()
  process.exit(0)
}

if (!APAGAR) {
  console.log('  Isto foi só o relatório — nada foi apagado.')
  console.log('  Para apagar de verdade, rode de novo com --apagar')
  console.log('')
  await prisma.$disconnect()
  process.exit(0)
}

const apagadas = await comoDono(async (tx) => {
  const r = await tx.posicaoRota.deleteMany({ where: { criadoEm: { lt: corte } } })
  return r.count
})

console.log(`  ${apagadas} posições apagadas.`)
console.log('  As assinaturas, com as coordenadas da entrega, continuam intactas.')
console.log('')

await prisma.$disconnect()
