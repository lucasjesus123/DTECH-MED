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
const p = await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.fill('input[name=email]','ana@dtechmed.com.br'); await p.fill('input[type=password]',SENHA)
await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2500)
console.log('depois do login:', p.url())
const t = await p.evaluate(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());return (c.textContent||'').replace(/\s+/g,' ').slice(0,300)})
console.log('tela:', t)
await p.goto(`${QA_BASE}/painel/ordens/nova`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
console.log('ordens/nova:', p.url())
console.log('formulários:', await p.locator('form').count(), '| textarea[name=defeito]:', await p.locator('textarea[name=defeito]').count())
const t2 = await p.evaluate(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());return (c.textContent||'').replace(/\s+/g,' ').slice(0,400)})
console.log('tela:', t2)
await nav.close()
