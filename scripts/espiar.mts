import 'dotenv/config'
import { Client } from 'pg'
const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
await c.connect()
const q = process.argv[2] ?? 'SELECT numero, etapa FROM ordens ORDER BY numero'
console.table((await c.query(q)).rows)
await c.end()
