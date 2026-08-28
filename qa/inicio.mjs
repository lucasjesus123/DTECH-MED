// Quem começa a usar o sistema em agosto consegue lançar as contas de julho?
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const BASE = `${QA_BASE}`
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-c',
  "select set_config('app.is_super_admin','on',false)", '-c', 'delete from lancamentos', '-c', 'delete from recorrencias'], { stdio: 'pipe' })

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email','lucas@dtechmed.com.br'); await p.fill('#senha',SENHA)
await p.getByRole('button',{name:/entrar/i}).click()
await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{timeout:20000})

const hoje = new Date().toISOString().slice(0,7)
const [a, m] = hoje.split('-').map(Number)
const anterior = m === 1 ? `${a-1}-12` : `${a}-${String(m-1).padStart(2,'0')}`

// Cadastra HOJE uma recorrência que começou em janeiro.
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Nova recorrência' }).click()
await p.fill('input[name=descricao]', 'Aluguel desde janeiro')
await p.fill('input[name=valor]', '3.000,00')
await p.fill('input[name=diaVencimento]', '10')
const campoInicio = p.locator('input[name=inicio]')
if (!(await campoInicio.count())) nao('o formulário não tem "Começa em"')
else { await campoInicio.fill(`${a}-01-01`); ok('o formulário tem "Começa em"') }
await p.getByRole('button', { name: 'Criar recorrência' }).click()
await p.waitForTimeout(2200)

const guardou = sql(`select inicio::date from recorrencias limit 1`)
guardou === `${a}-01-01` ? ok(`o início ficou gravado em ${guardou}`) : nao(`o início gravado foi "${guardou}"`)

// Gera o mês anterior.
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias&mes=${anterior}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const b = p.getByRole('button', { name: /^Gerar/ })
;(await b.count()) ? ok(`o botão de gerar aparece em ${anterior}`) : nao(`sem botão de gerar em ${anterior}`)
if (await b.count()) { await b.click(); await p.waitForTimeout(2800) }
const nAnt = sql(`select count(*) from lancamentos where vencimento >= '${anterior}-01' and vencimento < '${anterior}-01'::date + interval '1 month'`)
nAnt === '1' ? ok(`${anterior} ganhou a conta`) : nao(`${anterior} ficou com ${nAnt} conta(s)`)

// E o mês corrente continua gerável, independente.
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias&mes=${hoje}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const b2 = p.getByRole('button', { name: /^Gerar/ })
;(await b2.count()) ? ok(`o botão de gerar aparece em ${hoje}`) : nao(`sem botão de gerar em ${hoje}`)
if (await b2.count()) { await b2.click(); await p.waitForTimeout(2800) }
const nHoje = sql(`select count(*) from lancamentos where vencimento >= '${hoje}-01' and vencimento < '${hoje}-01'::date + interval '1 month'`)
nHoje === '1' ? ok(`${hoje} ganhou a conta`) : nao(`${hoje} ficou com ${nHoje} conta(s)`)

// Nada duplicou no total.
const total = sql('select count(*) from lancamentos')
total === '2' ? ok('duas contas no total — nada em dobro') : nao(`${total} contas no total`)

// Data final anterior ao início tem de ser recusada.
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Nova recorrência' }).click()
await p.fill('input[name=descricao]', 'Período invertido')
await p.fill('input[name=valor]', '100,00')
await p.fill('input[name=diaVencimento]', '5')
await p.fill('input[name=inicio]', `${a}-06-01`)
await p.fill('input[name=fim]', `${a}-03-01`)
await p.getByRole('button', { name: 'Criar recorrência' }).click()
await p.waitForTimeout(1800)
const recusou = await p.locator('p[role=alert]').first().innerText().catch(() => '')
;/anterior/i.test(recusou) ? ok(`recusou o período invertido: "${recusou.slice(0,60)}"`) : nao(`aceitou fim antes do início ("${recusou}")`)

await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
