// O FINANCEIRO NO PADRÃO NOVO: os quatro cartões que fecham, a tabela com
// status, a edição que derruba a aprovação, e o histórico do dinheiro.
//
// O que este roteiro existe para impedir, em ordem de gravidade:
//
//   1. A EDIÇÃO VIRAR PORTA DOS FUNDOS DA APROVAÇÃO. Lançar R$ 10, conseguir
//      aprovação (ninguém confere duas vezes um lançamento de dez reais),
//      editar para R$ 10.000 e dar baixa. Se isso passar, a segregação de
//      função inteira do sistema é teatro.
//   2. OS QUATRO CARTÕES NÃO FECHAREM. Total = pago + pendente + atrasado é a
//      igualdade que permite conferir de cabeça. No dia em que ela quebrar, a
//      tela vira quatro fatos soltos e ninguém percebe.
//   3. O CARTÃO DISCORDAR DA LISTA. Foi o defeito da primeira versão: o cartão
//      dizia "atrasado R$ 0,00" com duas linhas marcadas ATRASADO logo abaixo,
//      porque eu tinha prendido o atraso ao mês da tela.
//   4. "12x DE 500" VIRAR DOZE PARCELAS DE R$ 41,67 em silêncio.
//
// O texto é lido com regex sem diferenciar maiúsculas de propósito: os rótulos
// dos cartões são maiusculizados pelo CSS, e `innerText` devolve o texto COMO
// PINTADO — conferir por "Total do mês" reprovaria sempre.
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
const exec = (...cs) => execFileSync('psql',
  ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
   '-c', "select set_config('app.is_super_admin','on',false)", ...cs.flatMap((c) => ['-c', c])],
  { stdio: 'pipe' })

/** "R$ 6.285,00" → 628500. O mesmo caminho que a tela percorre, ao contrário. */
const centavos = (txt) => {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(txt)
  return m ? Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100) : null
}

// Repetir a passada não pode reprovar a seguinte.
exec("delete from lancamentos where descricao like 'QA-%' or descricao like 'QA %'",
     "delete from audit_logs where acao like 'caixa.%' and \"entidadeId\" like 'QA-%'")

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const p = await (await nav.newContext({ viewport: { width: 1500, height: 1100 } })).newPage()
  p.on('pageerror', (e) => erros.push(String(e)))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email); await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

const mes = new Date().toISOString().slice(0, 7)
const tenant = sql("select id from tenants order by \"criadoEm\" limit 1")
const autor = sql(`select id from usuarios where "tenantId"='${tenant}' and papel='ADMIN_EMPRESA' limit 1`)

/**
 * O CENÁRIO É MONTADO AQUI, e não herdado de outro roteiro.
 *
 * Três contas com estados diferentes e valores que não se repetem: uma aprovada
 * e em aberto (a que a edição vai mexer), uma aprovada e PAGA (a que a edição
 * tem de recusar), e uma vencida em mês ANTERIOR (a que prova que o atrasado
 * não respeita a janela do mês). Valores distintos porque a conferência lê
 * número na tela, e dois valores iguais tornariam impossível saber qual linha
 * respondeu.
 */
exec(`insert into lancamentos (id,"tenantId",tipo,descricao,categoria,contraparte,"valorCentavos",
  "valorPagoCentavos",vencimento,"pagoEm",parcela,parcelas,"autorId","autorNome",
  "aprovadoEm","aprovadoPorNome","criadoEm") values
  ('qa-edit','${tenant}','PAGAR','QA-editavel','QA','Fornecedor QA',10000,0,
    date_trunc('month',now())+interval '20 days',null,1,1,'${autor}','Lucas Jesus',now(),'Lucas Jesus',now()),
  ('qa-paga','${tenant}','PAGAR','QA-paga','QA','Fornecedor QA',20000,20000,
    date_trunc('month',now())+interval '2 days',now(),1,1,'${autor}','Lucas Jesus',now(),'Lucas Jesus',now()),
  ('qa-velha','${tenant}','PAGAR','QA-velha de dois meses','QA','Fornecedor QA',70000,0,
    date_trunc('month',now())-interval '55 days',null,1,1,'${autor}','Lucas Jesus',now(),'Lucas Jesus',now()),
  ('qa-parc','${tenant}','RECEBER','QA-locação (3/3)','QA','Cliente QA',73333,0,
    date_trunc('month',now())+interval '14 days',null,3,3,'${autor}','Lucas Jesus',now(),'Lucas Jesus',now())`)

const p = await entrar('lucas@dtechmed.com.br')

console.log('\n1) OS QUATRO CARTÕES FECHAM')
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const cartoes = await p.locator('section[aria-label*="pagar" i]').first().innerText()
const total = centavos(/total do m[êe]s[\s\S]*?(R\$[\d.,\s]+)/i.exec(cartoes)?.[1] ?? '')
const pago = centavos(/\bpago\b[\s\S]*?(R\$[\d.,\s]+)/i.exec(cartoes)?.[1] ?? '')
const pendente = centavos(/pendente[\s\S]*?(R\$[\d.,\s]+)/i.exec(cartoes)?.[1] ?? '')
const atrasado = centavos(/atrasado[\s\S]*?(R\$[\d.,\s]+)/i.exec(cartoes)?.[1] ?? '')
;[total, pago, pendente, atrasado].every((n) => n !== null)
  ? ok(`os quatro números estão na tela: ${total} = ${pago} + ${pendente} + ${atrasado}`)
  : nao(`não consegui ler os quatro cartões da tela:\n${cartoes.slice(0, 400)}`)
total === pago + pendente + atrasado
  ? ok('total = pago + pendente + atrasado')
  : nao(`a igualdade QUEBROU: ${total} ≠ ${pago} + ${pendente} + ${atrasado} = ${pago + pendente + atrasado}`)

console.log('\n2) ATRASADO NÃO RESPEITA O MÊS DA TELA')
// A conta 'qa-velha' venceu há quase dois meses. Ela TEM de estar no atrasado
// de hoje: foi exatamente aqui que a primeira versão errou, mostrando R$ 0,00
// com linhas marcadas ATRASADO logo abaixo.
const vencidoNoBanco = Number(sql(
  `select coalesce(sum("valorCentavos"),0) from lancamentos where "tenantId"='${tenant}'
     and tipo='PAGAR' and "pagoEm" is null and vencimento < now()`))
atrasado === vencidoNoBanco
  ? ok(`o cartão bate com o banco: ${atrasado} de vencido em aberto, de qualquer mês`)
  : nao(`o cartão diz ${atrasado} e o banco diz ${vencidoNoBanco} de vencido em aberto`)
atrasado >= 70000
  ? ok('a conta vencida há dois meses está contada')
  : nao('a conta vencida em mês anterior sumiu do atrasado')

console.log('\n3) A TABELA: colunas, pílula de status e contador de parcela')
const tabela = await p.locator('table').first()
const cabecalho = await tabela.locator('thead').innerText()
;/refer[êe]ncia/i.test(cabecalho) && /status/i.test(cabecalho) && /valor/i.test(cabecalho) && /a[çc][õo]es/i.test(cabecalho)
  ? ok('as quatro colunas: quem/referência, status, valor, ações')
  : nao(`cabeçalho inesperado: "${cabecalho.replace(/\n/g, ' ')}"`)
const corpo = await tabela.locator('tbody').innerText()
;/atrasado/i.test(corpo) ? ok('a pílula ATRASADO aparece na linha') : nao('nenhuma linha marcada atrasado')
;/venc\./i.test(corpo) ? ok('a linha de referência traz o vencimento') : nao('a referência não traz "Venc."')

// A conta parcelada é criada por ESTE roteiro, lá em cima. A primeira versão
// contava com uma parcelada vinda da semeadura, e reprovou na bateria por não
// haver nenhuma — o acoplamento pela ORDEM de execução que o README proíbe, e
// que aqui aparecia como "não achei o contador" acusando a tela.
await p.goto(`${QA_BASE}/painel/financeiro?aba=receber&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const linhaParc = p.locator('tr').filter({ hasText: 'QA-locação' }).first()
;(await linhaParc.count()) > 0 && /\b3\/3\b/.test(await linhaParc.innerText())
  ? ok('o contador de parcela (3/3) está na linha')
  : nao('não achei o contador de parcela na linha da conta parcelada')

console.log('\n4) "VALOR INFORMADO É: DE CADA PARCELA" MULTIPLICA, NÃO DIVIDE')
// O erro que isto impede não grita: sai uma lista plausível, com o número certo
// de linhas e um valor pequeno, e só aparece no mês em que o cliente paga 500 e
// o sistema acusa pagamento a maior.
await p.getByRole('button', { name: '+ Nova conta' }).click()
await p.waitForTimeout(600)
await p.fill('dialog[open] input[name=valor]', '500,00')
await p.fill('dialog[open] input[name=descricao]', 'QA parcela multiplicada')
await p.locator('dialog[open] select[name=parcelas]').selectOption('12')
await p.locator('dialog[open] select[name=modoValor]').selectOption('parcela')
await p.waitForTimeout(400)
const previa = await p.locator('dialog[open] [role=status]').first().innerText()
;/R\$\s*500,00/.test(previa) && /R\$\s*6\.000,00/.test(previa)
  ? ok(`a prévia diz as duas leituras antes de salvar: "${previa.trim()}"`)
  : nao(`a prévia não escreveu 12 × 500 = 6.000: "${previa.trim()}"`)
await p.locator('dialog[open]').getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(3000)
const geradas = sql(`select count(*)||'|'||coalesce(sum("valorCentavos"),0)||'|'||coalesce(min("valorCentavos"),0)
  from lancamentos where "tenantId"='${tenant}' and descricao like 'QA parcela multiplicada%'`)
geradas === '12|600000|50000'
  ? ok('12 parcelas de R$ 500,00, R$ 6.000,00 no total')
  : nao(`o parcelamento saiu errado (contagem|total|menor): "${geradas}" — esperava 12|600000|50000`)

console.log('\n5) EDITAR MUDANDO O VALOR DERRUBA A APROVAÇÃO')
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.locator('button[aria-label="Editar QA-editavel"]').click()
await p.waitForTimeout(600)
const avisoAntes = await p.locator('dialog[open] p').first().innerText()
;/j[áa] aprovada/i.test(avisoAntes)
  ? ok('a janela avisa que a conta está aprovada, antes de qualquer alteração')
  : nao(`sem o aviso de conta aprovada: "${avisoAntes.trim()}"`)

await p.fill('dialog[open] input[name=valor]', '10000,00')
await p.waitForTimeout(500)
const avisoDepois = await p.locator('dialog[open] p').first().innerText()
;/aprova[çc][ãa]o vai cair/i.test(avisoDepois)
  ? ok('o aviso ACENDE no instante em que o valor muda')
  : nao(`o aviso não acendeu ao mudar o valor: "${avisoDepois.trim()}"`)
;(await p.locator('dialog[open] p[role=alert]').count()) > 0
  ? ok('e vira role=alert, para o leitor de tela anunciar')
  : nao('o aviso aceso não é anunciado ao leitor de tela')

await p.locator('dialog[open]').getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(3000)
const depois = sql(`select "valorCentavos"||'|'||coalesce("aprovadoEm"::text,'NULO')||'|'||coalesce("aprovadoPorNome",'NULO')
  from lancamentos where id='qa-edit'`)
depois.startsWith('1000000|')
  ? ok('o novo valor foi gravado: R$ 10.000,00')
  : nao(`o valor não mudou: "${depois}"`)
depois.includes('|NULO|NULO')
  ? ok('A APROVAÇÃO CAIU — a conta voltou para a fila')
  : nao(`a aprovação SOBREVIVEU à mudança de valor: "${depois}" — a porta dos fundos está aberta`)

// E a baixa tem de recusar enquanto ela não for aprovada de novo. A trava está
// na ação, não só no botão: esconder o botão impede o clique, não a requisição.
const trilha = sql(`select acao from audit_logs where "entidadeId"='qa-edit' order by "criadoEm" desc limit 1`)
trilha === 'caixa.conta_editada_perdeu_aprovacao'
  ? ok('a trilha registra que a edição derrubou a aprovação')
  : nao(`a trilha gravou "${trilha}" em vez de caixa.conta_editada_perdeu_aprovacao`)

console.log('\n6) EDITAR SÓ A DESCRIÇÃO NÃO DERRUBA A APROVAÇÃO')
// A regra tem de ser cirúrgica. Se qualquer edição derrubasse a aprovação,
// corrigir um acento no nome do fornecedor mandaria a conta de volta para a
// fila — e a fila deixaria de ser lida, que é como um controle morre.
exec(`update lancamentos set "aprovadoEm"=now(), "aprovadoPorNome"='Lucas Jesus' where id='qa-edit'`)
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
await p.locator('button[aria-label="Editar QA-editavel"]').click()
await p.waitForTimeout(600)
await p.fill('dialog[open] input[name=descricao]', 'QA-editavel com nome corrigido')
await p.locator('dialog[open]').getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(3000)
const so = sql(`select descricao||'|'||coalesce("aprovadoEm"::text,'NULO') from lancamentos where id='qa-edit'`)
so.startsWith('QA-editavel com nome corrigido|') && !so.includes('|NULO')
  ? ok('a descrição mudou e a aprovação continuou de pé')
  : nao(`edição de descrição mexeu na aprovação: "${so}"`)

console.log('\n7) CONTA JÁ BAIXADA NÃO SE EDITA')
// Alterar o previsto de uma conta paga faria o relatório de um mês fechado com
// o contador mudar sozinho, meses depois.
;(await p.locator('button[aria-label="Editar QA-paga"]').count()) === 0
  ? ok('a linha paga não oferece o lápis')
  : nao('a conta paga está oferecendo edição na tela')

console.log('\n8) O HISTÓRICO DO DINHEIRO DIZ DE QUANTO PARA QUANTO')
await p.goto(`${QA_BASE}/painel/financeiro?aba=historico&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
const hist = await p.locator('table').first().innerText()
;/de R\$\s*100,00 para R\$\s*10\.000,00/i.test(hist)
  ? ok('a linha da edição mostra o antes e o depois')
  : nao('o histórico não escreveu "de R$ 100,00 para R$ 10.000,00" — só "quem mexeu", sem "no quê"')
;/lucas/i.test(hist) ? ok('com o nome de quem fez') : nao('o histórico não diz quem fez')

console.log('\n9) O ATALHO "HOJE" VOLTA AO MÊS CORRENTE')
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=2026-01`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const temHoje = await p.getByRole('link', { name: 'Hoje' }).count()
temHoje > 0 ? ok('num mês distante o atalho aparece') : nao('não achei o atalho Hoje')
if (temHoje > 0) {
  await p.getByRole('link', { name: 'Hoje' }).click()
  await p.waitForTimeout(1200)
  p.url().includes(`mes=${mes}`) && p.url().includes('aba=pagar')
    ? ok('ele volta ao mês corrente PRESERVANDO a aba')
    : nao(`o atalho levou para ${p.url()}`)
}
await p.goto(`${QA_BASE}/painel/financeiro?aba=pagar&mes=${mes}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
;(await p.getByRole('link', { name: 'Hoje' }).count()) === 0
  ? ok('e some quando já se está nele — atalho para onde já se está é ruído')
  : nao('o atalho Hoje continua aparecendo no mês corrente')

console.log('\n10) NENHUM ERRO DE JAVASCRIPT NA TELA')
erros.length === 0 ? ok('nenhum') : nao(`${erros.length}: ${erros.slice(0, 3).join(' | ')}`)

exec("delete from lancamentos where descricao like 'QA-%' or descricao like 'QA %'",
     "delete from audit_logs where \"entidadeId\" like 'qa-%'")
await nav.close()
console.log(ruins === 0 ? '\n  ✅ FINANCEIRO OK' : `\n  🔴 ${ruins} CONFERÊNCIAS REPROVARAM`)
process.exit(ruins === 0 ? 0 : 1)
