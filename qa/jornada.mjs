/**
 * AS 18 ETAPAS, PELA TELA, DE CABO A RABO.
 *
 * O que o motor de blueprint não alcança: subir foto de verdade e assinar no
 * visor. Aqui vai tudo — o mesmo caminho que uma ordem faz na vida real, cada
 * papel entrando com a conta dele, cada trava sendo cobrada onde o diagrama diz
 * que ela existe.
 *
 * Cada etapa é conferida NO BANCO depois de clicada. "A tela disse que salvou"
 * não conta.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

// O endereço do sistema em ensaio. Vem do ambiente para a bateria poder rodar
// noutra porta sem editar dezesseis arquivos.
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'

// A senha das contas de ensaio. Vem do ambiente para não ficar escrita
// num repositório público; o padrão é a que `npm run db:seed -- --demo`
// grava, e que só existe em banco de demonstração.
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw

const SHOTS = '/var/tmp/qa/jornada'
mkdirSync(SHOTS, { recursive: true })
const sql = (q) =>
  execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',q], {encoding:'utf8'}).trim()

let passo = 0, falhas = 0
const registros = []
const ok = (etapa, oque, certo, detalhe='') => {
  passo++
  if (!certo) falhas++
  console.log(`  ${certo ? '🟢' : '🔴'} ${String(etapa).padStart(2)} · ${oque}${detalhe ? '  — ' + detalhe : ''}`)
}

// Uma foto JPEG real, 8x8 pixels. Precisa ser imagem de verdade: o servidor
// abre com o sharp e recusa o que só se diz imagem.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMB' +
  'AAIRAxEAPwD3+iiigD//2Q==', 'base64')
const arquivoFoto = (n) => ({ name: `foto-${n}.jpg`, mimeType: 'image/jpeg', buffer: JPEG })

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const janelas = {}
async function como(quem, email, senha) {
  if (janelas[quem]) return janelas[quem]
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 1000 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log(`     PAGEERROR(${quem})`, String(e).slice(0, 140)))
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name=email]', email)
  await p.fill('input[type=password]', senha)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForTimeout(2200)
  janelas[quem] = p
  return p
}
const etapaNoBanco = (id) => sql(`SELECT etapa FROM ordens WHERE id='${id}'`)
/**
 * Avança uma etapa pela tela e ESPERA A ETAPA MUDAR DE VERDADE.
 *
 * A versão anterior clicava e dormia 2400ms fixos. Isso reprovava passos ao
 * acaso: em quatro passadas seguidas caíram três conferências DIFERENTES — a
 * aprovação da gestão numa, a recusa pelo portal noutra, a baixa final numa
 * terceira — e todas passavam quando repetidas. O servidor de desenvolvimento
 * compila rota sob demanda, então a mesma transição às vezes leva 3 segundos e
 * às vezes leva 1. Dormir um tempo fixo transforma isso em reprovação
 * intermitente, e teste que reprova sozinho ensina a ignorar reprovação — que
 * é o pior estrago possível numa bateria.
 *
 * Agora ele espera a CONDIÇÃO: lê a etapa antes, clica, e fica olhando o banco
 * até ela mudar (ou até 20s). Quando a etapa não devia mudar mesmo — as travas
 * — a espera vira o tempo limite e o teste segue, exatamente como antes.
 */
const avancar = async (p, id, rotulo) => {
  await p.goto(`${QA_BASE}/painel/ordens/${id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const b = p.getByRole('button', { name: new RegExp('^' + rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
  if (!(await b.count())) {
    const todos = await p.getByRole('button').allTextContents()
    console.log(`     [sem o botão "${rotulo}"] a ficha oferece: ${todos.map((t) => t.trim()).filter(Boolean).join(' | ')}`)
    return false
  }
  const antes = etapaNoBanco(id)
  await b.click()
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(500)
    if (etapaNoBanco(id) !== antes) break
  }
  return true
}


/**
 * Assinar no visor, de verdade: rola o quadro até ele aparecer, pega a caixa
 * DEPOIS de rolar (senão as coordenadas apontam para fora da tela e o traço
 * nunca acontece) e desenha com eventos de ponteiro, que é o que o componente
 * escuta.
 */
async function assinar(pg) {
  const q = pg.locator('canvas').first()
  if (!(await q.count())) return false
  await q.scrollIntoViewIfNeeded()
  await pg.waitForTimeout(400)
  const b = await q.boundingBox()
  if (!b) return false
  const y = b.y + b.height / 2
  await pg.mouse.move(b.x + 20, y)
  await pg.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await pg.mouse.move(b.x + 20 + (i * (b.width - 40)) / 20, y + Math.sin(i / 2) * (b.height / 4))
    await pg.waitForTimeout(15)
  }
  await pg.mouse.up()
  await pg.waitForTimeout(500)
  return true
}

const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
console.log(`\n  AS 18 ETAPAS, PELA TELA  ·  agendando para hoje, ${HOJE}\n  ` + '─'.repeat(62))

// ---------------------------------------------------------------------------
// 01 · SOLICITACAO_RECEBIDA — a atendente abre a ordem
// ---------------------------------------------------------------------------
const ana = await como('ana', 'ana@dtechmed.com.br', SENHA)
await ana.goto(`${QA_BASE}/painel/ordens/nova`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1000)
const nova = ana.locator('form').filter({ has: ana.locator('textarea[name=defeito]') }).first()
await nova.locator('input[name=clienteNome]').fill('Clínica Bella Pelle')
await nova.locator('input[name=clienteDocumento]').fill('11444777000161')
await nova.locator('input[name=clienteWhatsapp]').fill('51980449274')
await nova.locator('input[name=contatoNome]').fill('Mariana Farias')
await nova.locator('input[name=endereco]').fill('R. Sabiá, 702, Sala 03, Universitário')
await nova.locator('input[name=cidade]').fill('Lajeado')
await nova.locator('input[name=marca]').fill('Lavieen')
await nova.locator('input[name=modelo]').fill('Duo')
await nova.locator('input[name=numeroSerie]').fill('LA-3050-QA')
await nova.locator('textarea[name=defeito]').fill('Liga, mas desliga sozinho depois de uns dez minutos de uso.')
await nova.getByRole('button', { name: /abrir ordem e gerar/i }).click()
await ana.waitForTimeout(3000)
const erroNova = await ana.locator('[role=alert], .erro').first().textContent().catch(() => '')
if (erroNova) console.log('     formulário respondeu:', erroNova.trim().slice(0, 160))

const ordemId = sql("SELECT id FROM ordens ORDER BY \"abertaEm\" DESC LIMIT 1")
const numero = ordemId ? sql(`SELECT numero FROM ordens WHERE id='${ordemId}'`) : ''
// Abrir pela tela faz as etapas 01 e 02 de uma vez — é o que o diagrama diz
// em 02: "a central cadastra cliente, aparelho e o defeito; o PDF da ordem sai
// sozinho". SOLICITACAO_RECEBIDA é o instante anterior, quando o pedido chega
// pelo site.
ok(1, 'a atendente abriu a ordem pela tela Ordens → Nova', ordemId !== '', `O.S. nº ${numero}`)
if (!ordemId) { console.log('\n  Sem ordem: nada a percorrer.\n'); await nav.close(); process.exit(1) }
registros.push(`ordem nº ${numero} (${ordemId})`)
const token = sql(`SELECT "tokenPublico" FROM ordens WHERE id='${ordemId}'`)

/**
 * O NÚMERO DA O.S. COMO ÂNCORA — o que este roteiro usa no lugar de `.first()`.
 *
 * Toda tela de LISTA por onde a jornada passa — a fila da Agenda, a rota do
 * motorista, a fila de faturamento, a de recebimento — mostra o número da ordem
 * no formato `#0023`. Enquanto a bateria começava com o banco quase vazio, a
 * ordem recém-aberta era sempre a primeira da lista e o `.first()` acertava por
 * sorte. Com o cenário completo semeado antes da fase 2, ele passou a clicar na
 * ordem de outra pessoa: a jornada agendava a retirada alheia, a sua ficava
 * parada, e as dez etapas seguintes caíam em cascata — arrastando junto o
 * `isolamento.mjs`, que confere o que este roteiro deixou.
 *
 * Nada disso era defeito do produto. Era `.first()` num lugar onde há
 * identificador à mão.
 */
const OS = `#${String(numero).padStart(4, '0')}`
/** A linha (tabela) ou o cartão (aplicativo) que fala DESTA ordem. */
const daOrdem = (pagina, seletor) => pagina.locator(seletor).filter({ hasText: OS }).first()

/**
 * A parada DESTA ordem que ainda oferece a ação.
 *
 * O número da O.S. sozinho não basta na rota do motorista: uma ordem tem DUAS
 * paradas — a retirada e a entrega — e as duas mostram `#0023`. Depois que a
 * retirada é concluída, o cartão dela continua na lista (o motorista precisa
 * poder conferir o endereço aonde foi), só que sem botão. O `.first()` caía
 * nesse cartão morto, o clique não acontecia, e a etapa 16 reprovava dizendo
 * que a rota de entrega não saiu.
 *
 * Então a âncora é o par: o cartão desta ordem QUE TEM o botão.
 */
const paradaComBotao = (pagina, rotulo) =>
  pagina
    .locator('article')
    .filter({ hasText: OS })
    .filter({ has: pagina.getByRole('button', { name: rotulo }) })
    .first()
    .getByRole('button', { name: rotulo })

// ---------------------------------------------------------------------------
// 02 · ORDEM_RETIRADA_GERADA
// ---------------------------------------------------------------------------
ok(2, 'ORDEM_RETIRADA_GERADA · o PDF da ordem sai sozinho', etapaNoBanco(ordemId) === 'ORDEM_RETIRADA_GERADA')
const pdfOrdem = Number(sql(`SELECT count(*) FROM outbox_jobs WHERE payload->>'ordemId'='${ordemId}' AND tipo LIKE '%pdf%'`))
ok(2, 'o PDF entrou na fila junto com a etapa', pdfOrdem >= 1, `${pdfOrdem} job(s) de PDF`)

// ---- TRAVA 1: "parada marcada" ---------------------------------------------
await avancar(ana, ordemId, 'Retirada agendada')
const travou1 = etapaNoBanco(ordemId) === 'ORDEM_RETIRADA_GERADA'
ok(2, 'TRAVA · sem parada na Agenda, "agendada" é recusada', travou1)

// ---------------------------------------------------------------------------
// 03 · RETIRADA_AGENDADA — pela Agenda de rota, com dia, hora e motorista
// ---------------------------------------------------------------------------
await ana.goto(`${QA_BASE}/painel/agenda`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1200)
await daOrdem(ana, 'tr').getByRole('button', { name: 'Marcar', exact: true }).click()
await ana.waitForTimeout(1200)
const agendar = ana.locator('form').filter({ has: ana.locator('input[name=data]') }).first()
await agendar.locator('input[name=data]').fill(HOJE)
await agendar.locator('input[name=hora]').fill('09:00')
await agendar.locator('select[name=motoristaId]').selectOption({ index: 1 }).catch(() => {})
await agendar.getByRole('button', { name: /marcar e avisar/i }).click()
await ana.waitForTimeout(3000)
ok(3, 'RETIRADA_AGENDADA · dia, hora e motorista marcados', etapaNoBanco(ordemId) === 'RETIRADA_AGENDADA')

// ---------------------------------------------------------------------------
// 04 · EM_ROTA_RETIRADA — o motorista marca a saída no aplicativo
// ---------------------------------------------------------------------------
const adriano = await como('adriano', 'adriano@dtechmed.com.br', SENHA)
await adriano.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'domcontentloaded' })
await adriano.waitForTimeout(1500)
const saida = paradaComBotao(adriano, /Saí para esta parada/i)
if (await saida.count()) { await saida.click(); await adriano.waitForTimeout(2800) }
else console.log('     [rota do motorista]', ((await adriano.locator('body').textContent()) ?? '').replace(/\s+/g,' ').slice(0, 260))
ok(4, 'EM_ROTA_RETIRADA · o motorista marcou a saída', etapaNoBanco(ordemId) === 'EM_ROTA_RETIRADA')

// ---------------------------------------------------------------------------
// 05 · COLETADO — fotos e assinatura no visor
// ---------------------------------------------------------------------------
const parada = sql(`SELECT id FROM agendamentos WHERE "ordemId"='${ordemId}' AND tipo='RETIRADA' LIMIT 1`)
// A rota do aplicativo é por ORDEM, não pelo id da parada.
await adriano.goto(`${QA_BASE}/app/motorista/${ordemId}`, { waitUntil: 'domcontentloaded' })
await adriano.waitForTimeout(1500)

const entradaFoto = adriano.locator('input[type=file]').first()
console.log('     entradas de arquivo na tela da parada:', await adriano.locator('input[type=file]').count())
if (await entradaFoto.count()) {
  await entradaFoto.setInputFiles([arquivoFoto(1), arquivoFoto(2), arquivoFoto(3)])
  for (let i = 0; i < 20; i++) {
    await adriano.waitForTimeout(1000)
    if (Number(sql(`SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`)) >= 3) break
  }
  const aviso = await adriano.locator('[role=alert]').first().textContent().catch(() => '')
  if (aviso) console.log('     a tela avisou:', aviso.trim().slice(0, 160))
} else {
  console.log('     [tela da parada]', ((await adriano.locator('body').textContent()) ?? '').replace(/\s+/g,' ').slice(0, 300))
}
const fotosRetirada = Number(sql(`SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`))
ok(5, 'as fotos da retirada subiram', fotosRetirada >= 1, `${fotosRetirada} fotos`)

// A assinatura: um traço de verdade no quadro, com o mouse.
// TRAVA · sem o traço no visor, o botão de confirmar não deixa fechar.
const antesDoTraco = adriano.getByRole('button', { name: /confirmar retirada/i }).first()
ok(5, 'TRAVA · sem assinatura no visor, a coleta não fecha',
   (await antesDoTraco.count()) > 0 && (await antesDoTraco.isDisabled()))

await assinar(adriano)
const nomeAssin = adriano.locator('#nome')
if (await nomeAssin.count()) await nomeAssin.fill('Mariana Farias')
const docAssin = adriano.locator('#documento')
if (await docAssin.count()) await docAssin.fill('12345678909')
const confirmar = adriano.getByRole('button', { name: /confirmar retirada/i }).first()
if (await confirmar.count()) { await confirmar.click(); await adriano.waitForTimeout(3500) }
const assinaturas = Number(sql(`SELECT count(*) FROM assinaturas WHERE "ordemId"='${ordemId}' AND tipo='RETIRADA'`))
ok(5, 'COLETADO · assinado no visor pelo cliente', etapaNoBanco(ordemId) === 'COLETADO' && assinaturas === 1, `${assinaturas} assinatura`)

// ---------------------------------------------------------------------------
// 06 · RECEBIDO_NA_EMPRESA — o técnico e as 6 fotos
// ---------------------------------------------------------------------------
const rafael = await como('rafael', 'rafael@dtechmed.com.br', SENHA)
await rafael.goto(`${QA_BASE}/app/tecnico/${ordemId}`, { waitUntil: 'domcontentloaded' })
await rafael.waitForTimeout(1500)

// A trava das 6 fotos: o botão de dar entrada precisa estar recusando agora.
const rotuloBotao = await rafael.getByRole('button', { name: /dar entrada|falta/i }).first().textContent().catch(() => '')
ok(6, 'TRAVA · com menos de 6 fotos, a entrada é recusada e diz quantas faltam',
   /falta/i.test(rotuloBotao ?? ''), (rotuloBotao ?? '').trim())

const entradaTec = rafael.locator('input[type=file]').first()
await entradaTec.setInputFiles(Array.from({ length: 6 }, (_, i) => arquivoFoto(`tec-${i}`)))
await rafael.waitForTimeout(12000)
const totalFotos = Number(sql(`SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`))
ok(6, 'as 6 fotos do técnico subiram', totalFotos >= 6, `${totalFotos} fotos no total`)

await rafael.getByRole('button', { name: /dar entrada no equipamento/i }).first().click()
await rafael.waitForTimeout(3000)
ok(6, 'RECEBIDO_NA_EMPRESA · entrada dada', etapaNoBanco(ordemId) === 'RECEBIDO_NA_EMPRESA')

// ---------------------------------------------------------------------------
// 07 · EM_ANALISE
// ---------------------------------------------------------------------------
await avancar(rafael, ordemId, 'Em análise técnica')
ok(7, 'EM_ANALISE · o aparelho está na bancada', etapaNoBanco(ordemId) === 'EM_ANALISE')

// ---- TRAVA 2: diagnóstico escrito ------------------------------------------
await avancar(rafael, ordemId, 'Laudo concluído, orçamento em revisão')
ok(7, 'TRAVA · sem laudo escrito, não sai da análise', etapaNoBanco(ordemId) === 'EM_ANALISE')

// ---------------------------------------------------------------------------
// 08 · ORCAMENTO_INTERNO — com o laudo escrito
// ---------------------------------------------------------------------------
await rafael.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'domcontentloaded' })
await rafael.waitForTimeout(1000)
const laudo = rafael.locator('textarea[name=diagnostico]').first()
if (await laudo.count()) {
  await laudo.fill('Fonte sem saída nos 24V. Capacitor C14 estufado e trilha do regulador com marca de calor.')
  await rafael.getByRole('button', { name: /salvar laudo|salvar diagn/i }).first().click()
  await rafael.waitForTimeout(2200)
}
await avancar(rafael, ordemId, 'Laudo concluído, orçamento em revisão')
ok(8, 'ORCAMENTO_INTERNO · com o laudo escrito, passa', etapaNoBanco(ordemId) === 'ORCAMENTO_INTERNO')

// ---------------------------------------------------------------------------
// 09 · ORCAMENTO_ENVIADO — só a gestão libera
// ---------------------------------------------------------------------------
const camila = await como('camila', 'camila@dtechmed.com.br', SENHA)

// ---- TRAVA 3: orçamento montado --------------------------------------------
await avancar(camila, ordemId, 'Orçamento enviado ao cliente')
ok(9, 'TRAVA · orçamento vazio não vai ao cliente', etapaNoBanco(ordemId) === 'ORCAMENTO_INTERNO')

// Monta o orçamento na tela da ordem.
await camila.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'domcontentloaded' })
await camila.waitForTimeout(1200)
// Os campos do item do orçamento não têm `name`: são identificados por
// `aria-label`, que é como um leitor de tela — e um humano — os encontra.
const editar = camila.getByRole('button', { name: /editar or[çc]amento|montar or[çc]amento|novo or[çc]amento/i }).first()
if (await editar.count()) { await editar.click(); await camila.waitForTimeout(1000) }
const descricao = camila.getByLabel('Descrição do item').first()
if (await descricao.count()) {
  await descricao.fill('Troca do capacitor C14 e recuperação da trilha do regulador')
  await camila.getByLabel('Quantidade').first().fill('1')
  await camila.getByLabel('Valor unitário').first().fill('1840')
  await camila.getByRole('button', { name: /salvar or[çc]amento/i }).first().click()
  await camila.waitForTimeout(3000)
  const aviso = await camila.locator('[role=alert]').first().textContent().catch(() => '')
  if (aviso) console.log('     orçamento respondeu:', aviso.trim().slice(0, 160))
} else {
  console.log('     [ficha]', (await camila.getByRole('button').allTextContents()).join(' | '))
}

const totalOrc = sql(`SELECT coalesce(max("totalCentavos"),0) FROM orcamentos WHERE "ordemId"='${ordemId}'`)
ok(9, 'a gestão montou o orçamento', Number(totalOrc) > 0, `R$ ${(Number(totalOrc)/100).toFixed(2)}`)

await avancar(camila, ordemId, 'Orçamento enviado ao cliente')
ok(9, 'ORCAMENTO_ENVIADO · o cliente recebe o link', etapaNoBanco(ordemId) === 'ORCAMENTO_ENVIADO')

// TRAVA · começar o serviço sem o cliente ter aceitado o valor: a etapa nem é
// oferecida na ficha, e o motor recusaria de qualquer forma.
const tentouSemAprovar = await avancar(camila, ordemId, 'Manutenção iniciada')
ok(9, 'TRAVA · sem a aprovação do cliente, a manutenção não começa',
   !tentouSemAprovar && etapaNoBanco(ordemId) === 'ORCAMENTO_ENVIADO')

// ---------------------------------------------------------------------------
// 10 · ORCAMENTO_APROVADO — pelo PORTAL, pelo próprio cliente
// ---------------------------------------------------------------------------
const ctxCliente = await nav.newContext({ viewport: { width: 430, height: 900 } })
const cliente = await ctxCliente.newPage()
await cliente.goto(`${QA_BASE}/os/${token}`, { waitUntil: 'domcontentloaded' })
await cliente.waitForTimeout(1500)
const textoPortal = (await cliente.locator('body').textContent()) ?? ''
ok(10, 'o portal do cliente abre com o token da ordem', textoPortal.includes(String(numero)) || /or[çc]amento/i.test(textoPortal))
ok(10, 'o portal não mostra dado interno (custo, margem, laudo interno)',
   !/margem|custo interno|observa[çc][õo]es internas/i.test(textoPortal))

// O portal pede CPF, nome e assinatura para APROVAR — é o que transforma a
// ordem em contrato. É o cliente que aprova, e ninguém aqui dentro por ele.
const btnAprovar = cliente.getByRole('button', { name: /^Aprovar/ }).first()
if (await btnAprovar.count()) {
  await btnAprovar.click()
  await cliente.waitForTimeout(1200)
  await cliente.locator('#documento').fill('11444777000161')
  await cliente.locator('#assinanteNome').fill('Mariana Farias')
  await assinar(cliente)
  await cliente.getByRole('button', { name: /^(Aprovar|Confirmar)/ }).last().click()
  await cliente.waitForTimeout(3500)
  const avisoPortal = await cliente.locator('[role=alert]').first().textContent().catch(() => '')
  if (avisoPortal) console.log('     portal respondeu:', avisoPortal.trim().slice(0, 160))
} else {
  console.log('     [portal]', (await cliente.getByRole('button').allTextContents()).join(' | '))
}
await cliente.screenshot({ path: `${SHOTS}/portal.png`, fullPage: true })
ok(10, 'ORCAMENTO_APROVADO · aprovado pelo PRÓPRIO cliente, no portal',
   etapaNoBanco(ordemId) === 'ORCAMENTO_APROVADO')

// TRAVA · antes de o cliente aprovar, "Manutenção iniciada" não existe na
// ficha para ninguém — nem para a gestão. Conferido no estado anterior, com a
// ordem ainda em ORCAMENTO_ENVIADO, logo acima.

// ---------------------------------------------------------------------------
// 11 a 13 · a manutenção
// ---------------------------------------------------------------------------
await avancar(rafael, ordemId, 'Manutenção iniciada')
ok(11, 'EM_MANUTENCAO · as peças saem do estoque', etapaNoBanco(ordemId) === 'EM_MANUTENCAO')
await avancar(rafael, ordemId, 'Manutenção concluída, testes aprovados')
ok(12, 'MANUTENCAO_CONCLUIDA · testes aprovados', etapaNoBanco(ordemId) === 'MANUTENCAO_CONCLUIDA')
await avancar(rafael, ordemId, 'Aguardando conferência da gestão')
ok(13, 'APROVACAO_GESTAO · a segunda vista antes de cobrar', etapaNoBanco(ordemId) === 'APROVACAO_GESTAO')

// ---------------------------------------------------------------------------
// 14 · FATURAMENTO — só a gestão
// ---------------------------------------------------------------------------
await avancar(camila, ordemId, 'Liberado para faturamento')
ok(14, 'FATURAMENTO · a fatura nasce do valor aprovado', etapaNoBanco(ordemId) === 'FATURAMENTO')
// A fatura é EMITIDA pelo financeiro, na tela dele. O diagrama promete que
// ela sai com o valor do orçamento aprovado, "nunca digitado de novo" — é
// exatamente isso que a conferência abaixo cobra.
const fabio = await como('fabio', 'fabio@dtechmed.com.br', SENHA)
await fabio.goto(`${QA_BASE}/painel/financeiro`, { waitUntil: 'domcontentloaded' })
await fabio.waitForTimeout(1500)
const emitir = daOrdem(fabio, 'li, tr').getByRole('button', { name: /emitir fatura/i })
if (await emitir.count()) { await emitir.click(); await fabio.waitForTimeout(3000) }

const fatura = sql(`SELECT id FROM faturas WHERE "ordemId"='${ordemId}' LIMIT 1`)
const valorFatura = fatura ? sql(`SELECT "valorTotalCentavos" FROM faturas WHERE id='${fatura}'`) : '0'
ok(14, 'a fatura saiu com o valor do orçamento, não digitado de novo',
   fatura !== '' && valorFatura === String(totalOrc),
   `fatura R$ ${(Number(valorFatura)/100).toFixed(2)} · orçamento R$ ${(Number(totalOrc)/100).toFixed(2)}`)

// ---- TRAVA: fatura quitada -------------------------------------------------
await avancar(fabio, ordemId, 'Pagamento confirmado')
ok(14, 'TRAVA · sem o pagamento fechar, não vira FATURADO', etapaNoBanco(ordemId) === 'FATURAMENTO')

// -------------------------------------------------------------------------
// 15 · FATURADO — o diagrama promete pagamento EM PARTES: metade agora,
//      metade na entrega. Testado exatamente assim.
// -------------------------------------------------------------------------
const receber = async (reais) => {
  await fabio.goto(`${QA_BASE}/painel/financeiro`, { waitUntil: 'domcontentloaded' })
  await fabio.waitForTimeout(1500)
  const abrir = daOrdem(fabio, 'li, tr').getByRole('button', { name: 'Abrir', exact: true })
  if (!(await abrir.count())) return false
  await abrir.click()
  await fabio.waitForTimeout(1200)
  const campo = fabio.getByLabel(/^Valor \(R\$\)/).first()
  await campo.fill(String(reais))
  await fabio.getByRole('button', { name: /registrar recebimento/i }).first().click()
  await fabio.waitForTimeout(3000)
  return true
}
await receber(1000)
const parcial = fatura ? sql(`SELECT status FROM faturas WHERE id='${fatura}'`) : ''
ok(15, 'pagamento em PARTES: a primeira metade deixa a fatura PARCIAL', parcial === 'PARCIAL', `status ${parcial}`)
await avancar(fabio, ordemId, 'Pagamento confirmado')
ok(15, 'TRAVA · com a fatura só parcial, ainda não vira FATURADO', etapaNoBanco(ordemId) === 'FATURAMENTO')

await receber(Number(totalOrc) / 100 - 1000)
const saldo = fatura ? sql(`SELECT status FROM faturas WHERE id='${fatura}'`) : ''
ok(15, 'fechado o total, a fatura fica QUITADA', saldo === 'QUITADA', `status ${saldo}`)
await avancar(fabio, ordemId, 'Pagamento confirmado')
ok(15, 'FATURADO · pagamento confirmado', etapaNoBanco(ordemId) === 'FATURADO')

// ---- TRAVA 8 (nova): parada de entrega -------------------------------------
await avancar(camila, ordemId, 'Saiu para entrega')
ok(15, 'TRAVA NOVA · sem parada de entrega, "saiu para entrega" é recusada',
   etapaNoBanco(ordemId) === 'FATURADO')

// ---------------------------------------------------------------------------
// 16 · EM_ROTA_ENTREGA
// ---------------------------------------------------------------------------
await ana.goto(`${QA_BASE}/painel/agenda`, { waitUntil: 'domcontentloaded' })
await ana.waitForTimeout(1500)
await daOrdem(ana, 'tr').getByRole('button', { name: 'Marcar', exact: true }).click().catch(() => {})
await ana.waitForTimeout(1200)
const ag2 = ana.locator('form').filter({ has: ana.locator('input[name=data]') }).first()
if (await ag2.count()) {
  await ag2.locator('input[name=data]').fill(HOJE)
  await ag2.locator('input[name=hora]').fill('14:00')
  await ag2.locator('select[name=motoristaId]').selectOption({ index: 1 }).catch(() => {})
  await ag2.getByRole('button', { name: /marcar e avisar/i }).click()
  await ana.waitForTimeout(3000)
}
const paradaEntrega = sql(`SELECT id FROM agendamentos WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA' LIMIT 1`)
ok(16, 'a parada de entrega foi marcada na Agenda', paradaEntrega !== '')

await adriano.goto(`${QA_BASE}/app/motorista`, { waitUntil: 'domcontentloaded' })
await adriano.waitForTimeout(1500)
const saida2 = paradaComBotao(adriano, /Saí para esta parada/i)
if (await saida2.count()) { await saida2.click(); await adriano.waitForTimeout(2500) }
ok(16, 'EM_ROTA_ENTREGA · mesma rota, sentido contrário', etapaNoBanco(ordemId) === 'EM_ROTA_ENTREGA')

// ---------------------------------------------------------------------------
// 17 · ENTREGUE — assinatura, nome e CPF de quem recebeu
// ---------------------------------------------------------------------------
await adriano.goto(`${QA_BASE}/app/motorista/${ordemId}`, { waitUntil: 'domcontentloaded' })
await adriano.waitForTimeout(1500)
await assinar(adriano)
const n2 = adriano.locator('#nome'); if (await n2.count()) await n2.fill('Mariana Farias')

// A trava do CPF na ENTREGA: tentar sem documento tem de ser recusado.
const semDoc = adriano.getByRole('button', { name: /confirmar entrega/i }).first()
if (await semDoc.count()) { await semDoc.click(); await adriano.waitForTimeout(1500) }
const recusouSemCpf = etapaNoBanco(ordemId) === 'EM_ROTA_ENTREGA'
ok(17, 'TRAVA · entrega sem CPF de quem recebeu é recusada', recusouSemCpf)

const d2 = adriano.locator('#documento'); if (await d2.count()) await d2.fill('12345678909')
if (await semDoc.count()) { await semDoc.click(); await adriano.waitForTimeout(3500) }
const assinEntrega = Number(sql(`SELECT count(*) FROM assinaturas WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA'`))
ok(17, 'ENTREGUE · assinado, com nome e CPF de quem recebeu',
   etapaNoBanco(ordemId) === 'ENTREGUE' && assinEntrega === 1)

// ---------------------------------------------------------------------------
// 18 · FINALIZADO — a baixa final da gestão
// ---------------------------------------------------------------------------
await avancar(camila, ordemId, 'Baixa final da gestão')
ok(18, 'FINALIZADO · a baixa final da gestão', etapaNoBanco(ordemId) === 'FINALIZADO')

// ---------------------------------------------------------------------------
// A PROVA QUE NÃO SE APAGA
// ---------------------------------------------------------------------------
const eventos = Number(sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${ordemId}'`))
ok(18, 'a linha do tempo guardou cada passo', eventos >= 14, `${eventos} eventos`)
const semAutor = Number(sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${ordemId}' AND ("autorNome" IS NULL OR "autorNome"='')`))
ok(18, 'todo evento carrega o autor', semAutor === 0, `${semAutor} sem autor`)
const buracos = sql(`SELECT count(*) FROM (SELECT sequencia - row_number() OVER (ORDER BY sequencia) AS d FROM eventos_ordem WHERE "ordemId"='${ordemId}') t GROUP BY d`).split('\n').length
ok(18, 'a numeração é contínua, sem buraco', buracos === 1)

await camila.goto(`${QA_BASE}/painel/ordens/${ordemId}`, { waitUntil: 'domcontentloaded' })
await camila.waitForTimeout(1500)
await camila.screenshot({ path: `${SHOTS}/ficha-final.png`, fullPage: true })
// SEM os <script>: o payload do React que o Next embute na página contém a
// palavra "undefined" em toda tela, e lê-lo daria falso positivo em todas.
const fichaFinal = await camila.evaluate(() => {
  const c = document.body.cloneNode(true)
  c.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove())
  return c.textContent || ''
})
const quebrado = fichaFinal.match(/undefined|NaN|\[object Object\]|\{\{/)
ok(18, 'a ficha final não mostra dado quebrado', !quebrado, quebrado ? `achou "${quebrado[0]}"` : '')

console.log('  ' + '─'.repeat(62))
console.log(`  ${passo - falhas}/${passo} conferências passaram` + (falhas ? `  ·  ${falhas} FALHA(S)` : '  ·  TUDO CERTO'))
console.log(`  registros criados: ${registros.join(', ')}`)
console.log(`  prints em ${SHOTS}\n`)
writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ ordemId, numero, token, passo, falhas }, null, 2))
await nav.close()
process.exit(falhas ? 1 : 0)
