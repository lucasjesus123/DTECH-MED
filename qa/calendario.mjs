// O calendário junta cinco fontes numa grade — e o motorista NÃO vê dinheiro.
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

console.log('\n1) O administrador vê a grade e as cinco fontes')
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
  + (select count(*) from lancamentos where vencimento >= date_trunc('month', now())
       and vencimento < date_trunc('month', now()) + interval '1 month' and "pagoEm" is null)
  + (select count(*) from faturas where vencimento >= date_trunc('month', now())
       and vencimento < date_trunc('month', now()) + interval '1 month' and status in ('ABERTA','PARCIAL'))
  + (select count(*) from contratos_manutencao where fim >= date_trunc('month', now())
       and fim < date_trunc('month', now()) + interval '1 month' and ativo = true)`))
eventos === noBanco
  ? ok(`${eventos} na grade = ${noBanco} no banco (as cinco fontes)`)
  : nao(`grade tem ${eventos}, banco tem ${noBanco}`)

console.log('\n3) O FILTRO por tipo funciona')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}&so=parada`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)
const soParadas = await p.locator('a[class*="calEvento"]').count()
const dinheiroNoFiltro = await p.locator('a[class*="calDinheiro"]').count()
dinheiroNoFiltro === 0 ? ok(`filtro "Rota" trouxe ${soParadas} e nenhum de dinheiro`) : nao('o filtro deixou passar dinheiro')

console.log('\n4) O MOTORISTA não vê dinheiro — nem na tela, nem no HTML')
const m = await entrar('adriano@dtechmed.com.br')
const r = await m.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
r.status() === 200 ? ok('o motorista abre o calendário') : nao(`o motorista recebeu ${r.status()}`)
await m.waitForTimeout(800)

const semDinheiro = await m.locator('a[class*="calDinheiro"]').count()
semDinheiro === 0 ? ok('nenhum evento de dinheiro na grade dele') : nao(`${semDinheiro} eventos de dinheiro apareceram`)

// A prova que importa: o valor não pode estar NEM no HTML entregue.
const html = await m.content()
const contas = sql("select descricao from lancamentos where \"pagoEm\" is null limit 3")
const vazou = contas && contas.length > 3 && html.includes(contas)
vazou ? nao(`a descrição de uma conta veio no HTML dele: "${contas}"`) : ok('nenhuma descrição de conta no HTML entregue ao motorista')
const temReceber = html.includes('A receber no mês')
temReceber ? nao('o indicador de dinheiro apareceu para o motorista') : ok('o indicador de dinheiro não existe na página dele')

// E forçar o filtro pela URL também não abre porta.
await m.goto(`${QA_BASE}/painel/calendario?so=pagar`, { waitUntil: 'networkidle' })
await m.waitForTimeout(600)
const forcado = await m.locator('a[class*="calDinheiro"]').count()
forcado === 0 ? ok('forçar ?so=pagar na URL não revela nada') : nao(`${forcado} eventos vazaram pela URL`)
;
console.log('\n4b) O que nasce no Financeiro aparece no calendário')
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
const marca = `Conta do calendário ${Date.now().toString(36).slice(-5)}`
// Lançar deixou de ser um botão dentro da aba e virou "+ Nova conta" no
// cabeçalho, numa janela. A sequência mora em `lancar-conta.mjs` para os cinco
// roteiros que lançam conta não guardarem cinco cópias dela.
await lancarConta(p, { tipo: 'PAGAR', descricao: marca, valor: '777,00', vencimento: hojeISO() })
const hoje = hojeISO()

await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)

// Num dia cheio o compromisso fica atrás do "+N mais". Abrir os `<details>`
// é o que o usuário faria, e prova o que importa: que dá para CHEGAR nele.
// Conferir só o texto visível reprovaria um produto que está certo.
const abrir = await p.locator('details[class*="calMais"] > summary').all()
for (const d of abrir) await d.click()
await p.waitForTimeout(400)

const noCalendario = await p.locator('body').innerText()
noCalendario.includes(marca)
  ? ok(`a conta lançada agora apareceu no calendário: "${marca}"`)
  : nao('a conta lançada no Financeiro não apareceu no calendário')
;(await p.locator('a[class*="calDinheiro"]').count()) > 0
  ? ok('e veio com a cor do dinheiro') : nao('a conta não veio com a cor do dinheiro')

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
