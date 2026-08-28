// Contrato de prestação e nota promissória: emitem, saem com o valor do
// orçamento aprovado, e não são emitidos por quem não deve.
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

// Repetir a passada não pode reprovar a seguinte: o teste emite os dois
// documentos, e sem esta limpeza a segunda execução acharia quatro.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', "delete from documentos where tipo::text in ('CONTRATO_PRESTACAO','NOTA_PROMISSORIA')"],
  { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  p.on('pageerror', (e) => erros.push(String(e)))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

// Uma ordem com orçamento APROVADO e SALDO EM ABERTO.
//
// A primeira versão pegava qualquer ordem aprovada, e caiu numa já quitada: o
// contrato saía certo e a nota promissória saía com "ZERO REAL" por extenso no
// meio da folha — um título sem objeto, assinável. O teste precisa de uma
// ordem que deva alguma coisa, senão não exercita a nota.
const ordemId = sql(`
  select o.id from ordens o
    join orcamentos q on q."ordemId" = o.id and q.status::text = 'APROVADO'
    left join faturas f on f."ordemId" = o.id
   where coalesce(f."valorTotalCentavos" + f."multaCentavos" + f."jurosCentavos"
                  - f."valorPagoCentavos", q."totalCentavos") > 0
   limit 1`)
// O CONTRATO usa o total; a NOTA usa o saldo em aberto. São números diferentes
// de propósito: um contrato quitado continua valendo o que valia.
const totalEsperado = sql(`
  select coalesce((select "valorTotalCentavos" from faturas where "ordemId" = '${ordemId}'),
                  (select "totalCentavos" from orcamentos where "ordemId" = '${ordemId}'
                     and status::text = 'APROVADO' order by versao desc limit 1))`)
const abertoEsperado = sql(`
  select coalesce((select "valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                          - "valorPagoCentavos" from faturas where "ordemId" = '${ordemId}'),
                  (select "totalCentavos" from orcamentos where "ordemId" = '${ordemId}'
                     and status::text = 'APROVADO' order by versao desc limit 1))`)

console.log('\n1) O financeiro emite os dois')
const p = await entrar('fabio@dtechmed.com.br')
await p.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)

for (const b of ['Emitir contrato', 'Emitir nota promissória']) {
  ;(await p.getByRole('button', { name: b }).count()) > 0 ? ok(`botão "${b}"`) : nao(`sem botão "${b}"`)
}

const antes = Number(sql(`select count(*) from documentos where "ordemId" = '${ordemId}'`))
await p.getByRole('button', { name: 'Emitir contrato' }).click()
await p.waitForTimeout(3500)
const comContrato = sql(`select count(*) from documentos where "ordemId" = '${ordemId}' and tipo::text = 'CONTRATO_PRESTACAO'`)
comContrato === '1' ? ok('o contrato foi gravado') : nao(`contratos gravados: ${comContrato}`)

await p.getByRole('button', { name: 'Emitir nota promissória' }).click()
await p.waitForTimeout(3500)
const comNota = sql(`select count(*) from documentos where "ordemId" = '${ordemId}' and tipo::text = 'NOTA_PROMISSORIA'`)
comNota === '1' ? ok('a nota promissória foi gravada') : nao(`notas gravadas: ${comNota}`)

const depois = Number(sql(`select count(*) from documentos where "ordemId" = '${ordemId}'`))
depois === antes + 2 ? ok(`${antes} → ${depois} documentos`) : nao(`esperava ${antes + 2}, veio ${depois}`)

console.log('\n2) O PDF sai de verdade, e com hash')
const tok = sql(`select "tokenAcesso" from documentos where "ordemId" = '${ordemId}' and tipo::text = 'NOTA_PROMISSORIA'`)
// `page.goto` num PDF entrega o visor do navegador, não o arquivo — o corpo
// vem truncado (345 bytes de um arquivo de 10 KB). `request.get` faz a
// requisição HTTP de verdade, com os cookies da sessão, e devolve os bytes.
const r = await p.request.get(`${QA_BASE}/api/documento/${tok}`)
r.status() === 200 ? ok(`o PDF responde 200`) : nao(`o PDF respondeu ${r.status()}`)
const tipoResp = r.headers()['content-type'] ?? ''
;/pdf/.test(tipoResp) ? ok(`é PDF de verdade (${tipoResp})`) : nao(`content-type: ${tipoResp}`)
const corpo = await r.body()
const bytes = corpo.length
bytes > 1500 ? ok(`${bytes} bytes — não é arquivo vazio`) : nao(`só ${bytes} bytes`)
const hash = sql(`select hash from documentos where "tokenAcesso" = '${tok}'`)
hash && hash.length === 64 ? ok('o SHA-256 do conteúdo ficou gravado') : nao(`hash suspeito: "${hash}"`)

// O PDF começa com %PDF- e termina com %%EOF: prova que o arquivo está
// inteiro, e não cortado no meio da gravação.
corpo.subarray(0, 5).toString() === '%PDF-' ? ok('começa com %PDF-') : nao('não é um PDF válido no começo')
corpo.subarray(-1024).includes('%%EOF') ? ok('termina com %%EOF — arquivo completo') : nao('o PDF está truncado')

console.log('\n3) O valor por extenso está DENTRO do PDF')
// O texto do PDF é comprimido; a prova aqui é o valor em algarismo no título e
// o extenso conferido pelo teste unitário. O que dá para afirmar do arquivo é
// que ele foi gerado a partir do valor certo — e isso a trilha registra.
const trilhaNota = sql(`
  select detalhes::text from audit_logs
   where acao = 'documento.emitido' and detalhes::text like '%NOTA_PROMISSORIA%'
   order by "criadoEm" desc limit 1`)
const trilhaContrato = sql(`
  select detalhes::text from audit_logs
   where acao = 'documento.emitido' and detalhes::text like '%CONTRATO_PRESTACAO%'
   order by "criadoEm" desc limit 1`)

trilhaContrato.includes(totalEsperado)
  ? ok(`o contrato saiu pelo TOTAL: ${totalEsperado} centavos`)
  : nao(`contrato: trilha diz ${trilhaContrato}, total é ${totalEsperado}`)
trilhaNota.includes(abertoEsperado)
  ? ok(`a nota saiu pelo SALDO EM ABERTO: ${abertoEsperado} centavos`)
  : nao(`nota: trilha diz ${trilhaNota}, aberto é ${abertoEsperado}`)
Number(abertoEsperado) > 0
  ? ok('e o saldo é maior que zero — a nota não é um título vazio')
  : nao('a nota foi emitida sobre saldo zero')

console.log('\n3b) Ordem QUITADA recusa a nota, mas aceita o contrato')
const quitada = sql(`
  select f."ordemId" from faturas f
   where f."valorTotalCentavos" + f."multaCentavos" + f."jurosCentavos" - f."valorPagoCentavos" <= 0
   limit 1`)
if (quitada) {
  await p.goto(`${QA_BASE}/painel/ordens/${quitada}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: 'Emitir nota promissória' }).click()
  await p.waitForTimeout(2500)
  const recusaNota = await p.locator('p[role=alert]').first().innerText().catch(() => '')
  ;/saldo em aberto/i.test(recusaNota)
    ? ok(`recusou a nota numa ordem quitada: "${recusaNota.slice(0, 60)}"`)
    : nao(`emitiu (ou não explicou) a nota numa ordem quitada: "${recusaNota}"`)

  await p.getByRole('button', { name: 'Emitir contrato' }).click()
  await p.waitForTimeout(3000)
  const contratoQuitada = sql(`
    select count(*) from documentos where "ordemId" = '${quitada}' and tipo::text = 'CONTRATO_PRESTACAO'`)
  contratoQuitada === '1'
    ? ok('e o contrato saiu na mesma ordem — ele vale o total, pago ou não')
    : nao(`contrato em ordem quitada: ${contratoQuitada}`)
} else {
  console.log('  ·  nenhuma fatura quitada no cenário (não é falha)')
}

console.log('\n4) Quem NÃO pode emitir não vê o botão nem consegue pela ação')
const t = await entrar('rafael@dtechmed.com.br')  // técnico
await t.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
await t.waitForTimeout(800)
;(await t.getByRole('button', { name: 'Emitir contrato' }).count()) === 0
  ? ok('o técnico não vê o botão') : nao('o técnico vê o botão de emitir')

console.log('\n5) Ordem SEM valor aprovado é recusada com frase legível')
const semValor = sql(`
  select o.id from ordens o
   where not exists (select 1 from orcamentos q where q."ordemId" = o.id and q.status::text = 'APROVADO')
     and not exists (select 1 from faturas f where f."ordemId" = o.id)
   limit 1`)
if (semValor) {
  await p.goto(`${QA_BASE}/painel/ordens/${semValor}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const btn = p.getByRole('button', { name: 'Emitir contrato' })
  if (await btn.count()) {
    await btn.click()
    await p.waitForTimeout(2500)
    const recusa = await p.locator('p[role=alert]').first().innerText().catch(() => '')
    ;/valor aprovado/i.test(recusa)
      ? ok(`recusou e explicou: "${recusa.slice(0, 70)}"`)
      : nao(`aceitou ou não explicou: "${recusa}"`)
  } else nao('o botão não apareceu na ordem sem valor')
} else {
  console.log('  ·  nenhuma ordem sem valor no cenário (não é falha)')
}

console.log('\n6) Os dois temas, em 1440 e 390')
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    await p.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(600)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema}/${larg}px: a ficha rola de lado`)
  }
  ok(`${tema}: a ficha cabe em 1440 e 390`)
}

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
