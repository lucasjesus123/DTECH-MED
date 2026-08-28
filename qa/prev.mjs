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
const p = await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.fill('input[name=email]','camila@dtechmed.com.br'); await p.fill('input[type=password]',SENHA)
await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)
await p.goto(`${QA_BASE}/painel/preventiva`,{waitUntil:'domcontentloaded'})
await p.waitForTimeout(1200)
console.log('botões na tela:', await p.getByRole('button').allTextContents())
await p.getByRole('button',{name:'Novo contrato'}).click()
await p.waitForTimeout(1500)
const t = (await p.locator('body').textContent()) ?? ''
console.log('--- depois do clique, o formulário apareceu? ---')
console.log('tem "Novo contrato de preventiva":', t.includes('Novo contrato de preventiva'))
console.log('tem "Primeira visita":', t.includes('Primeira visita'))
console.log('campos de formulário:', await p.locator('form input, form select').count())
console.log('--- trecho ---')
console.log(t.replace(/\s+/g,' ').slice(0,700))
await p.screenshot({path:'prev.png', fullPage:true})
await nav.close()
