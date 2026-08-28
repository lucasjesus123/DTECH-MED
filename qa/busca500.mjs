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
const p = await (await nav.newContext()).newPage()
const erros = []
p.on('pageerror', e => erros.push(String(e).slice(0,120)))
await p.goto(`${QA_BASE}/entrar`, { waitUntil:'domcontentloaded' })
await p.fill('input[name="email"]', 'camila@dtechmed.com.br')
await p.fill('input[type="password"]', SENHA)
await p.getByRole('button', { name:/entrar/i }).click()
await p.waitForTimeout(2200)

const casos = [
  ['telefone do robô', '87428500402418'],
  ['CPF com pontos',   '123.456.789-09'],
  ['celular de Lajeado','(51) 98044-9274'],
  ['número de O.S. normal','1'],
  ['nome',             'Mariana'],
]
let falhas = 0
for (const [rotulo, termo] of casos) {
  for (const tela of ['/painel/ordens?situacao=todas&busca=', '/painel/financeiro?busca=', '/painel/acompanhar?busca=']) {
    const url = `${QA_BASE}` + tela + encodeURIComponent(termo)
    const r = await p.goto(url, { waitUntil:'domcontentloaded' })
    const cod = r?.status() ?? 0
    const corpo = (await p.locator('body').textContent()) ?? ''
    const quebrou = cod >= 500 || /Minified React error|Application error|out of range/i.test(corpo)
    if (quebrou) falhas++
    console.log(`  ${quebrou ? '🔴' : '🟢'} ${cod}  ${tela.split('?')[0].padEnd(22)} ${rotulo} "${termo}"`)
  }
}
console.log(erros.length ? '\n  exceções no navegador: ' + erros.join(' | ') : '\n  nenhuma exceção no navegador')
await nav.close()
console.log(falhas === 0 ? '  TUDO CERTO\n' : `  ${falhas} TELA(S) QUEBRADA(S)\n`)
process.exit(falhas ? 1 : 0)
