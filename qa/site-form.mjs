import pw from '/opt/node22/lib/node_modules/playwright/index.js'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const { chromium } = pw
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE', m.text().slice(0,160)) })
p.on('response', r=>{ if(r.status()>=400) console.log('HTTP', r.status(), r.url().slice(0,90)) })

await p.goto(`${QA_BASE}/`, { waitUntil:'networkidle' })
const form = p.locator('form').filter({ has: p.locator('textarea') }).first()
console.log('campos do formulário:')
for (const el of await form.locator('input,textarea,select').all()) {
  console.log('  ', await el.getAttribute('name'), '| required:', await el.getAttribute('required') !== null, '| type:', await el.getAttribute('type'))
}
await form.locator('input[name=nome]').fill('Bruna Weber Teste QA')
await form.locator('input[name=telefone]').fill('(51) 99123-4567')
await form.locator('textarea').fill('A radiofrequência faz barulho quando esquenta. Preciso de retirada.')
await form.getByRole('button', { name:/solicitar retirada/i }).click()
await p.waitForTimeout(3500)
const t = ((await p.locator('form').filter({has:p.locator('textarea')}).first().textContent()) ?? '').replace(/\s+/g,' ')
console.log('\n--- o que o formulário respondeu ---')
console.log(t.slice(0,500))
await p.screenshot({ path:'site-form.png', fullPage:false })
await nav.close()
