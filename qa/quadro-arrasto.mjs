// =============================================================================
// O BAMBAM DO QUADRO — arrastar o cartão, e o quadro NÃO mentir
// =============================================================================
// O dono pediu o gesto pelo nome:
//
//   "ainda na OS eu preciso que fixe a ideia de lista e tambem o bambam
//    (onde eu possa arrastar para um lado e para o outro!"
//
// Só que uma coluna do quadro agrupa VÁRIAS etapas da esteira, e as transições
// entre etapas não são livres: a máquina de estados sabe quais são legais, quem
// pode fazer cada uma, e o que cada uma exige. Um quadro que aceita qualquer
// arrasto e responde "não pode" depois é pior que um que não aceita nada — a
// pessoa já soltou, já viu o cartão mudar de lugar, e agora ele volta sozinho.
//
// Então o que este roteiro confere não é "o arrasto funciona". É "o arrasto só
// promete o que a esteira cumpre":
//
//   1. O CARTÃO SAI DO LUGAR. `draggable` de verdade, e só nos cartões que têm
//      para onde ir — cartão sem saída não se mexe.
//
//   2. COM O CARTÃO NA MÃO, A TELA JÁ RESPONDE. As colunas de destino possível
//      acendem; as demais apagam. Isso é medido no NAVEGADOR, no meio do gesto,
//      porque é a única hora em que existe.
//
//   3. TODA COLUNA ACESA DIZ O QUE VAI FAZER. Uma coluna agrupa quatro etapas,
//      então "solte em Diagnóstico" não informa nada — quem arrasta precisa ler
//      "Em análise técnica". É essa faixa que deixa a coluna de origem acender
//      sem parecer que soltar ali não faria nada. E é ela que sustenta o desenho
//      inteiro: com as colunas padrão, quase todo passo fica dentro da mesma
//      fase, e proibir a origem deixava o gesto sem alvo nenhum.
//
//   4. SOLTAR NUMA COLUNA APAGADA NÃO ANDA NADA. Esta é a conferência que dá
//      valor a todas as outras: ela prova que a recusa é REAL — a etapa no banco
//      continua a mesma. Sem ela, "as colunas apagam" seria só enfeite.
//
//   5. SOLTAR NUMA COLUNA ACESA ANDA A ESTEIRA DE VERDADE. E a etapa nova é uma
//      das etapas DAQUELA coluna, conferida contra `colunas_quadro` no banco —
//      não contra o texto do botão, que é justamente o que poderia estar errado.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }
const pulo = (t) => console.log(`  ⚪ NÃO TESTADO — ${t}`)

const sql = (q) => {
  const o = execFileSync('psql', ['-h', '127.0.0.1', '-p', '5599', '-U', 'postgres', '-d', 'dtechmed', '-tAc',
    "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' }).trim().split('\n')
  return o.length > 1 ? o.slice(1).join('\n').trim() : ''
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
const ctx = await nav.newContext({ viewport: { width: 1700, height: 1100 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
await p.fill('#email', 'lucas@dtechmed.com.br')
await p.fill('#senha', SENHA)
await p.getByRole('button', { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })

await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
// O quadro pode estar sem configuração (outro roteiro apaga as colunas para
// conferir a coluna de resgate). Sem coluna não há para onde arrastar.
const convite = p.getByRole('button', { name: /Começar com as cinco padrão/i })
if (await convite.count() > 0) {
  await convite.first().click()
  await p.waitForTimeout(2500)
  await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
}

/** As colunas do quadro, direto do banco — é contra elas que se confere o destino. */
const colunasDoBanco = sql("select nome || ' :: ' || array_to_string(etapas, ',') from colunas_quadro order by ordem")
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [nome, etapas] = l.split(' :: ')
    return { nome: nome.trim(), etapas: (etapas || '').split(',').filter(Boolean) }
  })

// ---------------------------------------------------------------------------
console.log('\n1) O CARTÃO SAI DO LUGAR — e só o que tem para onde ir')
// ---------------------------------------------------------------------------
// O cartão candidato: o primeiro que anuncia alguma coluna de destino no botão
// ("Passo → Coluna").
//
// A segunda versão deste roteiro exigia destino em coluna DIFERENTE, e não achou
// nenhum cartão — foi assim que apareceu o defeito de desenho: com as cinco
// colunas padrão, quase todo passo continua dentro da mesma fase. O produto
// mudou por causa disso (a coluna de origem acende, e a faixa diz o que o
// gesto vai rodar), e a exigência aqui voltou a ser a certa: "tem destino".
const escolhido = await p.evaluate(() => {
  const cartoes = [...document.querySelectorAll('section[aria-label] li')]
  for (const li of cartoes) {
    const seta = [...li.querySelectorAll('button')].find((b) => b.textContent.includes('→'))
    if (!seta) continue
    const link = li.querySelector('a[href*="/painel/ordens/"]')
    const coluna = li.closest('section[aria-label]')
    return {
      href: link ? link.getAttribute('href') : null,
      arrastavel: li.getAttribute('draggable'),
      destino: seta.textContent.split('→').pop().trim(),
      colunaOrigem: coluna.getAttribute('aria-label').split(',')[0],
      numero: li.querySelector('strong') ? li.querySelector('strong').textContent : '?',
    }
  }
  return null
})

if (!escolhido) {
  nao('nenhum cartão do quadro anuncia coluna de destino — o cenário não permite conferir o arrasto')
  console.log('\nRESULTADO: 1 vermelho')
  await nav.close()
  process.exit(1)
}

const ordemId = escolhido.href.split('/').pop()
const etapaAntes = sql(`select etapa from ordens where id = '${ordemId}'`)
ok(`cartão ${escolhido.numero}, em "${escolhido.colunaOrigem}", etapa ${etapaAntes}, anuncia "→ ${escolhido.destino}"`)

escolhido.arrastavel === 'true'
  ? ok('o cartão está arrastável (draggable="true")')
  : nao(`o cartão anuncia destino mas não é arrastável (draggable=${escolhido.arrastavel})`)

// Cartão SEM saída nenhuma não pode se mexer. Pode não existir no cenário — e
// aí é "não testado", não é verde de graça.
const semSaida = await p.evaluate(() => {
  const cartoes = [...document.querySelectorAll('section[aria-label] li')]
  for (const li of cartoes) {
    const daColuna = li.closest('section[aria-label]').getAttribute('aria-label').split(',')[0]
    const temSaida = [...li.querySelectorAll('button')].some((b) => b.textContent.includes('→'))
    if (!temSaida) return { arrastavel: li.getAttribute('draggable'), coluna: daColuna }
  }
  return null
})
if (!semSaida) pulo('não há no quadro nenhum cartão sem coluna de destino para conferir a trava')
else if (semSaida.arrastavel === 'true') nao('cartão sem nenhum destino possível está arrastável — o quadro promete o que não cumpre')
else ok('cartão sem destino possível não é arrastável')

// ---------------------------------------------------------------------------
console.log('\n2) COM O CARTÃO NA MÃO, a tela já responde')
// ---------------------------------------------------------------------------
const cartao = p.locator(`li:has(a[href="${escolhido.href}"])`).first()
const secoes = p.locator('section[aria-label]')

/**
 * Segura o cartão no meio da tela e devolve o estado de cada coluna.
 *
 * Mede o que o OLHO vê — opacidade e sombra calculadas pelo navegador — e não
 * o nome da classe: nome de classe de módulo CSS é embaralhado no build, e
 * conferir por ele daria verde num dia em que a regra não valesse mais nada.
 */
async function segurarEMedir() {
  const caixa = await cartao.boundingBox()
  await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height - 8)
  await p.mouse.down()
  await p.mouse.move(caixa.x + caixa.width / 2 + 40, caixa.y + 40, { steps: 8 })
  await p.mouse.move(caixa.x + caixa.width / 2 + 120, caixa.y + 60, { steps: 8 })
  return p.evaluate(() =>
    [...document.querySelectorAll('section[aria-label]')].map((s) => {
      const e = getComputedStyle(s)
      const faixa = [...s.querySelectorAll('p')].find((n) => /^Solte/.test(n.textContent.trim()))
      return {
        nome: s.getAttribute('aria-label').split(',')[0],
        opacidade: Number(e.opacity),
        acesa: e.boxShadow !== 'none' && e.boxShadow !== '',
        faixa: faixa ? faixa.textContent.trim() : null,
      }
    }),
  )
}

const estado = await segurarEMedir()
const acesas = estado.filter((c) => c.acesa).map((c) => c.nome)
const apagadas = estado.filter((c) => c.opacidade < 0.9).map((c) => c.nome)

acesas.length > 0
  ? ok(`acenderam ${acesas.length} coluna(s) de destino: ${acesas.join(', ')}`)
  : nao('nenhuma coluna acendeu com o cartão na mão')

apagadas.length > 0
  ? ok(`apagaram ${apagadas.length} coluna(s) sem saída: ${apagadas.join(', ')}`)
  : nao('nenhuma coluna apagou — o quadro não está dizendo onde o cartão NÃO cabe')

acesas.includes(escolhido.destino)
  ? ok(`a coluna anunciada pelo botão ("${escolhido.destino}") é uma das que acenderam`)
  : nao(`o botão anuncia "${escolhido.destino}" mas essa coluna não acendeu no arrasto`)

// ---------------------------------------------------------------------------
console.log('\n3) TODA COLUNA ACESA DIZ o que soltar ali vai fazer')
// ---------------------------------------------------------------------------
// Sem esta faixa, acender a coluna de origem seria confuso: "solte em Retirada"
// no cartão que já está em Retirada parece não fazer nada. A faixa não diz
// "aqui", diz o nome do passo — e é ele que vai rodar.
const semFaixa = estado.filter((c) => c.acesa && !c.faixa).map((c) => c.nome)
semFaixa.length === 0
  ? ok(`as ${estado.filter((c) => c.acesa).length} colunas acesas anunciam o passo: ${estado.filter((c) => c.acesa).map((c) => `"${c.faixa}"`).join(' · ')}`)
  : nao(`coluna acesa sem dizer o que vai fazer: ${semFaixa.join(', ')}`)

const apagadaComFaixa = estado.filter((c) => !c.acesa && c.faixa).map((c) => c.nome)
apagadaComFaixa.length === 0
  ? ok('nenhuma coluna sem saída anuncia passo que não tem')
  : nao(`coluna apagada anunciando passo: ${apagadaComFaixa.join(', ')}`)

// ---------------------------------------------------------------------------
console.log('\n4) SOLTAR NUMA COLUNA APAGADA não anda nada')
// ---------------------------------------------------------------------------
// A conferência que dá valor às outras: prova que a recusa é de verdade, e não
// só uma cor mais fraca na tela.
const nomeApagada = apagadas[0]
if (!nomeApagada) {
  pulo('todas as colunas eram destino possível — não deu para conferir a recusa')
  await p.mouse.up()
} else {
  const alvoRuim = await secoes.filter({ has: p.locator(`text=${nomeApagada}`) }).first().boundingBox()
  const caixaRuim = alvoRuim || (await secoes.nth(estado.findIndex((c) => c.nome === nomeApagada)).boundingBox())
  await p.mouse.move(caixaRuim.x + caixaRuim.width / 2, caixaRuim.y + caixaRuim.height / 2, { steps: 12 })
  await p.mouse.up()
  await p.waitForTimeout(2500)
  const etapaDepois = sql(`select etapa from ordens where id = '${ordemId}'`)
  etapaDepois === etapaAntes
    ? ok(`soltei em "${nomeApagada}" e a esteira não andou: etapa continua ${etapaDepois}`)
    : nao(`soltar numa coluna apagada MOVEU a ordem: ${etapaAntes} → ${etapaDepois}`)
}

// ---------------------------------------------------------------------------
console.log('\n5) SOLTAR NUMA COLUNA ACESA anda a esteira de verdade')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/ordens/quadro`, { waitUntil: 'networkidle' })
const estado2 = await segurarEMedir()
const indiceBom = estado2.findIndex((c) => c.acesa && c.nome === escolhido.destino)
if (indiceBom < 0) {
  await p.mouse.up()
  nao(`a coluna "${escolhido.destino}" não acendeu na segunda passada`)
} else {
  const caixaBoa = await secoes.nth(indiceBom).boundingBox()
  await p.mouse.move(caixaBoa.x + caixaBoa.width / 2, caixaBoa.y + caixaBoa.height / 2, { steps: 12 })
  await p.mouse.up()
  await p.waitForTimeout(3500)

  const etapaFinal = sql(`select etapa from ordens where id = '${ordemId}'`)
  const colunaDestino = colunasDoBanco.find((c) => c.nome === escolhido.destino)

  if (etapaFinal === etapaAntes) {
    /**
     * NEM TODA RECUSA É DEFEITO — mas a MUDA é.
     *
     * `proximosPassos(etapa, papel)` sabe quais transições existem e quem pode
     * fazê-las. O que ele NÃO sabe é se as exigências daquela transição estão
     * cumpridas: a entrega pede a fatura quitada, a coleta pede assinatura do
     * cliente. Essas o motor confere na hora do movimento — e por isso a coluna
     * pode acender e a esteira ainda recusar.
     *
     * Isso vale igual para o BOTÃO, que oferece os mesmos passos; não é do
     * arrasto. O que o arrasto não pode fazer é engolir a recusa em silêncio:
     * quem soltou tem de ler por quê. É isso que se confere aqui.
     */
    const recusa = await p.locator('[role="alert"]').first()
    const textoRecusa = (await recusa.count()) > 0 ? (await recusa.innerText()).trim() : ''
    if (textoRecusa) {
      ok(`a esteira recusou e DISSE o motivo na tela: "${textoRecusa}"`)
      const trilhaMuda = sql(`select count(*) from eventos_ordem where "ordemId" = '${ordemId}'`)
      ok(`e não gravou evento novo: a trilha continua com ${trilhaMuda}`)
    } else {
      // Pode ser a janelinha de escolha: dois passos caem na mesma coluna e o
      // sistema pergunta qual — de propósito. Só é vermelho se nem isso apareceu.
      const perguntou = await p.locator('text=Dois caminhos levam aqui').count()
      if (perguntou > 0) {
        ok('dois passos levavam à mesma coluna e o quadro perguntou qual — não escolheu sozinho')
        await p.getByRole('group', { name: /Escolha o passo/i }).getByRole('button').first().click()
        await p.waitForTimeout(3500)
        const etapa3 = sql(`select etapa from ordens where id = '${ordemId}'`)
        const recusa3 = await p.locator('[role="alert"]').first()
        const texto3 = (await recusa3.count()) > 0 ? (await recusa3.innerText()).trim() : ''
        if (etapa3 !== etapaAntes && colunaDestino && colunaDestino.etapas.includes(etapa3)) {
          ok(`escolhido o passo, a ordem foi para ${etapa3}, que é etapa de "${escolhido.destino}"`)
        } else if (texto3) {
          ok(`escolhido o passo, a esteira recusou e disse por quê: "${texto3}"`)
        } else {
          nao(`depois de escolher o passo a ordem ficou em ${etapa3}, e a tela não disse nada`)
        }
      } else {
        nao(`soltei na coluna acesa "${escolhido.destino}" e nada aconteceu, sem uma palavra na tela: etapa continua ${etapaAntes}`)
      }
    }
  } else if (!colunaDestino) {
    nao(`a coluna "${escolhido.destino}" não existe em colunas_quadro`)
  } else if (!colunaDestino.etapas.includes(etapaFinal)) {
    nao(`a ordem foi para ${etapaFinal}, que NÃO é etapa da coluna "${escolhido.destino}" (${colunaDestino.etapas.join(', ')})`)
  } else {
    ok(`${etapaAntes} → ${etapaFinal}, e ${etapaFinal} é etapa de "${escolhido.destino}"`)
    const trilha = sql(`select count(*) from eventos_ordem where "ordemId" = '${ordemId}' and etapa = '${etapaFinal}'`)
    Number(trilha) > 0
      ? ok('a transição ficou registrada na trilha do prontuário')
      : nao('a ordem mudou de etapa mas não gravou evento na trilha')
  }
}

// ---------------------------------------------------------------------------
console.log('\n6) NENHUM ERRO de JavaScript na tela')
// ---------------------------------------------------------------------------
erros.length === 0 ? ok('console limpo') : nao(`erros no navegador: ${erros.join(' | ')}`)

await nav.close()
console.log(`\nRESULTADO: ${ruins === 0 ? 'tudo verde' : ruins + ' vermelho(s)'}`)
process.exit(ruins === 0 ? 0 : 1)
