import 'dotenv/config'
import { Client } from 'pg'

/**
 * Apaga SÓ as ordens do banco de desenvolvimento, preservando empresas,
 * usuários e peças.
 *
 * Existe por um motivo específico: os eventos gravados antes da correção da
 * canonicalização do payload usam o algoritmo antigo de hash e falham a
 * verificação de integridade para sempre. Regravá-los é impossível por
 * definição — a cadeia é imutável de propósito. Então em desenvolvimento a
 * saída é recomeçar a linha do tempo.
 *
 * Roda com a conexão de OWNER porque o papel da aplicação, corretamente, não
 * tem permissão para apagar trilha de auditoria. Se este script funcionasse
 * com as credenciais do app, o endurecimento do banco estaria furado.
 *
 * NUNCA aponte para produção. O guarda abaixo recusa qualquer coisa que não
 * seja localhost.
 */
const url = process.env.DIRECT_DATABASE_URL
if (!url) throw new Error('DIRECT_DATABASE_URL ausente.')
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  throw new Error('Este script só roda contra banco local. Abortando.')
}

const cliente = new Client({ connectionString: url })
await cliente.connect()
// Depois do FORCE ROW LEVEL SECURITY, nem o dono apaga fora do escopo. A
// ferramenta declara a intenção em vez de contar com privilégio implícito.
await cliente.query(`SELECT set_config('app.is_super_admin', 'on', false)`)

// A ordem das tabelas segue as dependências. `ordens` em cascata levaria a
// maioria junto, mas ser explícito deixa claro o que está sendo descartado.
const tabelas = [
  'pagamentos',
  'faturas',
  'movimentos_estoque',
  'orcamento_itens',
  'orcamentos',
  'agendamentos',
  'assinaturas',
  'fotos',
  'documentos',
  'mensagens_whatsapp',
  'eventos_ordem',
  'outbox_jobs',
  'ordens',
]

for (const t of tabelas) {
  const r = await cliente.query(`DELETE FROM ${t}`)
  console.log(`${t}: ${r.rowCount} linha(s) removida(s)`)
}

// Zera a numeração para as novas ordens começarem em 1.
await cliente.query(`DELETE FROM contadores`)

// Devolve os saldos reservados: as reservas que os apontavam não existem mais.
await cliente.query(`UPDATE pecas SET "saldoReservado" = 0`)

await cliente.end()
console.log('\nLinha do tempo zerada. Rode: npx tsx scripts/cenario-demo.mts')
