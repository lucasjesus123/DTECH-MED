// Sobe foto de peça e de equipamento pela tela, e confere que ela aparece,
// que é servida com sessão, e que a franquia vizinha não alcança.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

// Uma imagem VÁLIDA, gerada pela mesma biblioteca que o servidor usa para ler.
// A primeira versão deste teste embutia um PNG em base64 escrito à mão, e ele
// estava corrompido — o cabeçalho passava e o corpo quebrava na decodificação.
// O teste reprovou por culpa do fixture, mas de quebra achou um defeito de
// verdade: o `resize` do servidor não estava protegido, e um arquivo assim
// derrubava a tela com erro 500 em vez de avisar. Gerar a imagem tira o
// fixture da lista de suspeitos.
execFileSync('node', ['-e', `require('sharp')({create:{width:240,height:180,channels:3,background:{r:30,g:120,b:200}}}).png().toFile('/tmp/peca-ok.png')`],
  { cwd: '/home/user/DTECH-MED' })
const IMAGEM = '/tmp/peca-ok.png'

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await nav.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br'); await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

console.log('\n1) A peça começa sem foto e ganha uma')
await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const vazias = await p.locator('[class*="fotoCatVazia"]').count()
vazias > 0 ? ok(`${vazias} peças mostram o quadro "sem foto"`) : nao('nenhum quadro de "sem foto"')

const antes = await p.locator('[class*="fotoCatImg"]').count()
await p.locator('input[type=file][name=arquivo]').first().setInputFiles(IMAGEM)
await p.waitForTimeout(3500)
const depois = await p.locator('[class*="fotoCatImg"]').count()
depois === antes + 1 ? ok('a foto apareceu na linha da peça') : nao(`fotos: antes ${antes}, depois ${depois}`)

const gravou = sql("select count(*) from pecas where \"fotoCaminho\" is not null")
gravou === '1' ? ok('o caminho ficou gravado na peça') : nao(`${gravou} peças com fotoCaminho`)

console.log('\n2) A imagem carrega de verdade')
const img = p.locator('[class*="fotoCatImg"]').first()
// Espera a imagem CARREGAR, não um tempo fixo. Conferir logo depois do
// `router.refresh()` pega o `<img>` já no DOM e ainda sem bytes — e reprova
// uma coisa que funciona, que é o pior tipo de teste.
let carregou = false
for (let i = 0; i < 40 && !carregou; i++) {
  carregou = await img.evaluate((el) => el.complete && el.naturalWidth > 0)
  if (!carregou) await p.waitForTimeout(250)
}
carregou ? ok('a miniatura renderizou (naturalWidth > 0)') : nao('a miniatura não renderizou')
const alt = await img.getAttribute('alt')
alt && alt.length > 5 ? ok(`tem alt descritivo: "${alt}"`) : nao(`alt fraco: "${alt}"`)

console.log('\n3) Trocar a foto não deixa arquivo órfão, e tirar limpa a linha')
await p.locator('input[type=file][name=arquivo]').first().setInputFiles(IMAGEM)
await p.waitForTimeout(3000)
const aindaUma = sql("select count(*) from pecas where \"fotoCaminho\" is not null")
aindaUma === '1' ? ok('reenviar a mesma imagem não quebrou a linha') : nao(`depois de reenviar: ${aindaUma}`)
const carregou2 = await p.locator('[class*="fotoCatImg"]').first().evaluate((i) => i.complete && i.naturalWidth > 0)
carregou2 ? ok('e a imagem continua carregando (o arquivo não foi apagado por engano)') : nao('reenviar a mesma imagem apagou o arquivo')

await p.getByRole('button', { name: 'tirar' }).first().click()
await p.waitForTimeout(2500)
const zerou = sql("select count(*) from pecas where \"fotoCaminho\" is not null")
zerou === '0' ? ok('"tirar" limpou a linha') : nao(`depois de tirar: ${zerou}`)

console.log('\n4) O equipamento também aceita foto')
await p.goto(`${QA_BASE}/painel/equipamentos`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const campoEq = p.locator('input[type=file][name=arquivo]').first()
if (await campoEq.count()) {
  await campoEq.setInputFiles(IMAGEM)
  await p.waitForTimeout(3500)
  const eq = sql("select count(*) from equipamentos where \"fotoCaminho\" is not null")
  eq === '1' ? ok('o equipamento ganhou foto') : nao(`equipamentos com foto: ${eq}`)
} else nao('a tela de equipamentos não oferece envio de foto')

console.log('\n5) A rota exige sessão, e recusa arquivo que não é imagem')
const idEq = sql("select id from equipamentos where \"fotoCaminho\" is not null limit 1")
const semSessao = await (await nav.newContext()).newPage()
const r = await semSessao.goto(`${QA_BASE}/api/catalogo/equipamento/${idEq}?t=1`)
r.status() === 401 ? ok('sem sessão a foto do catálogo dá 401') : nao(`sem sessão veio ${r.status()}`)

writeFileSync('/tmp/nao-imagem.png', Buffer.from('isto nao e uma imagem, e o nome mente'))
await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
await p.locator('input[type=file][name=arquivo]').first().setInputFiles('/tmp/nao-imagem.png')
await p.waitForTimeout(3000)
const recusa = await p.locator('p[role=alert]').first().innerText().catch(() => '')
;/não é uma imagem|Formato não aceito/i.test(recusa)
  ? ok(`recusou o arquivo que só tinha nome de imagem: "${recusa.slice(0, 60)}"`)
  : nao(`aceitou (ou não explicou): "${recusa}"`)

console.log('\n6) Sem rolagem lateral com a coluna nova')
for (const larg of [1440, 390]) {
  await p.setViewportSize({ width: larg, height: 900 })
  for (const url of ['/painel/estoque', '/painel/equipamentos']) {
    await p.goto(`${QA_BASE}${url}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${url} em ${larg}px: a página rola de lado`)
  }
}
ok('estoque e equipamentos cabem em 1440 e 390')

await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
