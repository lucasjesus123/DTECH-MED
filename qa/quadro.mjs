// =============================================================================
// O QUADRO DA O.S. — as colunas são da empresa, a esteira continua sendo do
// sistema, e NENHUMA ordem pode sumir da tela por causa de configuração.
// =============================================================================
// O quadro deixa a empresa desenhar o próprio processo: quais colunas existem,
// com que nome, e quais etapas cada uma agrupa. O que ele NÃO deixa mexer são as
// 18 etapas: cada evento da linha do tempo carrega o resumo criptográfico do
// anterior, e renomear uma etapa já gravada quebraria a corrente que dá valor de
// prova ao prontuário.
//
// O risco desse desenho é uma ordem ficar invisível: basta uma etapa não estar
// em coluna nenhuma. O sistema resolve isso com uma coluna de resgate ("Fora do
// quadro"), e as conferências 2 e 7 abaixo existem só para provar que ela
// funciona — inclusive depois de alguém apagar uma coluna cheia.
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

// O quadro começa em branco em toda passada: é o único jeito de conferir o
// convite e a coluna de resgate, que só aparecem quando não há configuração.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', 'delete from colunas_quadro'], { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1600, height: 1100 } })).newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

// O quadro traz TODAS as ordens — as encerradas têm coluna própria. Então a
// conferência de "nada sumiu" é contra o total, e não contra as abertas.
const totalOrdens = Number(sql('select count(*) from ordens'))
const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) A ABA · o quadro é uma aba da O.S., ao lado de Ordens')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens`, { waitUntil: 'networkidle' })
;(await p.locator('a[href="/painel/ordens/quadro"]').count()) > 0
  ? ok('a aba Quadro está na barra da O.S.')
  : nao('a aba Quadro não aparece na barra da O.S.')

// ---------------------------------------------------------------------------
console.log('\n2) SEM COLUNA · o convite aparece E as ordens continuam visíveis')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const vazio = await p.locator('body').innerText()
;/ainda não tem colunas/i.test(vazio)
  ? ok('o convite para desenhar o quadro aparece')
  : nao('sem coluna nenhuma, o convite não apareceu')

const cartoesOrfaos = await p.locator('[aria-label*="Fora do quadro"] li').count()
cartoesOrfaos === totalOrdens && totalOrdens > 0
  ? ok(`nenhuma ordem sumiu: ${cartoesOrfaos} cartões na coluna de resgate (${totalOrdens} ordens)`)
  : nao(`ordens sumiram com o quadro sem configuração: ${cartoesOrfaos} cartões para ${totalOrdens} ordens`)

// ---------------------------------------------------------------------------
console.log('\n3) O PADRÃO · cinco colunas para não começar de folha em branco')
// ---------------------------------------------------------------------------
await p.getByRole('button', { name: /Começar com as cinco padrão/i }).click()
await p.waitForTimeout(2500)
const quantas = Number(sql('select count(*) from colunas_quadro'))
quantas === 5
  ? ok('as cinco colunas padrão foram criadas')
  : nao(`o padrão criou ${quantas} colunas, não 5`)

await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const naTela = await p.locator('section[aria-label]').count()
const semResgate = (await p.locator('[aria-label*="Fora do quadro"]').count()) === 0
naTela === 5 && semResgate
  ? ok('as cinco aparecem na tela, e nenhuma etapa ficou fora do quadro')
  : nao(`a tela mostra ${naTela} colunas${semResgate ? '' : ' e ainda há etapa órfã'}`)

// ---------------------------------------------------------------------------
console.log('\n4) EDITAR · a coluna ganha o nome da casa, e a etapa SAI de onde estava')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/quadro/colunas`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: '+ Nova coluna' }).click()
await p.waitForTimeout(400)
await p.fill('input[name=nome]', 'Comp. peças')
await p.locator('select[name=cor]').selectOption('espera')
// A etapa da bancada é a que vai para a coluna nova.
await p.locator('label', { hasText: /^Em manutenção/i }).locator('input[type=checkbox]').first().check()
await p.getByRole('button', { name: 'Criar coluna' }).click()
await p.waitForTimeout(2500)

const criada = sql("select nome||'|'||coalesce(cor,'-')||'|'||array_length(etapas,1)::text from colunas_quadro where nome='Comp. peças'")
criada.startsWith('Comp. peças|espera|')
  ? ok(`a coluna nasceu com o nome e a cor da casa: ${criada}`)
  : nao(`a coluna não foi criada como pedido: ${criada || '(nada)'}`)

const duplicada = sql("select count(*) from colunas_quadro where 'EM_MANUTENCAO' = any(etapas)")
duplicada === '1'
  ? ok('a etapa ficou em UMA coluna só — o cartão não se duplica no quadro')
  : nao(`a etapa está em ${duplicada} colunas: o mesmo cartão apareceria em dois lugares`)

// ---------------------------------------------------------------------------
console.log('\n5) MOVER · o cartão anda a esteira DE VERDADE, com evento na trilha')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const cartao = p.locator('li', { has: p.locator('button[title*="Move para a coluna"]') }).first()
const houveCartao = (await cartao.count()) > 0
if (!houveCartao) nao('nenhum cartão oferece passo — não dá para conferir o movimento')
else {
  const href = await cartao.locator('a').first().getAttribute('href')
  const id = String(href).split('/').pop()
  const antes = sql(`select etapa from ordens where id='${id}'`)
  const eventosAntes = Number(sql(`select count(*) from eventos_ordem where "ordemId"='${id}'`))

  await cartao.locator('button[title*="Move para a coluna"]').first().click()
  await p.waitForTimeout(3500)

  const depois = sql(`select etapa from ordens where id='${id}'`)
  const eventosDepois = Number(sql(`select count(*) from eventos_ordem where "ordemId"='${id}'`))
  depois !== antes && eventosDepois === eventosAntes + 1
    ? ok(`a ordem andou ${antes} → ${depois}, e a trilha registrou (${eventosAntes}→${eventosDepois})`)
    : nao(`mover não andou a esteira: ${antes} → ${depois}, eventos ${eventosAntes}→${eventosDepois}`)
}

// ---------------------------------------------------------------------------
console.log('\n6) APAGAR · a coluna some, a ordem NÃO — ela vai para o resgate')
// ---------------------------------------------------------------------------
// A coluna do diagnóstico costuma ter cartão; é a que vale a pena apagar.
const alvo = sql("select nome from colunas_quadro where 'EM_ANALISE' = any(etapas)")
const emAnalise = Number(sql("select count(*) from ordens where etapa='EM_ANALISE'"))
await p.goto(`${QA_BASE}/painel/ordens/quadro/colunas`, { waitUntil: 'networkidle' })
p.once('dialog', (d) => d.accept())
await p.locator('li', { hasText: alvo }).getByRole('button', { name: 'Apagar' }).first().click()
await p.waitForTimeout(2500)

await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const resgate = await p.locator('[aria-label*="Fora do quadro"] li').count()
const ordensSumidas = Number(sql("select count(*) from ordens where etapa='EM_ANALISE'")) !== emAnalise
!ordensSumidas && (emAnalise === 0 || resgate >= emAnalise)
  ? ok(`apagar a coluna "${alvo}" não mexeu em ordem nenhuma; ${resgate} cartões foram para o resgate`)
  : nao(`apagar a coluna mexeu nas ordens ou escondeu ${emAnalise} delas (resgate: ${resgate})`)

// ---------------------------------------------------------------------------
console.log('\n7) A TRAVA · desenhar o quadro é da gestão, e a recusa é do SERVIDOR')
// ---------------------------------------------------------------------------
const t = await entrar('rafael@dtechmed.com.br')
await t.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const veQuadro = (await t.locator('section[aria-label]').count()) > 0
const veBotao = (await t.locator('a[href="/painel/ordens/quadro/colunas"]').count()) > 0
veQuadro && !veBotao
  ? ok('o técnico vê o quadro e trabalha nele, mas não recebe o botão de desenhar')
  : nao(`o técnico ${veQuadro ? '' : 'não vê o quadro; '}${veBotao ? 'recebeu o botão de desenhar' : ''}`)

// A recusa da guarda é REDIRECIONAMENTO para a tela de sem permissão, e não
// um código de erro — a primeira versão desta conferência media o HTTP e
// reprovava um produto que estava certo: o 200 é da tela de recusa. O que
// prova a trava é ONDE a pessoa foi parar, e que nada foi criado.
const antesDoChute = Number(sql('select count(*) from colunas_quadro'))
await t.goto(`${QA_BASE}/painel/ordens/quadro/colunas`, { waitUntil: 'networkidle' })
const parou = new URL(t.url()).pathname
const viuEditor = (await t.getByRole('button', { name: '+ Nova coluna' }).count()) > 0
const depoisDoChute = Number(sql('select count(*) from colunas_quadro'))
parou !== '/painel/ordens/quadro/colunas' && !viuEditor && depoisDoChute === antesDoChute
  ? ok(`pedir a tela pelo endereço direto foi recusado — parou em ${parou}`)
  : nao(`o técnico alcançou o editor de colunas pelo endereço direto (parou em ${parou}, editor à vista: ${viuEditor})`)

// ---------------------------------------------------------------------------
console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ o quadro é da empresa, e nada some\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
