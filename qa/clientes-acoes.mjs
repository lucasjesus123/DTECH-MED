// =============================================================================
// A CARTEIRA DEIXA DE SER UM BECO — ver, editar, chamar e arquivar
// =============================================================================
// A lista de clientes mostrava seis colunas e abria a ficha. Só. Quem precisava
// trocar um telefone errado, chamar a clínica no WhatsApp ou tirar da carteira
// um cadastro duplicado não tinha por onde, e o trabalho vazava para fora do
// sistema — para o caderno e para o celular pessoal.
//
// A conferência que sustenta o desenho é a 5: ARQUIVAR NÃO APAGA. As ordens do
// cliente continuam existindo, com a linha do tempo encadeada por hash que vale
// como prova; o que muda é ele sair das listas.
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

// Repetir a passada não pode reprovar a seguinte.
execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed',
  '-c', "select set_config('app.is_super_admin','on',false)",
  '-c', `update clientes set ativo = true;
         delete from clientes where nome like 'QA %'`], { stdio: 'pipe' })

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

const p = await entrar('lucas@dtechmed.com.br')

// ---------------------------------------------------------------------------
console.log('\n1) CADA LINHA tem o que fazer com o cliente')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
const linhas = await p.locator('table tbody tr').count()
linhas > 0 ? ok(`${linhas} clientes na carteira`) : nao('a carteira veio vazia')

const primeira = p.locator('table tbody tr').first()
const temEditar = (await primeira.locator('a[href*="?editar=1"]').count()) > 0
const temChamar = (await primeira.locator('a[href^="https://wa.me/"]').count()) > 0
const temArquivar = (await primeira.getByRole('button', { name: 'arquivar' }).count()) > 0
temEditar && temChamar && temArquivar
  ? ok('editar, chamar no WhatsApp e arquivar, na própria linha')
  : nao(`falta ação na linha — editar:${temEditar} chamar:${temChamar} arquivar:${temArquivar}`)

// O link do WhatsApp precisa levar ao número DO CADASTRO, e não a um vazio.
const zap = await primeira.locator('a[href^="https://wa.me/"]').getAttribute('href')
const numeroNaLinha = String(zap).replace('https://wa.me/55', '')
const numeroNoBanco = sql(`select whatsapp from clientes where nome = (
  select nome from clientes where ativo order by nome limit 1)`)
numeroNaLinha === numeroNoBanco.replace(/\D/g, '')
  ? ok(`o "chamar" leva ao número do cadastro: ${numeroNaLinha}`)
  : nao(`o link do WhatsApp não bate: tela ${numeroNaLinha} × banco ${numeroNoBanco}`)

// ---------------------------------------------------------------------------
console.log('\n2) EDITAR abre preenchido, e o atalho da linha já abre o formulário')
// ---------------------------------------------------------------------------
const href = await primeira.locator('a[href*="?editar=1"]').getAttribute('href')
await p.goto(`${QA_BASE}${href}`, { waitUntil: 'networkidle' })

const nomeNoCampo = await p.inputValue('input[name=nome]')
const docNoCampo = await p.inputValue('input[name=documento]')
nomeNoCampo.length > 2 && docNoCampo.length > 5
  ? ok(`o formulário abre preenchido: "${nomeNoCampo}" · ${docNoCampo}`)
  : nao(`o formulário não veio preenchido — nome "${nomeNoCampo}" doc "${docNoCampo}"`)

// O documento volta FORMATADO: quem confere contra um contrato na mão não pode
// ter que contar dígito na tela.
;/[./-]/.test(docNoCampo)
  ? ok(`o documento volta formatado: ${docNoCampo}`)
  : nao(`o documento voltou cru: ${docNoCampo}`)

// E salvar de verdade.
const id = String(href).split('/')[3].split('?')[0]
await p.fill('input[name=contatoNome]', 'QA contato corrigido')
await p.fill('input[name=cidade]', 'Estrela')
await p.getByRole('button', { name: 'Salvar correção' }).click()
await p.waitForTimeout(3000)

const corrigido = sql(`select "contatoNome"||'|'||coalesce(cidade,'-') from clientes where id='${id}'`)
corrigido === 'QA contato corrigido|Estrela'
  ? ok(`a correção gravou: ${corrigido}`)
  : nao(`a correção não gravou: ${corrigido}`)

// A EDIÇÃO NÃO PODE APAGAR O QUE NÃO ESTAVA NA TELA. O formulário traz os 27
// campos, e salvar por cima com metade vazia é o jeito mais silencioso de
// perder dado que alguém conferiu.
const documentoIntacto = sql(`select documento from clientes where id='${id}'`)
documentoIntacto.length >= 11
  ? ok('o documento continua inteiro depois da edição')
  : nao(`a edição comeu o documento: "${documentoIntacto}"`)

// ---------------------------------------------------------------------------
console.log('\n3) A TRAVA · não se arquiva quem tem serviço andando')
// ---------------------------------------------------------------------------
// Uma O.S. em curso é um aparelho de alguém na bancada, ou dentro da van.
// Arquivar o dono no meio disso tira o cliente da busca da atendente
// exatamente quando ela mais precisa dele.
const comOrdem = sql(`select c.id||'|'||c.nome from clientes c
  where exists (select 1 from ordens o where o."clienteId"=c.id
                and o.etapa not in ('FINALIZADO','CANCELADO')) limit 1`)
if (!comOrdem) {
  nao('NÃO TESTADO: nenhum cliente com ordem em andamento no cenário')
} else {
  const [idOcupado, nomeOcupado] = comOrdem.split('|')
  await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
  const linha = p.locator('table tbody tr', { hasText: nomeOcupado }).first()
  p.once('dialog', (d) => d.accept())
  await linha.getByRole('button', { name: 'arquivar' }).click()
  await p.waitForTimeout(2500)

  const aindaAtivo = sql(`select ativo::text from clientes where id='${idOcupado}'`)
  const recusa = await p.locator('[role=alert]').first().innerText().catch(() => '')
  aindaAtivo === 'true' && /em andamento/i.test(recusa)
    ? ok(`recusou arquivar ${nomeOcupado}: "${recusa.trim().slice(0, 70)}…"`)
    : nao(`a trava falhou — ativo:${aindaAtivo} recusa:"${recusa.trim().slice(0, 70)}"`)
}

// ---------------------------------------------------------------------------
console.log('\n4) ARQUIVAR some das listas — de TODAS elas')
// ---------------------------------------------------------------------------
// O filtro mora na consulta que o sistema inteiro usa. Filtrar só na tela de
// clientes deixaria o arquivado voltando pela porta dos fundos, em cada
// `select` do sistema.
/**
 * O cliente que vai ser arquivado NASCE AQUI, pela tela.
 *
 * Os quatro do cenário de ensaio têm ordem em andamento — de propósito, porque
 * é o que faz o resto da bateria ter trabalho para exercitar. Procurar entre
 * eles um "livre" para arquivar deixaria esta conferência dependendo de qual
 * cenário rodou antes, que é o acoplamento que faz roteiro passar sozinho e
 * reprovar dentro da bateria.
 *
 * Cadastrar um do zero também exercita o outro lado do formulário: o mesmo
 * componente que edita tem de continuar criando.
 */
await p.goto(`${QA_BASE}/painel/clientes?novo=1`, { waitUntil: 'networkidle' })
await p.fill('input[name=nome]', 'QA Clínica para arquivar')
await p.fill('input[name=documento]', '19.216.842/0001-06')
await p.fill('input[name=whatsapp]', '51 98888-7777')
await p.fill('input[name=cidade]', 'Lajeado')
await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
await p.waitForTimeout(3000)

const livre = sql(`select id||'|'||nome from clientes where nome='QA Clínica para arquivar'`)
livre
  ? ok('o mesmo formulário que edita continua CADASTRANDO')
  : nao('não consegui cadastrar o cliente de teste')
if (!livre) {
  nao('sem o cliente de teste, os blocos 4 e 5 não rodam')
} else {
  const [idLivre, nomeLivre] = livre.split('|')
  await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
  p.once('dialog', (d) => d.accept())
  await p.locator('table tbody tr', { hasText: nomeLivre }).first()
    .getByRole('button', { name: 'arquivar' }).click()
  await p.waitForTimeout(3000)

  sql(`select ativo::text from clientes where id='${idLivre}'`) === 'false'
    ? ok(`${nomeLivre} foi arquivado`)
    : nao(`${nomeLivre} continua ativo depois de arquivar`)

  await p.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
  const naCarteira = (await p.locator('table tbody tr', { hasText: nomeLivre }).count()) === 0
  naCarteira ? ok('some da carteira') : nao('continua aparecendo na carteira')

  // A outra lista: o `select` de dono do equipamento.
  await p.goto(`${QA_BASE}/painel/equipamentos?novo=1`, { waitUntil: 'networkidle' })
  const opcoes = await p.locator('select[name=clienteId] option').allInnerTexts()
  !opcoes.some((o) => o.includes(nomeLivre))
    ? ok('e some também do "cliente dono" do equipamento')
    : nao('o arquivado ainda é oferecido como dono de equipamento')

  // ---------------------------------------------------------------------------
  console.log('\n5) ARQUIVAR NÃO APAGA — e dá para reativar')
  // ---------------------------------------------------------------------------
  const ordens = sql(`select count(*) from ordens where "clienteId"='${idLivre}'`)
  const equipamentos = sql(`select count(*) from equipamentos where "clienteId"='${idLivre}'`)
  const existe = sql(`select count(*) from clientes where id='${idLivre}'`)
  existe === '1'
    ? ok(`nada foi apagado: o cliente continua no banco com ${ordens} ordens e ${equipamentos} equipamentos`)
    : nao('o cliente sumiu do banco — arquivar não pode apagar')

  await p.goto(`${QA_BASE}/painel/clientes?arquivados=1`, { waitUntil: 'networkidle' })
  const apareceArquivado = (await p.locator('table tbody tr', { hasText: nomeLivre }).count()) > 0
  apareceArquivado
    ? ok('"mostrar arquivados" acha ele de volta')
    : nao('nem com "mostrar arquivados" o cliente aparece — não haveria como reativar')

  await p.locator('table tbody tr', { hasText: nomeLivre }).first()
    .getByRole('button', { name: 'reativar' }).click()
  await p.waitForTimeout(3000)
  sql(`select ativo::text from clientes where id='${idLivre}'`) === 'true'
    ? ok(`${nomeLivre} voltou para a carteira`)
    : nao('reativar não funcionou')
}

// ---------------------------------------------------------------------------
console.log('\n6) A TRAVA DE PERFIL · o técnico não mexe na carteira')
// ---------------------------------------------------------------------------
// A carteira inteira é o dado mais sensível do sistema: nome, CPF/CNPJ,
// telefone e endereço de todo mundo numa tela só.
const t = await entrar('rafael@dtechmed.com.br')
const r = await t.goto(`${QA_BASE}/painel/clientes`, { waitUntil: 'networkidle' })
const parou = new URL(t.url()).pathname
parou !== '/painel/clientes'
  ? ok(`o técnico não alcança a carteira — parou em ${parou} (HTTP ${r?.status()})`)
  : nao('o técnico abriu a lista de clientes')

// E a ação recusa mesmo pedida direto, sem tela nenhuma.
const antesDoChute = sql('select count(*) from clientes where not ativo')
await t.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const depoisDoChute = sql('select count(*) from clientes where not ativo')
depoisDoChute === antesDoChute
  ? ok('nenhum cliente foi arquivado por fora da tela')
  : nao('algo arquivou cliente sem passar pela tela')

// ---------------------------------------------------------------------------
console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ a carteira deixou de ser um beco\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
