import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext()).newPage()
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,400)))
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email','lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button',{name:/entrar/i}).click()
await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{timeout:20000})
await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
const hrefs = await p.locator('a[href^="/painel/clientes/"]').evaluateAll(as => as.map(a => a.getAttribute('href')))
console.log('links encontrados:', JSON.stringify(hrefs.slice(0, 6)))
if (hrefs.filter(h => !h.endsWith('/exportar')).length) {
  const alvo = hrefs.find(h => !h.endsWith('/exportar'))
  const r = await p.goto(`${QA_BASE}${alvo}`, { waitUntil: 'networkidle' })
  console.log('ficha HTTP', r.status())
  console.log((await p.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | '))
}
await nav.close()
