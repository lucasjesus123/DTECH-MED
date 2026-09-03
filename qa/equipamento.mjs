// =============================================================================
// O CATÁLOGO DE EQUIPAMENTO E A O.S. PASSAM A SE FALAR
// =============================================================================
// O defeito que este roteiro guarda: o cadastro de equipamento exigia "Cliente
// dono", então não era catálogo — era ficha presa a um cliente. E a abertura da
// O.S. ignorava o cadastro por inteiro: pedia marca e modelo em texto livre e
// criava um equipamento NOVO toda vez que a série não batesse (ou não fosse
// digitada, que é o comum). O mesmo laser virava quatro linhas, cada uma com um
// pedaço do histórico e nenhuma com a foto.
//
// As seis conferências abaixo são, nesta ordem: o cadastro sem dono existe; ele
// se anuncia como catálogo na listagem; ele NÃO é oferecido para contrato de
// preventiva (contrato é com alguém); a abertura da O.S. o encontra e o puxa; ao
// abrir, ele ganha dono SEM VIRAR UMA SEGUNDA LINHA; e puxar o aparelho de
// outro cliente é recusado — com a recusa vindo do servidor, não só da tela.
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

// Repetir a passada não pode reprovar a seguinte: o cadastro de série é único.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', `delete from eventos_ordem where "ordemId" in (select id from ordens where "equipamentoId" in (select id from equipamentos where "numeroSerie" like 'QA-%'));
         delete from ordens where "equipamentoId" in (select id from equipamentos where "numeroSerie" like 'QA-%');
         delete from equipamentos where "numeroSerie" like 'QA-%'`], { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  // O aviso de depreciação do adaptador do pg é emitido uma vez por processo do
  // servidor e chega aqui pelo console; não é erro de tela.
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) CADASTRO · o aparelho entra no catálogo SEM dono')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/equipamentos?novo=1`, { waitUntil: 'networkidle' })

const obrigatorio = await p.locator('select[name=clienteId]').getAttribute('required')
obrigatorio === null
  ? ok('"Cliente dono" deixou de ser obrigatório')
  : nao('"Cliente dono" ainda é obrigatório — o cadastro continua preso a um cliente')

await p.fill('input[name=marca]', 'Ibramed')
await p.fill('input[name=modelo]', 'Neurodyn Esthetic')
await p.fill('input[name=numeroSerie]', 'QA-SEM-DONO-1')
await p.fill('input[name=categoria]', 'Eletroterapia')
await p.getByRole('button', { name: 'Cadastrar equipamento' }).click()
await p.waitForTimeout(2500)

const semDono = sql(`select coalesce("clienteId",'NULO')||'|'||marca from equipamentos where "numeroSerie"='QA-SEM-DONO-1'`)
semDono.startsWith('NULO|Ibramed')
  ? ok(`gravou sem dono: ${semDono}`)
  : nao(`não gravou sem dono — banco diz: ${semDono || '(nada)'}`)

// ---------------------------------------------------------------------------
console.log('\n2) LISTAGEM · sem dono se anuncia como catálogo, e não como falta de dado')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/equipamentos?busca=QA-SEM-DONO-1`, { waitUntil: 'networkidle' })
const texto = await p.locator('body').innerText()
;/sem dono/i.test(texto)
  ? ok('a listagem escreve "Sem dono — catálogo"')
  : nao('a listagem não diz que o aparelho é de catálogo')

// ---------------------------------------------------------------------------
console.log('\n3) PREVENTIVA · contrato é com alguém, então catálogo puro não entra na lista')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/preventiva`, { waitUntil: 'networkidle' })
const opcoes = await p.locator('select[name=equipamentoId] option').allInnerTexts().catch(() => [])
opcoes.length === 0 || !opcoes.some((o) => /Neurodyn Esthetic/i.test(o))
  ? ok('o aparelho sem dono não é oferecido para contrato')
  : nao('a preventiva oferece aparelho sem dono — o contrato ficaria pendurado em ninguém')

// ---------------------------------------------------------------------------
console.log('\n4) ABRIR O.S. · a busca acha o aparelho do catálogo e o puxa')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'networkidle' })

// Primeiro o cliente, pela carteira — é ele que vai receber o aparelho.
await p.fill('input[name=clienteNome]', 'Odonto')
await p.waitForTimeout(1200)
const sugCliente = p.locator('[role=listbox] [role=option]').first()
await sugCliente.waitFor({ timeout: 8000 }).catch(() => {})
;(await sugCliente.count()) > 0
  ? ok('a carteira reconhece o cliente enquanto se digita')
  : nao('a busca de cliente não sugeriu ninguém')
await sugCliente.click()
await p.waitForTimeout(400)

// Agora o aparelho, pelo catálogo.
await p.fill('input[placeholder*="patrimônio"]', 'Neurodyn')
await p.waitForTimeout(1400)
const sugEq = p.locator('[aria-label="Equipamentos encontrados"] [role=option]').first()
await sugEq.waitFor({ timeout: 8000 }).catch(() => {})
const achouNaBusca = (await sugEq.count()) > 0
achouNaBusca
  ? ok('a busca do catálogo achou o aparelho pela marca')
  : nao('a busca do catálogo não achou o aparelho')

if (achouNaBusca) {
  const rotulo = await sugEq.innerText()
  ;/sem dono/i.test(rotulo)
    ? ok('a sugestão diz de quem é o aparelho antes da escolha')
    : nao(`a sugestão não diz de quem é o aparelho: ${rotulo.replace(/\n/g, ' ')}`)
  await sugEq.click()
  await p.waitForTimeout(500)
}

const puxado = await p.locator('input[name=equipamentoId]').getAttribute('value').catch(() => null)
const marcaNoCampo = await p.inputValue('input[name=marca]')
const travado = await p.locator('input[name=marca]').getAttribute('readonly')
puxado && marcaNoCampo === 'Ibramed' && travado !== null
  ? ok('escolher preencheu os campos, travou a edição e mandou o id do aparelho')
  : nao(`escolher não amarrou o aparelho — id:${puxado} marca:${marcaNoCampo} travado:${travado !== null}`)

// ---------------------------------------------------------------------------
console.log('\n5) ABRIR O.S. · o aparelho ganha dono e NÃO vira uma segunda linha')
// ---------------------------------------------------------------------------
const antes = Number(sql(`select count(*) from equipamentos`))
await p.fill('textarea[name=defeito]', 'QA: liga e desliga sozinho depois de dez minutos de uso.')
await p.getByRole('button', { name: /Abrir O\.S\./i }).click()
await p.waitForURL(/\/painel\/ordens\/[a-z0-9]+$/, { timeout: 25000 }).catch(() => {})
await p.waitForTimeout(1500)

const depois = Number(sql(`select count(*) from equipamentos`))
depois === antes
  ? ok(`nenhum equipamento duplicado (${antes} antes, ${depois} depois)`)
  : nao(`o catálogo duplicou: ${antes} antes, ${depois} depois`)

const virouDono = sql(`select c.nome from equipamentos e join clientes c on c.id=e."clienteId" where e."numeroSerie"='QA-SEM-DONO-1'`)
virouDono.includes('Odonto')
  ? ok(`o aparelho passou a ser do cliente da O.S.: ${virouDono}`)
  : nao(`o aparelho não ganhou dono: ${virouDono || '(continua sem dono)'}`)

const naOrdem = sql(`select o.numero::text from ordens o join equipamentos e on e.id=o."equipamentoId" where e."numeroSerie"='QA-SEM-DONO-1'`)
naOrdem
  ? ok(`a O.S. #${naOrdem} nasceu com o aparelho do catálogo`)
  : nao('a O.S. não ficou ligada ao aparelho puxado')

// ---------------------------------------------------------------------------
console.log('\n6) A TRAVA · puxar o aparelho de outro cliente é recusado no SERVIDOR')
// ---------------------------------------------------------------------------
// O aparelho agora é da Odonto São Bento. A O.S. abaixo é de outro cliente.
await p.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'networkidle' })
await p.fill('input[name=clienteNome]', 'Bella Pelle')
await p.waitForTimeout(1200)
const outro = p.locator('[role=listbox] [role=option]').first()
await outro.waitFor({ timeout: 8000 }).catch(() => {})
await outro.click()
await p.waitForTimeout(400)

await p.fill('input[placeholder*="patrimônio"]', 'Neurodyn')
await p.waitForTimeout(1400)
const sugOutro = p.locator('[aria-label="Equipamentos encontrados"] [role=option]').first()
await sugOutro.waitFor({ timeout: 8000 }).catch(() => {})
await sugOutro.click()
await p.waitForTimeout(500)

const aviso = await p.locator('body').innerText()
;/no nome de/i.test(aviso)
  ? ok('a tela avisa na hora da escolha que o aparelho é de outro cliente')
  : nao('a tela não avisa que o aparelho é de outro cliente')

// A tela avisar não basta: esconder o botão impede o clique, não o pedido.
await p.fill('textarea[name=defeito]', 'QA: tentativa de puxar aparelho de outro cliente.')
const ordensAntes = Number(sql(`select count(*) from ordens`))
await p.getByRole('button', { name: /Abrir O\.S\./i }).click()
await p.waitForTimeout(3000)
const ordensDepois = Number(sql(`select count(*) from ordens`))
const recusa = await p.locator('[role=alert]').first().innerText().catch(() => '')

ordensDepois === ordensAntes && /outro cliente/i.test(recusa)
  ? ok(`o servidor recusou e nada foi gravado: "${recusa.trim().slice(0, 80)}…"`)
  : nao(`a trava falhou — ordens ${ordensAntes}→${ordensDepois}, recusa: "${recusa.trim().slice(0, 80)}"`)

// ---------------------------------------------------------------------------
console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ catálogo e O.S. conversando\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
