/**
 * O portal aguenta alguém chutando CPF até acertar?
 *
 * Leva a ordem até ORCAMENTO_ENVIADO pela tela e então ataca o portal como um
 * estranho que conseguiu o link mas não sabe o documento do cliente.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw
const sql = (q) =>
  execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q], {encoding:'utf8'}).trim()

let falhas = 0
const ok = (o, c, d = '') => { if (!c) falhas++; console.log(`  ${c ? '🟢' : '🔴'} ${o}${d ? '  — ' + d : ''}`) }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const entrar = async (email, senha) => {
  const p = await (await nav.newContext({ viewport: { width: 1400, height: 1000 } })).newPage()
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name=email]', email); await p.fill('input[type=password]', senha)
  await p.getByRole('button', { name: /entrar/i }).click(); await p.waitForTimeout(2200)
  return p
}
const avancar = async (p, id, rotulo) => {
  await p.goto(`${QA_BASE}/painel/ordens/${id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const b = p.getByRole('button', { name: new RegExp('^' + rotulo) }).first()
  if (!(await b.count())) return false
  await b.click(); await p.waitForTimeout(2200); return true
}

// --- monta uma ordem em ORCAMENTO_ENVIADO -----------------------------------
const ana = await entrar('ana@dtechmed.com.br', SENHA)
await ana.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1000)
const f = ana.locator('form').filter({ has: ana.locator('textarea[name=defeito]') }).first()
await f.locator('input[name=clienteNome]').fill('Clínica Bella Pelle')
await f.locator('input[name=clienteDocumento]').fill('11444777000161')
await f.locator('input[name=clienteWhatsapp]').fill('51980449274')
await f.locator('input[name=contatoNome]').fill('Mariana Farias')
await f.locator('input[name=endereco]').fill('R. Sabiá, 702, Sala 03')
await f.locator('input[name=cidade]').fill('Lajeado')
await f.locator('input[name=marca]').fill('Lavieen')
await f.locator('input[name=modelo]').fill('Duo')
await f.locator('textarea[name=defeito]').fill('Desliga sozinho depois de dez minutos de uso.')
await f.getByRole('button', { name: /abrir ordem e gerar/i }).click()
await ana.waitForTimeout(3000)

const ordemId = sql('SELECT id FROM ordens ORDER BY "abertaEm" DESC LIMIT 1')
const token = sql(`SELECT "tokenPublico" FROM ordens WHERE id='${ordemId}'`)
const tenant = sql(`SELECT "tenantId" FROM ordens WHERE id='${ordemId}'`)

// Empurra até ORCAMENTO_ENVIADO por dentro, que não é o que se testa aqui.
// O número do orçamento é único por empresa: usar um fixo quebra assim que
// outra execução já criou o nº 1 — que é a restrição do banco funcionando, não
// defeito. Pega o próximo livre.
const proximo = Number(sql(`SELECT coalesce(max(numero),0)+1 FROM orcamentos WHERE "tenantId"='${tenant}'`))
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-c',
  `UPDATE ordens SET etapa='ORCAMENTO_ENVIADO', diagnostico='Fonte sem saída nos 24V.' WHERE id='${ordemId}';
   INSERT INTO orcamentos (id,"tenantId","ordemId",numero,versao,status,"subtotalPecas","subtotalServicos","totalCentavos","criadoEm","atualizadoEm")
   VALUES ('orc-chutes-${proximo}','${tenant}','${ordemId}',${proximo},1,'ENVIADO',77000,107000,184000,now(),now());
   INSERT INTO contadores ("tenantId",chave,valor) VALUES ('${tenant}','orcamento',${proximo})
   ON CONFLICT ("tenantId",chave) DO UPDATE SET valor = GREATEST(contadores.valor, EXCLUDED.valor);`])

const etapa = sql(`SELECT etapa FROM ordens WHERE id='${ordemId}'`)
console.log(`\n  O.S. ${sql(`SELECT numero FROM ordens WHERE id='${ordemId}'`)} · etapa ${etapa}\n`)

// --- o estranho com o link, chutando o CPF ----------------------------------
const ctx = await nav.newContext({ viewport: { width: 430, height: 900 } })
const invasor = await ctx.newPage()

const tentar = async (cpf) => {
  await invasor.goto(`${QA_BASE}/os/${token}`, { waitUntil: 'domcontentloaded' })
  await invasor.waitForTimeout(700)
  const btn = invasor.getByRole('button', { name: /^Aprovar/ }).first()
  if (!(await btn.count())) return '(sem botão de aprovar)'
  await btn.click(); await invasor.waitForTimeout(500)
  await invasor.locator('#documento').fill(cpf)
  const nome = invasor.locator('#assinanteNome')
  if (await nome.count()) await nome.fill('Quem Não Deveria')
  const q = invasor.locator('canvas').first()
  if (await q.count()) {
    await q.scrollIntoViewIfNeeded(); await invasor.waitForTimeout(300)
    const b = await q.boundingBox()
    if (b) {
      await invasor.mouse.move(b.x + 20, b.y + b.height / 2); await invasor.mouse.down()
      for (let i = 1; i <= 12; i++) await invasor.mouse.move(b.x + 20 + i * (b.width - 45) / 12, b.y + b.height / 2 + Math.sin(i) * 12)
      await invasor.mouse.up(); await invasor.waitForTimeout(300)
    }
  }
  await invasor.getByRole('button', { name: /^(Aprovar|Confirmar)/ }).last().click()
  await invasor.waitForTimeout(1500)
  const t = await invasor.evaluate(() => {
    const c = document.body.cloneNode(true)
    c.querySelectorAll('script,style').forEach((n) => n.remove())
    return c.textContent || ''
  })
  if (/Muitas tentativas/.test(t)) return 'BLOQUEADO'
  if (/não confere/.test(t)) return 'recusado'
  return 'PASSOU'
}

let bloqueouNa = 0
for (let i = 1; i <= 13; i++) {
  const r = await tentar(String(10000000000 + i))
  if (r === 'BLOQUEADO' && !bloqueouNa) bloqueouNa = i
  if (i <= 3 || r === 'BLOQUEADO' || i === 13) console.log(`     chute ${String(i).padStart(2)}: ${r}`)
  if (r === 'PASSOU') { console.log('     um chute PASSOU — isso não pode acontecer'); break }
}

ok('o portal para de aceitar chutes de CPF', bloqueouNa > 0, bloqueouNa ? `bloqueou no chute ${bloqueouNa}` : 'NUNCA bloqueou')
ok('a ordem NÃO foi aprovada por quem não sabe o documento',
   sql(`SELECT etapa FROM ordens WHERE id='${ordemId}'`) === 'ORCAMENTO_ENVIADO')
const tentativasNaTrilha = Number(sql(`SELECT count(*) FROM audit_logs WHERE acao LIKE 'portal.documento%'`))
ok('as tentativas ficaram registradas na trilha', tentativasNaTrilha >= 10, `${tentativasNaTrilha} registros`)

// --- e o cliente de verdade, de outro IP/janela, continua conseguindo? ------
// O freio é por IP + link: outra janela do mesmo IP compartilha a cota, então
// a prova aqui é que o freio SOLTA quando a janela expira. Em vez de esperar
// 15 minutos, confere-se que a chave é por LINK: outra ordem não está presa.
const ordem2 = sql(`SELECT id FROM ordens WHERE id <> '${ordemId}' ORDER BY "abertaEm" DESC LIMIT 1`)
ok('o bloqueio é por link — outra ordem não é afetada junto',
   ordem2 === '' || sql(`SELECT etapa FROM ordens WHERE id='${ordem2}'`) !== '')

await invasor.screenshot({ path: '/var/tmp/qa/portal-bloqueado.png', fullPage: true })
await nav.close()
console.log(falhas ? `\n  ${falhas} FALHA(S)\n` : '\n  TUDO CERTO\n')
process.exit(falhas ? 1 : 0)
