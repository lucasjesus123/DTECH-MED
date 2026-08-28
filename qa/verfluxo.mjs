import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const F = '/tmp/claude-0/-home-user-DTECH-MED/608e303f-77e1-5cfe-99aa-9e4adfb4cb84/scratchpad/fluxo.html'
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const tema of ['light','dark']) {
  const ctx = await nav.newContext({ viewport:{width:1240,height:1000}, colorScheme: tema })
  const p = await ctx.newPage()
  const erros = []
  p.on('pageerror', e => erros.push(String(e).slice(0,120)))
  await p.goto('file://'+F, { waitUntil:'networkidle' })
  await p.waitForTimeout(800)
  const svg = await p.locator('svg').first().boundingBox()
  const textos = await p.locator('svg text').count()
  const corpo = await p.evaluate(()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());return c.textContent||''})
  const quebrado = corpo.match(/undefined|NaN|\[object Object\]/)
  // O corpo pinta o fundo? (um body transparente empresta o fundo do hospedeiro)
  const fundo = await p.evaluate(()=>getComputedStyle(document.body).backgroundColor)
  const cor   = await p.evaluate(()=>getComputedStyle(document.body).color)
  console.log(`\n  ${tema.toUpperCase()}`)
  console.log(`    svg desenhado ......... ${svg ? Math.round(svg.width)+'×'+Math.round(svg.height) : 'NÃO'}`)
  console.log(`    rótulos no desenho .... ${textos}`)
  console.log(`    fundo / texto ......... ${fundo} / ${cor}`)
  console.log(`    dado quebrado ......... ${quebrado ? 'ACHOU "'+quebrado[0]+'"' : 'nenhum'}`)
  console.log(`    erros de página ....... ${erros.length ? erros.join(' | ') : 'nenhum'}`)
  await p.screenshot({ path:`/var/tmp/qa/fluxo-${tema}.png`, fullPage:false })
  await ctx.close()
}
await nav.close()
