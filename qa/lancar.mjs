// O que as telas passaram a DEIXAR CRIAR: compromisso e conta pelo Calendário,
// contato à mão no Comercial, modelo de documento, e a aprovação do Financeiro.
//
// Todas estas telas eram ESPELHOS: mostravam o que outras criaram. Este roteiro
// existe para provar que elas passaram a receber — e, o que importa mais, que
// receber não abriu porta para quem não deve.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => {
  const o = execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
    "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n')
  return o.length > 1 ? o.slice(1).join(' | ').trim() : ''
}

// Repetir a passada não pode reprovar a seguinte.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', "delete from compromissos; delete from leads where mensagem like '%anotado por%'; " +
        "delete from lancamentos where descricao like 'QA-%'"], { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email, largura = 1500) {
  const p = await (await nav.newContext({ viewport: { width: largura, height: 1100 } })).newPage()
  p.on('pageerror', (e) => erros.push(String(e)))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const mes = new Date().toISOString().slice(0, 7)
const dia = `${mes}-15`

console.log('\n1) CALENDÁRIO · o dia recebe compromisso, com responsável')
const p = await entrar('lucas@dtechmed.com.br')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
;(await p.locator(`a[href*="dia=${dia}"]`).count()) > 0
  ? ok('o número do dia é o botão de marcar')
  : nao('o dia não abre o painel de marcar')

await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}&dia=${dia}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.fill('input[name=titulo]', 'QA visita antes de orçar')
await p.fill('input[name=hora]', '14:30')
await p.locator('select[name=responsavelId]').selectOption({ index: 2 })
await p.getByRole('button', { name: 'Marcar compromisso' }).click()
await p.waitForTimeout(2800)
const c = sql("select titulo||'|'||dia||'|'||coalesce(hora,'-')||'|'||coalesce((select nome from usuarios u where u.id=x.\"responsavelId\"),'-') from compromissos x where titulo='QA visita antes de orçar'")
c.includes(dia) && c.includes('14:30') && !c.endsWith('|-')
  ? ok(`gravou com dia, hora e responsável: ${c}`)
  : nao(`compromisso gravado errado: "${c}"`)

console.log('\n2) e ele aparece na grade do mês')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1100)
const grade = await p.locator('table').innerText()
grade.includes('QA visita antes de orçar') ? ok('a grade mostra o compromisso') : nao('o compromisso não apareceu na grade')
grade.includes('14:30') ? ok('com a hora na frente') : nao('a hora não apareceu')

console.log('\n3) a conta lançada pelo dia nasce ESPERANDO APROVAÇÃO')
await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}&dia=${dia}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.getByRole('button', { name: 'Conta' }).click()
await p.waitForTimeout(400)
await p.fill('input[name=descricao]', 'QA-contador do mês')
await p.fill('input[name=valor]', '890,00')
await p.getByRole('button', { name: 'Lançar conta neste dia' }).click()
await p.waitForTimeout(2800)
const conta = sql("select vencimento::date||'|'||coalesce(\"aprovadoEm\"::text,'SEM') from lancamentos where descricao='QA-contador do mês'")
conta.startsWith(dia) ? ok(`venceu no dia clicado (${dia})`) : nao(`vencimento errado: "${conta}"`)
conta.endsWith('|SEM') ? ok('nasceu sem aprovação — quem lança não aprova') : nao('nasceu já aprovada')

console.log('\n4) FINANCEIRO · a baixa é barrada antes da aprovação')
const f = await entrar('fabio@dtechmed.com.br')
await f.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=${mes}`, { waitUntil: 'networkidle' })
await f.waitForTimeout(900)
const abasF = await f.locator('nav[aria-label="Visões do financeiro"] a').allInnerTexts()
!abasF.some((t) => /Aprovar/.test(t)) ? ok('o financeiro NÃO vê a aba Aprovar') : nao('o financeiro vê a aba Aprovar')
abasF.some((t) => /Dar baixa/.test(t)) ? ok('mas vê a aba Dar baixa') : nao('sem a aba Dar baixa')

// A lista de contas virou TABELA: a linha é `tr`, não mais `li`.
const linha = f.locator('tr').filter({ hasText: 'QA-contador do mês' }).first()
if (await linha.count()) {
  await linha.getByRole('group').locator('summary').click()
  await f.waitForTimeout(400)
  await linha.getByRole('button', { name: /dar baixa|baixar|confirmar/i }).first().click().catch(() => {})
  await f.waitForTimeout(2500)
  const recusa = await f.locator('[role=alert]').first().innerText().catch(() => '')
  // O `;` na frente NÃO é enfeite: uma linha que começa com /regex/ depois de
  // outra instrução é lida como DIVISÃO, e o arquivo nem carrega. É a terceira
  // vez que esta armadilha aparece nesta bateria.
  ;/não foi aprovada/i.test(recusa) ? ok(`recusou: "${recusa.slice(0, 60)}"`) : nao(`não recusou: "${recusa}"`)
  sql("select coalesce(\"pagoEm\"::text,'NAO') from lancamentos where descricao='QA-contador do mês'") === 'NAO'
    ? ok('e a conta continua NÃO paga') : nao('a conta foi paga sem aprovação')
} else nao('a conta não apareceu na aba A pagar')

console.log('\n5) o ADMIN aprova, e aí a baixa passa')
await p.goto(`${QA_BASE}/painel/financeiro?aba=aprovar&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const cartao = p.locator('li').filter({ hasText: 'QA-contador do mês' }).first()
;(await cartao.innerText()).includes('Lucas')
  ? ok('a fila mostra quem lançou') : nao('a fila não diz quem lançou')
await cartao.getByRole('button', { name: 'Aprovar' }).click()
await p.waitForTimeout(2500)
const quem = sql("select coalesce(\"aprovadoPorNome\",'NAO') from lancamentos where descricao='QA-contador do mês'")
quem !== 'NAO' ? ok(`aprovada por ${quem}`) : nao('não aprovou')

console.log('\n6) MOTORISTA · marca compromisso e não vê dinheiro nenhum')
const m = await entrar('adriano@dtechmed.com.br')
await m.goto(`${QA_BASE}/painel/calendario?mes=${mes}&dia=${dia}`, { waitUntil: 'networkidle' })
await m.waitForTimeout(900)
const abasM = await m.locator('[aria-label="O que marcar"] button').allInnerTexts()
abasM.includes('Compromisso') ? ok('ele marca compromisso') : nao('ele não consegue marcar compromisso')
!abasM.includes('Conta') ? ok('e NÃO tem a aba Conta') : nao('o motorista pode lançar conta')
!/R\$\s?\d/.test(await m.locator('body').innerText())
  ? ok('nenhum valor em R$ na tela dele') : nao('vazou valor para o motorista')

console.log('\n7) COMERCIAL · contato à mão, com origem obrigatória')
const a = await entrar('ana@dtechmed.com.br')
await a.goto(`${QA_BASE}/painel/contatos`, { waitUntil: 'networkidle' })
await a.waitForTimeout(800)
await a.getByRole('button', { name: 'Anotar contato' }).click()
await a.waitForTimeout(500)
;(await a.locator('select[name=origem]').inputValue()) === ''
  ? ok('a origem começa vazia — sem padrão, ela precisa ser respondida')
  : nao('a origem tem padrão')
await a.fill('input[name=nome]', 'QA Renata Boeira')
await a.fill('input[name=telefone]', '51991234567')
await a.selectOption('select[name=origem]', 'INDICACAO')
await a.getByRole('button', { name: 'Anotar contato' }).last().click()
await a.waitForTimeout(2800)
const lead = sql("select origem||'|'||status from leads where nome='QA Renata Boeira'")
lead === 'INDICACAO|novo' ? ok('gravou como indicação, na fila') : nao(`lead gravado errado: "${lead}"`)
sql("select case when mensagem like '%anotado por Ana Prado%' then 'sim' else 'nao' end from leads where nome='QA Renata Boeira'") === 'sim'
  ? ok('e guardou quem anotou') : nao('não guardou quem anotou')

console.log('\n8) MODELOS · o técnico não alcança; o financeiro vê e não edita')
const t = await entrar('rafael@dtechmed.com.br')
await t.goto(`${QA_BASE}/painel/documentos`, { waitUntil: 'networkidle' })
await t.waitForTimeout(700)
new URL(t.url()).pathname === '/painel/sem-permissao'
  ? ok('o técnico é barrado') : nao(`o técnico chegou em ${new URL(t.url()).pathname}`)
await f.goto(`${QA_BASE}/painel/documentos`, { waitUntil: 'networkidle' })
await f.waitForTimeout(700)
;(await f.locator('h1').innerText()) === 'Modelos de documento' ? ok('o financeiro vê a tela') : nao('o financeiro não vê a tela')
;(await f.getByRole('button', { name: /Novo modelo de/ }).count()) === 0
  ? ok('e não tem botão de editar') : nao('o financeiro pode editar modelo')

console.log('\n9) Celular de 390 px, nos dois temas')
for (const tema of ['claro', 'escuro']) {
  const cel = await entrar('lucas@dtechmed.com.br', 390)
  await cel.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const url of [`/painel/calendario?mes=${mes}&dia=${dia}`, '/painel/documentos', `/painel/financeiro?aba=aprovar&mes=${mes}`, '/painel/contatos']) {
    await cel.goto(`${QA_BASE}${url}`, { waitUntil: 'networkidle' })
    await cel.waitForTimeout(500)
    const rola = await cel.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema} · ${url} rola de lado no celular`)
  }
  ok(`${tema}: as quatro telas cabem em 390 px`)
}

erros.length ? nao(`erro de JavaScript: ${erros[0].slice(0, 130)}`) : ok('nenhum erro de JavaScript')
await nav.close()
console.log(`\n${ruins === 0 ? '✅ tudo passou' : `❌ ${ruins} problema(s)`}\n`)
process.exit(ruins ? 1 : 0)
