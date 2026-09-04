// =============================================================================
// AZUL MÁQUINA · FASE 7 — a previsão de prazo, e o contrato de inferência
// =============================================================================
// Esta é a primeira coisa do sistema que o operador NÃO registrou: o sistema
// deduziu. A regra que o documento chama de a mais importante diz que toda
// saída de IA carrega três coisas — selo, confiança com base, e fonte que dá
// para clicar e conferir. "Se não dá para clicar e conferir, não pode ser
// afirmado."
//
// O que cada conferência guarda:
//
//   1. AS TRÊS OBRIGAÇÕES APARECEM JUNTAS. Não uma delas: as três. É o contrato
//      inteiro, e ele vale mais que qualquer número que o modelo produza.
//
//   2. O SELO É TEAL — e este é o ÚNICO lugar do sistema onde teal é permitido.
//      Ele foi recusado três vezes nas fases anteriores (halo da aura, selo de
//      gargalo, chip de "ao vivo") porque as três eram aritmética. Se um dia
//      alguém pintar outra coisa de teal, é aqui que a distinção morre.
//
//   3. A BARRA DE RISCO NÃO É TEAL. O selo já disse que a linha é inferência;
//      a barra fala de GRAVIDADE, que é outra escala. Misturar as duas apaga a
//      leitura que o operador precisa fazer.
//
//   4. TODA LINHA TEM MOTIVO. Um percentual sozinho não muda decisão nenhuma:
//      "55%" faz perguntar "por quê?", e se a tela não responde, a pessoa
//      ignora o número na terceira vez.
//
//   5. A RECUSA APARECE quando a base seca — e é CINZA, não teal. Marcar de
//      teal seria usar a tinta de conclusão para dizer que não houve conclusão.
//      Esta é a conferência que mais importa: um estimador que sempre responde
//      é um estimador que mente quando não sabe.
//
//   6. ORDEM JÁ VENCIDA NÃO ENTRA NA PREVISÃO. "Vai estourar" não é previsão
//      para quem já estourou — é fato, e o banner do dia já o diz com nome e
//      valor. Misturar gastaria a tinta de inferência num dado registrado.
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

/** O painel da previsão, decomposto em peças. */
const lerPrevisao = (p) =>
  p.evaluate(() => {
    const painel = document.querySelector('[class*="painelIa"]')
    if (!painel) return null
    const cor = (el) => {
      const m = el ? getComputedStyle(el).color.match(/\d+/g) : null
      return m ? m.slice(0, 3).map(Number) : null
    }
    const selo = painel.querySelector('[class*="seloIa"]')
    const recusa = painel.querySelector('[class*="semBase"]')
    const conf = painel.querySelector('[class*="confianca"]')
    return {
      selo: selo?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      corDoSelo: cor(selo),
      recusa: recusa
        ? { texto: recusa.innerText.replace(/\n/g, ' '), cor: cor(recusa.querySelector('p')) }
        : null,
      confianca: conf
        ? {
            pct: conf.querySelector('strong')?.innerText ?? '',
            base: conf.querySelector('[class*="confiancaBase"]')?.innerText ?? '',
          }
        : null,
      linhas: [...painel.querySelectorAll('[class*="previsaoItem"]')].map((li) => {
        const barra = li.querySelector('[class*="riscoTopo"] strong')
        return {
          os: li.querySelector('[class*="previsaoOs"]')?.innerText ?? '',
          motivo: li.querySelector('[class*="previsaoMotivo"]')?.innerText ?? '',
          risco: barra?.innerText ?? '',
          corDoRisco: cor(barra),
          faixa: li.querySelector('[class*="riscoFaixa"]')?.innerText ?? '',
          fontes: [...li.querySelectorAll('[class*="fonte"]')]
            .filter((a) => a.tagName === 'A')
            .map((a) => ({ texto: a.innerText, href: a.getAttribute('href') })),
        }
      }),
    }
  })

const p = await entrar('lucas@dtechmed.com.br')
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const prev = await lerPrevisao(p)

if (!prev) {
  nao('não achei o painel da previsão na tela')
  await nav.close()
  process.exit(1)
}

const concluidas = Number(
  sql(`SELECT count(*) FROM ordens WHERE etapa = 'FINALIZADO'`)[0] ?? '0',
)

// ---------------------------------------------------------------------------
console.log(`\n1) AS TRÊS OBRIGAÇÕES (${concluidas} O.S. concluídas no banco)`)
// ---------------------------------------------------------------------------
prev.selo && /PREVIS/i.test(prev.selo)
  ? ok(`o selo se declara inferência: "${prev.selo}"`)
  : nao(`sem selo de inferência: "${prev.selo}"`)

if (prev.recusa) {
  console.log('  · o modelo está recusando; confiança e fontes não se aplicam nesta rodada')
} else {
  prev.confianca && /%/.test(prev.confianca.pct)
    ? ok(`a confiança sai em percentual: ${prev.confianca.pct}`)
    : nao('a previsão saiu sem percentual de confiança')

  prev.confianca && prev.confianca.base.trim().length > 10
    ? ok(`e com a base de cálculo: "${prev.confianca.base}"`)
    : nao(`confiança sem base de cálculo: "${prev.confianca?.base}"`)

  const semFonte = prev.linhas.filter((l) => l.fontes.length === 0)
  semFonte.length === 0 && prev.linhas.length > 0
    ? ok(`as ${prev.linhas.length} linhas trazem fontes clicáveis`)
    : nao(`${semFonte.length} linha(s) sem fonte — o que não dá para conferir não pode ser afirmado`)

  const fontesRuins = prev.linhas
    .flatMap((l) => l.fontes)
    .filter((f) => !/^\/painel\/ordens\/.+/.test(f.href ?? ''))
  fontesRuins.length === 0
    ? ok('toda fonte leva à O.S. que sustenta o número')
    : nao(`fonte que não leva a uma O.S.: ${fontesRuins.map((f) => f.href).join(' · ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n2) O SELO É TEAL — o único lugar do sistema onde ele é permitido')
// ---------------------------------------------------------------------------
// Teal é verde-água: o canal verde na frente do vermelho, e o azul não muito
// atrás. A regra separa teal de âmbar (vermelho na frente) e de cobalto (azul
// na frente) sem depender do valor exato do token.
const ehTeal = ([r, g, b]) => g > r && g >= b * 0.8 && b < g * 1.4 && g > 60
prev.corDoSelo && ehTeal(prev.corDoSelo)
  ? ok(`o selo sai em teal, rgb(${prev.corDoSelo.join(',')})`)
  : nao(`o selo não está em teal: rgb(${prev.corDoSelo?.join(',')})`)

// ---------------------------------------------------------------------------
console.log('\n3) A BARRA DE RISCO NÃO é teal — inferência e gravidade são escalas diferentes')
// ---------------------------------------------------------------------------
if (prev.linhas.length === 0) {
  console.log('  · sem linhas nesta rodada; a cor da barra não pôde ser lida — NÃO TESTADO')
} else {
  const tealNoRisco = prev.linhas.filter((l) => l.corDoRisco && ehTeal(l.corDoRisco))
  tealNoRisco.length === 0
    ? ok(`as ${prev.linhas.length} barras de risco usam cor de estado, não a tinta de IA`)
    : nao(`${tealNoRisco.length} barra(s) de risco em teal — a escala de gravidade virou a de inferência`)

  const semFaixa = prev.linhas.filter((l) => !/prov|incerto/i.test(l.faixa))
  semFaixa.length === 0
    ? ok('cada risco vem com a faixa por extenso — estado não se comunica só por cor')
    : nao(`${semFaixa.length} linha(s) sem faixa em texto`)
}

// ---------------------------------------------------------------------------
console.log('\n4) TODA LINHA TEM MOTIVO')
// ---------------------------------------------------------------------------
if (prev.linhas.length === 0) {
  console.log('  · sem linhas nesta rodada — NÃO TESTADO')
} else {
  const mudas = prev.linhas.filter((l) => l.motivo.trim().length < 8)
  mudas.length === 0
    ? ok(`as ${prev.linhas.length} linhas dizem o que empurrou o número`)
    : nao(`${mudas.length} linha(s) com percentual e sem motivo`)
}

// ---------------------------------------------------------------------------
console.log('\n5) ORDEM JÁ VENCIDA não entra na previsão — isso é fato, não palpite')
// ---------------------------------------------------------------------------
const vencidas = sql(
  `SELECT numero FROM ordens
    WHERE "prazoPrometido" < now()
      AND etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')`,
).filter(Boolean)
const naPrevisao = prev.linhas.map((l) => l.os.replace(/\D/g, '').replace(/^0+/, ''))
const intrusas = vencidas.filter((n) => naPrevisao.includes(n.trim()))
intrusas.length === 0
  ? ok(`nenhuma das ${vencidas.length} ordens já vencidas aparece na previsão`)
  : nao(`ordem já vencida na previsão: ${intrusas.join(', ')}`)

// ---------------------------------------------------------------------------
console.log('\n6) A RECUSA — sem base, o modelo se cala e diz o que falta')
// ---------------------------------------------------------------------------
// Some o histórico e confere que a tela troca a previsão pela recusa. É a
// conferência que mais importa do arquivo: garantir que o número apareça é
// fácil; garantir que ele SUMA quando não há base é o que separa um estimador
// honesto de um gerador de percentuais.
const guardadas = sql(`SELECT id FROM ordens WHERE etapa = 'FINALIZADO'`).filter(Boolean)
const devolver = () => {
  if (guardadas.length === 0) return
  sql(`UPDATE ordens SET etapa = 'FINALIZADO'
        WHERE id IN (${guardadas.map((id) => `'${id.trim()}'`).join(',')})`)
}
process.on('exit', devolver)

if (guardadas.length === 0) {
  console.log('  · não havia histórico para esconder — NÃO TESTADO')
} else {
  sql(`UPDATE ordens SET etapa = 'EM_MANUTENCAO'
        WHERE id IN (${guardadas.map((id) => `'${id.trim()}'`).join(',')})`)

  await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
  const semBase = await lerPrevisao(p)

  semBase?.recusa
    ? ok(`sem histórico, a tela recusa: "${semBase.recusa.texto.slice(0, 90)}"`)
    : nao('o histórico sumiu e a previsão continuou mostrando número')

  semBase?.recusa && /\d/.test(semBase.recusa.texto)
    ? ok('e a recusa diz QUANTO falta, não só que falta')
    : nao('a recusa não diz o que falta para o modelo passar a prever')

  semBase?.recusa?.cor && !ehTeal(semBase.recusa.cor)
    ? ok('a recusa é cinza — não há conclusão aqui para marcar de teal')
    : nao(`a recusa saiu em teal: rgb(${semBase?.recusa?.cor?.join(',')})`)

  semBase?.selo
    ? ok('o selo continua: o painel é de inferência mesmo quando ela não sai')
    : nao('o painel perdeu o selo junto com a previsão')

  devolver()
  guardadas.length = 0
}

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ FASE 7 INTEIRA VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
