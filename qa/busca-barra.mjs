// A busca da barra: número da O.S., nome do cliente (que leva à ÚLTIMA O.S.),
// e a promessa de que ela não vira porta dos fundos para quem não tem a aba.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' })
  .trim().split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
const uma = (q) => sql(q).pop() ?? ''

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []

async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  p.on('pageerror', (e) => erros.push(`${email}: ${e}`))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

/** Digita e espera a lista assentar — 250ms de espera mais a ida ao servidor. */
async function procurar(p, termo) {
  const campo = p.locator('input[type=search]').first()
  await campo.fill(termo)
  await p.waitForTimeout(1300)
  return (await p.locator('#resultados-da-busca').innerText().catch(() => '')).trim()
}

const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) A busca está em TODA tela do painel, e tem nome para o leitor')
// ---------------------------------------------------------------------------
// Uma tela de busca só é usada por quem lembra que ela existe. Na barra, ela
// está presente inclusive na tela em que a pessoa estava quando o telefone
// tocou — que é o momento em que ela é necessária.
for (const tela of ['/painel', '/painel/ordens', '/painel/clientes', '/painel/financeiro']) {
  await p.goto(`${QA_BASE}${tela}`, { waitUntil: 'networkidle' })
  const n = await p.locator('header input[type=search]').count()
  n === 1 ? ok(`${tela}: a busca está na barra`) : nao(`${tela}: ${n} caixas de busca na barra`)
}
const rotulo = await p.locator('header input[type=search]').getAttribute('aria-label')
;/O\.S\./i.test(String(rotulo)) && /cliente/i.test(String(rotulo))
  ? ok(`o campo se apresenta: "${rotulo}"`)
  : nao(`o campo não diz o que faz: "${rotulo}"`)

// ---------------------------------------------------------------------------
console.log('\n2) O atalho de teclado leva o foco para a busca')
// ---------------------------------------------------------------------------
// Quem atende o balcão está com as duas mãos no teclado e o telefone no ombro.
await p.goto(`${QA_BASE}/painel/ordens`, { waitUntil: 'networkidle' })
await p.locator('body').click({ position: { x: 5, y: 400 } })
await p.keyboard.press('Control+k')
await p.waitForTimeout(300)
const focadoPorAtalho = await p.evaluate(() => document.activeElement?.getAttribute('type') === 'search')
focadoPorAtalho ? ok('Ctrl+K foca a busca') : nao('Ctrl+K não focou a busca')

await p.keyboard.press('Escape')
await p.locator('body').click({ position: { x: 5, y: 400 } })
await p.keyboard.press('/')
await p.waitForTimeout(300)
const focadoPorBarra = await p.evaluate(() => document.activeElement?.getAttribute('type') === 'search')
focadoPorBarra ? ok('a tecla / também foca') : nao('a tecla / não focou a busca')

// ---------------------------------------------------------------------------
console.log('\n3) O NÚMERO da O.S. acha aquela O.S. — e só aquela')
// ---------------------------------------------------------------------------
const alvo = uma(`select numero || '|' || id || '|' || (select nome from clientes c where c.id = o."clienteId")
                    from ordens o order by numero desc limit 1`)
const [numeroAlvo, idAlvo, clienteAlvo] = alvo.split('|')
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const listaNumero = await procurar(p, numeroAlvo)
listaNumero.includes(clienteAlvo) && listaNumero.includes(String(numeroAlvo).padStart(4, '0'))
  ? ok(`"${numeroAlvo}" acha a O.S. #${String(numeroAlvo).padStart(4, '0')} de ${clienteAlvo}`)
  : nao(`"${numeroAlvo}" não achou a O.S.: ${listaNumero.slice(0, 140)}`)

// Pelo número, a ORDEM vem primeiro — é a pergunta que foi feita.
;/^ORDENS DE SERVIÇO/i.test(listaNumero)
  ? ok('pelo número, o grupo das ordens vem primeiro')
  : nao(`pelo número, a lista começa com: ${listaNumero.split('\n')[0]}`)

// E o Enter abre exatamente ela.
await p.keyboard.press('Enter')
await p.waitForURL(/\/painel\/ordens\//, { timeout: 15000 })
p.url().endsWith(`/painel/ordens/${idAlvo}`)
  ? ok('o Enter abre a O.S. daquele número')
  : nao(`o Enter foi para ${p.url()} e devia ir para /painel/ordens/${idAlvo}`)

// A caixa se limpa ao navegar: lista aberta por cima da tela seguinte é a
// maneira mais rápida de a pessoa clicar no lugar errado.
const sobrou = await p.locator('#resultados-da-busca').count()
const campoVazio = await p.locator('header input[type=search]').inputValue()
sobrou === 0 && campoVazio === ''
  ? ok('depois de abrir, a lista fecha e o campo limpa')
  : nao(`ficou lista aberta (${sobrou}) ou termo no campo ("${campoVazio}")`)

// ---------------------------------------------------------------------------
console.log('\n4) O NOME do cliente leva à ÚLTIMA O.S. dele')
// ---------------------------------------------------------------------------
/**
 * É o pedido central: quem digita o nome quase nunca quer a ficha cadastral —
 * quer saber em que pé está o aparelho. A última é conferida contra o BANCO,
 * pela data de abertura, e não contra o que a tela mostra.
 */
const cli = uma(`select c.nome || '|' || c.id from clientes c
                  join ordens o on o."clienteId" = c.id
                 group by c.id, c.nome order by count(*) desc limit 1`)
const [nomeCliente, idCliente] = cli.split('|')
const ultima = uma(`select id || '|' || numero from ordens
                     where "clienteId" = '${idCliente}' order by "abertaEm" desc limit 1`)
const [idUltima, numeroUltima] = ultima.split('|')

// Só um pedaço do nome, como quem digita apressado.
const pedaco = nomeCliente.split(' ').slice(-2).join(' ')
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const listaNome = await procurar(p, pedaco)
listaNome.includes(nomeCliente)
  ? ok(`"${pedaco}" acha ${nomeCliente}`)
  : nao(`"${pedaco}" não achou o cliente: ${listaNome.slice(0, 140)}`)

// PELO NOME, o cliente vem PRIMEIRO — a resposta não pode estar embaixo de
// quatro ordens antigas.
;/^CLIENTES/i.test(listaNome)
  ? ok('pelo nome, o grupo dos clientes vem primeiro')
  : nao(`pelo nome, a lista começa com: ${listaNome.split('\n')[0]}`)

// E a linha do cliente já mostra qual é a última.
listaNome.includes(`#${String(numeroUltima).padStart(4, '0')}`)
  ? ok(`a linha do cliente mostra a última O.S. (#${String(numeroUltima).padStart(4, '0')}), como no banco`)
  : nao(`a linha do cliente não mostra a última (#${String(numeroUltima).padStart(4, '0')})`)

await p.keyboard.press('Enter')
await p.waitForURL(/\/painel\/(ordens|clientes)\//, { timeout: 15000 })
p.url().endsWith(`/painel/ordens/${idUltima}`)
  ? ok(`o Enter no nome abre a ÚLTIMA O.S. daquele cliente`)
  : nao(`o Enter foi para ${p.url()} e devia ir para /painel/ordens/${idUltima}`)

// ---------------------------------------------------------------------------
console.log('\n5) As setas andam, e o Esc fecha')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
await procurar(p, pedaco)
await p.keyboard.press('ArrowDown')
await p.waitForTimeout(200)
const marcadas = await p.locator('#resultados-da-busca [aria-selected=true]').count()
marcadas === 1 ? ok('a seta marca exatamente uma linha') : nao(`${marcadas} linhas marcadas`)

await p.keyboard.press('Escape')
await p.waitForTimeout(300)
;(await p.locator('#resultados-da-busca').count()) === 0
  ? ok('o Esc fecha a lista') : nao('o Esc não fechou a lista')

// ---------------------------------------------------------------------------
console.log('\n6) Nada encontrado diz que não encontrou')
// ---------------------------------------------------------------------------
// Lista vazia sem frase parece tela quebrada, e quem não entende repete a busca.
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const nada = await procurar(p, 'zzqxwv-nao-existe')
;/nada encontrado/i.test(nada)
  ? ok('a busca sem resultado explica') : nao(`sem resultado, a lista diz: "${nada.slice(0, 80)}"`)

// ---------------------------------------------------------------------------
console.log('\n7) Termo hostil não derruba a tela nem alcança o banco')
// ---------------------------------------------------------------------------
// O termo vai como parâmetro do Prisma, nunca concatenado.
for (const veneno of ["' OR 1=1 --", '"; drop table ordens; --', '%', '_', '\\']) {
  const r = await procurar(p, veneno).catch(() => null)
  r === null ? nao(`a busca quebrou com "${veneno}"`) : ok(`"${veneno}" não derruba a busca`)
}
const ordensDePe = uma('select count(*) from ordens')
Number(ordensDePe) > 0
  ? ok(`as ${ordensDePe} ordens continuam no banco`)
  : nao('as ordens sumiram do banco')

// ---------------------------------------------------------------------------
console.log('\n8) A busca NÃO é porta dos fundos: ela repete o que as abas dizem')
// ---------------------------------------------------------------------------
/**
 * O motorista vê a aba de O.S. e a de Equipamentos; NÃO vê a de Clientes. Uma
 * caixa de busca que devolvesse a carteira contornaria a permissão pelo
 * caminho mais discreto que existe — ninguém audita uma lupa.
 */
const m = await entrar('adriano@dtechmed.com.br')
await m.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const doMotorista = await procurar(m, pedaco)
!/^CLIENTES|CLIENTES —/im.test(doMotorista)
  ? ok('o motorista não recebe o grupo de clientes')
  : nao(`o motorista recebeu clientes: ${doMotorista.slice(0, 140)}`)

// Mas a O.S. ele acha — é o trabalho dele, e a aba de O.S. é dele.
const osDoMotorista = await procurar(m, numeroAlvo)
osDoMotorista.includes(String(numeroAlvo).padStart(4, '0'))
  ? ok('o motorista acha a O.S. pelo número — a aba de O.S. é dele')
  : nao(`o motorista não achou a O.S. #${numeroAlvo}`)

// O atendente, que tem a aba de Clientes, recebe os dois grupos.
const a = await entrar('ana@dtechmed.com.br').catch(() => null)
if (a) {
  await a.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
  const doAtendente = await procurar(a, pedaco)
  ;/CLIENTES/i.test(doAtendente)
    ? ok('o atendente recebe os clientes — a aba é dele')
    : nao(`o atendente não recebeu clientes: ${doAtendente.slice(0, 140)}`)
} else {
  nao('NÃO VERIFICADO: não consegui entrar como atendente')
}

// ---------------------------------------------------------------------------
console.log('\n9) Os dois temas, em 1440 e 390')
// ---------------------------------------------------------------------------
// A barra ganhou o elemento mais largo que ela já teve. Em 390px é onde ela
// empurra a tela para o lado, se for empurrar.
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(400)
    const rola = await p.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${tema}/${larg}px: a barra faz a tela rolar de lado`)
    // Com a lista ABERTA também: ela flutua ancorada no campo e não pode
    // ultrapassar a direita da tela.
    await procurar(p, pedaco)
    const rolaAberta = await p.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rolaAberta) nao(`${tema}/${larg}px: a LISTA aberta faz a tela rolar de lado`)
  }
  ok(`${tema}: a barra e a lista cabem em 1440 e 390`)
}

await p.setViewportSize({ width: 1500, height: 1000 })
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
await procurar(p, pedaco)
await p.screenshot({ path: '/tmp/busca-barra.png' })

console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ busca da barra: número, nome, e a última O.S.\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
