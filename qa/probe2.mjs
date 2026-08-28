import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)))
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email','lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button',{name:/entrar/i}).click()
await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{timeout:20000})
const r = await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
console.log('HTTP', r.status())
console.log((await p.locator('body').innerText()).slice(0, 700))
await nav.close()
