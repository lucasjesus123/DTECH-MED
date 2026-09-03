// =============================================================================
// O ESTOQUE PASSA A SABER QUE FERRAMENTA NÃO SE CONSOME
// =============================================================================
// O defeito que este roteiro guarda: todo item do estoque era uma peça de
// consumo, com um saldo que só descia. Uma chave de fenda que saía com o
// técnico era registrada como SAÍDA — o saldo caía para zero e a ferramenta
// desaparecia do sistema no dia em que alguém a levou. É assim que se perde
// ferramenta: não por roubo, por não saber com quem está.
//
// A conferência que sustenta o desenho inteiro é a 3: emprestar NÃO PODE mexer
// no saldo. A ferramenta continua sendo da empresa; o que muda é o lugar dela.
//
//     disponível = saldo − reservado − emprestado
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

// Repetir a passada não pode reprovar a seguinte: o código da peça é único.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', `delete from emprestimos_ferramenta where "pecaId" in (select id from pecas where sku like 'QA-%');
         delete from movimentos_estoque where "pecaId" in (select id from pecas where sku like 'QA-%');
         delete from pecas where sku like 'QA-%'`], { stdio: 'pipe' })

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

/**
 * Escolher a opção pelo TEXTO dela.
 *
 * `selectOption({ label })` só aceita string exata, e o texto das opções aqui
 * carrega saldo e unidade ("QA-FER-1 — Multímetro … · 2 UN disponíveis") — um
 * rótulo que muda a cada movimento. Casar por trecho é o que sobrevive a isso.
 */
async function escolher(pagina, seletor, trecho) {
  const valor = await pagina.locator(seletor).evaluate((sel, t) => {
    const achou = Array.from(sel.options).find((o) => o.textContent.includes(t))
    return achou ? achou.value : ''
  }, trecho)
  if (!valor) throw new Error(`nenhuma opção com "${trecho}" em ${seletor}`)
  await pagina.selectOption(seletor, valor)
  return valor
}

const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) CADASTRO · o item tem TIPO, e ferramenta tem patrimônio')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Cadastrar item' }).click()
await p.waitForTimeout(500)

// Marcar FERRAMENTA tem de MUDAR O FORMULÁRIO: some o preço de venda (não se
// vende ferramenta), aparece o patrimônio (é por ele que se acha a que sumiu).
await p.locator('input[name=tipo][value=FERRAMENTA]').check()
await p.waitForTimeout(300)
const temPatrimonio = (await p.locator('input[name=patrimonio]').count()) > 0
const temPreco = (await p.locator('input[name=precoVenda]').count()) > 0
temPatrimonio && !temPreco
  ? ok('escolher Ferramenta troca "preço de venda" por "patrimônio"')
  : nao(`o formulário não mudou com o tipo — patrimônio:${temPatrimonio} preço:${temPreco}`)

await p.fill('input[name=sku]', 'QA-FER-1')
await p.fill('input[name=nome]', 'Multímetro de bancada QA')
await p.fill('input[name=patrimonio]', 'PAT-9001')
await p.fill('input[name=localizacao]', 'Armário A')
await p.fill('input[name=estoqueMinimo]', '1')
await p.getByRole('button', { name: 'Cadastrar', exact: true }).click()
await p.waitForTimeout(2500)

const cadastrada = sql(`select tipo||'|'||coalesce(patrimonio,'-') from pecas where sku='QA-FER-1'`)
cadastrada === 'FERRAMENTA|PAT-9001'
  ? ok(`gravou como ferramenta com patrimônio: ${cadastrada}`)
  : nao(`não gravou o tipo/patrimônio — banco diz: ${cadastrada || '(nada)'}`)

// ---------------------------------------------------------------------------
console.log('\n2) ENTRADA · duas unidades entram na prateleira')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/estoque`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Lançar entrada, baixa ou inventário' }).click()
await p.waitForTimeout(400)
await escolher(p, 'select[name=pecaId]', 'QA-FER-1')
// Dois `select[name=tipo]` convivem na tela: o do FILTRO (peça/insumo/
// ferramenta) e o do MOVIMENTO (entrada/baixa/perda/ajuste). São formulários
// diferentes, então o envio de cada um leva só o seu — mas o roteiro precisa
// dizer de qual está falando.
const formMov = p.locator('form:has(button:text("Lançar movimento"))')
await formMov.locator('select[name=tipo]').selectOption('ENTRADA')
await formMov.locator('input[name=quantidade]').fill('2')
await formMov.locator('input[name=custoUnit]').fill('450')
await p.getByRole('button', { name: 'Lançar movimento' }).click()
await p.waitForTimeout(2500)

const saldoInicial = sql(`select trim_scale(saldo)::text||'|'||"custoMedioCentavos"::text from pecas where sku='QA-FER-1'`)
saldoInicial.startsWith('2') && saldoInicial.endsWith('45000')
  ? ok(`entrada gravou saldo e custo médio: ${saldoInicial}`)
  : nao(`a entrada não fechou: ${saldoInicial}`)

// ---------------------------------------------------------------------------
console.log('\n3) EMPRÉSTIMO · sai com alguém e O SALDO NÃO MUDA')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/estoque?ver=ferramentas`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Registrar saída de ferramenta' }).click()
await p.waitForTimeout(500)
await escolher(p, 'select[name=pecaId]', 'QA-FER-1')
await escolher(p, 'select[name=responsavelId]', 'Rafael')
await p.fill('input[name=quantidade]', '1')
await p.fill('input[name=observacao]', 'QA: atendimento externo')
await p.getByRole('button', { name: 'Registrar saída' }).click()
await p.waitForTimeout(3000)

const depois = sql(`select trim_scale(saldo)::text||'|'||trim_scale("saldoEmprestado")::text from pecas where sku='QA-FER-1'`)
depois === '2|1'
  ? ok(`o saldo continua 2 e uma unidade foi para "emprestado": ${depois}`)
  : nao(`emprestar mexeu no lugar errado — saldo|emprestado = ${depois}`)

// O livro-razão registra o movimento SEM alterar o saldo: é movimento de posse.
const mov = sql(`select m.tipo||'|'||trim_scale(m."saldoAnterior")::text||'|'||trim_scale(m."saldoPosterior")::text
                   from movimentos_estoque m join pecas p on p.id=m."pecaId"
                  where p.sku='QA-FER-1' and m.tipo='EMPRESTIMO'`)
mov === 'EMPRESTIMO|2|2'
  ? ok(`o livro-razão registrou a posse sem mexer no saldo: ${mov}`)
  : nao(`o movimento de empréstimo saiu errado: ${mov || '(nenhum)'}`)

const aberto = sql(`select e."responsavelNome" from emprestimos_ferramenta e join pecas p on p.id=e."pecaId"
                     where p.sku='QA-FER-1' and e."devolvidoEm" is null`)
aberto.includes('Rafael')
  ? ok(`a tela sabe com quem está: ${aberto}`)
  : nao(`não ficou registro de posse aberto: ${aberto || '(nenhum)'}`)

await p.goto(`${QA_BASE}/painel/estoque?ver=ferramentas`, { waitUntil: 'networkidle' })
const naTela = await p.locator('body').innerText()
;/Multímetro de bancada QA/.test(naTela) && /Rafael/.test(naTela)
  ? ok('a aba Ferramentas mostra a ferramenta e quem está com ela')
  : nao('a aba Ferramentas não mostra a ferramenta em campo')

// ---------------------------------------------------------------------------
console.log('\n4) A TRAVA · peça de consumo NÃO se empresta, e a recusa é do SERVIDOR')
// ---------------------------------------------------------------------------
// Peça emprestada sairia do disponível para sempre, esperando uma devolução que
// nunca vem — e a O.S. que precisasse dela veria falta sem nenhuma pista do
// motivo. A tela nem oferece peça na lista; o que este bloco prova é que a
// recusa NÃO DEPENDE DISSO. A opção é forjada no `select` pelo navegador, que é
// o que qualquer pessoa consegue fazer com o inspetor aberto.
const umaPeca = sql(`select id from pecas where tipo='PECA' limit 1`)
const nomeDaPeca = sql(`select nome from pecas where id='${umaPeca}'`)

await p.goto(`${QA_BASE}/painel/estoque?ver=ferramentas`, { waitUntil: 'networkidle' })
await p.getByRole('button', { name: 'Registrar saída de ferramenta' }).click()
await p.waitForTimeout(500)

const forjou = await p.locator('select[name=pecaId]').evaluate((sel, id) => {
  const o = document.createElement('option')
  o.value = id
  o.textContent = 'peça forjada pelo inspetor'
  sel.appendChild(o)
  sel.value = id
  return sel.value === id
}, umaPeca)
forjou
  ? ok(`a opção proibida foi forjada na tela (${nomeDaPeca})`)
  : nao('não consegui forjar a opção — a conferência da trava não rodou')

await escolher(p, 'select[name=responsavelId]', 'Rafael')
const antesDoChute = sql('select count(*) from emprestimos_ferramenta')
await p.getByRole('button', { name: 'Registrar saída' }).click()
await p.waitForTimeout(3000)
const depoisDoChute = sql('select count(*) from emprestimos_ferramenta')
const recusa = await p.locator('[role=alert]').first().innerText().catch(() => '')

depoisDoChute === antesDoChute && /peça não volta|só de ferramenta/i.test(recusa)
  ? ok(`o servidor recusou e nada foi gravado: "${recusa.trim().slice(0, 90)}…"`)
  : nao(`a trava falhou — empréstimos ${antesDoChute}→${depoisDoChute}, recusa: "${recusa.trim().slice(0, 90)}"`)

// E o saldo da peça inocente não pode ter sido tocado no caminho.
const pecaIntacta = sql(`select trim_scale("saldoEmprestado")::text from pecas where id='${umaPeca}'`)
pecaIntacta === '0'
  ? ok('a peça alvo ficou intacta — nada foi movido antes da recusa')
  : nao(`a peça foi movida mesmo com a recusa: emprestado = ${pecaIntacta}`)

// A devolução do bloco 5 é da FERRAMENTA, não desta tentativa: recarrego a
// tela para o formulário forjado sair do caminho.
await p.goto(`${QA_BASE}/painel/estoque?ver=ferramentas`, { waitUntil: 'networkidle' })

// ---------------------------------------------------------------------------
console.log('\n5) DEVOLUÇÃO · volta com a condição escrita, e não volta duas vezes')
// ---------------------------------------------------------------------------
await p.getByRole('button', { name: 'Devolveu' }).first().click()
await p.waitForTimeout(400)
await p.fill('input[name=condicaoVolta]', 'QA: voltou sem a ponteira')
await p.getByRole('button', { name: 'Confirmar devolução' }).click()
await p.waitForTimeout(3000)

const voltou = sql(`select trim_scale(p.saldo)::text||'|'||trim_scale(p."saldoEmprestado")::text||'|'||coalesce(e."condicaoVolta",'-')
                      from pecas p join emprestimos_ferramenta e on e."pecaId"=p.id
                     where p.sku='QA-FER-1'`)
voltou.startsWith('2|0|QA: voltou sem a ponteira')
  ? ok(`voltou para a prateleira com a avaria escrita: ${voltou}`)
  : nao(`a devolução não fechou: ${voltou}`)

const movDev = sql(`select count(*) from movimentos_estoque m join pecas p on p.id=m."pecaId"
                     where p.sku='QA-FER-1' and m.tipo='DEVOLUCAO'`)
movDev === '1'
  ? ok('a devolução também entrou no livro-razão')
  : nao(`a devolução não foi registrada no livro-razão: ${movDev}`)

// ---------------------------------------------------------------------------
console.log('\n6) A FICHA · a conta do disponível é escrita, não só calculada')
// ---------------------------------------------------------------------------
const idFer = sql(`select id from pecas where sku='QA-FER-1'`)
await p.goto(`${QA_BASE}/painel/estoque/${idFer}`, { waitUntil: 'networkidle' })
const ficha = await p.locator('body').innerText()
;/PAT-9001/.test(ficha) && /disponíve/i.test(ficha) && /livro-razão/i.test(ficha)
  ? ok('a ficha traz patrimônio, a conta do disponível e o livro-razão do item')
  : nao('a ficha do item não está completa')

;/Rafael/.test(ficha) && /voltou sem a ponteira/.test(ficha)
  ? ok('a ficha guarda quem levou e como a ferramenta voltou')
  : nao('a ficha não mostra o histórico de posse')

// ---------------------------------------------------------------------------
console.log('\n7) COMPRAS · o giro e a cobertura em dias respondem o que comprar')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/estoque?ver=compras`, { waitUntil: 'networkidle' })
const compras = await p.locator('body').innerText()
;/cobertura/i.test(compras) && /Dinheiro parado/i.test(compras) && /O que mais gira/i.test(compras)
  ? ok('a aba Compras traz cobertura, dinheiro parado e o que mais gira')
  : nao('a aba Compras não está completa')

// A ferramenta não pode entrar na conta de compra: ela volta, não se consome.
;/Multímetro de bancada QA/.test(compras)
  ? nao('a ferramenta apareceu na lista de compra — ela volta, não se consome')
  : ok('ferramenta fica fora do giro e da lista de compra')

// ---------------------------------------------------------------------------
console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ estoque: peça, insumo e ferramenta, cada um com a sua conta\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
