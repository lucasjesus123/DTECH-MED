// Os modelos de documento no padrão do gerador: cinco por tipo com o contador
// à vista, e a ordem de serviço podendo sair sozinha para o cliente.
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

// O ensaio mexe em modelos. Ele limpa o que criou no fim, e limpa também no
// começo — uma execução interrompida não pode envenenar a seguinte.
const limpar = () => sql(`delete from modelos_documento where nome like 'QA %'`)
limpar()

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []

async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  p.on('pageerror', (e) => erros.push(`${email}: ${e}`))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const p = await entrar('lucas@dtechmed.com.br')
const irPara = async (aba) => {
  await p.goto(`${QA_BASE}/painel/documentos?aba=${aba}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(300)
}

// ---------------------------------------------------------------------------
console.log('\n1) As três abas mostram quantos estão em uso, e de quantos')
// ---------------------------------------------------------------------------
// Um teto que só aparece quando é atingido vira erro surpresa no meio do
// trabalho — quem está escrevendo o quinto precisa saber que é o último.
await irPara('ORDEM_SERVICO')
const abas = await p.locator('nav[aria-label="Tipos de documento"]').innerText()
;/\(\d+\/5\)/.test(abas)
  ? ok(`as abas mostram o contador: ${abas.replace(/\n/g, ' · ')}`)
  : nao(`as abas não mostram o teto: ${abas.replace(/\n/g, ' · ')}`)

const nasAbas = (abas.match(/\((\d+)\/5\)/g) ?? []).length
nasAbas === 3 ? ok('as três abas contam') : nao(`${nasAbas} abas com contador`)

// ---------------------------------------------------------------------------
console.log('\n2) Só a ORDEM DE SERVIÇO tem o campo de disparo automático')
// ---------------------------------------------------------------------------
/**
 * Contrato e nota promissória obrigam o cliente — um em instrumento, outro em
 * título de crédito com o valor da dívida escrito nele. A decisão de obrigar
 * alguém não pode ser efeito colateral de arrastar um cartão no quadro.
 */
for (const [aba, deveTer] of [['ORDEM_SERVICO', true], ['CONTRATO_PRESTACAO', false], ['NOTA_PROMISSORIA', false]]) {
  await irPara(aba)
  await p.getByRole('button', { name: /Novo modelo de/i }).click()
  await p.waitForTimeout(500)
  const tem = (await p.locator('select[name=dispararNaEtapa]').count()) > 0
  tem === deveTer
    ? ok(`${aba}: ${deveTer ? 'tem' : 'não tem'} o campo de disparo, como deve`)
    : nao(`${aba}: campo de disparo ${tem ? 'presente' : 'ausente'} — o contrário do esperado`)
}

// ---------------------------------------------------------------------------
console.log('\n3) Um modelo de O.S. que sai sozinho numa etapa')
// ---------------------------------------------------------------------------
await irPara('ORDEM_SERVICO')
await p.getByRole('button', { name: /Novo modelo de/i }).click()
await p.waitForTimeout(500)
await p.fill('input[name=nome]', 'QA papel que sai sozinho')
await p.fill('textarea[name=corpo]', 'Papel de {{cliente_nome}} — O.S. {{os_numero}}')
const opcoes = await p.locator('select[name=dispararNaEtapa] option').count()
opcoes > 15 ? ok(`${opcoes - 1} etapas oferecidas para o disparo`) : nao(`só ${opcoes} opções de etapa`)

// A etapa é escolhida pelo VALOR, e não pelo rótulo: o rótulo é texto de tela e
// muda; o valor é o que o banco guarda.
await p.selectOption('select[name=dispararNaEtapa]', 'EM_ANALISE')
await p.getByRole('button', { name: /Salvar modelo/i }).click()
await p.waitForTimeout(2000)

const gravado = uma(`select "dispararNaEtapa" from modelos_documento where nome = 'QA papel que sai sozinho'`)
gravado === 'EM_ANALISE'
  ? ok('o banco gravou a etapa do disparo')
  : nao(`o banco gravou "${gravado}" em vez de EM_ANALISE`)

await irPara('ORDEM_SERVICO')
const corpo = await p.locator('body').innerText()
;/sai sozinho ·/i.test(corpo)
  ? ok('o cartão avisa que este modelo sai sozinho')
  : nao('o cartão não distingue o modelo que dispara do que só sai a pedido')

// ---------------------------------------------------------------------------
console.log('\n4) Uma etapa, um modelo — o segundo tira do primeiro')
// ---------------------------------------------------------------------------
// Dois modelos ativos na mesma etapa mandariam DOIS documentos ao cliente no
// mesmo instante, e qual chegaria primeiro seria sorteio.
await p.getByRole('button', { name: /Novo modelo de/i }).click()
await p.waitForTimeout(500)
await p.fill('input[name=nome]', 'QA segundo papel')
await p.fill('textarea[name=corpo]', 'Outro papel de {{cliente_nome}}')
await p.selectOption('select[name=dispararNaEtapa]', 'EM_ANALISE')
await p.getByRole('button', { name: /Salvar modelo/i }).click()
await p.waitForTimeout(2000)

const naEtapa = sql(`select nome from modelos_documento where "dispararNaEtapa" = 'EM_ANALISE' and ativo`)
naEtapa.length === 1 && naEtapa[0] === 'QA segundo papel'
  ? ok('a etapa ficou com um modelo só, e é o último escolhido')
  : nao(`a etapa ficou com ${naEtapa.length}: ${naEtapa.join(', ')}`)

// ---------------------------------------------------------------------------
console.log('\n5) O teto de cinco é de verdade')
// ---------------------------------------------------------------------------
// Três a mais pelo banco, para chegar a cinco sem escrever três formulários.
const tenant = uma('select id from tenants limit 1')
for (const n of ['QA extra 1', 'QA extra 2', 'QA extra 3']) {
  sql(`insert into modelos_documento (id, "tenantId", nome, tipo, corpo, "criadoEm", "atualizadoEm")
       values (md5(random()::text), '${tenant}', '${n}', 'ORDEM_SERVICO', 'texto', now(), now())`)
}
await irPara('ORDEM_SERVICO')
const emUso = Number(uma(`select count(*) from modelos_documento where tipo='ORDEM_SERVICO' and ativo`))
const botao = p.getByRole('button', { name: /Novo modelo de/i })
const desligado = await botao.isDisabled()
const rotulo = await botao.innerText()
emUso === 5 && desligado && rotulo.includes('5/5')
  ? ok(`com ${emUso} em uso, o botão fica visível e desligado — e diz 5/5`)
  : nao(`${emUso} em uso · desligado:${desligado} · rótulo "${rotulo}"`)

const explica = await p.locator('body').innerText()
;/São 5 modelos por tipo/i.test(explica)
  ? ok('a tela explica o teto em vez de só travar')
  : nao('o teto trava sem dizer por quê')

// Aposentar abre vaga — e é isso que o teto promete.
sql(`update modelos_documento set ativo=false where nome='QA extra 3'`)
await irPara('ORDEM_SERVICO')
const depoisDeAposentar = await p.getByRole('button', { name: /Novo modelo de/i }).isDisabled()
!depoisDeAposentar
  ? ok('aposentar um abre vaga — aposentado não ocupa o teto')
  : nao('aposentar não abriu vaga')

// ---------------------------------------------------------------------------
console.log('\n6) Variável que o sistema não conhece é barrada ANTES de salvar')
// ---------------------------------------------------------------------------
// Na impressão o marcador desconhecido sai visível de propósito — melhor que um
// buraco no lugar do nome. Mas o lugar de avisar é aqui, com o texto na frente.
await p.getByRole('button', { name: /Novo modelo de/i }).click()
await p.waitForTimeout(500)
await p.fill('input[name=nome]', 'QA com erro')
await p.fill('textarea[name=corpo]', 'Olá {{cliente_nomee}}')
await p.getByRole('button', { name: /Salvar modelo/i }).click()
await p.waitForTimeout(1500)
const criouErrado = Number(uma(`select count(*) from modelos_documento where nome='QA com erro'`))
const avisou = /não conhece/i.test(await p.locator('body').innerText())
criouErrado === 0 && avisou
  ? ok('a variável inventada é recusada, com o nome dela escrito')
  : nao(`recusa falhou — gravou:${criouErrado} avisou:${avisou}`)

// ---------------------------------------------------------------------------
console.log('\n7) A tabela de documentos ativos diz se o cliente recebeu')
// ---------------------------------------------------------------------------
// Um documento gerado e não entregue parece pronto em qualquer lista que só
// mostre "gerado em" — e é o caso em que o cliente liga dizendo que não recebeu.
await irPara('ORDEM_SERVICO')
const bloco = p.locator('[class*="bloco"]', { hasText: 'Documentos ativos' })
;(await bloco.count()) > 0 ? ok('o bloco de documentos ativos existe') : nao('sem bloco de documentos ativos')
const colunas = (await bloco.locator('thead th').allInnerTexts()).map((t) => t.trim().toUpperCase())
for (const c of ['DOCUMENTO', 'O.S.', 'CLIENTE', 'WHATSAPP', 'GERADO']) {
  colunas.includes(c) ? ok(`coluna "${c}"`) : nao(`falta a coluna "${c}" — tem: ${colunas.join(' / ')}`)
}
const linhas = await bloco.locator('tbody tr').count()
const noBanco = Number(uma('select least(count(*), 20) from documentos'))
linhas === noBanco
  ? ok(`${linhas} documentos na tela, como no banco`)
  : nao(`tela mostra ${linhas} e o banco tem ${noBanco}`)

// ---------------------------------------------------------------------------
console.log('\n8) Quem pode ver não é quem pode mexer')
// ---------------------------------------------------------------------------
/**
 * O financeiro EMITE, e por isso precisa conferir com que texto vai sair. Ele
 * não escreve o texto: o molde de contrato é o que a empresa promete e cobra, e
 * essa é a decisão anterior à emissão.
 */
const f = await entrar('fabio@dtechmed.com.br')
await f.goto(`${QA_BASE}/painel/documentos?aba=ORDEM_SERVICO`, { waitUntil: 'networkidle' })
const financeiroVe = f.url().includes('/painel/documentos')
const financeiroMexe = await f.getByRole('button', { name: /Novo modelo de/i }).count()
financeiroVe && financeiroMexe === 0
  ? ok('o financeiro vê os modelos e não tem botão de criar')
  : nao(`financeiro — vê:${financeiroVe} botões de criar:${financeiroMexe}`)

const t = await entrar('rafael@dtechmed.com.br')
await t.goto(`${QA_BASE}/painel/documentos`, { waitUntil: 'networkidle' })
await t.waitForTimeout(600)
// `exigirPapel` REDIRECIONA, e a tela de recusa devolve 200 — conferir o código
// da resposta daria verde numa recusa e verde num vazamento.
!new URL(t.url()).pathname.startsWith('/painel/documentos')
  ? ok(`o técnico não entra na tela (foi para ${new URL(t.url()).pathname})`)
  : nao('o técnico abriu a tela de modelos')

// ---------------------------------------------------------------------------
console.log('\n9) Os dois temas, em 1440 e 390')
// ---------------------------------------------------------------------------
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    for (const aba of ['ORDEM_SERVICO', 'CONTRATO_PRESTACAO']) {
      await irPara(aba)
      const rola = await p.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      if (rola) nao(`${aba} em ${tema}/${larg}px: rola de lado`)
    }
  }
  ok(`${tema}: a tela cabe em 1440 e 390`)
}

await p.setViewportSize({ width: 1500, height: 1100 })
await irPara('ORDEM_SERVICO')
await p.screenshot({ path: '/tmp/modelos-documento.png', fullPage: true })

// O ensaio devolve o banco como encontrou.
limpar()

console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ modelos: cinco por tipo, e a O.S. que sai sozinha\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
