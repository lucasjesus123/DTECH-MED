// =============================================================================
// AZUL MÁQUINA · FASE 6 — o Dashboard na ordem do documento
// =============================================================================
// A tela abria com quatro contagens. Contagem é o que se lê DEPOIS de saber que
// está tudo bem — ela não responde "o que eu faço agora". Quem abria o sistema
// de manhã via "12 ordens abertas" e tinha de descobrir sozinho, clicando, que
// três estouraram o prazo e uma delas é de um hospital.
//
// O que cada conferência guarda:
//
//   1. A ORDEM DOS BLOCOS. Alerta, herói, esteira, indicadores. Ela é o miolo
//      da fase e é a coisa mais fácil de desfazer sem querer: qualquer pessoa
//      que acrescentar um bloco novo no lugar cômodo do arquivo muda a ordem
//      de leitura da primeira tela do sistema.
//
//   2. EXATAMENTE UM NÚMERO-HERÓI. Dois candidatos a "o mais importante" e o
//      olho, sem conseguir escolher, volta a varrer tudo — o estado anterior,
//      com fonte maior.
//
//   3. O HERÓI MUDA COM O PAPEL, e o indicador que virou herói SAI da faixa.
//      Sem isso, o mesmo número aparece duas vezes na mesma tela com rótulos
//      diferentes, e quem lê passa a duvidar dos dois.
//
//   4. O BANNER NOMEIA OS CULPADOS. "3 atrasadas" não é acionável: para fazer
//      alguma coisa é preciso saber QUAIS. Os chips têm de trazer o número da
//      O.S. e levar para ela.
//
//   5. O MOTORISTA NÃO VÊ DINHEIRO — nem na tela, nem no HTML. O banner dele
//      troca até a frase da consequência, porque a versão com valor não faz
//      sentido para quem não pode ver valor.
//
//   6. DIA CALMO NÃO GANHA BANNER. Um aviso verde de "tudo certo" ocuparia o
//      lugar mais nobre da tela para não informar nada, e treinaria o olho a
//      pular justamente a faixa onde o problema vai aparecer amanhã.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => {
  const o = execFileSync('psql', ['-h', '127.0.0.1', '-p', '5599', '-U', 'postgres', '-d', 'dtechmed', '-tAc',
    "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n')
  return o.length > 1 ? o.slice(1) : []
}

// ---------------------------------------------------------------------------
// O ROTEIRO CRIA O PROBLEMA DO DIA — e desfaz no fim.
// ---------------------------------------------------------------------------
// O cenário da bateria monta as ordens com prazo no futuro, então não há
// atraso nenhum e o banner não apareceria. Rodando assim, a conferência dos
// chips nunca sairia do papel. Ele então vence o prazo de um punhado de
// ordens, confere, e devolve as datas originais — sem a devolução, os roteiros
// seguintes herdariam ordens atrasadas que ninguém atrasou.
const ETAPA_ALVO = 'EM_MANUTENCAO'
const original = sql(
  `SELECT id, coalesce("prazoPrometido"::text,'') FROM ordens WHERE etapa = '${ETAPA_ALVO}'`,
).map((l) => l.split('|'))

if (original.length > 0) {
  sql(`UPDATE ordens SET "prazoPrometido" = now() - interval '4 days' WHERE etapa = '${ETAPA_ALVO}'`)
}
const devolver = () => {
  if (original.length === 0) return
  const valores = original
    .map(([id, at]) => `('${id}', ${at ? `'${at}'::timestamptz` : 'NULL::timestamptz'})`)
    .join(',')
  sql(`UPDATE ordens o SET "prazoPrometido" = v.at FROM (VALUES ${valores}) AS v(id, at) WHERE o.id = v.id`)
}
process.on('exit', devolver)

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

/** O esqueleto da tela: que blocos existem, em que ordem, e o que dizem. */
const lerTela = (p) =>
  p.evaluate(() => {
    const nome = (el) => String(el.className).split(/\s+/)[0].split('__').pop() ?? ''
    const alvo = /^(alertaDia|heroi|esteira|resumo)$/
    const blocos = []
    for (const el of document.querySelectorAll('section, nav, div')) {
      const n = nome(el)
      if (alvo.test(n) && !blocos.includes(n)) blocos.push(n)
    }
    const banner = document.querySelector('[class*="alertaDia"]')
    return {
      blocos,
      herois: [...document.querySelectorAll('strong[class*="big"]')].map((e) =>
        e.innerText.replace(/\s+/g, ' ').trim(),
      ),
      indicadores: [...document.querySelectorAll('[class*="indicador"]')].map((e) => ({
        rotulo: e.querySelector('[class*="indRotulo"], p, span')?.innerText ?? '',
        texto: e.innerText.replace(/\n/g, ' | '),
      })),
      banner: banner
        ? {
            titulo: banner.querySelector('h2')?.innerText ?? '',
            frase: banner.querySelector('[class*="alertaFrase"]')?.innerText ?? '',
            chips: [...banner.querySelectorAll('[class*="alertaChip"]')]
              .filter((c) => c.tagName === 'A')
              .map((c) => ({ texto: c.innerText.replace(/\n/g, ' '), href: c.getAttribute('href') })),
          }
        : null,
      temRS: document.body.innerHTML.includes('R$'),
    }
  })

const pa = await entrar('lucas@dtechmed.com.br')
await pa.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const admin = await lerTela(pa)

// ---------------------------------------------------------------------------
console.log('\n1) A ORDEM DOS BLOCOS — alerta, herói, esteira, indicadores')
// ---------------------------------------------------------------------------
const esperada = ['alertaDia', 'heroi', 'esteira', 'resumo']
JSON.stringify(admin.blocos) === JSON.stringify(esperada)
  ? ok(`a tela abre na ordem certa: ${admin.blocos.join(' → ')}`)
  : nao(`ordem trocada: esperava ${esperada.join(' → ')}, veio ${admin.blocos.join(' → ')}`)

// ---------------------------------------------------------------------------
console.log('\n2) EXATAMENTE UM número-herói por tela')
// ---------------------------------------------------------------------------
admin.herois.length === 1
  ? ok(`o administrador tem um herói: "${admin.herois[0]}"`)
  : nao(`${admin.herois.length} números-herói na tela do administrador: ${admin.herois.join(' · ')}`)

// ---------------------------------------------------------------------------
console.log('\n3) O HERÓI MUDA COM O PAPEL, e o que virou herói sai da faixa')
// ---------------------------------------------------------------------------
// Quem vê dinheiro tem o faturamento como herói, e "Ordens abertas" continua
// na faixa. Quem não vê tem as ordens como herói — e aí elas NÃO podem
// reaparecer embaixo, porque seria o mesmo número duas vezes.
// O `;` na frente: linha que começa com `/` continua a anterior como DIVISÃO.
;/R\$/.test(admin.herois[0] ?? '')
  ? ok('para quem vê dinheiro, o herói é o faturamento')
  : nao(`o herói do administrador não é dinheiro: "${admin.herois[0]}"`)

const pm = await entrar('adriano@dtechmed.com.br')
await pm.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const motorista = await lerTela(pm)

motorista.herois.length === 1
  ? ok(`o motorista também tem exatamente um herói: "${motorista.herois[0]}"`)
  : nao(`${motorista.herois.length} números-herói na tela do motorista: ${motorista.herois.join(' · ')}`)

// O valor do herói do motorista não pode se repetir em nenhum indicador.
const numeroDoHeroi = (motorista.herois[0] ?? '').match(/\d+/)?.[0] ?? ''
const repetido = motorista.indicadores.filter((i) => {
  const n = i.texto.match(/\b\d+\b/)?.[0]
  return n && n === numeroDoHeroi
})
repetido.length === 0
  ? ok(`o ${numeroDoHeroi} do herói não se repete em nenhum indicador da faixa`)
  : nao(`o número do herói (${numeroDoHeroi}) aparece de novo na faixa: ${repetido.map((i) => i.texto).join(' · ')}`)

// ---------------------------------------------------------------------------
console.log('\n4) O BANNER NOMEIA OS CULPADOS, e cada chip leva para a ordem')
// ---------------------------------------------------------------------------
const atrasadas = Number(
  sql(`SELECT count(*) FROM ordens
        WHERE "prazoPrometido" < now()
          AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')`)[0] ?? '0',
)

if (atrasadas === 0) {
  admin.banner === null
    ? ok('não há atraso no banco e a tela não inventa banner')
    : nao(`nada atrasado no banco e mesmo assim há banner: "${admin.banner.titulo}"`)
} else if (!admin.banner) {
  nao(`${atrasadas} ordens atrasadas no banco e nenhum banner na tela`)
} else {
  admin.banner.titulo.includes(String(atrasadas))
    ? ok(`o banner diz o tamanho certo: "${admin.banner.titulo}"`)
    : nao(`o banner não bate com o banco (${atrasadas}): "${admin.banner.titulo}"`)

  const chips = admin.banner.chips
  chips.length > 0 && chips.length <= 4
    ? ok(`${chips.length} chip(s) com nome, de ${atrasadas} — o resto vira "e mais N"`)
    : nao(`o banner tem ${chips.length} chips; esperava de 1 a 4`)

  const semOs = chips.filter((c) => !/OS-\d+/.test(c.texto))
  semOs.length === 0
    ? ok('todo chip traz o número da O.S.')
    : nao(`chip sem número de O.S.: ${semOs.map((c) => c.texto).join(' · ')}`)

  const semDestino = chips.filter((c) => !/^\/painel\/ordens\/.+/.test(c.href ?? ''))
  semDestino.length === 0
    ? ok('todo chip leva direto para a ordem dele')
    : nao(`chip que não leva para a ordem: ${semDestino.map((c) => c.href).join(' · ')}`)

  ;/R\$/.test(chips.map((c) => c.texto).join(' '))
    ? ok('os chips do administrador carregam o valor exposto')
    : nao('os chips do administrador não mostram valor nenhum')
}

// ---------------------------------------------------------------------------
console.log('\n5) O MOTORISTA não vê dinheiro — nem na tela, nem no HTML')
// ---------------------------------------------------------------------------
motorista.temRS === false
  ? ok('nenhum "R$" no HTML inteiro da tela do motorista')
  : nao('o HTML do motorista contém "R$" — o corte não é na consulta')

if (motorista.banner && admin.banner) {
  const semValor = motorista.banner.chips.every((c) => !/R\$/.test(c.texto))
  semValor
    ? ok('os chips do motorista trazem O.S. e cliente, sem valor')
    : nao('chip do motorista com valor')

  motorista.banner.frase !== admin.banner.frase
    ? ok(`a frase da consequência muda para quem não vê dinheiro: "${motorista.banner.frase}"`)
    : nao('a frase do banner fala em dinheiro para quem não pode ver dinheiro')
}

// ---------------------------------------------------------------------------
console.log('\n6) DIA CALMO não ganha banner')
// ---------------------------------------------------------------------------
// Devolve os prazos ANTES da hora e confere que o banner some. É a metade que
// ninguém testa: garantir que o aviso apareça é fácil, garantir que ele suma
// quando não há motivo é o que evita a faixa que grita todo dia.
devolver()
original.length = 0 // já devolvido; o `process.on('exit')` não repete
const semAtraso = Number(
  sql(`SELECT count(*) FROM ordens
        WHERE "prazoPrometido" < now()
          AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')`)[0] ?? '0',
)
const [descartados, minimos] = [
  Number(sql(`SELECT count(*) FROM outbox_jobs WHERE status = 'DESCARTADO'`)[0] ?? '0'),
  Number(sql(`SELECT count(*) FROM pecas WHERE ativo = true AND saldo <= "estoqueMinimo"`)[0] ?? '0'),
]

await pa.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const depois = await lerTela(pa)

// A afirmação é sempre a mesma, e é a única que vale nos dois casos: O BANNER
// TEM DE CONCORDAR COM O BANCO. Se há atraso, ele fala de prazo; se não há mas
// há aviso preso, fala de aviso; depois estoque; e se não há nada, ele não
// existe.
//
// A primeira versão desta conferência afirmava algo mais forte — "depois de
// devolver os prazos, o banner não fala mais de prazo" — e reprovou. Estava
// errada ELA, não o produto: devolver o prazo original só tira o atraso quando
// o prazo original era futuro, e no cenário havia ordens que já nasciam
// vencidas. Uma conferência que só vale com um estado específico do banco
// acusa o inocente no dia em que o banco muda.
const esperadoAgora =
  semAtraso > 0 ? 'atraso' : descartados > 0 ? 'aviso' : minimos > 0 ? 'estoque' : null

if (esperadoAgora === null) {
  depois.banner === null
    ? ok('sem atraso, sem aviso preso e sem peça no mínimo: a tela não mostra banner')
    : nao(`nada errado no banco e o banner continua: "${depois.banner.titulo}"`)
} else if (!depois.banner) {
  nao(`há ${esperadoAgora} no banco (${semAtraso}/${descartados}/${minimos}) e o banner sumiu`)
} else {
  const fala =
    /prazo/i.test(depois.banner.titulo) ? 'atraso'
    : /aviso/i.test(depois.banner.titulo) ? 'aviso'
    : /peça|peças/i.test(depois.banner.titulo) ? 'estoque'
    : 'outro'
  fala === esperadoAgora
    ? ok(`o banner fala do problema que o banco tem agora (${esperadoAgora}): "${depois.banner.titulo}"`)
    : nao(`o banco tem ${esperadoAgora} e o banner fala de ${fala}: "${depois.banner.titulo}"`)
}

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ FASE 6 INTEIRA VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
