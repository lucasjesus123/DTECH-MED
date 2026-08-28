// O funil de orçamentos: mostra o que espera resposta, na ordem da urgência,
// e a taxa só conta o que foi respondido.
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

const texto = async () => (await p.locator('body').innerText()).toLowerCase()

console.log('\n1) O menu diz "Comercial", e a tela tem duas abas')
await p.goto(`${QA_BASE}/painel/contatos`, { waitUntil: 'networkidle' })
;(await p.getByRole('link', { name: 'Comercial', exact: true }).count()) > 0
  ? ok('o item de menu virou "Comercial"') : nao('o menu não diz "Comercial"')
for (const a of ['Contatos do site', 'Orçamentos']) {
  ;(await p.getByRole('link', { name: a, exact: true }).count()) > 0 ? ok(`aba "${a}"`) : nao(`sem aba "${a}"`)
}

console.log('\n2) O funil abre e mostra os cinco números')
await p.getByRole('link', { name: 'Orçamentos', exact: true }).click()
await p.waitForURL(/aba=orcamentos/, { timeout: 15000 })
await p.waitForLoadState('networkidle')
const t = await texto()
for (const n of ['Esperando um sim', 'Passou da validade', 'Virou serviço', 'De cada 100, viram sim', 'O cliente responde em']) {
  t.includes(n.toLowerCase()) ? ok(`indicador "${n}"`) : nao(`sem indicador "${n}"`)
}
// A busca é feita no texto ORIGINAL e com maiúsculas: "fiNANceiro" contém
// "nan", e procurar em minúsculas acusava a própria palavra do menu. `NaN`
// tem caixa própria, e as bordas de palavra evitam o resto.
const bruto = await p.locator('body').innerText()
const lixo = bruto.match(/\bundefined\b|\bNaN\b|\[object Object\]/)
lixo ? nao(`"${lixo[0]}" na tela`) : ok('nenhum lixo de renderização')

console.log('\n3) "Esperando um sim" bate com o banco')
// A ÚLTIMA versão de cada número, só ENVIADO, nos últimos 90 dias.
const esperado = sql(`
  select coalesce(sum("totalCentavos"),0) from (
    select distinct on (numero) status::text as st, "totalCentavos"
      from orcamentos
     where status::text in ('ENVIADO','APROVADO','REPROVADO','EXPIRADO')
       and "criadoEm" > now() - interval '90 days'
     order by numero, versao desc) u
   where u.st = 'ENVIADO'`)
const fmt = (Number(esperado) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
t.includes(fmt.toLowerCase())
  ? ok(`"Esperando um sim" mostra R$ ${fmt}, igual ao banco`)
  : nao(`o banco diz R$ ${fmt} e a tela não mostra`)

console.log('\n4) Só a ÚLTIMA versão de cada orçamento entra na lista')
const numeros = await p.locator('[class*="caixaQuando"] strong').allInnerTexts()
const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i)
repetidos.length === 0
  ? ok(`${numeros.length} orçamentos, nenhum número repetido`)
  : nao(`número repetido na lista: ${repetidos[0]}`)

console.log('\n5) Rascunho e revisão interna NÃO aparecem')
const internos = sql("select count(*) from orcamentos where status::text in ('RASCUNHO','EM_REVISAO')")
const naTela = await p.locator('li[class*="caixaItem"]').count()
const doFunil = sql(`
  select count(*) from (
    select distinct on (numero) status::text as st from orcamentos
     where status::text in ('ENVIADO','APROVADO','REPROVADO','EXPIRADO')
       and "criadoEm" > now() - interval '90 days'
     order by numero, versao desc) u`)
naTela === Number(doFunil)
  ? ok(`${naTela} na tela = ${doFunil} do funil (e ${internos} internos ficaram de fora)`)
  : nao(`tela mostra ${naTela}, o funil tem ${doFunil}`)

console.log('\n6) O filtro por situação funciona')
await p.goto(`${QA_BASE}/painel/contatos?aba=orcamentos&fase=APROVADO`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
const selos = await p.locator('[class*="caixaValor"] [class*="tag"]').allInnerTexts()
const foraDoFiltro = selos.filter((x) => !/aprovado/i.test(x))
foraDoFiltro.length === 0
  ? ok(`o filtro "Aprovados" trouxe ${selos.length} e nenhum fora`)
  : nao(`veio fora do filtro: ${foraDoFiltro[0]}`)

console.log('\n7) A aba de contatos continua funcionando')
await p.goto(`${QA_BASE}/painel/contatos`, { waitUntil: 'networkidle' })
const t2 = await texto()
t2.includes('aguardando resposta') ? ok('a aba de contatos ainda mostra o que era dela') : nao('a aba de contatos quebrou')

console.log('\n8) Os dois temas, em 1440 e 390')
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    for (const url of ['/painel/contatos', '/painel/contatos?aba=orcamentos']) {
      await p.goto(`${QA_BASE}${url}`, { waitUntil: 'networkidle' })
      await p.waitForTimeout(500)
      const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      if (rola) nao(`${url} em ${tema}/${larg}px: rola de lado`)
    }
  }
  ok(`${tema}: as duas abas cabem em 1440 e 390`)
}
await p.setViewportSize({ width: 1500, height: 1100 })
await p.goto(`${QA_BASE}/painel/contatos?aba=orcamentos`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/comercial.png', fullPage: true })

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
