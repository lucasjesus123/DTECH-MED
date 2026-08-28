import pw from '/opt/node22/lib/node_modules/playwright/index.js'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await nav.newContext({viewport:{width:1500,height:1000}})).newPage()
await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.fill('input[name=email]','fabio@dtechmed.com.br'); await p.fill('input[type=password]',SENHA)
await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)
await p.goto(`${QA_BASE}/painel/financeiro`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
console.log('ANTES:', (await p.getByRole('button').allTextContents()).map(t=>t.trim()).filter(Boolean).join(' | '))
const emitir = p.getByRole('button',{name:/emitir fatura/i}).first()
if (await emitir.count()) { await emitir.click(); await p.waitForTimeout(3000) }
console.log('DEPOIS:', (await p.getByRole('button').allTextContents()).map(t=>t.trim()).filter(Boolean).join(' | '))
const rec = p.getByRole('button',{name:/^Abrir$/}).first()
if (await rec.count()) { await rec.click(); await p.waitForTimeout(1500)
  console.log('FORM:', (await p.getByRole('button').allTextContents()).map(t=>t.trim()).filter(Boolean).join(' | '))
  console.log('rótulos:', (await p.locator('label').allTextContents()).map(t=>t.replace(/\s+/g,' ').trim()).slice(0,12).join(' | '))
}
await p.screenshot({path:'fin.png',fullPage:true})
await nav.close()
