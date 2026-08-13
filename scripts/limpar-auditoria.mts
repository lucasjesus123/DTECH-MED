import 'dotenv/config'
import { Client } from 'pg'

/**
 * Remove o que a auditoria criou no banco local: as 30 empresas de carga e a
 * franquia usada para provar o isolamento.
 *
 * Elas nunca existiram em produção — foram criadas aqui só para medir
 * escalabilidade com volume real e para tentar, de fato, alcançar dado de
 * outra empresa.
 */
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DIRECT_DATABASE_URL ?? '')) {
  throw new Error('Só contra banco local.')
}
const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
await c.connect()
await c.query(`SELECT set_config('app.is_super_admin','on',false)`)
const r = await c.query(`DELETE FROM tenants WHERE slug LIKE 'carga-%' OR slug = 'auditoria-vizinha'`)
console.log(`empresas de auditoria removidas: ${r.rowCount}`)
const s = await c.query(`SELECT slug, nome FROM tenants ORDER BY slug`)
console.table(s.rows)
await c.end()
