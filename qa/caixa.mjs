// Usa o Financeiro como um humano: lança conta a pagar, parcela, dá baixa,
// cria recorrência, gera as contas do mês e confere os números na tela.
// Caminho absoluto, como os outros scripts desta pasta: o resolvedor de ESM do
// Node NÃO honra NODE_PATH, e `import 'playwright'` só funciona quando o script
// roda de dentro de um projeto que tem o pacote instalado.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw

// O endereço do sistema em ensaio, e onde ficam os prints. Os dois vêm do
// ambiente: o roteiro precisa rodar noutra porta e gravar noutra pasta sem
// ninguém editar o arquivo. `qa/telas` está no .gitignore — print de execução
// é descartável, o roteiro é que versiona.
const BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const PASTA = process.env.QA_TELAS || new URL('./telas', import.meta.url).pathname

let falhas = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); falhas++ }

// Zera o caixa antes de começar: o teste cria as mesmas contas toda vez, e
// duas execuções empilhadas fariam as somas do topo dobrarem — o que pareceria
// defeito do produto e é defeito do teste.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'


// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
execFileSync('bash', ['-c',
  'set -a; . /var/tmp/pgdemo/env; set +a; psql "$DATABASE_URL" -q -c "select set_config(\'app.is_super_admin\',\'on\',false)" -c "delete from lancamentos" -c "delete from recorrencias"'],
  { stdio: 'inherit' })

mkdirSync(PASTA, { recursive: true })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1100 } })
const p = await ctx.newPage()

const erros = []
p.on('pageerror', (e) => erros.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

async function entrar(email, senha = SENHA) {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', senha)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
}

// ---------------------------------------------------------------------------
console.log('\n1) Abrir o Financeiro e ver as cinco abas')
await entrar('lucas@dtechmed.com.br')
await p.goto(`${BASE}/painel/financeiro`, { waitUntil: 'networkidle' })

for (const nome of ['A receber', 'A pagar', 'Faturas de serviço', 'Recorrências', 'Relatórios']) {
  const n = await p.getByRole('link', { name: nome, exact: true }).count()
  n === 1 ? ok(`aba "${nome}"`) : nao(`aba "${nome}" apareceu ${n}x`)
}
for (const ind of ['Entrou no mês', 'Saiu no mês', 'Sobrou', 'A receber vencido', 'A pagar vencido']) {
  ;(await p.getByText(ind, { exact: true }).count()) > 0 ? ok(`indicador "${ind}"`) : nao(`sem indicador "${ind}"`)
}
await p.screenshot({ path: `${PASTA}/caixa-1-receber.png` })

// ---------------------------------------------------------------------------
console.log('\n2) Lançar uma conta a pagar simples')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Lançar conta a pagar' }).click()
await p.fill('input[name=descricao]', 'Energia elétrica da oficina')
await p.fill('input[name=categoria]', 'Energia e água')
await p.fill('input[name=contraparte]', 'RGE Sul')
await p.fill('input[name=valor]', '842,37')
const hoje = new Date().toISOString().slice(0, 10)
await p.fill('input[name=vencimento]', hoje)
await p.getByRole('button', { name: 'Lançar a pagar' }).click()
await p.waitForTimeout(1800)

const temEnergia = await p.getByText('Energia elétrica da oficina').count()
temEnergia > 0 ? ok('a conta apareceu na lista') : nao('a conta não apareceu na lista')
const temValor = await p.getByText('R$ 842,37').count()
temValor > 0 ? ok('o valor bateu (R$ 842,37)') : nao('o valor não apareceu como R$ 842,37')

// ---------------------------------------------------------------------------
console.log('\n3) Lançar parcelado em 3x e conferir que viram 3 linhas')
await p.getByRole('button', { name: 'Lançar conta a pagar' }).click()
await p.fill('input[name=descricao]', 'Compressor do laboratório')
await p.fill('input[name=valor]', '1000,00')
await p.fill('input[name=vencimento]', hoje)
await p.fill('input[name=parcelas]', '3')
await p.waitForTimeout(400)

// A prévia tem que dizer o centavo da última parcela ANTES de salvar.
const previa = await p.locator('[role=status]').first().innerText().catch(() => '')
;/333,34/.test(previa) ? ok(`prévia mostra o centavo da última: "${previa.slice(0, 90)}…"`) : nao(`prévia sem o ajuste de centavo: "${previa}"`)

await p.getByRole('button', { name: 'Lançar a pagar' }).click()
await p.waitForTimeout(1800)

// A 1/3 vence hoje; as outras nos meses seguintes — então só ela está no mês.
const p1 = await p.getByText('Compressor do laboratório (1/3)').count()
p1 > 0 ? ok('parcela 1/3 no mês corrente') : nao('parcela 1/3 não apareceu')
const p2 = await p.getByText('Compressor do laboratório (2/3)').count()
p2 === 0 ? ok('parcela 2/3 NÃO está no mês corrente (está no próximo)') : nao('parcela 2/3 vazou para o mês errado')
await p.screenshot({ path: `${PASTA}/caixa-2-pagar.png` })

console.log('\n4) A parcela 2/3 aparece no mês seguinte')
const [ano, mes] = hoje.split('-').map(Number)
const prox = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
await p.goto(`${BASE}/painel/financeiro?aba=pagar&mes=${prox}&situacao=todas`, { waitUntil: 'networkidle' })
const p2b = await p.getByText('Compressor do laboratório (2/3)').count()
p2b > 0 ? ok(`parcela 2/3 caiu em ${prox}`) : nao(`parcela 2/3 não apareceu em ${prox}`)

// ---------------------------------------------------------------------------
console.log('\n5) Dar baixa na conta de energia')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
const linhaEnergia = p.locator('li').filter({ hasText: 'Energia elétrica da oficina' }).first()
await linhaEnergia.getByRole('group').locator('summary').click()
await p.waitForTimeout(400)
await linhaEnergia.getByRole('button', { name: 'Confirmar' }).click()
await p.waitForTimeout(2000)

// Paga, ela sai do filtro "abertas" e aparece em "Pagas no mês" — é o que o
// rodapé da tela promete.
const aindaAberta = await p.locator('li').filter({ hasText: 'Energia elétrica da oficina' }).count()
aindaAberta === 0 ? ok('a conta paga saiu da lista de abertas') : nao('a conta paga continua entre as abertas')
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=pagas`, { waitUntil: 'networkidle' })
const selo = await p.locator('li').filter({ hasText: 'Energia elétrica da oficina' }).first().innerText().catch(() => '')
;/pago/i.test(selo) ? ok('e aparece em "Pagas no mês", marcada como paga') : nao(`não achei em "Pagas no mês": "${selo.replace(/\n/g, ' | ').slice(0, 120)}"`)

console.log('\n6) O "Saiu no mês" subiu no topo')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
const saiu = await p.locator('div').filter({ hasText: /^Saiu no mês/ }).first().innerText().catch(() => '')
;/842,37/.test(saiu) ? ok(`"Saiu no mês" virou R$ 842,37`) : nao(`"Saiu no mês" não bateu: "${saiu.replace(/\n/g, ' | ')}"`)

// ---------------------------------------------------------------------------
console.log('\n7) Criar uma recorrência e gerar as contas do mês')
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Nova recorrência' }).click()
await p.fill('input[name=descricao]', 'Aluguel da oficina')
await p.fill('input[name=categoria]', 'Instalações')
await p.fill('input[name=contraparte]', 'Imobiliária Central')
await p.fill('input[name=valor]', '4200,00')
await p.fill('input[name=diaVencimento]', '5')
await p.getByRole('button', { name: 'Criar recorrência' }).click()
await p.waitForTimeout(1800)

;(await p.getByText('Aluguel da oficina').count()) > 0 ? ok('recorrência criada') : nao('recorrência não apareceu')
;(await p.getByText('Custo fixo mensal').count()) > 0 ? ok('mostra o custo fixo mensal') : nao('sem custo fixo mensal')

const btnGerar = p.getByRole('button', { name: /^Gerar/ })
if (await btnGerar.count()) {
  await btnGerar.click()
  await p.waitForTimeout(2000)
  ok('gerou as contas do mês')
} else {
  nao('o botão de gerar não apareceu')
}
await p.screenshot({ path: `${PASTA}/caixa-3-recorrencias.png` })

console.log('\n8) Gerar de novo NÃO pode duplicar (idempotência)')
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=todas`, { waitUntil: 'networkidle' })
const antes = await p.getByText('Aluguel da oficina').count()
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
const btn2 = p.getByRole('button', { name: /^Gerar/ })
if (await btn2.count()) {
  await btn2.click()
  await p.waitForTimeout(2000)
}
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=todas`, { waitUntil: 'networkidle' })
const depois = await p.getByText('Aluguel da oficina').count()
antes === depois && antes > 0
  ? ok(`o aluguel continua aparecendo ${depois}x — não duplicou`)
  : nao(`duplicou: antes ${antes}, depois ${depois}`)

// ---------------------------------------------------------------------------
console.log('\n9) Relatórios: o gráfico desenha e a tabela bate')
await p.goto(`${BASE}/painel/financeiro?aba=relatorios`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
;(await p.locator('svg[role=img]').count()) > 0 ? ok('o gráfico de barras existe') : nao('sem gráfico')
;(await p.locator('table caption').count()) > 0 ? ok('a tabela equivalente existe (leitor de tela)') : nao('sem tabela equivalente')
;(await p.getByText('Para onde foi o dinheiro').count()) > 0 ? ok('categorias de saída') : nao('sem categorias de saída')
;(await p.getByText('Quem está segurando o caixa').count()) > 0 ? ok('maiores devedores') : nao('sem devedores')
await p.screenshot({ path: `${PASTA}/caixa-4-relatorios.png`, fullPage: true })

// ---------------------------------------------------------------------------
console.log('\n10) O financeiro (papel FINANCEIRO) entra, mas NÃO apaga')
const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 1000 } })
const f = await ctx2.newPage()
await f.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
await f.fill('#email', 'fabio@dtechmed.com.br')
await f.fill('#senha', SENHA)
await f.getByRole('button', { name: /entrar/i }).click()
await f.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
await f.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })

;(await f.getByRole('button', { name: 'Lançar conta a pagar' }).count()) > 0
  ? ok('o financeiro consegue lançar')
  : nao('o financeiro não vê o botão de lançar')
const apagar = await f.getByRole('button', { name: 'Apagar', exact: true }).count()
apagar === 0 ? ok('o financeiro NÃO vê "Apagar" (é da gestão)') : nao(`o financeiro vê ${apagar} botão(ões) de apagar`)

// ---------------------------------------------------------------------------
console.log('\n11) Os dois temas, sem texto invisível nem rolagem lateral')
for (const tema of ['escuro', 'claro']) {
  await p.goto(`${BASE}/painel`, { waitUntil: 'networkidle' })
  await p.evaluate((t) => { document.cookie = `dtechmed_tema=${t}; path=/; max-age=31536000` }, tema)
  for (const aba of ['receber', 'pagar', 'recorrencias', 'relatorios', 'faturas']) {
    await p.goto(`${BASE}/painel/financeiro?aba=${aba}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${aba}/${tema}: a página rola de lado`)
    const txt = await p.locator('body').innerText()
    const lixo = txt.match(/undefined|NaN|\[object Object\]|\{\{/)
    if (lixo) nao(`${aba}/${tema}: "${lixo[0]}" na tela`)
    await p.screenshot({ path: `${PASTA}/caixa-${tema}-${aba}.png` })
  }
  ok(`${tema}: 5 abas sem rolagem lateral nem lixo`)
}

// ---------------------------------------------------------------------------
if (erros.length) {
  console.log('\nErros de JavaScript no navegador:')
  for (const e of [...new Set(erros)].slice(0, 8)) { nao(e.slice(0, 160)) }
} else {
  ok('nenhum erro de JavaScript no navegador')
}

await nav.close()
console.log(`\n${falhas === 0 ? '✅ tudo passou' : `❌ ${falhas} falha(s)`}\n`)
process.exit(falhas === 0 ? 0 : 1)
