import pw from '/opt/node22/lib/node_modules/playwright/index.js'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [papel,email] of [['motorista','adriano@dtechmed.com.br'],['gestora','camila@dtechmed.com.br']]) {
  const ctx = await nav.newContext()
  const p = await ctx.newPage()
  await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
  await p.fill('input[name=email]',email); await p.fill('input[type=password]',SENHA)
  await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)
  const cookies = await ctx.cookies()
  console.log(`\n${papel}: sessão? ${cookies.some(c=>c.name==='dtm_sessao')} · url ${p.url().replace(`${QA_BASE}`,'')}`)
  const r = await p.request.get(`${QA_BASE}/painel/clientes/exportar`)
  const t = await r.text()
  console.log(`  page.request  -> HTTP ${r.status()} · ${t.length} bytes · ${JSON.stringify(t.slice(0,90))}`)
  console.log(`  headers       -> ${JSON.stringify(r.headers()['content-type'])} ${JSON.stringify(r.headers()['content-disposition'])}`)
}
await nav.close()
