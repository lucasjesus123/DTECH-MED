// =============================================================================
// O CALENDÁRIO EM CINCO VISÕES — dia, semana, mês, ano e lista
// =============================================================================
// A grade do mês sozinha obrigava a fazer as outras quatro leituras na cabeça:
// "a terça que vem está cheia?", "onde estão os picos do ano?", "o que tem
// hoje?". As três primeiras conferências abaixo provam que cada visão olha a
// JANELA CERTA — é o erro que uma tela de calendário comete calada, mostrando
// a semana errada ou o mês vizinho sem que nada acuse.
//
// A conferência 6 é a que guarda o pedido literal: manutenção agendada E
// executada precisam aparecer, e não só a que ainda vai acontecer.
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

execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', "delete from compromissos where titulo like 'QA-CAL%'"], { stdio: 'pipe' })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const hoje = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const mes = hoje.slice(0, 7)
const ano = hoje.slice(0, 4)

const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) AS CINCO VISÕES existem e cada uma abre')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/calendario`, { waitUntil: 'networkidle' })
const barra = await p.locator('nav[aria-label="Como olhar o calendário"]').innerText().catch(() => '')
const todas = ['Dia', 'Semana', 'Mês', 'Ano', 'Lista'].every((v) => barra.includes(v))
todas
  ? ok(`a barra oferece as cinco: ${barra.replace(/\n/g, ' · ')}`)
  : nao(`faltam visões na barra: "${barra.replace(/\n/g, ' · ')}"`)

for (const v of ['dia', 'semana', 'mes', 'ano', 'lista']) {
  const r = await p.goto(`${QA_BASE}/painel/calendario?ver=${v}&dia=${hoje}`, { waitUntil: 'networkidle' })
  const status = r ? r.status() : 0
  const marcada = await p.locator('nav[aria-label="Como olhar o calendário"] [aria-current=page]').innerText().catch(() => '')
  status === 200 && marcada.length > 0
    ? ok(`${v}: abre (HTTP 200) e a aba marcada é "${marcada}"`)
    : nao(`${v}: HTTP ${status}, aba marcada "${marcada}"`)
}

// ---------------------------------------------------------------------------
console.log('\n2) A JANELA de cada visão — a semana tem 7 dias, o mês tem o mês')
// ---------------------------------------------------------------------------
// É o erro que um calendário comete calado: mostrar a semana errada, ou o mês
// vizinho, sem que nada na tela acuse.
await p.goto(`${QA_BASE}/painel/calendario?ver=semana&dia=${hoje}`, { waitUntil: 'networkidle' })
const celulasSemana = await p.locator('table td').count()
celulasSemana === 7
  ? ok('a semana desenha exatamente 7 células')
  : nao(`a semana desenhou ${celulasSemana} células, não 7`)

await p.goto(`${QA_BASE}/painel/calendario?ver=mes&dia=${hoje}`, { waitUntil: 'networkidle' })
const celulasMes = await p.locator('table td').count()
celulasMes % 7 === 0 && celulasMes >= 28 && celulasMes <= 42
  ? ok(`o mês desenha ${celulasMes} células (semanas inteiras)`)
  : nao(`o mês desenhou ${celulasMes} células`)

await p.goto(`${QA_BASE}/painel/calendario?ver=ano&dia=${hoje}`, { waitUntil: 'networkidle' })
const meses = await p.locator('[class*="calAnoMes"]').count()
meses === 12
  ? ok('o ano desenha os doze meses')
  : nao(`o ano desenhou ${meses} meses, não 12`)

// ---------------------------------------------------------------------------
console.log('\n3) TROCAR DE VISÃO NÃO PERDE O LUGAR')
// ---------------------------------------------------------------------------
// Uma âncora só na URL. Sem isto, quem está olhando dezembro e clica em "Dia"
// cai em hoje, e tem de navegar de volta — que é o jeito mais rápido de a
// pessoa desistir de usar as visões.
const longe = `${ano}-12-15`
await p.goto(`${QA_BASE}/painel/calendario?ver=mes&dia=${longe}`, { waitUntil: 'networkidle' })
const linkDia = await p.locator('nav[aria-label="Como olhar o calendário"] a', { hasText: 'Dia' }).first().getAttribute('href')
String(linkDia).includes(longe)
  ? ok(`ir de Mês para Dia mantém ${longe}: ${linkDia}`)
  : nao(`trocar de visão perdeu o lugar: ${linkDia}`)

// ---------------------------------------------------------------------------
console.log('\n4) A NAVEGAÇÃO anda no passo da visão')
// ---------------------------------------------------------------------------
// A mesma seta ‹ › vale para as cinco visões, e cada uma anda o SEU período.
// Uma seta que anda um mês na visão de dia é a definição de tela confusa.
const passos = [
  ['dia', `${ano}-06-15`, `${ano}-06-14`, `${ano}-06-16`],
  ['semana', `${ano}-06-15`, `${ano}-06-07`, `${ano}-06-21`],
  ['mes', `${ano}-06-15`, `${ano}-05-01`, `${ano}-07-01`],
  ['ano', `${ano}-06-15`, `${Number(ano) - 1}-06-01`, `${Number(ano) + 1}-06-01`],
]
for (const [v, foco, esperadoAntes, esperadoDepois] of passos) {
  await p.goto(`${QA_BASE}/painel/calendario?ver=${v}&dia=${foco}`, { waitUntil: 'networkidle' })
  const antes = await p.locator('a[aria-label="Período anterior"]').getAttribute('href')
  const depois = await p.locator('a[aria-label="Próximo período"]').getAttribute('href')
  String(antes).includes(esperadoAntes) && String(depois).includes(esperadoDepois)
    ? ok(`${v}: ‹ vai para ${esperadoAntes} e › para ${esperadoDepois}`)
    : nao(`${v}: setas erradas — ‹ ${antes} › ${depois}`)
}

// ---------------------------------------------------------------------------
console.log('\n5) + NOVO EVENTO abre o painel de marcar, sem procurar nada')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/calendario?ver=mes&dia=${hoje}`, { waitUntil: 'networkidle' })
const botao = p.getByRole('link', { name: '+ Novo evento' })
;(await botao.count()) > 0
  ? ok('o botão "+ Novo evento" está no cabeçalho')
  : nao('não há botão de novo evento')
await botao.click()
await p.waitForTimeout(1200)

const abriu = (await p.locator('input[name=titulo]').count()) > 0
abriu
  ? ok('clicar nele já abre o formulário de marcar — sem passo intermediário')
  : nao('o botão não abriu o formulário')

// E cria de verdade.
await p.fill('input[name=titulo]', 'QA-CAL compromisso do botão')
await p.fill('input[name=hora]', '09:15')
await p.getByRole('button', { name: 'Marcar compromisso' }).click()
await p.waitForTimeout(2800)
const criado = sql(`select to_char(dia,'YYYY-MM-DD')||'|'||coalesce(hora,'-') from compromissos where titulo='QA-CAL compromisso do botão'`)
criado.startsWith(hoje) && criado.endsWith('09:15')
  ? ok(`gravou no dia certo: ${criado}`)
  : nao(`não gravou como esperado: ${criado || '(nada)'}`)

// ---------------------------------------------------------------------------
console.log('\n6) CLICAR NUM DIA DO MÊS já começa — e o novo aparece IMEDIATO')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/calendario?ver=mes&dia=${hoje}`, { waitUntil: 'networkidle' })
const noMes = await p.locator('body').innerText()
noMes.includes('QA-CAL compromisso do botão')
  ? ok('o compromisso recém-criado já está na grade do mês')
  : nao('o compromisso criado não apareceu na grade')

// O número do dia é o botão de marcar: um clique e o formulário está aberto.
const diaDoMes = Number(hoje.slice(8))
await p.locator('a[class*="calNumero"]', { hasText: new RegExp(`^${diaDoMes}$`) }).first().click()
await p.waitForTimeout(1500)
;(await p.locator('input[name=titulo]').count()) > 0
  ? ok('clicar no número do dia abre o formulário na hora')
  : nao('clicar no dia não abriu o formulário')

// ---------------------------------------------------------------------------
console.log('\n7) MANUTENÇÃO agendada E executada aparecem — as duas')
// ---------------------------------------------------------------------------
/**
 * O cenário de ensaio não nasce com visita preventiva nenhuma, e sem visita
 * esta conferência viraria um "NÃO TESTADO" permanente no item que o dono
 * pediu com todas as letras. Então o roteiro CRIA o contrato — pela tela, como
 * uma pessoa faria — e o sistema gera as visitas sozinho.
 *
 * Só o STATUS de uma delas é virado por SQL. Não é atalho preguiçoso: o que
 * está sob teste aqui é a LEITURA do calendário, não o caminho que leva uma
 * visita a ficar realizada — esse caminho (visita → O.S.) é do roteiro da
 * jornada, e refazê-lo aqui testaria a mesma coisa duas vezes e deixaria este
 * roteiro quebrar por motivo alheio ao calendário.
 */
await p.goto(`${QA_BASE}/painel/preventiva`, { waitUntil: 'networkidle' })
// O formulário nasce fechado atrás de "Novo contrato" — a tela é lida muito
// mais do que preenchida.
const abridor = p.getByRole('button', { name: 'Novo contrato' })
if ((await abridor.count()) > 0) {
  await abridor.click()
  await p.waitForTimeout(600)
}
const temFormulario = (await p.locator('select[name=equipamentoId]').count()) > 0
if (temFormulario && sql('select count(*) from visitas_preventivas') === '0') {
  await p.locator('select[name=equipamentoId]').selectOption({ index: 1 })
  await p.locator('select[name=periodicidade]').selectOption('MENSAL')
  await p.fill('input[name=inicio]', `${mes}-05`)
  await p.fill('input[name=valorVisita]', '380')
  await p.getByRole('button', { name: 'Abrir contrato' }).click()
  await p.waitForTimeout(3000)
  // Uma visita passa a REALIZADA, para a conferência ter os dois lados.
  execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
    '-c', "select set_config('app.is_super_admin','on',false)",
    '-c', `update visitas_preventivas set status='REALIZADA'
            where id = (select id from visitas_preventivas order by "previstaPara" asc limit 1)`],
    { stdio: 'pipe' })
}

// O pedido era literal: "tudo o que for de manutenção (agendada, executada)
// PRECISA APARECER IMEDIATO NO CALENDÁRIO". O calendário traz toda visita que
// não foi CANCELADA — então uma REALIZADA continua na grade, que é o que
// permite olhar para trás e ver o que foi feito.
const porStatus = sql(`select status||'='||count(*) from visitas_preventivas group by status`)
console.log(`     visitas no banco: ${porStatus || '(nenhuma)'}`)

const umaRealizada = sql(`select to_char("previstaPara" AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')
                            from visitas_preventivas where status='REALIZADA' limit 1`)
if (!umaRealizada) {
  console.log('     ⚠️  NÃO TESTADO: o cenário de ensaio não tem visita REALIZADA para conferir')
} else {
  await p.goto(`${QA_BASE}/painel/calendario?ver=dia&dia=${umaRealizada}`, { waitUntil: 'networkidle' })
  const texto = await p.locator('body').innerText()
  ;/Preventiva/i.test(texto)
    ? ok(`a visita REALIZADA de ${umaRealizada} aparece no calendário`)
    : nao(`a visita REALIZADA de ${umaRealizada} não aparece`)
}

const agendada = sql(`select to_char("previstaPara" AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')
                        from visitas_preventivas where status in ('PREVISTA','AGENDADA') limit 1`)
if (!agendada) {
  console.log('     ⚠️  NÃO TESTADO: sem visita agendada no cenário')
} else {
  await p.goto(`${QA_BASE}/painel/calendario?ver=dia&dia=${agendada}`, { waitUntil: 'networkidle' })
  const texto = await p.locator('body').innerText()
  ;/Preventiva/i.test(texto)
    ? ok(`a visita agendada de ${agendada} aparece no calendário`)
    : nao(`a visita agendada de ${agendada} não aparece`)
}

// A cancelada é a única que NÃO entra: ela não vai acontecer, e um calendário
// que mostra o que foi desmarcado faz a pessoa sair para uma visita cancelada.
const cancelada = sql(`select count(*) from visitas_preventivas where status='CANCELADA'`)
console.log(`     canceladas (ficam de fora, de propósito): ${cancelada}`)

// ---------------------------------------------------------------------------
console.log('\n8) O MOTORISTA continua sem ver dinheiro, em TODAS as visões')
// ---------------------------------------------------------------------------
// O corte é na consulta, e a visão de ano usa uma consulta DIFERENTE das
// outras quatro. É exatamente o tipo de lugar onde uma trava se perde.
const m = await entrar('adriano@dtechmed.com.br')
for (const v of ['dia', 'semana', 'mes', 'ano', 'lista']) {
  await m.goto(`${QA_BASE}/painel/calendario?ver=${v}&dia=${hoje}`, { waitUntil: 'networkidle' })
  const corpo = await m.locator('body').innerText()
  const temFiltroDinheiro = /A receber|A pagar/.test(corpo)
  const temValor = /R\$\s?\d/.test(corpo)
  !temFiltroDinheiro && !temValor
    ? ok(`${v}: nenhum valor nem filtro de dinheiro para o motorista`)
    : nao(`${v}: vazou dinheiro — filtro:${temFiltroDinheiro} valor:${temValor}`)
}

// ---------------------------------------------------------------------------
console.log('\n9) O ENDEREÇO ANTIGO continua valendo')
// ---------------------------------------------------------------------------
// Links de `?mes=AAAA-MM` já foram mandados por mensagem. Uma tela que ganha
// visões não pode quebrá-los.
const r = await p.goto(`${QA_BASE}/painel/calendario?mes=${mes}`, { waitUntil: 'networkidle' })
const marcada = await p.locator('nav[aria-label="Como olhar o calendário"] [aria-current=page]').innerText().catch(() => '')
r?.status() === 200 && marcada === 'Mês'
  ? ok('?mes=AAAA-MM ainda abre, e cai na visão de mês')
  : nao(`o endereço antigo quebrou: HTTP ${r?.status()}, aba "${marcada}"`)

// ---------------------------------------------------------------------------
console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ calendário: cinco visões, e o lugar não se perde\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
