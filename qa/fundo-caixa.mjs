// Varredura funda do Financeiro: acessibilidade COM os formulários abertos,
// uso no celular, teclado, e os estados que o axe não vê parado.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { readFileSync } from 'node:fs'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const axe = readFileSync('/opt/node22/lib/node_modules/axe-core/axe.min.js', 'utf8')
const BASE = `${QA_BASE}`

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function entrar(largura) {
  const p = await (await nav.newContext({ viewport: { width: largura, height: 900 } })).newPage()
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', 'lucas@dtechmed.com.br')
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

async function acusar(p, onde) {
  await p.addScriptTag({ content: axe })
  const r = await p.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  const serias = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  if (serias.length) {
    for (const v of serias) nao(`${onde}: ${v.id} (${v.impact}) — ${JSON.stringify(v.nodes[0].target)}`)
  } else ok(`${onde}: sem violação séria`)
}

console.log('\n1) Acessibilidade com os FORMULÁRIOS ABERTOS')
const p = await entrar(1440)

await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
// A janela de lançar é um `<dialog>` de verdade — e é justamente por isso que
// ela precisa passar pelo axe: `showModal()` torna o resto da página inerte,
// prende o foco e escurece o fundo, e um erro de rótulo aqui dentro fica com a
// pessoa sem saída até fechar.
await abrirNovaConta(p, { descricao: 'QA acessibilidade', valor: '10,00' })
await acusar(p, 'janela de lançar conta')
await p.keyboard.press('Escape')
await p.waitForTimeout(300)

await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Nova recorrência' }).click()
await p.waitForTimeout(400)
await acusar(p, 'formulário de recorrência')

console.log('\n2) O popover da baixa: abre, tem foco e não sai da tela')
// Cria uma conta para ter em que dar baixa.
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await lancarConta(p, { descricao: 'Conta de teste do popover', valor: '199,90' })

// A lista virou TABELA: a linha é `tr`, não mais `li`.
const linha = p.locator('tr').filter({ hasText: 'Conta de teste do popover' }).first()
await linha.getByRole('group').locator('summary').click()
await p.waitForTimeout(400)
await acusar(p, 'popover da baixa')

const cx = await p.evaluate(() => {
  const f = document.querySelector('[class*="caixaBaixaForm"]')
  if (!f) return null
  const r = f.getBoundingClientRect()
  return { esq: r.left, dir: r.right, larg: document.documentElement.clientWidth }
})
if (!cx) nao('o popover da baixa não apareceu no DOM')
else if (cx.esq < 0 || cx.dir > cx.larg + 1) nao(`o popover sai da tela (${cx.esq.toFixed(0)}…${cx.dir.toFixed(0)} em ${cx.larg})`)
else ok('o popover da baixa cabe na tela')

console.log('\n3) O mesmo no CELULAR (390px)')
const m = await entrar(390)
await m.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await m.waitForTimeout(600)

const rolaM = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
rolaM ? nao('a aba A pagar rola de lado no celular') : ok('a aba A pagar não rola de lado no celular')

const lm = m.locator('li').filter({ hasText: 'Conta de teste do popover' }).first()
if (await lm.count()) {
  await lm.getByRole('group').locator('summary').click()
  await m.waitForTimeout(500)
  const cm = await m.evaluate(() => {
    const f = document.querySelector('[class*="caixaBaixaForm"]')
    if (!f) return null
    const r = f.getBoundingClientRect()
    return { esq: r.left, dir: r.right, larg: document.documentElement.clientWidth }
  })
  if (!cm) nao('no celular o popover não abriu')
  else if (cm.esq < -1 || cm.dir > cm.larg + 1) nao(`no celular o popover sai da tela (${cm.esq.toFixed(0)}…${cm.dir.toFixed(0)} em ${cm.larg})`)
  else ok('no celular o popover cabe na tela')
  const rola2 = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  rola2 ? nao('com o popover aberto a página passa a rolar de lado no celular') : ok('com o popover aberto a página continua sem rolar de lado')
} else nao('a conta de teste não apareceu no celular')

// O formulário de lançar, no celular.
await m.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await abrirNovaConta(m, { descricao: 'QA celular', valor: '10,00' })
const rolaF = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
rolaF ? nao('o formulário de lançar faz a página rolar de lado no celular') : ok('o formulário de lançar cabe no celular')

console.log('\n4) Relatórios no celular: gráfico e tabela')
await m.goto(`${BASE}/painel/financeiro?aba=relatorios`, { waitUntil: 'networkidle' })
await m.waitForTimeout(700)
const rolaR = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
rolaR ? nao('os relatórios rolam de lado no celular') : ok('os relatórios não rolam de lado no celular')

console.log('\n5) Teclado: dá para percorrer a tela sem mouse')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(400)
let comFoco = 0
for (let i = 0; i < 25; i++) {
  await p.keyboard.press('Tab')
  const vis = await p.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return false
    const s = getComputedStyle(el)
    // Contorno, sombra ou borda: qualquer pista visível de onde o foco está.
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none' || el.tagName === 'A'
  })
  if (vis) comFoco++
}
comFoco >= 15
  ? ok(`${comFoco} de 25 paradas do Tab mostram onde o foco está`)
  : nao(`só ${comFoco} de 25 paradas do Tab mostram o foco`)

await nav.close()
console.log(`\n${ruins === 0 ? '✅ nada a corrigir' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins === 0 ? 0 : 1)
