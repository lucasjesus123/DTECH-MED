// O calendário junta as fontes da OPERAÇÃO numa grade — e não tem dinheiro
// nenhum, para ninguém. Vencimento se responde no Financeiro.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
import { lancarConta, hojeISO } from './lancar-conta.mjs'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

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

const mes = new Date().toISOString().slice(0, 7)

console.log('\n1) O administrador vê a grade e as quatro fontes')
const p = await entrar('lucas@dtechmed.com.br')
await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)

;(await p.locator('table[class*="calGrade"]').count()) > 0 ? ok('a grade é uma <table>') : nao('sem tabela')
const cabecalhos = await p.locator('table[class*="calGrade"] thead th').count()
cabecalhos === 7 ? ok('sete colunas de dia da semana') : nao(`${cabecalhos} colunas no cabeçalho`)
const eventos = await p.locator('a[class*="calEvento"]').count()
// Grade vazia NÃO é aprovação. Uma consulta que devolve zero passa em todo
// teste que só compara a tela com o banco — foi assim que a troca de
// previstoPara por janelaInicio quase passou despercebida, com as duas
// pontas concordando em zero.
eventos > 0 ? ok(`${eventos} compromissos na grade`) : nao('grade VAZIA — o teste não prova nada assim')

const bruto = await p.locator('body').innerText()
const lixo = bruto.match(/\bundefined\b|\bNaN\b|\[object Object\]/)
lixo ? nao(`"${lixo[0]}" na tela`) : ok('nenhum lixo de renderização')

console.log('\n2) O número de eventos bate com o banco')
const noBanco = Number(sql(`
  select
    -- previstoPara é O DIA da parada e é obrigatório; janelaInicio é só a
    -- faixa de horário combinada, e a maioria das paradas não tem. A primeira
    -- versão desta consulta usava janelaInicio — a mesma troca que fazia o
    -- calendário perder TODAS as 32 paradas do cenário.
    (select count(*) from agendamentos where "previstoPara" >= date_trunc('month', now())
       and "previstoPara" < date_trunc('month', now()) + interval '1 month' and status <> 'CANCELADO')
  + (select count(*) from visitas_preventivas where "previstaPara" >= date_trunc('month', now())
       and "previstaPara" < date_trunc('month', now()) + interval '1 month' and status <> 'CANCELADA')
  + (select count(*) from contratos_manutencao where fim >= date_trunc('month', now())
       and fim < date_trunc('month', now()) + interval '1 month' and ativo = true)
  + (select count(*) from compromissos where dia >= date_trunc('month', now())
       and dia < date_trunc('month', now()) + interval '1 month')`))
eventos === noBanco
  ? ok(`${eventos} na grade = ${noBanco} no banco (as quatro fontes)`)
  : nao(`grade tem ${eventos}, banco tem ${noBanco}`)

console.log('\n3) O FILTRO por tipo funciona')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}&so=parada`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
const soParadas = await p.locator('a[class*="calEvento"]').count()
const paradasNoBanco = Number(sql(`select count(*) from agendamentos
  where "previstoPara" >= date_trunc('month', now())
    and "previstoPara" < date_trunc('month', now()) + interval '1 month'
    and status <> 'CANCELADO'`))
soParadas === paradasNoBanco
  ? ok(`filtro "Rota" trouxe as ${soParadas} paradas do mês, nem mais nem menos`)
  : nao(`filtro "Rota" trouxe ${soParadas} e o banco tem ${paradasNoBanco} paradas`)

// ---------------------------------------------------------------------------
console.log('\n4) NÃO HÁ DINHEIRO no calendário — para ninguém, nem no HTML')
// ---------------------------------------------------------------------------
/**
 * O calendário mostrava conta a pagar e a receber, e foi retirado: vencimento
 * não disputa o dia com ninguém. Uma conta que vence na quinta não ocupa o
 * motorista nem prende a bancada — ela só enchia a grade e empurrava para baixo
 * o que precisa ser olhado antes de marcar mais uma entrega.
 *
 * A conferência é no ADMINISTRADOR, e não no motorista: enquanto havia dinheiro
 * ali, a pergunta era "quem pode ver"; agora é "não existe". Testar só o
 * motorista deixaria passar o dinheiro voltando para os outros seis papéis.
 */
for (const [quem, pagina] of [['administrador', p], ['motorista', await entrar('adriano@dtechmed.com.br')]]) {
  const r = await pagina.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
  r.status() === 200 ? ok(`o ${quem} abre o calendário`) : nao(`o ${quem} recebeu ${r.status()}`)

  const texto = await pagina.locator('body').innerText()
  ;/R\$\s?\d/.test(texto)
    ? nao(`${quem}: apareceu valor em reais no calendário`)
    : ok(`${quem}: nenhum valor em reais na tela`)

  const filtros = await pagina.locator('nav[aria-label="Filtrar por tipo"]').innerText().catch(() => '')
  ;/a pagar|a receber/i.test(filtros)
    ? nao(`${quem}: o filtro ainda oferece dinheiro — ${filtros.replace(/\n/g, ' ')}`)
    : ok(`${quem}: os filtros são só de operação`)

  // A prova que importa: a descrição de uma conta não pode estar NEM no HTML.
  const html = await pagina.content()
  const conta = sql("select descricao from lancamentos where \"pagoEm\" is null limit 1")
  conta && conta.length > 3 && html.includes(conta)
    ? nao(`${quem}: a descrição de uma conta veio no HTML — "${conta}"`)
    : ok(`${quem}: nenhuma descrição de conta no HTML entregue`)
}

// Forçar o filtro antigo pela URL não ressuscita a fonte.
await p.goto(`${QA_BASE}/painel/calendario?so=pagar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
const forcado = await p.locator('body').innerText()
;/R\$\s?\d/.test(forcado)
  ? nao('forçar ?so=pagar na URL trouxe dinheiro de volta')
  : ok('o endereço antigo ?so=pagar abre normal, e sem dinheiro')

// ---------------------------------------------------------------------------
console.log('\n4b) A conta lançada no Financeiro FICA no Financeiro')
// ---------------------------------------------------------------------------
// A separação é de propósito, e por isso é conferida: uma conta nova aparece na
// tela do dinheiro e NÃO aparece na grade da operação.
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
const marca = `Conta do calendário ${Date.now().toString(36).slice(-5)}`
await lancarConta(p, { tipo: 'PAGAR', descricao: marca, valor: '777,00', vencimento: hojeISO() })

await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
;(await p.locator('body').innerText()).includes(marca)
  ? ok('a conta nasceu e aparece no Financeiro')
  : nao('a conta não apareceu nem no Financeiro — o lançamento falhou')

await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
// Num dia cheio o item fica atrás do "+N mais". Abrir os `<details>` é o que o
// usuário faria — conferir só o texto visível aprovaria um vazamento escondido.
for (const d of await p.locator('details[class*="calMais"] > summary').all()) await d.click()
await p.waitForTimeout(400)
;(await p.locator('body').innerText()).includes(marca)
  ? nao(`a conta apareceu no calendário: "${marca}"`)
  : ok('e não aparece no calendário, que é o combinado')

console.log('\n5) Navegar entre meses preserva o filtro')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}&so=parada`, { waitUntil: 'networkidle' })
const proxima = await p.getByRole('link', { name: 'Mês seguinte' }).getAttribute('href')
;/so=parada/.test(proxima ?? '') ? ok('a seta do mês carrega o filtro junto') : nao(`a seta perdeu o filtro: ${proxima}`)

console.log('\n6) Os dois temas, em 1440 e 390 — sem rolagem na PÁGINA')
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((t) => { document.cookie = `dtechmed_tema=${t}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(600)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema}/${larg}px: a PÁGINA rola de lado`)
  }
  ok(`${tema}: cabe em 1440 e 390 (a grade rola dentro da própria caixa)`)
}
await p.setViewportSize({ width: 1500, height: 1100 })
await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/calendario.png', fullPage: true })

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
