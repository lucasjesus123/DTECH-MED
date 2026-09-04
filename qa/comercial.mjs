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

// ---------------------------------------------------------------------------
console.log('\n7b) A ABA DE ORÇAMENTOS PASSA A CRIAR, e não só a espelhar')
// ---------------------------------------------------------------------------
// Ela mostrava o que já existe e não deixava começar nada. Quem sentava para
// orçar tinha de sair do Comercial e garimpar na lista geral de ordens quais
// estão esperando preço, no meio das que estão na bancada e das que estão na rua.
await p.goto(`${QA_BASE}/painel/contatos?aba=orcamentos`, { waitUntil: 'networkidle' })
const botaoMontar = p.getByRole('button', { name: 'Montar orçamento' })
;(await botaoMontar.count()) > 0
  ? ok('a aba de orçamentos tem o botão de montar')
  : nao('a aba de orçamentos continua só receptiva')

await botaoMontar.click()
await p.waitForTimeout(700)

/**
 * A lista tem de trazer EXATAMENTE as ordens em que fazer preço faz sentido.
 *
 * Uma lista larga demais devolveria o garimpo que o botão veio resolver; uma
 * estreita demais esconderia trabalho. As quatro etapas abaixo são as que o
 * servidor promete, e a conferência é contra o banco — não contra a tela.
 */
const esperandoNoBanco = sql(`select count(*) from ordens
  where etapa in ('RECEBIDO_NA_EMPRESA','EM_ANALISE','ORCAMENTO_INTERNO','ORCAMENTO_REPROVADO')`)
const naListaMontar = await p.locator('table', { hasText: 'PARADA HÁ' }).locator('tbody tr').count()
  .catch(() => 0)
const linhasMontar = naListaMontar || (await p.locator('a[href*="#orcamento"]').count())
String(linhasMontar) === esperandoNoBanco
  ? ok(`a lista traz as ${esperandoNoBanco} O.S. que esperam preço — nem mais, nem menos`)
  : nao(`a lista não bate com o banco: tela ${linhasMontar} × banco ${esperandoNoBanco}`)

// O botão leva ao lugar onde o orçamento é montado DE VERDADE — a âncora
// dentro da O.S., com as peças do estoque, o laudo e a garantia.
const destino = await p.locator('a[href*="#orcamento"]').first().getAttribute('href').catch(() => null)
;/\/painel\/ordens\/[a-z0-9]+#orcamento/.test(String(destino))
  ? ok(`"Montar" leva à O.S., na âncora do orçamento: ${destino}`)
  : nao(`o botão de montar não leva ao orçamento da O.S.: ${destino}`)

// E a O.S. de destino ABRE, com o bloco do orçamento presente. Um link que
// leva a uma âncora que não existe é pior que link nenhum.
if (destino) {
  await p.goto(`${QA_BASE}${destino}`, { waitUntil: 'networkidle' })
  const temBloco = (await p.locator('#orcamento').count()) > 0
  temBloco
    ? ok('a âncora existe na ficha da O.S. — o link não cai no vazio')
    : nao('a O.S. não tem a âncora #orcamento')
}

// O contrário também: "anotar contato" não pode aparecer na aba de orçamentos,
// e "montar orçamento" não pode aparecer na de contatos. Botão fora de assunto
// é o que faz a pessoa parar de ler os botões.
await p.goto(`${QA_BASE}/painel/contatos?aba=orcamentos`, { waitUntil: 'networkidle' })
const anotarNaErrada = await p.getByRole('button', { name: 'Anotar contato' }).count()
await p.goto(`${QA_BASE}/painel/contatos`, { waitUntil: 'networkidle' })
const montarNaErrada = await p.getByRole('button', { name: 'Montar orçamento' }).count()
const anotarNaCerta = await p.getByRole('button', { name: 'Anotar contato' }).count()
anotarNaErrada === 0 && montarNaErrada === 0 && anotarNaCerta === 1
  ? ok('cada aba tem o SEU botão de criar, e só ele')
  : nao(`botões trocados de aba — anotar/orç:${anotarNaErrada} montar/cont:${montarNaErrada} anotar/cont:${anotarNaCerta}`)

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
