import 'dotenv/config'
import { hashEvento } from '../src/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }

async function main() {
  const o = await comEscopo(SUPER, (tx) => tx.ordem.findFirst({ where: { etapa: 'ORCAMENTO_APROVADO' } }))
  if (!o) return
  const ctx: ContextoAcesso = { tenantId: o.tenantId, userId: null, ehSuperAdmin: false }
  const eventos = await comEscopo(ctx, (tx) =>
    tx.eventoOrdem.findMany({ where: { ordemId: o.id }, orderBy: { sequencia: 'asc' } }),
  )
  let anterior: string | null = null
  for (const e of eventos) {
    const esperado = hashEvento({
      ordemId: e.ordemId,
      sequencia: e.sequencia,
      etapaNova: e.etapaNova,
      tipo: e.tipo,
      autorId: e.autorId,
      criadoEm: e.criadoEm,
      payload: e.payload,
      hashAnterior: anterior,
    })
    const bate = esperado === e.hash
    const elo = e.hashAnterior === anterior
    if (!bate || !elo) {
      console.log(`\nQUEBROU na sequência ${e.sequencia} (${e.tipo})`)
      console.log(`  hash confere : ${bate}`)
      console.log(`  elo confere  : ${elo}`)
      console.log(`  payload      : ${JSON.stringify(e.payload)}`)
      console.log(`  criadoEm     : ${e.criadoEm.toISOString()} (ms=${e.criadoEm.getMilliseconds()})`)
      console.log(`  gravado      : ${e.hash.slice(0, 24)}`)
      console.log(`  recalculado  : ${esperado.slice(0, 24)}`)
      break
    }
    anterior = e.hash
  }
  console.log(`\ntotal de eventos: ${eventos.length}`)
}
void main().finally(() => prisma.$disconnect())
