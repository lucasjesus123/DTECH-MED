import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { writeFileSync } from 'node:fs'
const { chromium } = pw
const QA_BASE = 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHUlEQVQIW2NkYGD4z8DAwMgABXAGNgGwSgwVAFbmAgWjJ1uZAAAAAElFTkSuQmCC','base64')
writeFileSync('/tmp/peca-teste.png', PNG)
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)))
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,300)) })
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email','lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button',{name:/entrar/i}).click()
await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{timeout:20000})
await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
console.log('inputs de arquivo:', await p.locator('input[type=file][name=arquivo]').count())
await p.locator('input[type=file][name=arquivo]').first().setInputFiles('/tmp/peca-teste.png')
await p.waitForTimeout(4000)
const alertas = await p.locator('[role=alert]').allInnerTexts()
console.log('alertas:', JSON.stringify(alertas.slice(0,4)))
console.log('trecho:', (await p.locator('body').innerText()).slice(0, 300).replace(/\n+/g,' | '))
await nav.close()
