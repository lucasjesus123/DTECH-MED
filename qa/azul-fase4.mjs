// =============================================================================
// AZUL MÁQUINA · FASE 4 — a aura, a sombra fora dos cards, e a densidade
// =============================================================================
// As três coisas desta passada são MEDÍVEIS, e é por isso que elas cabem num
// roteiro em vez de caberem só num print. Um print prova que a tela está
// bonita hoje; ele não avisa quando alguém devolver a sombra ao card daqui a
// dois meses.
//
// O que cada conferência guarda:
//
//   1. A AURA EXISTE E ESTÁ ATRÁS DE TUDO. Halos, grade de 56px, máscara —
//      e, principalmente, `z-index` negativo e `pointer-events: none`. Uma
//      aura que intercepta clique é um defeito que não se vê: a tela parece
//      certa e o botão não responde.
//
//   2. O FUNDO NÃO SE MEXE. São três as animações que este sistema aceita, e
//      fundo animado não é uma delas. A conferência lê `animation-name` das
//      duas camadas.
//
//   3. NENHUM CARD TEM SOMBRA. Ela varre a tela inteira procurando quem tem
//      borda, raio e `box-shadow` de deslocamento — que é a assinatura da
//      sombra de elevação. Halo (deslocamento zero) e anel são liberados de
//      propósito: são luz de marca, e a regra é sobre elevação.
//
//   4. O QUE FLUTUA CONTINUA COM SOMBRA. É a outra metade da regra, e a que
//      se perde primeiro: quem tira sombra de tudo achata o menu suspenso
//      contra a tabela de baixo, e aí a lista de busca deixa de parecer que
//      está por cima.
//
//   5. A LINHA DE UMA LINHA FECHA ENTRE 38 E 40px. Medida injetando uma linha
//      curta na tabela real, com o CSS real. A linha de DUAS linhas fica de
//      fora do alvo de propósito: apertar ela exigiria esconder a segunda
//      informação, e densidade nunca foi desculpa para tirar dado da tela.
//
//   6. PADDING DE CARD ENTRE 14 E 17px. Varre as telas e acusa quem escapou.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await nav.newContext({ viewport: { width: 1366, height: 768 } })
const erros = []
const p = await ctx.newPage()
p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br')
await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

const TELAS = [
  ['Dashboard', '/painel'],
  ['O.S.', '/painel/ordens'],
  ['Clientes', '/painel/clientes'],
  ['Financeiro', '/painel/financeiro'],
  ['Estoque', '/painel/estoque'],
  ['Equipamentos', '/painel/equipamentos'],
  ['Calendário', '/painel/calendario'],
]

// ---------------------------------------------------------------------------
console.log('\n1) A AURA existe, está atrás de tudo e não intercepta clique')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const aura = await p.evaluate(() => {
  // O 56px mora em `background-size`, e não em `background-image`: a imagem é
  // o par de `linear-gradient` que desenha o fio, e o tamanho é o que faz dele
  // uma grade. Procurar no lugar errado dava "não achei a aura" com a aura
  // pintada na tela — o modo mais caro de um roteiro errar.
  const alvo = [...document.querySelectorAll('div')].find((d) =>
    getComputedStyle(d, '::after').backgroundSize.includes('56px'))
  if (!alvo) return null
  const b = getComputedStyle(alvo, '::before')
  const a = getComputedStyle(alvo, '::after')
  return {
    halos: b.backgroundImage,
    haloZ: b.zIndex, haloClique: b.pointerEvents,
    grade: a.backgroundSize,
    mascara: a.maskImage || a.webkitMaskImage || '',
    gradeZ: a.zIndex, gradeClique: a.pointerEvents,
    animacoes: [b.animationName, a.animationName],
  }
})
if (!aura) {
  nao('não achei a camada da aura (nenhuma `::after` com grade de 56px)')
} else {
  ;(aura.halos.match(/radial-gradient/g) || []).length >= 2
    ? ok('os dois halos radiais estão lá')
    : nao(`esperava dois halos radiais, achei: ${aura.halos.slice(0, 80)}`)
  aura.grade.includes('56px')
    ? ok(`a grade é de 56px (${aura.grade})`)
    : nao(`a grade não é de 56px: ${aura.grade}`)
  aura.mascara.includes('radial-gradient')
    ? ok('a grade se dissolve por máscara radial')
    : nao(`a grade não tem máscara radial: "${aura.mascara.slice(0, 60)}"`)
  ;(Number(aura.haloZ) < 0 && Number(aura.gradeZ) < 0)
    ? ok(`as duas camadas ficam atrás do conteúdo (z ${aura.haloZ} e ${aura.gradeZ})`)
    : nao(`aura na frente do conteúdo: z ${aura.haloZ} e ${aura.gradeZ}`)
  ;(aura.haloClique === 'none' && aura.gradeClique === 'none')
    ? ok('nenhuma das camadas intercepta clique')
    : nao(`aura intercepta clique: ${aura.haloClique} / ${aura.gradeClique}`)
}

// ---------------------------------------------------------------------------
console.log('\n2) O FUNDO NÃO SE MEXE — fundo animado não é uma das três')
// ---------------------------------------------------------------------------
if (aura) {
  aura.animacoes.every((n) => n === 'none')
    ? ok('as duas camadas da aura estão paradas')
    : nao(`a aura ainda anima: ${aura.animacoes.join(' / ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n3) NENHUM CARD COM SOMBRA, nas duas paletas')
// ---------------------------------------------------------------------------
// A assinatura da sombra de elevação é o DESLOCAMENTO: `0 1px 2px`, `0 10px
// 26px`. Halo é `0 0 Npx` — deslocamento zero — e anel é `0 0 0 1px`. Os dois
// últimos são luz de marca e continuam permitidos; a regra é sobre elevação.
const temDeslocamento = `(s) => {
  if (!s || s === 'none') return false
  for (const camada of s.split(/,(?![^()]*\\))/)) {
    if (/inset/.test(camada)) continue
    const n = camada.match(/-?\\d+(?:\\.\\d+)?px/g)
    if (!n) continue
    const [x, y] = n
    if (parseFloat(x) !== 0 || parseFloat(y) !== 0) return true
  }
  return false
}`

for (const tema of ['escuro', 'claro']) {
  await ctx.addCookies([{ name: 'dtechmed_tema', value: tema, url: QA_BASE }])
  const culpados = []
  for (const [nome, rota] of TELAS) {
    await p.goto(`${QA_BASE}${rota}`, { waitUntil: 'networkidle' })
    const achados = await p.evaluate((fonte) => {
      const desloca = eval(fonte)
      const px = (v) => parseFloat(v) || 0
      // Quem flutua tem direito à sombra. A lista é por CLASSE porque é assim
      // que a exceção fica legível: dá para ler "menu, modal, folha, gaveta".
      const FLUTUA = /busca(Lista|Caixa)|janela|sugestoes|telaCaixa|folha|caixaBaixaForm|dica|balao|toast/i
      const r = []
      for (const el of document.querySelectorAll('*')) {
        const c = getComputedStyle(el)
        const cx = el.getBoundingClientRect()
        if (cx.width < 120 || cx.height < 44) continue
        if (!(px(c.borderTopWidth) >= 1 && c.borderTopStyle === 'solid')) continue
        if (px(c.borderTopLeftRadius) < 6) continue
        const classe = String(el.className || '')
        if (FLUTUA.test(classe)) continue
        if (desloca(c.boxShadow)) {
          r.push(classe.split(/\s+/).map((k) => k.split('__').pop()).join('.') + ' → ' + c.boxShadow.slice(0, 44))
        }
      }
      return [...new Set(r)]
    }, temDeslocamento)
    for (const a of achados) culpados.push(`${nome}: ${a}`)
  }
  culpados.length === 0
    ? ok(`no tema ${tema}, nenhum card carrega sombra de elevação`)
    : nao(`no tema ${tema}, ${culpados.length} card(s) com sombra:\n       ${culpados.slice(0, 6).join('\n       ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n4) O QUE FLUTUA CONTINUA COM SOMBRA — a outra metade da regra')
// ---------------------------------------------------------------------------
await ctx.addCookies([{ name: 'dtechmed_tema', value: 'escuro', url: QA_BASE }])
await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
const busca = p.locator('input[type="search"], input[placeholder*="Buscar"]').first()
await busca.click()
await busca.fill('Clínica')
await p.waitForTimeout(900)
const listaFlutua = await p.evaluate((fonte) => {
  const desloca = eval(fonte)
  const lista = document.querySelector('[role="listbox"], [class*="buscaLista"]')
  if (!lista) return 'sem lista'
  return desloca(getComputedStyle(lista).boxShadow)
}, temDeslocamento)
listaFlutua === true
  ? ok('a lista da busca continua com sombra — ela flutua sobre a tela')
  : nao(`a lista suspensa da busca perdeu a elevação (${listaFlutua})`)
await p.keyboard.press('Escape')

// ---------------------------------------------------------------------------
console.log('\n5) A LINHA DE UMA LINHA fecha entre 38 e 40px')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
const linha = await p.evaluate(() => {
  const tb = document.querySelector('table tbody')
  if (!tb || !tb.firstElementChild) return null
  const tr = document.createElement('tr')
  for (let i = 0; i < tb.firstElementChild.children.length; i++) {
    const td = document.createElement('td')
    td.textContent = '—'          // curto de propósito: uma linha em qualquer coluna
    tr.appendChild(td)
  }
  tb.appendChild(tr)
  const h = Math.round(tr.getBoundingClientRect().height * 10) / 10
  tr.remove()
  return h
})
if (linha === null) nao('não achei tabela para medir a linha')
else if (linha >= 38 && linha <= 40) ok(`a linha de uma linha fecha em ${linha}px`)
else nao(`a linha de uma linha está em ${linha}px — o alvo é 38 a 40`)

// ---------------------------------------------------------------------------
console.log('\n6) PADDING DE CARD entre 14 e 17px')
// ---------------------------------------------------------------------------
// A moldura do que flutua fica de fora: caixa de diálogo tem folga própria, e
// apertar o corpo de um modal para 16px é apertar o que ninguém opera oito
// horas por dia.
const gordos = []
for (const [nome, rota] of TELAS) {
  await p.goto(`${QA_BASE}${rota}`, { waitUntil: 'networkidle' })
  const achados = await p.evaluate(() => {
    const px = (v) => parseFloat(v) || 0
    const FORA = /tela(Topo|Corpo|Pe|Caixa|Fundo)|folha|janela|modeloPapel|papel/i
    const r = []
    for (const el of document.querySelectorAll('div,article,section,li')) {
      const c = getComputedStyle(el)
      const cx = el.getBoundingClientRect()
      if (cx.width < 200 || cx.height < 60) continue
      if (!(px(c.borderTopWidth) >= 1 && c.borderTopStyle === 'solid')) continue
      if (px(c.borderTopLeftRadius) < 6) continue
      const classe = String(el.className || '')
      if (FORA.test(classe)) continue
      const pt = px(c.paddingTop)
      if (pt === 0) continue
      if (pt < 14 || pt > 17) {
        r.push(classe.split(/\s+/)[0].split('__').pop() + ` → ${pt}px`)
      }
    }
    return [...new Set(r)]
  })
  for (const a of achados) gordos.push(`${nome}: ${a}`)
}
gordos.length === 0
  ? ok('todo card da varredura tem padding entre 14 e 17px')
  : nao(`${gordos.length} card(s) fora da faixa:\n       ${gordos.slice(0, 8).join('\n       ')}`)

// ---------------------------------------------------------------------------
console.log('\n7) NADA ROLA NA HORIZONTAL, e o console fica limpo')
// ---------------------------------------------------------------------------
const vazando = []
for (const [nome, rota] of TELAS) {
  await p.goto(`${QA_BASE}${rota}`, { waitUntil: 'networkidle' })
  const rola = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  if (rola) vazando.push(nome)
}
vazando.length === 0
  ? ok('nenhuma das telas rola na horizontal em 1366px')
  : nao(`rolagem horizontal em: ${vazando.join(', ')}`)

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ FASE 4 INTEIRA VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
