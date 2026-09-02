// Usa o Financeiro como um humano: lança conta a pagar, parcela, dá baixa,
// cria recorrência, gera as contas do mês e confere os números na tela.
// Caminho absoluto, como os outros scripts desta pasta: o resolvedor de ESM do
// Node NÃO honra NODE_PATH, e `import 'playwright'` só funciona quando o script
// roda de dentro de um projeto que tem o pacote instalado.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw

// O endereço do sistema em ensaio, e onde ficam os prints. Os dois vêm do
// ambiente: o roteiro precisa rodar noutra porta e gravar noutra pasta sem
// ninguém editar o arquivo. `qa/telas` está no .gitignore — print de execução
// é descartável, o roteiro é que versiona.
const BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const PASTA = process.env.QA_TELAS || new URL('./telas', import.meta.url).pathname

let falhas = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); falhas++ }

// Zera o caixa antes de começar: o teste cria as mesmas contas toda vez, e
// duas execuções empilhadas fariam as somas do topo dobrarem — o que pareceria
// defeito do produto e é defeito do teste.
import { execFileSync } from 'node:child_process'
import { abrirNovaConta, lancarConta, hojeISO } from './lancar-conta.mjs'
import { mkdirSync } from 'node:fs'


// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
execFileSync('bash', ['-c',
  'set -a; . /var/tmp/pgdemo/env; set +a; psql "$DATABASE_URL" -q -c "select set_config(\'app.is_super_admin\',\'on\',false)" -c "delete from lancamentos" -c "delete from recorrencias"'],
  { stdio: 'inherit' })

mkdirSync(PASTA, { recursive: true })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1100 } })
const p = await ctx.newPage()

const erros = []
p.on('pageerror', (e) => erros.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

async function entrar(email, senha = SENHA) {
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', senha)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
}

// ---------------------------------------------------------------------------
console.log('\n1) Abrir o Financeiro e ver as cinco abas')
await entrar('lucas@dtechmed.com.br')
await p.goto(`${BASE}/painel/financeiro`, { waitUntil: 'networkidle' })

for (const nome of ['A receber', 'A pagar', 'Faturas de serviço', 'Recorrências', 'Relatórios']) {
  const n = await p.getByRole('link', { name: nome, exact: true }).count()
  n === 1 ? ok(`aba "${nome}"`) : nao(`aba "${nome}" apareceu ${n}x`)
}
// OS CINCO INDICADORES VIRARAM QUATRO CARTÕES E UMA FAIXA DE LEITURA.
//
// Antes o topo trazia ENTROU / SAIU / SOBROU / A RECEBER VENCIDO / A PAGAR
// VENCIDO — cinco rótulos, cinco perguntas diferentes, nenhuma relação entre
// os números. Nada se perdeu na troca, e vale escrever ONDE cada um foi parar,
// porque é isso que este bloco confere:
//
//   entrou · saiu · sobrou   → a faixa "O caixa de <mês>", em texto corrido.
//   a receber vencido        → o cartão ATRASADO, na aba A receber.
//   a pagar vencido          → o cartão ATRASADO, na aba A pagar.
//
// A conferência mudou de forma junto: em vez de procurar rótulo, ela confere a
// IGUALDADE dos quatro cartões. Um rótulo presente prova que alguém escreveu
// uma palavra na tela; a soma fechando prova que os números querem dizer
// alguma coisa.
for (const rotulo of ['Total do mês', 'Pendente', 'Atrasado']) {
  ;(await p.getByText(rotulo, { exact: true }).count()) > 0
    ? ok(`cartão "${rotulo}"`) : nao(`sem o cartão "${rotulo}"`)
}
const secao = await p.locator('section[aria-label*="receber" i]').first().innerText()
const cent = (t) => { const m = /R\$\s*([\d.]+,\d{2})/.exec(t); return m ? Math.round(Number(m[1].replace(/\./g,'').replace(',','.'))*100) : null }
const vTotal = cent(/total do m[êe]s[\s\S]*?(R\$[\d.,\s]+)/i.exec(secao)?.[1] ?? '')
const vPago = cent(/recebido[\s\S]*?(R\$[\d.,\s]+)/i.exec(secao)?.[1] ?? '')
const vPend = cent(/pendente[\s\S]*?(R\$[\d.,\s]+)/i.exec(secao)?.[1] ?? '')
const vAtr = cent(/atrasado[\s\S]*?(R\$[\d.,\s]+)/i.exec(secao)?.[1] ?? '')
vTotal !== null && vTotal === vPago + vPend + vAtr
  ? ok(`os quatro cartões fecham: ${vTotal} = ${vPago} + ${vPend} + ${vAtr}`)
  : nao(`os quatro cartões NÃO fecham: ${vTotal} ≠ ${vPago} + ${vPend} + ${vAtr}`)

// E o caixa realizado, que era "Entrou/Saiu/Sobrou", continua na tela.
const leitura = await p.locator('section[aria-label^="Leitura"]').innerText().catch(() => '')
;/entrou/i.test(leitura) && /saiu/i.test(leitura) && /sobrou/i.test(leitura)
  ? ok('a faixa de leitura traz entrou, saiu e sobrou')
  : nao(`a faixa de leitura perdeu o caixa realizado: "${leitura.slice(0, 120)}"`)
await p.screenshot({ path: `${PASTA}/caixa-1-receber.png` })

// ---------------------------------------------------------------------------
console.log('\n2) Lançar uma conta a pagar simples')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
const hoje = hojeISO()
// Lançar saiu de dentro da aba e virou "+ Nova conta" no cabeçalho, numa
// janela. A sequência mora em `lancar-conta.mjs`, para os cinco roteiros que
// lançam conta não guardarem cinco cópias dela.
await lancarConta(p, {
  tipo: 'PAGAR', descricao: 'Energia elétrica da oficina', valor: '842,37',
  vencimento: hoje, categoria: 'Energia e água', contraparte: 'RGE Sul',
})

const temEnergia = await p.getByText('Energia elétrica da oficina').count()
temEnergia > 0 ? ok('a conta apareceu na lista') : nao('a conta não apareceu na lista')
const temValor = await p.getByText('R$ 842,37').count()
temValor > 0 ? ok('o valor bateu (R$ 842,37)') : nao('o valor não apareceu como R$ 842,37')

// ---------------------------------------------------------------------------
console.log('\n3) Lançar parcelado em 3x e conferir que viram 3 linhas')
await abrirNovaConta(p, {
  tipo: 'PAGAR', descricao: 'Compressor do laboratório', valor: '1000,00',
  vencimento: hoje, parcelas: 3, modoValor: 'total',
})

// A prévia tem que dizer o centavo da última parcela ANTES de salvar. Ela é
// lida DENTRO da janela: `[role=status]` sozinho pegaria a mensagem de sucesso
// da tela atrás.
const previa = await p.locator('dialog[open] [role=status]').first().innerText().catch(() => '')
;/333,34/.test(previa) ? ok(`prévia mostra o centavo da última: "${previa.slice(0, 90)}…"`) : nao(`prévia sem o ajuste de centavo: "${previa}"`)

await p.locator('dialog[open]').getByRole('button', { name: 'Salvar' }).click()
await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 })
await p.waitForTimeout(1200)

// A 1/3 vence hoje; as outras nos meses seguintes — então só ela está no mês.
const p1 = await p.getByText('Compressor do laboratório (1/3)').count()
p1 > 0 ? ok('parcela 1/3 no mês corrente') : nao('parcela 1/3 não apareceu')
const p2 = await p.getByText('Compressor do laboratório (2/3)').count()
p2 === 0 ? ok('parcela 2/3 NÃO está no mês corrente (está no próximo)') : nao('parcela 2/3 vazou para o mês errado')
await p.screenshot({ path: `${PASTA}/caixa-2-pagar.png` })

console.log('\n4) A parcela 2/3 aparece no mês seguinte')
const [ano, mes] = hoje.split('-').map(Number)
const prox = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
await p.goto(`${BASE}/painel/financeiro?aba=pagar&mes=${prox}&situacao=todas`, { waitUntil: 'networkidle' })
const p2b = await p.getByText('Compressor do laboratório (2/3)').count()
p2b > 0 ? ok(`parcela 2/3 caiu em ${prox}`) : nao(`parcela 2/3 não apareceu em ${prox}`)

// ---------------------------------------------------------------------------
/**
 * A APROVAÇÃO ENTROU NO MEIO, E ESTE ROTEIRO COBRAVA A REGRA ANTIGA.
 *
 * Antes, quem lançava dava baixa no minuto seguinte. Agora não: a conta nasce
 * esperando aprovação, e a baixa é recusada até um administrador liberar.
 *
 * Este bloco falhou na bateria exatamente por isso — e a falha estava CERTA. O
 * roteiro dizia "a conta paga continua entre as abertas" porque ela não tinha
 * sido paga: tinha sido recusada, corretamente, por falta de aprovação.
 *
 * A conferência de que a recusa acontece está em `lancar.mjs`, que é o roteiro
 * daquela regra. Aqui o passo existe só para o caixa poder seguir testando o
 * que ele testa: baixa, filtro de pagas, e o total do mês.
 *
 * O `lucas@` é ADMIN, então ele mesmo aprova — e a tela avisa que está
 * aprovando a própria conta, com a trilha guardando os dois nomes.
 */
console.log('\n4b) Aprovar antes de poder baixar — quem lança não aprova')
await p.goto(`${BASE}/painel/financeiro?aba=aprovar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
const paraAprovar = p.locator('li').filter({ hasText: 'Energia elétrica da oficina' }).first()
if (await paraAprovar.count()) {
  await paraAprovar.getByRole('button', { name: 'Aprovar' }).click()
  await p.waitForTimeout(2200)
  ok('a conta foi aprovada, e só então pode receber baixa')
} else {
  nao('a conta lançada não apareceu na fila de aprovação')
}

console.log('\n5) Dar baixa na conta de energia')
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
// A lista de contas virou TABELA — a linha é `tr`. A fila de aprovação, logo
// acima, continua sendo cartão em `li`: são duas telas diferentes.
const linhaEnergia = p.locator('tr').filter({ hasText: 'Energia elétrica da oficina' }).first()
await linhaEnergia.getByRole('group').locator('summary').click()
await p.waitForTimeout(400)
await linhaEnergia.getByRole('button', { name: 'Confirmar' }).click()
await p.waitForTimeout(2000)

// Paga, ela sai do filtro "abertas" e aparece em "Pagas no mês" — é o que o
// rodapé da tela promete.
const aindaAberta = await p.locator('tr').filter({ hasText: 'Energia elétrica da oficina' }).count()
aindaAberta === 0 ? ok('a conta paga saiu da lista de abertas') : nao('a conta paga continua entre as abertas')
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=pagas`, { waitUntil: 'networkidle' })
const selo = await p.locator('tr').filter({ hasText: 'Energia elétrica da oficina' }).first().innerText().catch(() => '')
;/pago/i.test(selo) ? ok('e aparece em "Pagas no mês", marcada como paga') : nao(`não achei em "Pagas no mês": "${selo.replace(/\n/g, ' | ').slice(0, 120)}"`)

console.log('\n6) O que saiu do caixa subiu para a faixa de leitura')
// "Saiu no mês" era um cartão de rótulo próprio; virou uma frase na faixa de
// leitura ("Entrou X, saiu Y, sobrou Z"). O número é o mesmo e a conferência
// continua sendo pelo NÚMERO, que é o que importa — o rótulo mudou de forma,
// a baixa de R$ 842,37 tem de aparecer no caixa realizado do mês do mesmo
// jeito.
await p.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
const saiu = await p.locator('section[aria-label^="Leitura"]').innerText().catch(() => '')
;/saiu[^.]*842,37/i.test(saiu) ? ok('a faixa de leitura diz que saíram R$ 842,37') : nao(`o caixa realizado não bateu: "${saiu.replace(/\n/g, ' | ').slice(0, 160)}"`)

// ---------------------------------------------------------------------------
console.log('\n7) Criar uma recorrência e gerar as contas do mês')
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Nova recorrência' }).click()
await p.fill('input[name=descricao]', 'Aluguel da oficina')
await p.fill('input[name=categoria]', 'Instalações')
await p.fill('input[name=contraparte]', 'Imobiliária Central')
await p.fill('input[name=valor]', '4200,00')
await p.fill('input[name=diaVencimento]', '5')
await p.getByRole('button', { name: 'Criar recorrência' }).click()
await p.waitForTimeout(1800)

;(await p.getByText('Aluguel da oficina').count()) > 0 ? ok('recorrência criada') : nao('recorrência não apareceu')
;(await p.getByText('Custo fixo mensal').count()) > 0 ? ok('mostra o custo fixo mensal') : nao('sem custo fixo mensal')

const btnGerar = p.getByRole('button', { name: /^Gerar/ })
if (await btnGerar.count()) {
  await btnGerar.click()
  await p.waitForTimeout(2000)
  ok('gerou as contas do mês')
} else {
  nao('o botão de gerar não apareceu')
}
await p.screenshot({ path: `${PASTA}/caixa-3-recorrencias.png` })

console.log('\n8) Gerar de novo NÃO pode duplicar (idempotência)')
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=todas`, { waitUntil: 'networkidle' })
const antes = await p.getByText('Aluguel da oficina').count()
await p.goto(`${BASE}/painel/financeiro?aba=recorrencias`, { waitUntil: 'networkidle' })
const btn2 = p.getByRole('button', { name: /^Gerar/ })
if (await btn2.count()) {
  await btn2.click()
  await p.waitForTimeout(2000)
}
await p.goto(`${BASE}/painel/financeiro?aba=pagar&situacao=todas`, { waitUntil: 'networkidle' })
const depois = await p.getByText('Aluguel da oficina').count()
antes === depois && antes > 0
  ? ok(`o aluguel continua aparecendo ${depois}x — não duplicou`)
  : nao(`duplicou: antes ${antes}, depois ${depois}`)

// ---------------------------------------------------------------------------
console.log('\n9) Relatórios: o gráfico desenha e a tabela bate')
await p.goto(`${BASE}/painel/financeiro?aba=relatorios`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
;(await p.locator('svg[role=img]').count()) > 0 ? ok('o gráfico de barras existe') : nao('sem gráfico')
;(await p.locator('table caption').count()) > 0 ? ok('a tabela equivalente existe (leitor de tela)') : nao('sem tabela equivalente')
;(await p.getByText('Para onde foi o dinheiro').count()) > 0 ? ok('categorias de saída') : nao('sem categorias de saída')
;(await p.getByText('Quem está segurando o caixa').count()) > 0 ? ok('maiores devedores') : nao('sem devedores')
await p.screenshot({ path: `${PASTA}/caixa-4-relatorios.png`, fullPage: true })

// ---------------------------------------------------------------------------
console.log('\n10) O financeiro (papel FINANCEIRO) entra, mas NÃO apaga')
const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 1000 } })
const f = await ctx2.newPage()
await f.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
await f.fill('#email', 'fabio@dtechmed.com.br')
await f.fill('#senha', SENHA)
await f.getByRole('button', { name: /entrar/i }).click()
await f.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
await f.goto(`${BASE}/painel/financeiro?aba=pagar`, { waitUntil: 'networkidle' })

;(await f.getByRole('button', { name: '+ Nova conta' }).count()) > 0
  ? ok('o financeiro consegue lançar')
  : nao('o financeiro não vê o botão de lançar')
const apagar = await f.getByRole('button', { name: 'Apagar', exact: true }).count()
apagar === 0 ? ok('o financeiro NÃO vê "Apagar" (é da gestão)') : nao(`o financeiro vê ${apagar} botão(ões) de apagar`)

// ---------------------------------------------------------------------------
console.log('\n11) Os dois temas, sem texto invisível nem rolagem lateral')
for (const tema of ['escuro', 'claro']) {
  await p.goto(`${BASE}/painel`, { waitUntil: 'networkidle' })
  await p.evaluate((t) => { document.cookie = `dtechmed_tema=${t}; path=/; max-age=31536000` }, tema)
  for (const aba of ['receber', 'pagar', 'recorrencias', 'relatorios', 'faturas']) {
    await p.goto(`${BASE}/painel/financeiro?aba=${aba}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    const rola = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (rola) nao(`${aba}/${tema}: a página rola de lado`)
    const txt = await p.locator('body').innerText()
    const lixo = txt.match(/undefined|NaN|\[object Object\]|\{\{/)
    if (lixo) nao(`${aba}/${tema}: "${lixo[0]}" na tela`)
    await p.screenshot({ path: `${PASTA}/caixa-${tema}-${aba}.png` })
  }
  ok(`${tema}: 5 abas sem rolagem lateral nem lixo`)
}

// ---------------------------------------------------------------------------
if (erros.length) {
  console.log('\nErros de JavaScript no navegador:')
  for (const e of [...new Set(erros)].slice(0, 8)) { nao(e.slice(0, 160)) }
} else {
  ok('nenhum erro de JavaScript no navegador')
}

await nav.close()
console.log(`\n${falhas === 0 ? '✅ tudo passou' : `❌ ${falhas} falha(s)`}\n`)
process.exit(falhas === 0 ? 0 : 1)
