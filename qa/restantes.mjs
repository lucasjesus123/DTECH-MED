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
const sql=(q)=>execFileSync('psql',['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q],{encoding:'utf8'}).trim()
const equip = sql("SELECT id FROM equipamentos LIMIT 1")
let falhas=0
const ok=(o,c,d='')=>{ if(!c) falhas++; console.log(`  ${c?'🟢':'🔴'} ${o}${d?'  — '+d:''}`) }
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage()
p.on('pageerror', e=>console.log('  PAGEERROR', String(e).slice(0,160)))
await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.fill('input[name=email]','camila@dtechmed.com.br'); await p.fill('input[type=password]',SENHA)
await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)

const limpo=async(u,nome)=>{
  const r = await p.goto(`${QA_BASE}`+u,{waitUntil:'domcontentloaded'})
  await p.waitForTimeout(1200)
  const t = await p.evaluate(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove());return c.textContent||''})
  const q = t.match(/undefined|NaN|\[object Object\]|\{\{|TypeError|Minified React error/)
  ok(nome, (r?.status()??0) < 400 && !q, `HTTP ${r?.status()}${q?' — achou "'+q[0]+'"':''}`)
  return t
}
const prontuario = await limpo(`/painel/equipamentos/${equip}`, 'o prontuário do equipamento abre limpo')
ok('o prontuário mostra o histórico do aparelho', /hist[óo]rico|ordem|garantia|prontu/i.test(prontuario))
await limpo('/app', 'o aplicativo de campo (a escolha) abre limpo')
await limpo('/sem-conexao', 'a tela de "sem conexão" do PWA abre limpa')
await limpo('/painel/trocar-senha', 'a tela de trocar senha abre limpa')
await limpo('/painel/equipamentos', 'a lista de equipamentos abre limpa')

// O 404 de uma ordem que não existe: precisa ser uma tela, não uma quebra.
const r404 = await p.goto(`${QA_BASE}/painel/ordens/cmnaoexisteaaaaaaaaaaaaa`,{waitUntil:'domcontentloaded'})
await p.waitForTimeout(900)
const t404 = await p.evaluate(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());return c.textContent||''})
ok('ordem inexistente responde 404 com tela, não com quebra', (r404?.status()??0)===404 && !/TypeError|Minified React/.test(t404), `HTTP ${r404?.status()}`)
await nav.close()
console.log(falhas?`\n  ${falhas} FALHA(S)\n`:'\n  TUDO CERTO\n')
