/**
 * A promessa que sustenta a franquia: uma empresa não alcança a outra.
 *
 * O ataque é o realista — o operador da B descobre o endereço de uma ordem da
 * A (um link colado no WhatsApp, um print, um id no histórico do navegador) e
 * digita na barra de endereços.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const { chromium } = pw
const sql = (q) => execFileSync('psql',['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q],{encoding:'utf8'}).trim()

let falhas = 0
const ok = (o, c, d='') => { if(!c) falhas++; console.log(`  ${c?'🟢':'🔴'} ${o}${d?'  — '+d:''}`) }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const entrar = async (email, senha) => {
  const p = await (await nav.newContext({viewport:{width:1400,height:900}})).newPage()
  await p.goto(`${QA_BASE}/entrar`,{waitUntil:'domcontentloaded'})
  await p.fill('input[name=email]', email); await p.fill('input[type=password]', senha)
  await p.getByRole('button',{name:/entrar/i}).click(); await p.waitForTimeout(2200)
  return p
}

// A ordem da DTECH MED (empresa A), com tudo dentro dela.
const ordemA = sql("SELECT id FROM ordens ORDER BY \"abertaEm\" DESC LIMIT 1")
const numeroA = sql(`SELECT numero FROM ordens WHERE id='${ordemA}'`)
const clienteA = sql(`SELECT c.nome FROM clientes c JOIN ordens o ON o."clienteId"=c.id WHERE o.id='${ordemA}'`)
const fotoA = sql(`SELECT id FROM fotos WHERE "ordemId"='${ordemA}' LIMIT 1`)
const assinA = sql(`SELECT id FROM assinaturas WHERE "ordemId"='${ordemA}' LIMIT 1`)
console.log(`\n  Empresa A: DTECH MED · O.S. nº ${numeroA} · cliente "${clienteA}"\n`)

// O super admin cria a empresa B, com o responsável dela.
const chefe = await entrar('contato@conexaomkt.com.br','Ensaio@2026x')
await chefe.goto(`${QA_BASE}/painel/empresas`,{waitUntil:'domcontentloaded'})
await chefe.waitForTimeout(1500)
const abrir = chefe.getByRole('button',{name:/cadastrar empresa|nova empresa/i}).first()
if (await abrir.count()) { await abrir.click(); await chefe.waitForTimeout(1200) }
const f = chefe.locator('form').filter({ has: chefe.locator('input[name=slug]') }).first()
const marca = Date.now().toString().slice(-6)
await f.locator('input[name=nome]').fill('Franquia Vizinha QA')
await f.locator('input[name=slug]').fill('vizinha-' + marca)
await f.locator('input[name=cnpj]').fill('55888999000133').catch(()=>{})
await f.locator('input[name=cidade]').fill('Estrela').catch(()=>{})
await f.locator('input[name=uf]').fill('RS').catch(()=>{})
await f.locator('input[name=adminNome]').fill('Bruno Vizinho')
await f.locator('input[name=adminEmail]').fill(`bruno.${marca}@vizinha.test`)
await f.locator('input[name=adminSenha]').fill('SenhaVizinha@2026')
await f.getByRole('button',{type:'submit'}).first().click().catch(async()=>{ await f.locator('button[type=submit]').first().click() })
await chefe.waitForTimeout(3000)
const tenantB = sql(`SELECT id FROM tenants WHERE slug='vizinha-${marca}'`)
ok('o super admin criou a empresa vizinha', tenantB !== '', tenantB ? 'slug vizinha-'+marca : 'não criou')
if (!tenantB) { await nav.close(); process.exit(1) }

// O responsável da B entra e tenta alcançar a A.
const bruno0 = await entrar(`bruno.${marca}@vizinha.test`, 'SenhaVizinha@2026')
ok('o responsável da vizinha entrou', !bruno0.url().includes('/entrar'), bruno0.url())

// Senha provisória: o sistema obriga a troca no primeiro acesso.
const obrigouTroca = bruno0.url().includes('trocar-senha')
ok('senha provisória obriga a troca no primeiro acesso', obrigouTroca, bruno0.url())
if (obrigouTroca) {
  const ft = bruno0.locator('form').filter({ has: bruno0.locator('input[name=atual]') }).first()
  await ft.locator('input[name=atual]').fill('SenhaVizinha@2026')
  await ft.locator('input[name=nova]').fill('OutraFraseDoBruno2026')
  await ft.locator('input[name=confirmacao]').fill('OutraFraseDoBruno2026')
  await ft.getByRole('button',{name:/trocar senha/i}).click()
  await bruno0.waitForTimeout(2500)
  const trocou = sql(`SELECT "trocarSenha" FROM usuarios WHERE email='bruno.${marca}@vizinha.test'`)
  ok('a troca de senha obrigatória funcionou', trocou === 'f', `trocarSenha=${trocou}`)
}
const bruno = bruno0

const naoAlcanca = async (caminho, oque) => {
  const r = await bruno.goto(`${QA_BASE}`+caminho, { waitUntil:'domcontentloaded' })
  await bruno.waitForTimeout(900)
  const cod = r?.status() ?? 0
  const txt = await bruno.evaluate(() => { const c=document.body.cloneNode(true); c.querySelectorAll('script,style').forEach(n=>n.remove()); return c.textContent||'' })
  const vazou = txt.includes(clienteA) || (numeroA && new RegExp(`\\b${numeroA}\\b`).test(txt) && txt.includes('Prontuário'))
  ok(oque, !vazou, `HTTP ${cod}${vazou ? ' — VAZOU' : ''}`)
}
await naoAlcanca(`/painel/ordens/${ordemA}`, 'a vizinha NÃO abre a ficha da ordem da outra empresa')
await naoAlcanca(`/painel/acompanhar?busca=${encodeURIComponent(clienteA)}`, 'a busca da vizinha NÃO encontra o cliente da outra')
await naoAlcanca(`/painel/clientes?busca=${encodeURIComponent(clienteA)}`, 'a carteira da vizinha NÃO lista o cliente da outra')
await naoAlcanca(`/painel/ordens?situacao=todas`, 'a lista de ordens da vizinha vem vazia')
await naoAlcanca(`/painel/financeiro`, 'o financeiro da vizinha não mostra fatura da outra')

/**
 * A BUSCA DA BARRA É PORTA NOVA, e porta nova tem de ser testada como porta.
 *
 * Ela está em TODA tela do painel e aceita o número da O.S. e o nome do
 * cliente — exatamente os dois dados que vazam num print colado no WhatsApp.
 * Uma caixa de busca que ignorasse o escopo seria a maneira mais discreta de
 * contornar o isolamento: ninguém audita uma lupa.
 */
for (const [termo, oque] of [[numeroA, 'o NÚMERO da O.S. da outra empresa'],
                             [clienteA, 'o NOME do cliente da outra empresa']]) {
  await bruno.goto(`${QA_BASE}/painel`, { waitUntil: 'domcontentloaded' })
  await bruno.waitForTimeout(1200)
  const campo = bruno.locator('input[type=search]').first()
  if (await campo.count()) {
    await campo.fill(String(termo))
    await bruno.waitForTimeout(1800)
    const lista = await bruno.locator('#resultados-da-busca').innerText().catch(() => '')
    const vazou = lista.includes(clienteA) || new RegExp(`#0*${numeroA}\\b`).test(lista)
    ok(`a busca da barra da vizinha NÃO acha ${oque}`, !vazou, vazou ? 'VAZOU: ' + lista.slice(0, 120) : 'nada')
  } else {
    ok(`a busca da barra existe para procurar ${oque}`, false, 'campo de busca não encontrado na barra')
  }
}

// Os arquivos: foto e assinatura são servidos por rota própria.
for (const [cam, oque] of [[`/api/foto/${fotoA}`,'a FOTO da outra empresa não é servida'],
                           [`/api/assinatura/${assinA}`,'a ASSINATURA da outra empresa não é servida']]) {
  const r = await bruno.goto(`${QA_BASE}`+cam, { waitUntil:'domcontentloaded' }).catch(()=>null)
  const cod = r?.status() ?? 0
  ok(oque, cod === 404 || cod === 403, `HTTP ${cod}`)
}

// E a empresa A segue intacta.
const etapaDepois = sql(`SELECT etapa FROM ordens WHERE id='${ordemA}'`)
ok('a ordem da empresa A continua intacta depois das tentativas', etapaDepois === 'FINALIZADO', etapaDepois)

await bruno.screenshot({ path:'/var/tmp/qa/isolamento.png', fullPage:true })
await nav.close()
console.log(falhas ? `\n  ${falhas} FALHA(S)\n` : '\n  TUDO CERTO\n')
process.exit(falhas?1:0)
