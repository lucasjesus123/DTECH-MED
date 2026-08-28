import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const axe = readFileSync('/opt/node22/lib/node_modules/axe-core/axe.min.js','utf8')
const sql=(q)=>execFileSync('psql',['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q],{encoding:'utf8'}).trim()
const ordem = sql("SELECT id FROM ordens ORDER BY \"abertaEm\" DESC LIMIT 1")
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage()
await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.fill('input[name=email]','camila@dtechmed.com.br'); await p.fill('input[type=password]',SENHA)
await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)
for (const url of ['/painel', '/painel/financeiro', `/painel/ordens/${ordem}`]) {
  await p.goto(`${QA_BASE}`+url,{waitUntil:'networkidle'})
  await p.addScriptTag({ content: axe })
  const r = await p.evaluate(() => window.axe.run(document, { resultTypes:['violations'] }))
  console.log('\n=== ' + url + ' ===')
  for (const v of r.violations) {
    console.log(`  ${v.impact}  ${v.id}  (${v.nodes.length})`)
    for (const n of v.nodes.slice(0,3)) {
      console.log('     alvo:', JSON.stringify(n.target))
      console.log('     ', (n.failureSummary||'').replace(/\n/g,' ').slice(0,220))
    }
  }
  if (!r.violations.length) console.log('  nenhuma')
}
await nav.close()
