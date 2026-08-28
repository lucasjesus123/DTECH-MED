import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1500, height: 1050 } })).newPage()
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
await p.evaluate(() => { document.cookie = 'dtechmed_tema=escuro; path=/; max-age=31536000' })
await p.goto(`${QA_BASE}${process.argv[2]}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.screenshot({ path: process.argv[3] })
await nav.close()
