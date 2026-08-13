import 'dotenv/config'
import { Client } from 'pg'
const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
await c.connect()
// Com FORCE ROW LEVEL SECURITY, nem o dono lê fora do escopo. Esta é uma
// ferramenta de inspeção do desenvolvedor: assume o contexto de plataforma
// explicitamente, em vez de contar com privilégio implícito.
await c.query(`SELECT set_config('app.is_super_admin', 'on', false)`)
const q = process.argv[2] ?? 'SELECT numero, etapa FROM ordens ORDER BY numero'
console.table((await c.query(q)).rows)
await c.end()
