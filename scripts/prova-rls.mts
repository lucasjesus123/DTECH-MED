import 'dotenv/config'
import { Client } from 'pg'

/** Prova empírica: o dono da tabela enxerga linhas de todas as empresas? */
const owner = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
const app = new Client({ connectionString: process.env.DATABASE_URL!.replace(/\?.*$/, '') })
await owner.connect(); await app.connect()

// Depois do FORCE ROW LEVEL SECURITY, nem o dono lê fora do escopo — por isso
// a lista de empresas vem pelo contexto de Super Admin, e não "de graça".
await owner.query(`BEGIN`)
await owner.query(`SELECT set_config('app.is_super_admin', 'on', true)`)
const tenants = await owner.query(`SELECT id, slug FROM tenants ORDER BY slug`)
await owner.query(`COMMIT`)
console.log('empresas no banco:', tenants.rows.map(r => r.slug).join(', ') || '(nenhuma)')

const total = await owner.query(`SELECT count(*)::int n FROM ordens`)
console.log(`\nDONO (dtechmed_owner), sem definir app.tenant_id:`)
console.log(`  ordens visíveis: ${total.rows[0].n}`)

const alvo = tenants.rows[0]?.id ?? ''
await app.query(`BEGIN`)
await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [alvo])
const comEscopo = await app.query(`SELECT count(*)::int n FROM ordens`)
console.log(`\nAPP (dtechmed_app) com escopo da empresa ${tenants.rows[0]?.slug}:`)
console.log(`  ordens visíveis: ${comEscopo.rows[0].n}`)
await app.query(`ROLLBACK`)

await app.query(`BEGIN`)
const semEscopo = await app.query(`SELECT count(*)::int n FROM ordens`)
console.log(`\nAPP sem nenhum escopo definido:`)
console.log(`  ordens visíveis: ${semEscopo.rows[0].n}  ${semEscopo.rows[0].n === 0 ? '(RLS filtrou tudo)' : '(VAZAMENTO)'}`)
await app.query(`ROLLBACK`)

// A aplicação consegue ALTERAR uma assinatura já coletada?
console.log(`\nAPP tentando alterar o nome de quem assinou:`)
await owner.query(`BEGIN`)
await owner.query(`SELECT set_config('app.is_super_admin', 'on', true)`)
const a = await owner.query(`SELECT id, "tenantId", "assinanteNome" FROM assinaturas LIMIT 1`)
await owner.query(`COMMIT`)
if (!a.rows[0]) console.log('  (não há assinatura no banco para testar)')
else {
  await app.query(`BEGIN`)
  await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.rows[0].tenantId])
  try {
    const u = await app.query(`UPDATE assinaturas SET "assinanteNome" = 'ALTERADO' WHERE id = $1`, [a.rows[0].id])
    console.log(`  linhas alteradas: ${u.rowCount}  ${u.rowCount ? '← CONSEGUIU' : '← barrado'}`)
  } catch (e) { console.log('  barrado:', (e as Error).message) }
  await app.query(`ROLLBACK`)

  console.log(`\nAPP tentando alterar um evento da linha do tempo:`)
  await app.query(`BEGIN`)
  await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.rows[0].tenantId])
  try {
    const u = await app.query(`UPDATE eventos_ordem SET titulo = 'ALTERADO' WHERE "tenantId" = $1`, [a.rows[0].tenantId])
    console.log(`  linhas alteradas: ${u.rowCount}  ← CONSEGUIU`)
  } catch (e) { console.log('  barrado:', (e as Error).message.split('\n')[0]) }
  await app.query(`ROLLBACK`)
}

await owner.end(); await app.end()
