// A ficha do cliente responde "quem é este cliente para nós?" — e o link do
// Financeiro finalmente leva a algum lugar.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
const erros = []
p.on('pageerror', (e) => erros.push(String(e)))
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

console.log('\n1) A lista leva à ficha')
await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
// `a[href^="/painel/clientes/"]` também casa com `/painel/clientes/exportar`,
// que é um link de download e não navega. O seletor precisa apontar o que ele
// quer, e não o que se parece com isso.
const link = p.locator('tbody a[href^="/painel/clientes/"]:not([href$="/exportar"])').first()
;(await link.count()) ? ok('o nome do cliente é link') : nao('o nome do cliente não leva a lugar nenhum')
const nomeClicado = (await link.innerText()).trim()
await link.click()
// `waitForURL` e não `waitForLoadState`: a navegação do Next é do lado do
// cliente, e "networkidle" volta antes de a URL trocar — o teste conferia o
// endereço velho e reprovava uma coisa que funciona.
let abriu = true
try {
  await p.waitForURL(/\/painel\/clientes\/[a-z0-9]{10,}/, { timeout: 15000 })
} catch { abriu = false }
abriu ? ok(`abriu a ficha de "${nomeClicado}"`) : nao(`foi parar em ${p.url()}`)
await p.waitForLoadState('networkidle')

console.log('\n2) A ficha mostra dinheiro, trabalho e cadastro')
const corpo = await p.locator('body').innerText()
// SEM DIFERENCIAR CAIXA: `innerText` devolve o texto como ele é PINTADO, e os
// rótulos do painel usam `text-transform: uppercase`. Comparar com o texto do
// código reprovava rótulos que estão na tela — o teste estava conferindo CSS
// sem querer.
const temTexto = (t) => corpo.toLowerCase().includes(t.toLowerCase())
for (const rot of ['Deve agora', 'Vencido', 'Já pagou', 'Ordens', 'Aparelhos']) {
  temTexto(rot) ? ok(`indicador "${rot}"`) : nao(`sem indicador "${rot}"`)
}
for (const bloco of ['Aparelhos deste cliente', 'Contratos de manutenção', 'Últimas ordens', 'Cadastro']) {
  temTexto(bloco) ? ok(`bloco "${bloco}"`) : nao(`sem bloco "${bloco}"`)
}
const lixo = corpo.match(/undefined|NaN|\[object Object\]/)
lixo ? nao(`"${lixo[0]}" na tela`) : ok('nenhum lixo de renderização')

console.log('\n3) O "Deve agora" bate com o banco')
const idCliente = p.url().split('/').pop().split('?')[0]
const noBanco = sql(`
  select coalesce((select sum("valorTotalCentavos"+"multaCentavos"+"jurosCentavos"-"valorPagoCentavos")
     from faturas where "clienteId"='${idCliente}' and status in ('ABERTA','PARCIAL')),0)
   + coalesce((select sum("valorCentavos") from lancamentos
     where "clienteId"='${idCliente}' and tipo='RECEBER' and "pagoEm" is null),0)`)
const esperado = (Number(noBanco) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
corpo.includes(esperado)
  ? ok(`"Deve agora" mostra R$ ${esperado}, igual ao banco`)
  : nao(`o banco diz R$ ${esperado} e a tela não mostra esse número`)

console.log('\n4) O link do Financeiro leva à ficha (ele apontava para o vazio)')
await p.goto(`${QA_BASE}/painel/financeiro?aba=relatorios`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const devedor = p.locator('a[href^="/painel/clientes/"]:not([href$="/exportar"])').first()
if (await devedor.count()) {
  const r = await p.goto(`${QA_BASE}${await devedor.getAttribute('href')}`, { waitUntil: 'networkidle' })
  r.status() === 200 ? ok('o link de "quem está segurando o caixa" abre a ficha') : nao(`o link deu ${r.status()}`)
} else {
  console.log('  ·  ninguém devendo no cenário (não é falha)')
}

console.log('\n5) Cliente de outra franquia dá 404, não 500 nem vazamento')
const r404 = await p.goto(`${QA_BASE}/painel/clientes/cl00000000000000000000000`, { waitUntil: 'domcontentloaded' })
r404.status() === 404 ? ok('id inexistente dá 404') : nao(`id inexistente deu ${r404.status()}`)

console.log('\n6) Os dois temas, em 1440 e 390')
for (const tema of ['escuro', 'claro']) {
  await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
  await p.evaluate((t) => { document.cookie = `dtechmed_tema=${t}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    await p.goto(`${QA_BASE}/painel/clientes/${idCliente}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema}/${larg}px: a ficha rola de lado`)
  }
  ok(`${tema}: a ficha cabe em 1440 e 390`)
}
await p.setViewportSize({ width: 1500, height: 1100 })
await p.goto(`${QA_BASE}/painel/clientes/${idCliente}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/cliente.png', fullPage: true })

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
