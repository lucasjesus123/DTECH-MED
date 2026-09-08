// =============================================================================
// ABRIR A O.S. EM TRÊS PASSOS — e não perder nada no caminho
// =============================================================================
// O pedido do dono, depois de olhar a tela pronta:
//
//   "TO ACHANDO SO AINDA UM POUCO CONFUSO AO ABRIR O.S EU GOSTARIA QUE FOSSE
//    MAIS FLUIDO TIPO PASSO A PASSO FACIL AINDA PRA MIM TA MUITO CONFUSO TUDO"
//
// A tela virou assistente: o cliente, o aparelho, a ordem. E um assistente tem
// exatamente um jeito de estragar tudo, que é o que este roteiro persegue:
// PERDER O QUE JÁ FOI RESPONDIDO. Se os passos fossem desmontados ao trocar, o
// envio sairia sem nome, sem CPF e sem endereço — e a ordem nasceria quebrada,
// ou o servidor recusaria uma tela cheia de campos que ninguém mais vê.
//
// O que se confere aqui:
//
//   1. A TRILHA DIZ ONDE SE ESTÁ. Três passos, o atual marcado, e o que ainda
//      não se viu não é clicável — pular deixaria campo obrigatório vazio e
//      escondido, que trava o envio SEM MENSAGEM nenhuma.
//
//   2. UM PASSO DE CADA VEZ. O campo do defeito não aparece no passo 1.
//
//   3. NÃO DÁ PARA AVANÇAR VAZIO. "Continuar" com o nome em branco não anda.
//
//   4. O QUE FOI DIGITADO CONTINUA LÁ. Ida e volta pelos três passos, e os
//      campos do passo 1 seguem preenchidos — inclusive vistos de dentro do
//      formulário, que é de onde o `FormData` sai.
//
//   5. E CHEGA INTEIRO NO BANCO. A ordem nasce com o cliente, o aparelho e o
//      defeito que foram digitados — conferidos linha a linha, não pela tela.
//
//   6. EMITIR CAI NO DESPACHO. A ficha abre com a janela de marcar a parada já
//      aberta: emitir e despachar são o mesmo movimento.
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
  return o.length > 1 ? o.slice(1).join('\n').trim() : ''
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
const p = await (await nav.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br')
await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

await p.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)

// Um cliente que NÃO existe na carteira: assim o passo 1 tem de ser digitado
// inteiro, que é o caso em que perder dado dói.
const marcaTempo = Date.now().toString().slice(-6)
const NOME = `Clínica Passo a Passo ${marcaTempo}`

/**
 * UM CNPJ NOVO A CADA EXECUÇÃO — e válido, porque o formulário confere.
 *
 * A primeira versão reusou 11444777000161, que é da Clínica Bella Pelle do
 * cenário. A ordem nasceu no nome DELA, e o roteiro acusou "o cliente saiu como
 * Clínica Bella Pelle" como se fosse defeito. Não é: o documento é a identidade
 * do cliente, e `abrirOrdem` casa por ele de propósito — abrir a segunda O.S.
 * da mesma clínica não pode criar um cadastro paralelo. Quem estava errado era
 * o roteiro, pedindo nome novo com documento de outro.
 */
function cnpjValido(base) {
  const n = base.padStart(12, '0').slice(-12).split('').map(Number)
  const dv = (nums) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = nums.reduce((t, v, i) => t + v * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(n)
  const d2 = dv([...n, d1])
  return [...n, d1, d2].join('')
}
const DOC = cnpjValido(`${marcaTempo}0001`)
const SERIE = `PP-${marcaTempo}`
const DEFEITO = 'Liga e apaga sozinho depois de uns minutos, segundo a recepcionista.'

// ---------------------------------------------------------------------------
console.log('\n1) A TRILHA diz onde se está — e não deixa pular')
// ---------------------------------------------------------------------------
const trilha = p.locator('ol li button')
const quantos = await trilha.count()
quantos === 3
  ? ok('a trilha tem os três passos')
  : nao(`a trilha tem ${quantos} passos, e devia ter 3`)

const atual = await p.locator('ol li button[aria-current="step"]').innerText().catch(() => '')
;/1[\s\S]*cliente/i.test(atual)
  ? ok(`o passo atual é o primeiro: "${atual.replace(/\s+/g, ' ').trim()}"`)
  : nao(`o passo atual não é o cliente: "${atual}"`)

const terceiroTravado = await trilha.nth(2).isDisabled()
terceiroTravado
  ? ok('o passo 3 está travado — pular deixaria campo obrigatório vazio e escondido')
  : nao('dá para pular direto para o passo 3, com o passo 1 em branco')

// ---------------------------------------------------------------------------
console.log('\n2) UM PASSO DE CADA VEZ')
// ---------------------------------------------------------------------------
const defeitoVisivel = await p.locator('textarea[name=defeito]').isVisible()
defeitoVisivel
  ? nao('o campo do defeito aparece já no passo do cliente — não é um passo de cada vez')
  : ok('o campo do defeito não aparece no passo do cliente')

const nomeVisivel = await p.locator('input[name=clienteNome]').isVisible()
nomeVisivel ? ok('e o campo do cliente aparece') : nao('o campo do cliente não aparece no passo 1')

// ---------------------------------------------------------------------------
console.log('\n3) NÃO DÁ PARA AVANÇAR VAZIO')
// ---------------------------------------------------------------------------
await p.getByRole('button', { name: /^Continuar$/ }).click()
await p.waitForTimeout(600)
const aindaNoUm = await p.locator('input[name=clienteNome]').isVisible()
aindaNoUm
  ? ok('"Continuar" com o formulário vazio não sai do passo 1')
  : nao('o assistente avançou com o passo 1 em branco')

// ---------------------------------------------------------------------------
console.log('\n4) O QUE FOI DIGITADO CONTINUA LÁ — indo e voltando')
// ---------------------------------------------------------------------------
await p.fill('input[name=clienteNome]', NOME)
await p.fill('input[name=clienteDocumento]', DOC)
await p.fill('input[name=clienteWhatsapp]', '51980449274')
await p.fill('input[name=contatoNome]', 'Mariana Farias')
await p.fill('input[name=endereco]', 'R. Sabiá, 702, Sala 03, Universitário')
await p.fill('input[name=cidade]', 'Lajeado')
await p.getByRole('button', { name: /^Continuar$/ }).click()
await p.waitForTimeout(700)

const noDois = await p.locator('input[name=marca]').isVisible()
noDois ? ok('passou para o aparelho') : nao('não chegou ao passo do aparelho')

await p.fill('input[name=marca]', 'Lavieen')
await p.fill('input[name=modelo]', 'Duo')
await p.fill('input[name=numeroSerie]', SERIE)

/**
 * "CONTINUAR" NÃO PODE ENVIAR O FORMULÁRIO — e por pouco enviava.
 *
 * O React reaproveita o mesmo `<button>` do DOM entre os dois ramos quando eles
 * ocupam a mesma posição na árvore: o clique roda o `onClick`, o React repinta
 * na hora e troca o `type` para `submit`, e SÓ ENTÃO o navegador executa a ação
 * padrão do clique — lendo o tipo como está agora. Resultado: "Continuar"
 * enviava a ordem.
 *
 * ESTA CONFERÊNCIA PRECISOU SER REFEITA, e o motivo importa mais que ela.
 *
 * A primeira versão só escutava o evento `submit` com o formulário como ele
 * está: `defeito` obrigatório e vazio. Ela ficou VERDE mesmo com o defeito no
 * lugar — porque o navegador barra o envio na validação, e aí o evento `submit`
 * NUNCA É DISPARADO. Conferência que não sabe falhar não prova nada, e essa
 * teria carimbado a tela como certa.
 *
 * O caso perigoso é outro: quando a O.S. nasce de um contato do site, `defeito`
 * JÁ VEM PREENCHIDO. Nada barra, o envio acontece de verdade, e a ordem sai do
 * passo 2 — com PDF emitido e cliente avisado — sem ninguém ter visto o passo 3.
 * Então é esse estado que se monta aqui: o campo do passo 3 preenchido por
 * fora, exatamente como o contato do site o entrega.
 */
await p.evaluate(() => {
  const t = document.querySelector('textarea[name="defeito"]')
  // Como o contato do site entrega: valor já lá, campo ainda escondido.
  t.value = 'Mensagem que veio do site, preenchendo o passo 3 antes da hora.'
  const f = document.querySelector('form:has(textarea[name="defeito"])')
  window.__submeteu = false
  f.addEventListener('submit', () => { window.__submeteu = true })
})
const ordensAntes = Number(sql('select count(*) from ordens'))
await p.getByRole('button', { name: /^Continuar$/ }).click()
await p.waitForTimeout(2500)
const tentouEnviar = await p.evaluate(() => window.__submeteu === true)
const ordensDepois = Number(sql('select count(*) from ordens'))
tentouEnviar || ordensDepois !== ordensAntes
  ? nao(`"Continuar" ENVIOU o formulário (submit=${tentouEnviar}, ordens ${ordensAntes}→${ordensDepois}) — no fluxo do contato do site isso abre a O.S. sozinha, no passo 2`)
  : ok('"Continuar" não envia nada, nem com o campo do passo 3 já preenchido')
// Devolve o campo ao estado em que o roteiro o encontrou.
await p.evaluate(() => { document.querySelector('textarea[name="defeito"]').value = '' })

const noTres = await p.locator('textarea[name=defeito]').isVisible()
noTres ? ok('passou para a ordem') : nao('não chegou ao passo da ordem')

// A volta inteira, que é onde um assistente mal feito apaga tudo.
await p.locator('ol li button').nth(0).click()
await p.waitForTimeout(500)
const voltou = await p.inputValue('input[name=clienteNome]')
const docVoltou = await p.inputValue('input[name=clienteDocumento]')
voltou === NOME && docVoltou === DOC
  ? ok('voltando ao passo 1, nome e documento continuam preenchidos')
  : nao(`o passo 1 perdeu o que foi digitado: nome="${voltou}" doc="${docVoltou}"`)

/**
 * E O FORMULÁRIO ENXERGA OS TRÊS PASSOS AO MESMO TEMPO.
 *
 * Esta é a conferência que separa "a tela mostra de novo" de "o envio leva
 * junto". Ela lê os campos DE DENTRO do `<form>`, que é exatamente de onde o
 * `FormData` sai — se um passo tivesse sido desmontado, o campo não estaria
 * aqui, mesmo a tela parecendo certa ao voltar.
 */
await p.locator('ol li button').nth(2).click()
await p.waitForTimeout(500)
const dentroDoForm = await p.evaluate(() => {
  // O formulário DO ASSISTENTE, e não o primeiro da página: a barra de cima
  // tem o seu, e `document.querySelector('form')` devolvia aquele — os campos
  // vinham nulos e o roteiro acusava perda de dado que não houve.
  const f = document.querySelector('form:has(textarea[name="defeito"])')
  if (!f) return null
  const v = (n) => {
    const el = f.querySelector(`[name="${n}"]`)
    return el ? el.value : null
  }
  return { nome: v('clienteNome'), doc: v('clienteDocumento'), serie: v('numeroSerie') }
})
dentroDoForm && dentroDoForm.nome === NOME && dentroDoForm.doc === DOC && dentroDoForm.serie === SERIE
  ? ok('no passo 3, o formulário ainda carrega os campos dos passos 1 e 2 — é isso que o envio leva')
  : nao(`o formulário perdeu campos de passos anteriores: ${JSON.stringify(dentroDoForm)}`)

// ---------------------------------------------------------------------------
console.log('\n5) E CHEGA INTEIRO NO BANCO')
// ---------------------------------------------------------------------------
await p.fill('textarea[name=defeito]', DEFEITO)
const botaoEmitir = p.getByRole('button', { name: /Emitir Ordem de Servi/i })
;(await botaoEmitir.count()) > 0
  ? ok('o botão do passo 3 é "Emitir Ordem de Serviço"')
  : nao('o passo 3 não tem o botão "Emitir Ordem de Serviço"')

await botaoEmitir.click()
await p.waitForTimeout(5000)

const linha = sql(`
  select o.numero, c.nome, c.documento, e."numeroSerie", o."defeitoRelatado", o.etapa
  from ordens o
  join clientes c on c.id = o."clienteId"
  join equipamentos e on e.id = o."equipamentoId"
  order by o."abertaEm" desc limit 1`)

if (!linha) {
  nao('nenhuma ordem foi criada')
} else {
  const [numero, nome, doc, serie, defeito, etapa] = linha.split('|')
  nome === NOME ? ok(`o cliente chegou inteiro: "${nome}"`) : nao(`o cliente saiu como "${nome}"`)
  doc === DOC ? ok('o CPF/CNPJ do passo 1 chegou') : nao(`o documento saiu como "${doc}"`)
  serie === SERIE ? ok('a série do passo 2 chegou') : nao(`a série saiu como "${serie}"`)
  defeito === DEFEITO ? ok('o relato do passo 3 chegou') : nao(`o relato saiu como "${defeito}"`)
  etapa === 'ORDEM_RETIRADA_GERADA'
    ? ok(`a O.S. #${String(numero).padStart(4, '0')} nasceu em ${etapa}`)
    : nao(`a ordem nasceu em ${etapa}`)
}

// ---------------------------------------------------------------------------
console.log('\n6) EMITIR CAI NO DESPACHO')
// ---------------------------------------------------------------------------
const url = p.url()
;/\/painel\/ordens\/[^/?]+\?despachar=1/.test(url)
  ? ok('a ficha abriu com o despacho pedido na URL')
  : nao(`depois de emitir, a tela foi para ${url}`)

const janela = await p.locator('[role="dialog"]').count()
janela > 0
  ? ok('e a janela de marcar a parada já está aberta — emitir e despachar num movimento só')
  : nao('a ficha abriu sem a janela do despacho')

// Fechar tem de funcionar: a janela vem da URL, e a URL não muda ao fechar.
// Sem cuidado, ela reabriria a cada atualização da tela e prenderia a pessoa.
const fechar = p.getByRole('button', { name: 'Cancelar', exact: true })
if (await fechar.count()) {
  await fechar.first().click()
  await p.waitForTimeout(1200)
  ;(await p.locator('[role="dialog"]').count()) === 0
    ? ok('e ela fecha, sem voltar sozinha')
    : nao('a janela do despacho não fecha — a URL a reabre')
}

// ---------------------------------------------------------------------------
console.log('\n7) NENHUM ERRO de JavaScript na tela')
// ---------------------------------------------------------------------------
erros.length === 0 ? ok('console limpo') : nao(`erros no navegador: ${erros.join(' | ')}`)

await nav.close()
console.log(`\nRESULTADO: ${ruins === 0 ? 'tudo verde' : ruins + ' vermelho(s)'}`)
process.exit(ruins === 0 ? 0 : 1)
