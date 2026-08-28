/**
 * A carteira de clientes está mesmo fechada para quem não deve vê-la?
 *
 * Cobra os DOIS lados: o menu não pode oferecer, e a tela não pode abrir nem
 * quando o endereço é digitado direto na barra. Esconder no navegador é
 * enfeite; o que vale é a recusa do servidor.
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

const CLIENTE = sql("SELECT nome FROM clientes ORDER BY nome LIMIT 1")
const DOC = sql("SELECT documento FROM clientes ORDER BY nome LIMIT 1")
console.log(`\n  Dado protegido: "${CLIENTE}" · documento ${DOC}\n`)

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const texto = async (p) => p.evaluate(() => {
  const c = document.body.cloneNode(true)
  c.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove())
  return c.textContent || ''
})

const PAPEIS = [
  ['motorista', 'adriano@dtechmed.com.br', false],
  ['técnico',   'rafael@dtechmed.com.br',  false],
  ['atendente', 'ana@dtechmed.com.br',     true],
  ['gestora',   'camila@dtechmed.com.br',  true],
  ['admin',     'lucas@dtechmed.com.br',   true],
]

for (const [papel, email, deveVer] of PAPEIS) {
  const p = await (await nav.newContext({ viewport: { width: 1400, height: 1000 } })).newPage()
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name=email]', email)
  await p.fill('input[type=password]', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForTimeout(2200)

  // 1. O menu oferece?
  const noMenu = await p.getByRole('link', { name: 'Clientes', exact: true }).count()
  ok(`${papel.padEnd(10)} · o menu ${deveVer ? 'OFERECE' : 'não oferece'} Clientes`,
     deveVer ? noMenu > 0 : noMenu === 0)

  // 2. E digitando o endereço na barra?
  await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1100)
  const url = p.url()
  const corpo = await texto(p)
  const vazou = corpo.includes(CLIENTE) || (DOC && corpo.includes(DOC))

  if (deveVer) {
    ok(`${papel.padEnd(10)} · abre a carteira pelo endereço`, !url.includes('sem-permissao') && vazou, url.replace(`${QA_BASE}`,''))
  } else {
    ok(`${papel.padEnd(10)} · é BARRADO pelo endereço, e nada vaza`,
       url.includes('sem-permissao') && !vazou,
       url.replace(`${QA_BASE}`,'') + (vazou ? ' — VAZOU O CLIENTE' : ''))
  }

  // 3. E a exportação em CSV?
  //
  // Nem `page.goto` nem `page.request` servem aqui, e os dois enganam de jeitos
  // diferentes:
  //   • `goto` numa rota que devolve `Content-Disposition: attachment` vira
  //     download, não navegação — o Playwright responde `null`, que parece
  //     "HTTP 0".
  //   • `page.request` NÃO manda o cookie de sessão, porque ele é
  //     `SameSite=Strict`. A rota respondia 200 com a tela de LOGIN, para todo
  //     mundo, e parecia que a trava tinha sumido.
  // `fetch` de dentro da página é o que o navegador faz de verdade: mesma
  // origem, cookie junto.
  const resp = await p.evaluate(async () => {
    const r = await fetch('/painel/clientes/exportar')
    return { status: r.status, corpo: r.status === 200 ? await r.text() : '' }
  })
  const linhas = resp.corpo ? resp.corpo.trim().split('\n').length - 1 : 0
  ok(`${papel.padEnd(10)} · a exportação em CSV ${deveVer ? 'entrega a carteira' : 'RECUSA'}`,
     deveVer ? (resp.status === 200 && resp.corpo.includes(CLIENTE) && linhas > 0) : resp.status === 403,
     `HTTP ${resp.status}${deveVer && linhas ? ` · ${linhas} clientes no arquivo` : ''}`)

  // 4. O técnico continua vendo o cliente DA ORDEM em que trabalha?
  if (papel === 'técnico') {
    const ordem = sql('SELECT id FROM ordens ORDER BY "abertaEm" DESC LIMIT 1')
    if (ordem) {
      await p.goto(`${QA_BASE}/painel/ordens/${ordem}`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(1100)
      const naFicha = await texto(p)
      ok('técnico    · ainda vê o cliente DA ORDEM em que trabalha',
         !p.url().includes('sem-permissao') && naFicha.length > 500)
    }
  }
}

await nav.close()
console.log(falhas ? `\n  ${falhas} FALHA(S)\n` : '\n  TUDO CERTO\n')
process.exit(falhas ? 1 : 0)
