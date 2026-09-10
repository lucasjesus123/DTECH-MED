/**
 * A ESTEIRA NOVA, EM TEMPO REAL — 13 DEGRAUS NA TELA, 18 ETAPAS NA TRILHA.
 *
 * =============================================================================
 * O QUE ESTE ROTEIRO PROVA, E QUE NENHUM OUTRO PROVAVA
 * =============================================================================
 * O redesenho tinha 100 testes de unidade e 70 de contraste, e NENHUM navegador
 * jamais tinha percorrido `/sistema` de ponta a ponta. Testes de unidade provam
 * que `acaoDaVez` devolve o rótulo certo; eles não provam que existe um botão
 * na tela, que ele está clicável, que o clique chega ao motor e que o motor
 * grava. Entre a função certa e a tela funcionando cabe um sistema inteiro.
 *
 * Este roteiro fecha esse vão. Uma ordem nasce na tela da atendente e chega
 * FINALIZADA, passando pelo celular do motorista, pela bancada do técnico, pelo
 * portal do cliente, pela mesa da gestão e pelo caixa — cada papel com a conta
 * dele, cada clique num botão de verdade.
 *
 * =============================================================================
 * AS TRÊS AFIRMAÇÕES QUE ELE COBRA
 * =============================================================================
 * 1 · O BOTÃO-DA-VEZ NUNCA MENTE. Em todo degrau existe UM botão, ele diz o que
 *     faz, e o motor aceita. Um botão que aparece e leva "não" é o defeito que
 *     o redesenho veio tirar; aqui ele reprova.
 *
 * 2 · MENOS CLIQUES, MESMA AUDITORIA. A fusão faz um clique valer dois saltos.
 *     A trilha tem de continuar com um evento por salto — autor, horário e hash
 *     encadeado. Se a economia de clique virasse economia de prova, o sistema
 *     perderia a razão de existir, e o teste final desta folha é exatamente
 *     esse: contar os eventos e conferir a corrente.
 *
 * 3 · AS DUAS REGRAS NOVAS VALEM NA TELA. O técnico envia o orçamento (6.1) e a
 *     entrega assinada de uma O.S. paga dá baixa sozinha (6.2). Foram decisões
 *     do dono, tomadas em voz alta; elas são cobradas aqui como comportamento
 *     visível, não como linha de código.
 *
 * =============================================================================
 * COMO ELE FALHA
 * =============================================================================
 * Cada degrau é conferido NO BANCO depois de clicado — "a tela disse que
 * salvou" não conta. E cada tela é cronometrada: o relatório sai com o tempo de
 * cada uma, porque um sistema que um operador usa oitenta vezes por dia não
 * pode ser só correto.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'
const { chromium } = pw

const SHOTS = '/var/tmp/qa/sistema'
mkdirSync(SHOTS, { recursive: true })

const sql = (q) =>
  execFileSync(
    'psql',
    ['-h', '127.0.0.1', '-p', '5599', '-U', 'postgres', '-d', 'dtechmed', '-tAc', q],
    { encoding: 'utf8' },
  ).trim()

// ---------------------------------------------------------------------------
// PLACAR
// ---------------------------------------------------------------------------
let falhas = 0
let conferencias = 0
const tempos = []

const ok = (degrau, oque, certo, detalhe = '') => {
  conferencias++
  if (!certo) falhas++
  console.log(
    `  ${certo ? '🟢' : '🔴'} ${String(degrau).padStart(2)} · ${oque}${detalhe ? '  — ' + detalhe : ''}`,
  )
}

/**
 * AQUECER AS ROTAS ANTES DE CRONOMETRAR.
 *
 * Em modo de desenvolvimento cada rota compila na PRIMEIRA visita, e a ação de
 * servidor por trás dela compila na primeira chamada. Sem aquecer, duas coisas
 * saem erradas: o relatório de tempo mede o compilador em vez da tela, e o
 * primeiro `setInputFiles` fica esperando atrás de uma compilação — foi assim
 * que este roteiro acusou "0 fotos" numa tela que funcionava.
 *
 * O aquecimento não é maquiagem: ele separa o que se quer medir (o sistema) do
 * que não se quer (o empacotador). Em produção esta função é um `no-op` caro de
 * um segundo, e por isso ela fica aqui e não some.
 */
async function aquecer(p, ...urls) {
  for (const u of urls) {
    await p.goto(`${QA_BASE}${u}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
  }
}

/** Cronometra uma navegação e guarda para o relatório do fim. */
async function abrir(p, url, rotulo) {
  const t0 = Date.now()
  await p.goto(`${QA_BASE}${url}`, { waitUntil: 'domcontentloaded' })
  await p.waitForLoadState('networkidle').catch(() => {})
  const ms = Date.now() - t0
  tempos.push({ rotulo, ms })
  return ms
}

// Uma foto JPEG real, 8x8. Precisa ser imagem de verdade: o servidor abre com o
// sharp e recusa o que só tem nome de imagem.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMB' +
    'AAIRAxEAPwD3+iiigD//2Q==',
  'base64',
)
const foto = (n) => ({ name: `foto-${n}.jpg`, mimeType: 'image/jpeg', buffer: JPEG })

// ---------------------------------------------------------------------------
// AS JANELAS — uma por pessoa, abertas de uma vez e mantidas
// ---------------------------------------------------------------------------
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const janelas = {}
const erros = []

async function como(quem, email, celular = false) {
  if (janelas[quem]) return janelas[quem]
  const ctx = await nav.newContext({
    viewport: celular ? { width: 390, height: 844 } : { width: 1440, height: 950 },
    ...(celular ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    ...(celular
      ? {
          // O celular do motorista, com GPS respondendo — que é o caso comum.
          // O caso do GPS MUDO é conferido à parte, mais abaixo.
          permissions: ['geolocation'],
          geolocation: { latitude: -29.4669, longitude: -51.9611, accuracy: 12 },
        }
      : {}),
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(`${quem}: ${String(e).slice(0, 160)}`))
  p.on('response', (r) => {
    if (r.status() >= 500) erros.push(`${quem}: HTTP ${r.status()} ${r.url()}`)
  })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name=email]', email)
  await p.fill('input[name=senha]', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForTimeout(2500)
  janelas[quem] = p
  return p
}

/**
 * CLICA O BOTÃO-DA-VEZ E ESPERA O BANCO MUDAR.
 *
 * Esperar tempo fixo depois de um clique é a receita de um roteiro que reprova
 * sozinho em máquina lenta. Aqui a espera é pela CONDIÇÃO: lê a etapa antes,
 * clica, e fica olhando o banco até ela mudar. Quando ela não deve mudar — as
 * travas — a espera vira o tempo limite e o roteiro segue, de propósito.
 *
 * Devolve o que aconteceu, para o chamador poder dizer por que reprovou:
 * `{ achou, mudou, etapa, recusa }`.
 */
async function botaoDaVez(p, id, rotulo, { espera = 20000 } = {}) {
  const b = p.getByRole('button', { name: new RegExp(rotulo, 'i') }).first()
  if (!(await b.count())) {
    const todos = (await p.getByRole('button').allTextContents())
      .map((t) => t.trim())
      .filter(Boolean)
    return { achou: false, mudou: false, etapa: etapaNoBanco(id), oferece: todos }
  }
  const antes = etapaNoBanco(id)
  await b.click()
  const ate = Date.now() + espera
  while (Date.now() < ate) {
    await p.waitForTimeout(400)
    if (etapaNoBanco(id) !== antes) {
      return { achou: true, mudou: true, etapa: etapaNoBanco(id) }
    }
  }
  const recusa = await p
    .locator('[role=alert]')
    .first()
    .innerText()
    .catch(() => '')
  return { achou: true, mudou: false, etapa: antes, recusa: recusa.trim() }
}

/**
 * ASSINAR NO VISOR, DE VERDADE.
 *
 * O componente escuta eventos de PONTEIRO, não de mouse, e o canvas tem tamanho
 * de CSS diferente do tamanho de bitmap. Um traço desenhado com coordenadas de
 * página cai fora da área útil e o "assinou" nunca acende — que é a maneira
 * mais silenciosa de este roteiro reprovar por defeito próprio.
 */
async function assinarNoVisor(p) {
  const q = p.locator('canvas').first()
  await q.scrollIntoViewIfNeeded()
  await p.waitForTimeout(300)
  const c = await q.boundingBox()
  if (!c) return false
  const y = c.y + c.height / 2
  await p.mouse.move(c.x + c.width * 0.15, y)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(c.x + c.width * (0.15 + 0.06 * i), y + Math.sin(i) * (c.height * 0.18))
    await p.waitForTimeout(20)
  }
  await p.mouse.up()
  await p.waitForTimeout(400)
  return true
}

/**
 * ESPERA O BANCO CHEGAR A UM NÚMERO — em vez de esperar um tanto de segundos.
 *
 * Subir foto é ação de servidor: o navegador devolve o controle antes de o
 * arquivo estar gravado. Um `waitForTimeout(4000)` aqui reprova em máquina
 * carregada e passa em máquina folgada, que é a pior espécie de teste — o que
 * mente nos dois sentidos.
 */
async function ateQue(p, consulta, minimo, limite = 90000) {
  const t0 = Date.now()
  const ate = t0 + limite
  let v = Number(sql(consulta))
  while (v < minimo && Date.now() < ate) {
    await p.waitForTimeout(500)
    v = Number(sql(consulta))
  }
  ateQue.ultimoMs = Date.now() - t0
  return v
}

/**
 * PÕE UMA SEGUNDA O.S. NA FRENTE DA FILA DO MOTORISTA.
 *
 * O trecho do GPS mudo precisa de uma parada de coleta pronta para ser aceita.
 * O cenário de demonstração já semeia várias em RETIRADA_AGENDADA, com o
 * Adriano designado — só falta ela ser a DA VEZ, porque o app mostra uma por
 * vez.
 *
 * Mexer em `posicaoRota` é arrumação do ensaio, não do produto: é a ordem da
 * rota, uma coisa que a central muda de verdade na tela de Rotas. Está escrito
 * aqui para ninguém ler o resultado como se o sistema tivesse reordenado
 * sozinho.
 */
function pornaFrenteDaFila() {
  const id = sql(
    `SELECT o.id FROM ordens o JOIN agendamentos a ON a."ordemId"=o.id
     WHERE o.etapa='RETIRADA_AGENDADA' AND a.tipo='RETIRADA' AND a."motoristaId" IS NOT NULL
     ORDER BY o."abertaEm" ASC LIMIT 1`,
  )
  if (!id) return null
  sql(
    `UPDATE agendamentos SET "posicaoRota" = (
       SELECT COALESCE(MIN("posicaoRota"), 1) - 1 FROM agendamentos
       WHERE "previstoPara" >= date_trunc('day', now())
     ), "previstoPara" = date_trunc('day', now()) + interval '7 hours'
     WHERE "ordemId"='${id}' AND tipo='RETIRADA'`,
  )
  return id
}

const etapaNoBanco = (id) => sql(`SELECT etapa FROM ordens WHERE id='${id}'`)
const contarEventos = (id) => Number(sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${id}'`))

/**
 * A JORNADA RELATA, EM VEZ DE MORRER.
 *
 * Um roteiro que estoura no primeiro botão que não achou esconde tudo o que
 * vinha depois — e o que vinha depois é justamente o que ninguém tinha olhado.
 * Aqui a exceção é ANOTADA como falha do degrau em que aconteceu, e o relatório
 * sai inteiro: placar, erros de página e o tempo de cada tela.
 */
try {
  console.log('\n  A ESTEIRA NOVA, EM TEMPO REAL  ·  /sistema + /campo')
  console.log('  ' + '─'.repeat(68))

  // ===========================================================================
  // DEGRAU 1 · A ATENDENTE ABRE A O.S. — numa tela só
  // ===========================================================================
  const ana = await como('ana', 'ana@dtechmed.com.br')
  ok(0, 'a atendente entra e cai no sistema novo', ana.url().includes('/sistema'), ana.url().replace(QA_BASE, ''))

  const msNova = await abrir(ana, '/sistema/ordens/nova', 'abrir O.S. (formulário)')

  // O formulário novo é UMA TELA. Nenhum campo escondido atrás de "Continuar" —
  // é a diferença que este roteiro mede sem precisar dizer: ele preenche tudo
  // seguido, sem navegar entre passos.
  await ana.getByLabel('Nome ou razão social').fill('Clínica Bella Pelle')
  await ana.getByLabel('CPF ou CNPJ').fill('11444777000161')
  await ana.getByLabel('WhatsApp').fill('51980449274')
  await ana.getByLabel('Com quem falar (opcional)').fill('Mariana Farias')
  await ana.getByLabel('Cidade').fill('Lajeado')
  await ana.getByLabel('Endereço da coleta').fill('R. Sabiá, 702, Sala 03, Universitário')
  await ana.getByLabel('Marca').fill('Lavieen')
  await ana.getByLabel('Modelo').fill('Duo')
  await ana.getByLabel('Número de série').fill('LA-SIS-0001')
  await ana
    .getByLabel('O que o cliente está relatando')
    .fill('Liga, mas desliga sozinho depois de uns dez minutos de uso.')

  const camposVisiveis = await ana.locator('input:visible, textarea:visible, select:visible').count()
  ok(1, 'o formulário é UMA tela — nada escondido atrás de "Continuar"', camposVisiveis >= 10,
     `${camposVisiveis} campos visíveis de uma vez`)

  await ana.screenshot({ path: `${SHOTS}/01-nova-os.png`, fullPage: true })

  const antesDeAbrir = Number(sql('SELECT count(*) FROM ordens'))
  await ana.getByRole('button', { name: /^Abrir O\.S\./ }).click()
  await ana.waitForTimeout(4000)

  const ordemId = sql('SELECT id FROM ordens ORDER BY "abertaEm" DESC LIMIT 1')
  const numero = sql(`SELECT numero FROM ordens WHERE id='${ordemId}'`)
  ok(1, 'a O.S. nasceu', Number(sql('SELECT count(*) FROM ordens')) === antesDeAbrir + 1,
     `O.S. nº ${numero} · ${msNova}ms para abrir a tela`)

  // ---------------------------------------------------------------------------
  // O RADAR JÁ SABE. A O.S. aparece na fila da Ana com o botão certo, sem que
  // ninguém precise procurá-la numa lista de doze.
  // ---------------------------------------------------------------------------
  await abrir(ana, '/sistema', 'Painel da atendente (radar)')
  const naFila = await ana.locator(`a[href*="${ordemId}"]`).count()
  ok(1, 'a O.S. nova aparece sozinha no radar da atendente', naFila > 0)

  // ===========================================================================
  // DEGRAU 2 e 3 · AGENDAR A COLETA — um clique que vale dois saltos
  // ===========================================================================
  await abrir(ana, `/sistema/ordens/${ordemId}`, 'ficha da O.S.')

  const rotuloFusao = await ana
    .getByRole('button', { name: /Agendar coleta/i })
    .first()
    .isVisible()
    .catch(() => false)
  ok(2, 'o botão-da-vez diz "Agendar coleta" — e não o nome de uma etapa', rotuloFusao)

  // A PAPELADA JÁ SAIU SOZINHA.
  //
  // A O.S. não nasce em SOLICITACAO_RECEBIDA e fica esperando alguém "gerar a
  // ordem de retirada": abrir pela tela já faz os dois. É por isso que o botão
  // aqui vale UM salto e não mostra o selo de fusão — e conferir isso importa,
  // porque um selo dizendo "2 passos" num botão de um passo seria pior que selo
  // nenhum. O selo é cobrado adiante, no degrau 8, onde a fusão é de verdade.
  ok(2, 'a O.S. já nasce com a ordem de retirada gerada — papelada não é decisão',
     etapaNoBanco(ordemId) === 'ORDEM_RETIRADA_GERADA', etapaNoBanco(ordemId))
  const semSeloAqui = await ana.locator('[class*="fundida"]').count()
  ok(2, 'e o botão de um salto NÃO se anuncia como fusão', semSeloAqui === 0)

  await ana.getByRole('button', { name: /Agendar coleta/i }).first().click()
  await ana.waitForTimeout(2500)
  ok(2, 'o botão leva à folha que colhe a parada, em vez de recusar depois',
     ana.url().includes('fluxo=agendar-coleta'), ana.url().replace(QA_BASE, '').slice(0, 60))

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  await ana.getByLabel('Dia').fill(hoje)
  await ana.getByLabel('Hora').fill('14:30')
  // O <select> do motorista: o nome acessível dele engloba as opções, então o
  // papel é o alvo mais estável — e é só um na folha.
  await ana.getByRole('combobox').first().selectOption({ label: 'Adriano Martins' })
  await ana.screenshot({ path: `${SHOTS}/02-agendar-coleta.png`, fullPage: true })

  const antes23 = etapaNoBanco(ordemId)
  await ana.getByRole('button', { name: /Agendar coleta|Confirmar|Salvar/i }).last().click()
  for (let i = 0; i < 40 && etapaNoBanco(ordemId) === antes23; i++) await ana.waitForTimeout(400)
  ok(3, 'RETIRADA_AGENDADA · dia, hora e motorista marcados na mesma folha',
     etapaNoBanco(ordemId) === 'RETIRADA_AGENDADA', etapaNoBanco(ordemId))
  ok(3, 'a parada existe de verdade, com motorista',
     sql(`SELECT count(*) FROM agendamentos WHERE "ordemId"='${ordemId}' AND tipo='RETIRADA' AND "motoristaId" IS NOT NULL`) === '1')

  // ===========================================================================
  // DEGRAU 4 e 5 · O MOTORISTA, NO CELULAR DE 390px
  // ===========================================================================
  const adriano = await como('adriano', 'adriano@dtechmed.com.br', true)
  ok(4, 'o motorista entra e cai no app de campo, não no painel',
     adriano.url().includes('/campo'), adriano.url().replace(QA_BASE, ''))

  await abrir(adriano, '/campo', 'app de campo · tarefas')
  await adriano.screenshot({ path: `${SHOTS}/03-campo-tarefas.png`, fullPage: true })

  const semRolagem = await adriano.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )
  ok(4, 'o app cabe num celular de 390px, sem rolagem lateral', semRolagem)

  /**
   * O MOTORISTA NÃO ABRE UMA O.S. — ELE ABRE A FILA.
   *
   * Digitar o endereço de uma ordem no celular do motorista leva ao app de campo,
   * e isso é desenho, não defeito: quem dirige trabalha pela PRÓXIMA parada, não
   * por um catálogo de ordens. Conferido aqui porque é uma promessa do redesenho.
   */
  await abrir(adriano, `/sistema/ordens/${ordemId}`, 'motorista tenta abrir a O.S.')
  ok(4, 'o motorista que abre o endereço de uma O.S. cai na FILA dele',
     adriano.url().includes('/campo'), adriano.url().replace(QA_BASE, ''))

  // ---------------------------------------------------------------------------
  // ARRUMAÇÃO DO ENSAIO — e ela é do ENSAIO, não do produto.
  //
  // O app mostra UMA parada por vez, e o cenário de demonstração já deixou 33
  // paradas no dia do Adriano. Para a jornada falar da NOSSA ordem, ela precisa
  // ser a da vez. Quem decide isso é `posicaoRota`, que é a ordem da rota — uma
  // coisa que a central mexe de verdade, na tela de Rotas.
  //
  // Fazer isso por SQL é atalho de teste, e está escrito aqui para ninguém ler o
  // resultado como se o produto tivesse reordenado sozinho.
  // ---------------------------------------------------------------------------
  // Estritamente MENOR que qualquer posição já existente — e não "0". Zero
  // empata com o zero da execução anterior, e o desempate cai no horário, que
  // também empata. Duas rodadas seguidas passavam a testar a parada da rodada
  // passada, silenciosamente.
  sql(
    `UPDATE agendamentos SET "posicaoRota" = (
       SELECT COALESCE(MIN("posicaoRota"), 1) - 1 FROM agendamentos
       WHERE "previstoPara" >= date_trunc('day', now())
     ) WHERE "ordemId"='${ordemId}'`,
  )

  // A folha de parada e a ação que anexa foto compilam na primeira visita.
  await aquecer(adriano, `/campo/parada/${ordemId}?tipo=coleta`)

  await abrir(adriano, '/campo', 'app de campo · a parada da vez')
  const cartao = await adriano.locator('body').innerText()
  ok(4, 'a parada da nossa O.S. é a da vez, com cliente e aparelho na cara',
     cartao.includes('Clínica Bella Pelle') && cartao.includes('Lavieen'),
     cartao.split('\n').filter(Boolean).slice(2, 4).join(' · '))

  /**
   * O BOTÃO DO MOTORISTA É UM SÓ, E ELE ANDA COM A CORRIDA.
   *
   * Aceitar → a caminho → cheguei não são três botões competindo por atenção numa
   * tela vista de moto: é o MESMO botão, trocando de rótulo, com a barra de
   * passos em cima dizendo onde se está. Quem dirige tem uma pergunta por vez.
   *
   * O aceite é trava de gente, não de sistema: a central designa, e quem vai é
   * que confirma. Sem ele o despacho seria uma ordem dada no vazio.
   */
  const aceitar = adriano.getByRole('button', { name: /Aceitar corrida/i }).first()
  ok(4, 'a central designou, e quem vai é que CONFIRMA — o aceite existe',
     (await aceitar.count()) > 0)
  await aceitar.click()
  await adriano.waitForTimeout(3000)
  ok(4, 'o aceite ficou gravado na parada, com hora',
     sql(`SELECT count(*) FROM agendamentos WHERE "ordemId"='${ordemId}' AND "aceitoEm" IS NOT NULL`) === '1')

  const antesRota = etapaNoBanco(ordemId)
  await adriano.getByRole('button', { name: /Sair para a coleta/i }).first().click()
  for (let i = 0; i < 50 && etapaNoBanco(ordemId) === antesRota; i++) await adriano.waitForTimeout(400)
  ok(4, 'o MESMO botão vira "Sair para a coleta", e o motor aceita',
     etapaNoBanco(ordemId) === 'EM_ROTA_RETIRADA', etapaNoBanco(ordemId))

  // --- chegou: fotos + assinatura do cliente, no visor ------------------------
  await adriano.getByRole('button', { name: /^Cheguei/i }).first().click()
  // "Cheguei" navega pelo roteador do cliente. Esperar tempo aqui deixa o
  // roteiro pegando o `<input type=file>` da tela ANTERIOR, já desmontado — os
  // arquivos vão para um elemento que não existe mais e ninguém reclama.
  await adriano.waitForURL(/\/campo\/parada\//, { timeout: 20000 }).catch(() => {})
  await adriano.waitForLoadState('networkidle').catch(() => {})
  await adriano.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 20000 })
  ok(5, '"Cheguei" abre a folha que colhe foto e assinatura',
     adriano.url().includes('/campo/parada/'), adriano.url().replace(QA_BASE, '').slice(0, 55))

  /**
   * NO CAMPO, A FOTO FICA NO APARELHO ATÉ O ENVIO ÚNICO.
   *
   * Escolher a foto NÃO sobe nada: ela vira miniatura local, e tudo — as fotos,
   * o nome de quem recebeu e o traço da assinatura — sai numa remessa só quando
   * o motorista toca em "Finalizar e enviar".
   *
   * Isso é desenho, e é o desenho certo para quem está na porta do cliente com
   * duas barras de sinal: um envio, um ponto de falha, uma tentativa para
   * repetir. Subir foto a foto dá seis chances de a coleta ficar pela metade —
   * com o aparelho já dentro da van e a assinatura já colhida.
   *
   * O roteiro cobra as duas metades separadas: primeiro que a miniatura apareça
   * (o motorista vê o que fotografou), depois que o banco receba (a prova
   * existe). Confundir as duas é o erro que faz um teste dizer "subiu" quando
   * nada saiu do celular.
   */
  await adriano.locator('input[type=file]').first().setInputFiles([foto(1), foto(2), foto(3)])
  await adriano.waitForTimeout(1200)
  const miniaturas = await adriano.locator('img').count()
  ok(5, 'as 3 fotos viram miniatura na hora — o motorista vê o que fotografou',
     miniaturas >= 3, `${miniaturas} miniaturas`)
  ok(5, 'e NADA subiu ainda: no campo o envio é um só, no fim',
     Number(sql(`SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`)) === 0)

  // A TRAVA, cobrada na tela e não depois: sem nome e sem traço, o botão não
  // habilita. A recusa que nunca acontece é a melhor recusa.
  const travadoSemAssinar = await adriano
    .getByRole('button', { name: /Finalizar e enviar/i })
    .isDisabled()
  ok(5, 'TRAVA · sem o nome e a assinatura, a tela não deixa concluir', travadoSemAssinar)

  await adriano.getByLabel('Quem está recebendo').fill('Mariana Farias')
  await assinarNoVisor(adriano)
  const liberou = !(await adriano.getByRole('button', { name: /Finalizar e enviar/i }).isDisabled())
  ok(5, 'com nome e traço, o botão libera', liberou)
  await adriano.screenshot({ path: `${SHOTS}/04-assinatura.png`, fullPage: true })

  const antesColeta = etapaNoBanco(ordemId)
  await adriano.getByRole('button', { name: /Finalizar e enviar/i }).click()

  const nFotos = await ateQue(adriano, `SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`, 3)
  ok(5, 'a remessa única levou as 3 fotos ao servidor', nFotos >= 3,
     `${nFotos} fotos em ${(ateQue.ultimoMs / 1000).toFixed(1)}s`)

  const nAssin = await ateQue(adriano, `SELECT count(*) FROM assinaturas WHERE "ordemId"='${ordemId}'`, 1)
  ok(5, 'a assinatura chegou ao servidor, com hash da imagem', nAssin >= 1,
     `${nAssin} assinatura(s) em ${(ateQue.ultimoMs / 1000).toFixed(1)}s`)
  for (let i = 0; i < 120 && etapaNoBanco(ordemId) === antesColeta; i++) await adriano.waitForTimeout(500)
  ok(5, 'COLETADO · assinado no visor pelo próprio cliente',
     etapaNoBanco(ordemId) === 'COLETADO',
     `${sql(`SELECT count(*) FROM assinaturas WHERE "ordemId"='${ordemId}'`)} assinatura(s) · ${etapaNoBanco(ordemId)}`)

  /**
   * O GPS MUDO — a trava que este roteiro encontrou, e que agora ele guarda.
   *
   * A captura pede a localização antes de mandar a assinatura. Se o aparelho
   * não responde — permissão pendente, subsolo, celular velho — a espera tem de
   * DESISTIR. Quando ela não desistia, o motorista ficava com "Enviando…" na
   * tela para sempre: as fotos já no servidor, a assinatura colhida, a O.S.
   * parada e o aparelho dentro da van.
   *
   * Aqui a coleta é refeita numa janela SEM permissão de localização. Se algum
   * dia a espera voltar a ser infinita, esta conferência é a que reprova — e
   * reprova em 40 segundos, não na porta de um cliente.
   */
  const semGps = await nav.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    // Nenhuma permissão concedida: `getCurrentPosition` não chama retorno
    // nenhum, que é o caso real do aviso do navegador sem resposta.
  })
  const mudo = await semGps.newPage()
  await mudo.goto(`${QA_BASE}/entrar`, { waitUntil: 'domcontentloaded' })
  await mudo.fill('input[name=email]', 'adriano@dtechmed.com.br')
  await mudo.fill('input[name=senha]', SENHA)
  await mudo.getByRole('button', { name: /entrar/i }).click()
  await mudo.waitForTimeout(2500)

  const idMudo = pornaFrenteDaFila()
  if (!idMudo) {
    // Sem parada de coleta livre no cenário não dá para conferir isto, e
    // INVENTAR uma passaria por cima justamente do caminho que se quer medir.
    // Dizer "não deu" é a resposta honesta; fingir verde seria a desonesta.
    console.log('   ·  GPS mudo: nenhuma coleta livre no cenário (não é falha)')
    await semGps.close()
  } else {
  await mudo.goto(`${QA_BASE}/campo`, { waitUntil: 'domcontentloaded' })
  await mudo.waitForLoadState('networkidle').catch(() => {})
  await mudo.getByRole('button', { name: /Aceitar corrida/i }).first().click()
  await mudo.waitForTimeout(2500)
  await mudo.getByRole('button', { name: /Sair para a coleta/i }).first().click()
  for (let i = 0; i < 60 && etapaNoBanco(idMudo) !== 'EM_ROTA_RETIRADA'; i++) await mudo.waitForTimeout(400)
  await mudo.getByRole('button', { name: /^Cheguei/i }).first().click()
  await mudo.waitForURL(/\/campo\/parada\//, { timeout: 20000 }).catch(() => {})
  await mudo.waitForLoadState('networkidle').catch(() => {})
  await mudo.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 20000 })

  await mudo.locator('input[type=file]').first().setInputFiles([foto(1)])
  await mudo.waitForTimeout(1500)
  await mudo.getByLabel('Quem está recebendo').fill('Paulo Renner')
  await assinarNoVisor(mudo)
  const t0Gps = Date.now()
  await mudo.getByRole('button', { name: /Finalizar e enviar/i }).click()
  const assinMudo = await ateQue(mudo, `SELECT count(*) FROM assinaturas WHERE "ordemId"='${idMudo}'`, 1, 40000)
  ok(5, 'GPS MUDO · a captura DESISTE da localização e envia assim mesmo',
     assinMudo >= 1, `${((Date.now() - t0Gps) / 1000).toFixed(1)}s até a assinatura entrar`)
  ok(5, 'e a assinatura entrou SEM coordenada, com isso anotado',
     sql(`SELECT count(*) FROM assinaturas WHERE "ordemId"='${idMudo}' AND latitude IS NULL`) === '1')
  await semGps.close()
  }

  // ===========================================================================
  // DEGRAU 6 e 7 · A BANCADA
  // ===========================================================================
  const rafael = await como('rafael', 'rafael@dtechmed.com.br')
  ok(6, 'o técnico entra e cai na Bancada — a casa do papel dele',
     rafael.url().includes('/sistema/bancada'), rafael.url().replace(QA_BASE, ''))

  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. na bancada')
  await rafael.getByRole('button', { name: /Receber na bancada/i }).first().click()
  await rafael.waitForTimeout(2500)
  ok(6, '"Receber na bancada" abre a folha das 6 fotos de entrada',
     rafael.url().includes('fluxo=captura-bancada'))

  // A TRAVA, cobrada na tela: com menos de 6 fotos o botão nem habilita.
  await rafael.locator('input[type=file]').first().setInputFiles([foto(4), foto(5)])
  await ateQue(rafael, `SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}' AND categoria='RECEBIMENTO'`, 2)
  await rafael.waitForTimeout(800)
  const travado = await rafael.getByRole('button', { name: /Finalizar e enviar/i }).isDisabled()
  ok(6, 'TRAVA · com menos de 6 fotos a tela não deixa concluir', travado)

  await rafael.locator('input[type=file]').first()
    .setInputFiles([foto(6), foto(7), foto(8), foto(9)])
  await ateQue(rafael, `SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}' AND categoria='RECEBIMENTO'`, 6)
  await rafael.waitForTimeout(800)

  const antesEntrada = etapaNoBanco(ordemId)
  await rafael.getByRole('button', { name: /Finalizar e enviar/i }).click()
  for (let i = 0; i < 50 && etapaNoBanco(ordemId) === antesEntrada; i++) await rafael.waitForTimeout(400)
  ok(6, 'RECEBIDO_NA_EMPRESA · entrada dada com as 6 fotos',
     etapaNoBanco(ordemId) === 'RECEBIDO_NA_EMPRESA',
     `${sql(`SELECT count(*) FROM fotos WHERE "ordemId"='${ordemId}'`)} fotos no total`)

  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. · iniciar análise')
  const analise = await botaoDaVez(rafael, ordemId, 'Iniciar análise')
  ok(7, 'EM_ANALISE · o aparelho está na bancada', analise.etapa === 'EM_ANALISE')

  // ===========================================================================
  // DEGRAU 8 · A REGRA 6.1 NA TELA — o técnico emite laudo E orçamento
  // ===========================================================================
  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. · laudo')
  const rotuloTecnico = await rafael
    .getByRole('button', { name: /Emitir laudo/i })
    .first()
    .innerText()
    .catch(() => '(sem botão)')
  ok(8, 'REGRA 6.1 · para o TÉCNICO o botão diz "Emitir laudo + orçamento"',
     /orçamento/i.test(rotuloTecnico), rotuloTecnico.replace(/\n/g, ' ').trim())

  await rafael.getByRole('button', { name: /Emitir laudo/i }).first().click()
  await rafael.waitForTimeout(2500)
  await rafael
    .getByLabel('O que foi encontrado no aparelho')
    .fill('Fonte chaveada oscilando em carga. Capacitor de filtro estufado e trilha da placa de potência com micro-rompimento.')
  await rafael.screenshot({ path: `${SHOTS}/05-laudo.png`, fullPage: true })

  /**
   * A FUSÃO É ELÁSTICA, E A TELA AVISA ANTES DE ELA ENCURTAR.
   *
   * "Emitir laudo + orçamento" vale dois saltos — mas o segundo exige orçamento
   * montado, e neste ponto não existe nenhum. O painel-vivo diz isso ANTES do
   * clique, com todas as letras, em vez de deixar a pessoa descobrir pela
   * recusa. É a diferença entre um sistema que conversa e um que reage.
   */
  const aviso = await rafael.locator('body').innerText()
  ok(8, 'o painel-vivo avisa que o orçamento ainda não existe, ANTES do clique',
     /ainda não montado/i.test(aviso) && /recusado/i.test(aviso))

  const antesLaudo = etapaNoBanco(ordemId)
  await rafael.getByRole('button', { name: /Emitir laudo/i }).last().click()
  for (let i = 0; i < 50 && etapaNoBanco(ordemId) === antesLaudo; i++) await rafael.waitForTimeout(400)
  ok(8, 'o laudo ficou gravado e a esteira andou UM degrau — o que dava para andar',
     etapaNoBanco(ordemId) === 'ORCAMENTO_INTERNO', etapaNoBanco(ordemId))
  ok(8, 'o laudo está no banco, e não só na tela',
     Number(sql(`SELECT length(coalesce(diagnostico,'')) FROM ordens WHERE id='${ordemId}'`)) > 40)

  // ===========================================================================
  // DEGRAU 9 · O ORÇAMENTO — e a recusa que o motor deu vira o próximo passo
  // ===========================================================================
  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. · montar orçamento')
  await rafael.getByRole('button', { name: /Enviar orçamento ao cliente/i }).first().click()
  await rafael.waitForURL(/fluxo=orcamento/, { timeout: 20000 }).catch(() => {})
  await rafael.waitForLoadState('networkidle').catch(() => {})
  ok(9, 'a esteira já oferece o passo que faltava: montar e enviar', rafael.url().includes('fluxo=orcamento'))

  // Duas linhas: a peça e a mão de obra. É o orçamento mais comum da casa.
  const linhas = rafael.locator('input[placeholder*="placa de potência"]')
  await linhas.first().fill('Placa de potência recondicionada')
  const numeros = rafael.locator('input[inputmode="decimal"], input[type="number"]')
  await numeros.nth(0).fill('1')
  await numeros.nth(1).fill('980,00')
  await rafael.getByRole('button', { name: /Acrescentar|Adicionar|\+ item/i }).first().click().catch(() => {})
  await rafael.waitForTimeout(600)
  await rafael.screenshot({ path: `${SHOTS}/06-orcamento.png`, fullPage: true })

  const antesEnvio = etapaNoBanco(ordemId)
  await rafael.getByRole('button', { name: /Enviar ao cliente/i }).last().click()
  for (let i = 0; i < 60 && etapaNoBanco(ordemId) === antesEnvio; i++) await rafael.waitForTimeout(400)
  ok(9, 'ORCAMENTO_ENVIADO · o cliente recebe o link do portal',
     etapaNoBanco(ordemId) === 'ORCAMENTO_ENVIADO', etapaNoBanco(ordemId))
  const total = sql(`SELECT "totalCentavos" FROM orcamentos WHERE "ordemId"='${ordemId}' ORDER BY versao DESC LIMIT 1`)
  ok(9, 'o orçamento tem valor, e ele saiu dos itens', Number(total) > 0, `R$ ${(Number(total) / 100).toFixed(2)}`)

  // ===========================================================================
  // DEGRAU 10 · O CLIENTE APROVA — no portal, e ninguém por ele
  // ===========================================================================
  const token = sql(`SELECT "tokenPublico" FROM ordens WHERE id='${ordemId}'`)
  const ctxCliente = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const cliente = await ctxCliente.newPage()
  await cliente.goto(`${QA_BASE}/os/${token}`, { waitUntil: 'domcontentloaded' })
  await cliente.waitForLoadState('networkidle').catch(() => {})
  const textoPortal = (await cliente.locator('body').innerText()) ?? ''
  ok(10, 'o portal abre com o link mandado no WhatsApp, sem senha',
     /or[çc]amento/i.test(textoPortal))
  ok(10, 'e não mostra nada de dentro de casa: custo, margem, parecer interno',
     !/margem|custo interno|parecer para a gest/i.test(textoPortal))

  /**
   * A APROVAÇÃO DO CLIENTE NÃO É BOTÃO DE NINGUÉM AQUI DENTRO.
   *
   * Nenhum papel interno tem atalho para este passo — está no teste de unidade
   * da esteira e é cobrado aqui de novo, no lugar em que importa: o único
   * caminho é o portal, com documento, nome e traço. É o que dá valor jurídico
   * à assinatura, e é o que impede a oficina de aprovar o próprio orçamento.
   */
  await cliente.getByRole('button', { name: /^Aprovar/ }).first().click()
  await cliente.waitForTimeout(1500)
  await cliente.locator('#documento').fill('11444777000161')
  await cliente.locator('#assinanteNome').fill('Mariana Farias')
  await assinarNoVisor(cliente)
  const antesAprov = etapaNoBanco(ordemId)
  await cliente.getByRole('button', { name: /^(Aprovar|Confirmar)/ }).last().click()
  for (let i = 0; i < 60 && etapaNoBanco(ordemId) === antesAprov; i++) await cliente.waitForTimeout(400)
  await cliente.screenshot({ path: `${SHOTS}/07-portal.png`, fullPage: true })
  ok(10, 'ORCAMENTO_APROVADO · aprovado pelo PRÓPRIO cliente, com documento',
     etapaNoBanco(ordemId) === 'ORCAMENTO_APROVADO', etapaNoBanco(ordemId))
  await ctxCliente.close()

  // ===========================================================================
  // DEGRAU 11 e 12 · A MANUTENÇÃO
  // ===========================================================================
  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. · iniciar manutenção')
  const inicio = await botaoDaVez(rafael, ordemId, 'Iniciar manutenção')
  ok(11, 'EM_MANUTENCAO · a bancada abre o serviço', inicio.etapa === 'EM_MANUTENCAO', inicio.etapa)

  await abrir(rafael, `/sistema/ordens/${ordemId}`, 'O.S. · concluir manutenção')
  await rafael.getByRole('button', { name: /Concluir manutenção/i }).first().click()
  await rafael.waitForURL(/fluxo=pecas/, { timeout: 20000 }).catch(() => {})
  await rafael.waitForLoadState('networkidle').catch(() => {})
  ok(12, '"Concluir manutenção" cobra o que saiu da prateleira', rafael.url().includes('fluxo=pecas'))

  await rafael.getByLabel('O que foi executado')
    .fill('Trocada a placa de potência, refeita a solda do conector e testado por duas horas em carga.')

  /**
   * O SILÊNCIO NÃO SERVE COMO RESPOSTA.
   *
   * Sem dizer o que saiu do estoque — nem que não saiu nada — o serviço não
   * fecha. A peça não lançada aqui não é lançada nunca: daqui a ordem vai para
   * a gestão e para a rua.
   */
  const travaPeca = await rafael.getByRole('button', { name: /Concluir manutenção|Salvar/i }).last().isDisabled()
  ok(12, 'TRAVA · sem dizer o que saiu do estoque, não fecha', travaPeca)

  await rafael.getByRole('checkbox').first().check()
  const antesConcl = etapaNoBanco(ordemId)
  await rafael.getByRole('button', { name: /Concluir manutenção|Salvar/i }).last().click()
  for (let i = 0; i < 60 && etapaNoBanco(ordemId) === antesConcl; i++) await rafael.waitForTimeout(400)
  ok(12, 'MANUTENCAO_CONCLUIDA · com a declaração de peça registrada',
     etapaNoBanco(ordemId) === 'MANUTENCAO_CONCLUIDA', etapaNoBanco(ordemId))

  // ===========================================================================
  // DEGRAU 13 · A FUSÃO DE VERDADE — conferir e liberar num aval só
  // ===========================================================================
  const camila = await como('camila', 'camila@dtechmed.com.br')
  await abrir(camila, `/sistema/ordens/${ordemId}`, 'O.S. · conferência da gestão')

  const rotuloGestao = await camila.getByRole('button', { name: /Aprovar conferência/i }).first()
    .innerText().catch(() => '(sem botão)')
  ok(13, 'para a GESTÃO o botão diz "Aprovar conferência" — os dois passos dela',
     /Aprovar conferência/i.test(rotuloGestao), rotuloGestao.replace(/\n/g, ' ').trim())

  const seloDeVerdade = await camila.getByText(/PASSOS EM UM CLIQUE/i).first().innerText().catch(() => '')
  ok(13, 'e AGORA o selo de fusão aparece, dizendo quantos', /2 PASSOS/i.test(seloDeVerdade), seloDeVerdade)

  const eventosAntes = contarEventos(ordemId)
  const fusao = await botaoDaVez(camila, ordemId, 'Aprovar conferência')
  ok(13, 'UM clique andou DOIS degraus: conferido e liberado para o caixa',
     fusao.etapa === 'FATURAMENTO', fusao.etapa)

  /**
   * A CONTA QUE JUSTIFICA O REDESENHO INTEIRO.
   *
   * Um clique, dois degraus — e DOIS eventos na trilha, cada um com o seu
   * autor, o seu horário e o seu elo de hash. Se este número fosse 1, o
   * redesenho teria comprado conforto com prova, e a folha de rastreabilidade
   * passaria a mentir para o cliente, para o fabricante e para a vigilância.
   */
  ok(13, 'e a trilha guardou DOIS eventos, um por salto — a economia foi de clique, não de prova',
     contarEventos(ordemId) - eventosAntes === 2,
     `${contarEventos(ordemId) - eventosAntes} eventos novos`)

  // ===========================================================================
  // DEGRAU 14 · O CAIXA
  // ===========================================================================
  const fabio = await como('fabio', 'fabio@dtechmed.com.br')
  await abrir(fabio, '/sistema/financeiro', 'Financeiro · a fila da cobrança')
  const naFilaCaixa = await fabio.locator(`a[href*="${ordemId}"]`).count()
  ok(14, 'a O.S. liberada aparece sozinha na fila do financeiro', naFilaCaixa > 0)

  await abrir(fabio, `/sistema/ordens/${ordemId}`, 'O.S. · confirmar pagamento')
  await fabio.getByRole('button', { name: /Confirmar pagamento/i }).first().click()
  await fabio.waitForURL(/fluxo=pagamento/, { timeout: 20000 }).catch(() => {})
  await fabio.waitForLoadState('networkidle').catch(() => {})
  ok(14, 'a folha de pagamento abre com o valor já calculado, e não em branco',
     fabio.url().includes('fluxo=pagamento'))

  /**
   * A FATURA NASCE DO ORÇAMENTO APROVADO — e a folha diz isso em vez de recusar.
   *
   * A O.S. chega ao caixa sem fatura emitida, e a tela não devolve um "não":
   * ela explica o que falta e oferece o passo, com o valor já vindo do
   * orçamento que o cliente aprovou. Ninguém redigita R$ 980,00 — redigitar é
   * onde nasce a diferença entre o que foi combinado e o que foi cobrado.
   */
  const textoCaixa = await fabio.locator('body').innerText()
  ok(14, 'sem fatura, a folha EXPLICA o passo que falta em vez de recusar',
     /ainda não tem fatura/i.test(textoCaixa) && /nasce do orçamento aprovado/i.test(textoCaixa))

  await fabio.getByRole('button', { name: /Emitir a fatura/i }).click()

  // Esperar a LINHA da fatura aparecer no banco não basta: ela nasce e os
  // valores são preenchidos logo em seguida, então uma leitura rápida pega
  // R$ 0,00 e o roteiro acusa a tela de errar uma conta que ela ainda não fez.
  // Quem espera direito é a própria tela — o formulário de pagamento só é
  // desenhado quando a fatura está pronta para receber.
  await fabio.getByRole('combobox').first().waitFor({ state: 'visible', timeout: 30000 })
  await fabio.waitForTimeout(500)

  const aPagar = Number(sql(
    `SELECT "totalCentavos" FROM orcamentos WHERE "ordemId"='${ordemId}' ORDER BY versao DESC LIMIT 1`))
  const naFatura = Number(sql(`SELECT "valorTotalCentavos" FROM faturas WHERE "ordemId"='${ordemId}'`))
  ok(14, 'a fatura saiu com o valor do orçamento, e não digitado de novo',
     naFatura === aPagar, `fatura R$ ${(naFatura / 100).toFixed(2)} · orçamento R$ ${(aPagar / 100).toFixed(2)}`)

  await fabio.getByRole('combobox').first().selectOption('PIX')
  await fabio.locator('input[inputmode="decimal"]').first().fill((aPagar / 100).toFixed(2).replace('.', ','))
  const antesPg = etapaNoBanco(ordemId)
  await fabio.getByRole('button', { name: /Confirmar pagamento|Dar baixa|Registrar/i }).last().click()
  for (let i = 0; i < 60 && etapaNoBanco(ordemId) === antesPg; i++) await fabio.waitForTimeout(400)
  ok(14, 'FATURADO · o pagamento fechou a fatura',
     etapaNoBanco(ordemId) === 'FATURADO', etapaNoBanco(ordemId))
  ok(14, 'e a fatura está QUITADA no banco',
     sql(`SELECT status FROM faturas WHERE "ordemId"='${ordemId}'`) === 'QUITADA',
     sql(`SELECT status FROM faturas WHERE "ordemId"='${ordemId}'`))

  // ===========================================================================
  // DEGRAU 15 · A VOLTA — agendar a entrega
  // ===========================================================================
  await abrir(ana, `/sistema/ordens/${ordemId}`, 'O.S. · agendar entrega')
  await ana.getByRole('button', { name: /Agendar entrega/i }).first().click()
  await ana.waitForURL(/fluxo=agendar-entrega/, { timeout: 20000 }).catch(() => {})
  await ana.waitForLoadState('networkidle').catch(() => {})
  ok(15, 'a folha da entrega abre — e é a MESMA folha da coleta, com outro título',
     ana.url().includes('fluxo=agendar-entrega'))

  await ana.getByLabel('Dia').fill(hoje)
  await ana.getByLabel('Hora').fill('16:00')
  await ana.getByRole('combobox').first().selectOption({ label: 'Adriano Martins' })
  await ana.getByRole('button', { name: /Agendar entrega/i }).last().click()
  await ateQue(ana, `SELECT count(*) FROM agendamentos WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA'`, 1)
  ok(15, 'a parada de entrega existe, com motorista',
     sql(`SELECT count(*) FROM agendamentos WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA' AND "motoristaId" IS NOT NULL`) === '1')

  // ===========================================================================
  // DEGRAU 16 e 17 · A ENTREGA
  // ===========================================================================
  sql(
    `UPDATE agendamentos SET "posicaoRota" = (
       SELECT COALESCE(MIN("posicaoRota"), 1) - 1 FROM agendamentos
       WHERE "previstoPara" >= date_trunc('day', now())
     ) WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA'`,
  )
  await abrir(adriano, '/campo', 'app de campo · a entrega')
  await adriano.getByRole('button', { name: /Aceitar corrida/i }).first().click()
  await adriano.waitForTimeout(2500)

  const antesRotaEnt = etapaNoBanco(ordemId)
  await adriano.getByRole('button', { name: /Sair para a entrega/i }).first().click()
  for (let i = 0; i < 60 && etapaNoBanco(ordemId) === antesRotaEnt; i++) await adriano.waitForTimeout(400)
  ok(16, 'EM_ROTA_ENTREGA · mesma rota, sentido contrário',
     etapaNoBanco(ordemId) === 'EM_ROTA_ENTREGA', etapaNoBanco(ordemId))

  await adriano.getByRole('button', { name: /^Cheguei/i }).first().click()
  await adriano.waitForURL(/\/campo\/parada\//, { timeout: 20000 }).catch(() => {})
  await adriano.waitForLoadState('networkidle').catch(() => {})
  await adriano.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 20000 })
  await adriano.locator('input[type=file]').first().setInputFiles([foto(10)])
  await adriano.waitForTimeout(1200)
  await adriano.getByLabel('Quem está recebendo').fill('Mariana Farias')
  await assinarNoVisor(adriano)

  const eventosAntesEntrega = contarEventos(ordemId)
  await adriano.getByRole('button', { name: /Finalizar e enviar/i }).click()
  await ateQue(adriano, `SELECT count(*) FROM assinaturas WHERE "ordemId"='${ordemId}' AND tipo='ENTREGA'`, 1)
  await adriano.screenshot({ path: `${SHOTS}/08-entrega.png`, fullPage: true })

  // ===========================================================================
  // DEGRAU 18 · A REGRA 6.2 NA TELA — ninguém clica, e a O.S. fecha
  // ===========================================================================
  /**
   * A BAIXA QUE ACONTECE SOZINHA.
   *
   * O aparelho voltou, o cliente assinou o recebimento e o dinheiro já tinha
   * entrado. Não sobra decisão nenhuma para a gestão tomar — e o passo que
   * existia ali era só uma fila a mais entre o serviço pronto e a O.S.
   * encerrada.
   *
   * A regra foi decisão do dono, tomada em voz alta. Aqui ela é cobrada como
   * COMPORTAMENTO: o motorista toca em "Finalizar e enviar", ninguém mais
   * clica em nada, e a O.S. tem de chegar a FINALIZADO por conta própria.
   */
  for (let i = 0; i < 90 && etapaNoBanco(ordemId) !== 'FINALIZADO'; i++) await adriano.waitForTimeout(500)
  ok(18, 'REGRA 6.2 · a entrega assinada de uma O.S. PAGA fecha a ordem SOZINHA',
     etapaNoBanco(ordemId) === 'FINALIZADO', etapaNoBanco(ordemId))

  /**
   * E A BAIXA AUTOMÁTICA ASSINA O QUE FEZ.
   *
   * Um sistema que age por conta própria e não diz quem agiu é pior que um
   * sistema que não age: a folha de rastreabilidade passaria a ter um passo sem
   * dono. O evento sai com autor "Sistema" e com o motivo escrito, para que
   * quem ler a trilha daqui a dois anos saiba que ninguém esqueceu de clicar.
   */
  const autorDaBaixa = sql(
    `SELECT coalesce("autorNome",'(vazio)') FROM eventos_ordem
     WHERE "ordemId"='${ordemId}' AND "etapaNova"='FINALIZADO' ORDER BY "criadoEm" DESC LIMIT 1`)
  ok(18, 'e o evento da baixa automática tem autor, e o autor é o Sistema',
     autorDaBaixa === 'Sistema', autorDaBaixa)

  const motivoDaBaixa = sql(
    `SELECT coalesce(descricao,'') || ' ' || coalesce(titulo,'') FROM eventos_ordem
     WHERE "ordemId"='${ordemId}' AND "etapaNova"='FINALIZADO' ORDER BY sequencia DESC LIMIT 1`)
  ok(18, 'e diz POR QUE fechou, em português, para quem ler daqui a dois anos',
     /quitada/i.test(motivoDaBaixa), motivoDaBaixa.slice(0, 70))

  ok(18, 'ninguém precisou clicar: a entrega gerou entrega E baixa',
     contarEventos(ordemId) - eventosAntesEntrega >= 2,
     `${contarEventos(ordemId) - eventosAntesEntrega} eventos desde a chegada do motorista`)

  // ===========================================================================
  // A CONTA FINAL · 13 degraus na tela, 18 etapas na trilha
  // ===========================================================================
  const totalEventos = contarEventos(ordemId)
  ok(0, 'a linha do tempo guardou cada salto, e não cada clique',
     totalEventos >= 15, `${totalEventos} eventos para 13 degraus de tela`)

  ok(0, 'nenhum evento ficou sem autor — nem os automáticos',
     sql(`SELECT count(*) FROM eventos_ordem WHERE "ordemId"='${ordemId}' AND ("autorNome" IS NULL OR "autorNome"='')`) === '0')

  /**
   * A CORRENTE DE HASH, CONFERIDA ELO A ELO.
   *
   * Cada evento carrega o hash do anterior. É isso que transforma a trilha de
   * "uma tabela que alguém pode editar" em "uma sequência em que uma alteração
   * aparece". Se a fusão de cliques tivesse quebrado a ordem de gravação, é
   * aqui que apareceria.
   */
  const buracos = sql(
    `SELECT count(*) FROM (
       SELECT "hashAnterior", lag(hash) OVER (ORDER BY sequencia) AS esperado
       FROM eventos_ordem WHERE "ordemId"='${ordemId}'
     ) t WHERE "hashAnterior" IS DISTINCT FROM esperado AND esperado IS NOT NULL`)
  ok(0, 'a corrente de hash está inteira: cada evento aponta para o anterior',
     buracos === '0', `${buracos} elo(s) rompido(s)`)

  await abrir(camila, `/sistema/ordens/${ordemId}`, 'O.S. finalizada · a linha do tempo')
  await camila.screenshot({ path: `${SHOTS}/09-finalizada.png`, fullPage: true })
  const fichaFinal = await camila.locator('body').innerText()
  /**
   * SEM A BANDEIRA `i`, E ISSO NÃO É DESCUIDO.
   *
   * `NaN` procurado sem diferenciar maiúsculas casa com o "nan" de
   * "Fi-NAN-ceiro" — que é uma palavra que aparece no menu de todas as telas.
   * O roteiro passou a acusar dado quebrado em toda ficha, e a acusação era
   * sobre o próprio menu.
   *
   * Os quatro rastros procurados aqui são literais: `NaN`, `undefined`,
   * `Invalid Date` e `[object`. Nenhum deles precisa de tolerância a
   * maiúsculas, e todos ficam mais precisos sem ela.
   */
  const quebrado = fichaFinal.match(/.{0,60}(NaN|undefined|Invalid Date|\[object).{0,60}/)
  ok(0, 'a ficha final não mostra dado quebrado (NaN, undefined, Invalid Date)',
     !quebrado, quebrado ? quebrado[0].replace(/\n/g, ' ') : '')


} catch (e) {
  falhas++
  conferencias++
  console.log(`  🔴 ·· a jornada parou aqui: ${String(e).split('\n')[0].slice(0, 160)}`)
}

// ===========================================================================
// RELATÓRIO
// ===========================================================================
console.log('\n  ' + '─'.repeat(68))
console.log(`  ${conferencias - falhas}/${conferencias} conferências passaram` +
            (falhas ? `  ·  ${falhas} FALHA(S)` : ''))
if (erros.length) {
  console.log(`\n  ⚠ ${erros.length} erro(s) de página:`)
  for (const e of [...new Set(erros)].slice(0, 8)) console.log('     ' + e)
}
console.log('\n  TEMPO DE CADA TELA')
for (const t of tempos) console.log(`     ${String(t.ms).padStart(5)}ms  ${t.rotulo}`)
console.log(`\n  prints em ${SHOTS}\n`)

await nav.close()
process.exit(falhas ? 1 : 0)
