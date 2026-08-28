// O cartão do Acompanhar responde "cadê meu aparelho?" sem abrir nada?
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
const erros = []
p.on('pageerror', (e) => erros.push(String(e)))

await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br')
await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

await p.goto(`${QA_BASE}/painel/acompanhar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)

const cartoes = await p.locator('[class*="cartaoAcomp"]').count()
cartoes > 0 ? ok(`${cartoes} cartões na tela`) : nao('nenhum cartão')

// 1) TODO cartão diz onde o aparelho está, em português.
const lugares = await p.locator('[class*="acompOnde"]').allInnerTexts()
lugares.length === cartoes
  ? ok(`os ${cartoes} cartões dizem onde o aparelho está`)
  : nao(`só ${lugares.length} de ${cartoes} dizem o lugar`)

const VALIDOS = /^(ainda no cliente|na rua|na oficina|entregue|devolvido sem reparo|cancelada)/
const invalidos = lugares.filter((l) => !VALIDOS.test(l.trim()))
invalidos.length === 0
  ? ok(`todas as frases são de lugar: ${[...new Set(lugares.map(l=>l.trim().split(' com ')[0]))].join(' · ')}`)
  : nao(`frase que não é lugar: ${invalidos.slice(0, 3).join(' | ')}`)

// 2) Nenhum nome técnico de etapa vazou para o lugar.
const vazou = lugares.filter((l) => /[A-Z]{4,}_|_[A-Z]{4,}/.test(l))
vazou.length === 0 ? ok('nenhum nome de etapa cru na linha do lugar') : nao(`etapa crua: ${vazou[0]}`)

// 3) Quem está com o aparelho aparece quando existe.
const comNome = lugares.filter((l) => / com /.test(l))
comNome.length > 0
  ? ok(`${comNome.length} cartões dizem com QUEM está — ex.: "${comNome[0].trim()}"`)
  : console.log('  ·  nenhum cartão tem responsável no momento (não é falha)')

// 4) A miniatura da foto carrega de verdade (não é ícone quebrado).
const minis = p.locator('[class*="acompMini"]')
const nMini = await minis.count()
if (nMini > 0) {
  const carregou = await minis.first().evaluate((i) => i.complete && i.naturalWidth > 0)
  carregou ? ok(`${nMini} miniaturas, e a primeira carregou de verdade`) : nao('a miniatura não carregou')
  const semAlt = await minis.evaluateAll((is) => is.filter((i) => i.getAttribute('alt') === null).length)
  semAlt === 0 ? ok('toda miniatura tem alt') : nao(`${semAlt} miniaturas sem alt`)
} else {
  console.log('  ·  nenhuma ordem com foto ainda (não é falha)')
}

// 5) O cartão continua abrindo a janela.
await p.locator('[class*="cartaoAcomp"]').first().click()
await p.waitForTimeout(1000)
;(await p.getByRole('dialog').count()) > 0 ? ok('o cartão ainda abre a janela') : nao('a janela não abriu')
await p.keyboard.press('Escape')
await p.waitForTimeout(400)

// 6) Celular e temas.
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((t) => { document.cookie = `dtechmed_tema=${t}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    await p.goto(`${QA_BASE}/painel/acompanhar`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(600)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema}/${larg}px: a página rola de lado`)
    const txt = await p.locator('body').innerText()
    const lixo = txt.match(/undefined|NaN|\[object Object\]/)
    if (lixo) nao(`${tema}/${larg}px: "${lixo[0]}" na tela`)
  }
  ok(`${tema}: sem rolagem lateral nem lixo, em 1440 e 390`)
}
await p.screenshot({ path: '/tmp/acompanhar.png' })

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 120)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
