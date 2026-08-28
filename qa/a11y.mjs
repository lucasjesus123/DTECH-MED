// Acessibilidade nas telas principais, com os papéis que as usam.
//
// =============================================================================
// POR QUE ELE FOI REESCRITO
// =============================================================================
// A primeira versão deste arquivo IMPRIMIA as violações e saía com código 0 —
// sempre. Ela aparecia como roteiro no README, mas a bateria nunca a chamava, e
// se chamasse passaria com a tela inteira quebrada. Um teste que não reprova é
// pior que teste nenhum: ele ocupa a linha do relatório que faria falta.
//
// Agora ele reprova em violação SÉRIA ou CRÍTICA, e o `fundo-caixa.mjs` cobre o
// resto — os estados que o axe não vê parado, com formulário aberto.
//
// =============================================================================
// POR QUE CADA TELA ESTÁ AQUI COM O PAPEL QUE A USA
// =============================================================================
// Uma tela renderiza diferente para cada papel: o botão que o gestor vê o
// técnico não vê, e é justamente o botão que costuma faltar rótulo. Varrer tudo
// com um único login mede metade do sistema.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const { chromium } = pw

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n').pop().trim()

const axe = readFileSync('/opt/node22/lib/node_modules/axe-core/axe.min.js', 'utf8')
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

async function varrer(p, caminho) {
  await p.goto(`${QA_BASE}${caminho}`, { waitUntil: 'networkidle' })
  await p.addScriptTag({ content: axe })
  const r = await p.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  const serias = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  if (serias.length) {
    for (const v of serias) {
      nao(`${caminho}: ${v.id} (${v.impact}, ${v.nodes.length}×) — ${JSON.stringify(v.nodes[0].target)}`)
      const resumo = (v.nodes[0].failureSummary || '').replace(/\s+/g, ' ').slice(0, 180)
      if (resumo) console.log(`        ${resumo}`)
    }
  } else ok(`${caminho}: sem violação séria`)
}

const ordem = sql('SELECT id FROM ordens ORDER BY "abertaEm" DESC LIMIT 1')
const cliente = sql('SELECT id FROM clientes ORDER BY "criadoEm" DESC LIMIT 1')
const mes = new Date().toISOString().slice(0, 7)

console.log('\n1) O administrador: as telas de gestão')
const admin = await entrar('lucas@dtechmed.com.br')
for (const c of [
  '/painel',
  '/painel/ordens',
  `/painel/ordens/${ordem}`,
  '/painel/acompanhar',
  '/painel/clientes',
  `/painel/clientes/${cliente}`,
  '/painel/equipamentos',
  '/painel/estoque',
  '/painel/contatos',
  '/painel/contatos?aba=orcamentos',
  `/painel/calendario?mes=${mes}`,
  '/painel/preventiva',
  '/painel/usuarios',
  '/painel/auditoria',
]) await varrer(admin, c)

console.log('\n2) O financeiro: o dinheiro, aba por aba')
const fin = await entrar('fabio@dtechmed.com.br')
for (const aba of ['receber', 'pagar', 'recorrencias', 'faturas', 'relatorios']) {
  await varrer(fin, `/painel/financeiro?aba=${aba}`)
}

console.log('\n3) O campo: o aplicativo de quem trabalha em pé')
const tec = await entrar('rafael@dtechmed.com.br')
await varrer(tec, '/app/tecnico')
const mot = await entrar('adriano@dtechmed.com.br')
await varrer(mot, '/app/motorista')

/**
 * 4) A PORTA DO SISTEMA — e por que a home do SITE não está aqui.
 *
 * Esta bateria cobre o SISTEMA. O site institucional é outro escopo, com outra
 * autorização, e o combinado é explícito: não se mexe nele por aqui.
 *
 * Quando esta varredura passou a reprovar de verdade (antes ela só imprimia e
 * saía com código 0), ela encontrou TRÊS violações sérias em `/`. Elas ficam
 * anotadas aqui em vez de reprovarem a bateria do sistema, porque um teste que
 * reprova por algo que ele não tem permissão de consertar só ensina a ignorar
 * reprovação:
 *
 *   · aria-prohibited-attr  — `.avEstrelas` leva `aria-label="5 de 5 estrelas"`
 *     num elemento sem papel ARIA. O leitor de tela descarta o rótulo, e a
 *     avaliação é lida como um punhado de estrelas sem nota.
 *   · color-contrast        — o botão da primeira dobra
 *     (`a[data-medir-origem="primeira-dobra"]`) não alcança o mínimo. É o
 *     principal caminho de conversão do site.
 *   · scrollable-region-focusable — `.gmnTira` rola de lado e não recebe foco:
 *     quem navega por teclado não chega ao conteúdo dela.
 *
 * Para conferir estas três: `node a11y.mjs --com-site`.
 */
const COM_SITE = process.argv.includes('--com-site')
console.log(`\n4) A porta do sistema${COM_SITE ? ' — e a home do site, a pedido' : ''}`)
const anon = await (await nav.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
for (const c of COM_SITE ? ['/', '/entrar'] : ['/entrar']) {
  await anon.goto(`${QA_BASE}${c}`, { waitUntil: 'networkidle' })
  await anon.addScriptTag({ content: axe })
  const r = await anon.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  const serias = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  if (serias.length) for (const v of serias) nao(`${c}: ${v.id} (${v.impact}) — ${JSON.stringify(v.nodes[0].target)}`)
  else ok(`${c}: sem violação séria`)
}

await nav.close()
console.log(`\n${ruins === 0 ? '✅ nenhuma violação séria' : `❌ ${ruins} violação(ões) séria(s)`}\n`)
process.exit(ruins === 0 ? 0 : 1)
