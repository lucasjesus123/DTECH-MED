// =============================================================================
// RASTREABILIDADE — a folha de "quem mexeu neste aparelho"
// =============================================================================
// Esta é a única peça da remanufatura que não existia em lugar nenhum. O
// sistema já guardava tudo o que ela mostra, em três lugares que nunca se
// encontravam: a trilha de etapas de cada O.S., o log de auditoria, e as provas
// (fotos, assinaturas, documentos). Juntar era trabalho de cabeça, feito com o
// cliente esperando no telefone.
//
// O que cada conferência guarda:
//
//   1. O ADMINISTRADOR DA EMPRESA ENTRA. Escrevi esta folha com
//      `exigirPapel(GESTOR)`, que é lista EXATA, e o dono da empresa — que está
//      ACIMA do gestor — batia em "esta parte não é do seu perfil" na própria
//      folha que ele mais precisa. `exigirNivel(GESTOR)` é piso, e é o certo.
//      Os dois guardas têm nome parecido e comportamento diferente; esta
//      conferência existe para que a troca não volte sozinha.
//
//   2. O TÉCNICO NÃO ENTRA. A folha NOMEIA PESSOAS e diz o que cada uma fez —
//      inclusive o que tentaram fazer e o sistema recusou. Isso é informação de
//      gestão, não de bancada. Um piso que deixa todo mundo passar não é piso.
//
//   3. NENHUMA CLASSE DE CSS VIROU `undefined`. Nome de classe de CSS module
//      não é conferido pelo TypeScript: um nome errado vira `undefined`, a
//      regra não aplica, e a tela sai torta sem ninguém reclamar. Já aconteceu
//      duas vezes nesta folha (`tituloPagina`, `indRotulo`).
//
//   4. AS PROVAS NÃO SE REPETEM. A primeira versão pendurava o balde de provas
//      do DIA em TODAS as linhas daquele dia. Numa O.S. que anda inteira num
//      dia — o caso normal — isso imprimia as mesmas oito provas dezessete
//      vezes, e a folha de UM aparelho passava de onze mil pixels. Agora o
//      bloco sai uma vez por dia, na última linha, e rótulo repetido vira
//      contagem ("6 fotos de recebimento", e não seis linhas iguais).
//
//   5. A FOLHA SOMA O QUE ELA MOSTRA. "6 passagens" com cinco blocos de O.S. na
//      tela é um relatório que se contradiz — e um relatório que se contradiz
//      não se entrega a fabricante nem a vigilância sanitária.
//
//   6. A TENTATIVA BARRADA APARECE — e esta é a conferência que mais importa.
//      Ela não confere um número existente: ela PROVOCA uma recusa de verdade,
//      no portal do cliente, com CPF errado, pelo caminho real do código. Foi
//      assim que descobri que a consulta filtrava `entidade: 'Ordem'` enquanto
//      o sistema inteiro grava `'ordem'` em minúscula — a metade de auditoria
//      da folha vinha vazia PARA SEMPRE, sem erro nenhum, e nenhuma conferência
//      de estrutura teria visto isso.
//
//   7. NO PAPEL, SOME O QUE NÃO SE IMPRIME. Esta folha existe para sair da
//      impressora. Menu lateral e botão em papel são tinta gasta; o rodapé com
//      a data de emissão é o contrário — sem ele, alguém compara duas versões
//      daqui a um ano sem saber qual é a atual.
//
//   8. ID QUE NÃO EXISTE DÁ 404, e não estouro. A folha é linkada de fora e o
//      id anda em URL.
//
// O que este roteiro NÃO confere: vazamento entre empresas. O banco de ensaio
// tem uma empresa só, então aqui isso seria teatro. Quem cobre esse caso é
// `qa/isolamento.mjs`, contra o RLS.
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
  return o.length > 1 ? o.slice(1) : []
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(email) {
  const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

/** A folha inteira, decomposta em peças conferíveis. */
const lerFolha = (p) =>
  p.evaluate(() => {
    const txt = (el) => el?.innerText.replace(/\s+/g, ' ').trim() ?? null
    return {
      barrado: /não é do seu perfil/i.test(document.body.innerText),
      titulo: txt(document.querySelector('h1')),
      // `rastroPassos` (a lista) e `rastroPasso` (a linha) casariam os dois num
      // seletor por prefixo. A linha é `li`, e é ela que interessa.
      indicadores: [...document.querySelectorAll('[class*="indicador"]')].map((e) =>
        e.innerText.replace(/\n/g, ' · '),
      ),
      pessoas: [...document.querySelectorAll('li[class*="rastroPessoa"]')].map((e) => txt(e)),
      // Só os blocos de O.S.: a lista "quem mexeu neste aparelho" também é um
      // `.bloco`, e contá-la junto dava sete blocos para seis passagens — a
      // conferência acusaria o produto por um erro do próprio roteiro.
      blocos: [...document.querySelectorAll('section')].filter((s) =>
        s.querySelector('[class*="rastroCabOS"]'),
      ).length,
      linhas: [...document.querySelectorAll('li[class*="rastroPasso"]')].map((li) => ({
        quando: txt(li.querySelector('[class*="rastroQuando"]')),
        oque: txt(li.querySelector('[class*="rastroOque"]')),
        quem: txt(li.querySelector('[class*="rastroQuem"]')),
        provas: txt(li.querySelector('[class*="rastroProvas"]')),
        negado: !!li.className.match(/rastroNegado/),
      })),
      negadosNaTela: document.querySelectorAll('[class*="rastroNegado"]').length,
      rodape: txt(document.querySelector('[class*="rastroRodape"]')),
      // Nome de classe errado em CSS module vira a string "undefined".
      classesVazias: [...document.querySelectorAll('[class*="undefined"]')].length,
    }
  })

// O aparelho de ensaio é o que tem uma O.S. esperando resposta do cliente: é
// dela que sai a recusa de verdade da conferência 6.
const [alvo] = sql(
  `select o."equipamentoId"||'|'||o."tokenPublico" from ordens o
   where o.etapa='ORCAMENTO_ENVIADO' and o."tokenPublico" is not null limit 1`,
)
if (!alvo) {
  nao('não há O.S. aguardando o cliente no banco de ensaio — semeie antes de rodar')
  await nav.close()
  process.exit(1)
}
const [equipamentoId, token] = alvo.split('|')
const URL_FOLHA = `${QA_BASE}/painel/equipamentos/${equipamentoId}/rastreabilidade`

console.log('\n— 1 e 2. quem entra nesta folha —')
const dono = await entrar('lucas@dtechmed.com.br')
await dono.goto(URL_FOLHA, { waitUntil: 'networkidle' })
let f = await lerFolha(dono)

f.barrado
  ? nao('o ADMINISTRADOR DA EMPRESA foi barrado na própria folha da empresa dele')
  : ok('o administrador da empresa entra — o guarda é piso, não lista exata')

const gestor = await entrar('camila@dtechmed.com.br')
await gestor.goto(URL_FOLHA, { waitUntil: 'networkidle' })
;(await lerFolha(gestor)).barrado
  ? nao('o GESTOR foi barrado, e o piso é justamente ele')
  : ok('o gestor entra — ele é o piso')

const tecnico = await entrar('rafael@dtechmed.com.br')
await tecnico.goto(URL_FOLHA, { waitUntil: 'networkidle' })
;(await lerFolha(tecnico)).barrado
  ? ok('o técnico é barrado — a folha nomeia pessoas, é papel de gestão')
  : nao('o TÉCNICO ABRIU a folha que diz o que cada colega fez')

console.log('\n— 3. a folha montou de verdade —')
f.classesVazias === 0
  ? ok('nenhuma classe de CSS module virou `undefined`')
  : nao(`${f.classesVazias} elemento(s) com classe inexistente — a regra não aplicou`)

f.titulo && f.titulo.length > 3
  ? ok(`a folha abre nomeando o aparelho: "${f.titulo}"`)
  : nao('a folha não diz de que aparelho ela é')

console.log('\n— 4. as provas não se repetem —')
const repetidoNaLinha = f.linhas.find((l) => {
  if (!l.provas) return false
  const partes = l.provas.split(' · ').map((s) => s.trim())
  return new Set(partes).size !== partes.length
})
repetidoNaLinha
  ? nao(`uma linha repete o mesmo rótulo de prova: "${repetidoNaLinha.provas}"`)
  : ok('nenhuma linha repete o mesmo rótulo — repetição virou contagem')

const comProvas = f.linhas.filter((l) => l.provas)
const diasComProva = new Set(comProvas.map((l) => (l.quando || '').slice(0, 10)))
comProvas.length === 0 || comProvas.length <= diasComProva.size * f.blocos
  ? ok(`o bloco de provas sai ${comProvas.length}× para ${diasComProva.size} dia(s) — uma vez por dia`)
  : nao(`${comProvas.length} linhas carregam provas para ${diasComProva.size} dia(s): voltou a repetir`)

console.log('\n— 5. a folha soma o que mostra —')
const numeroDo = (rotulo) => {
  const ind = f.indicadores.find((i) => i.toLowerCase().includes(rotulo))
  const m = ind?.match(/·\s*(\d+)\s*·/)
  return m ? Number(m[1]) : null
}
const passagens = numeroDo('passagens')
const pessoas = numeroDo('pessoas')

passagens === f.blocos
  ? ok(`"${passagens} passagens" e ${f.blocos} blocos de O.S. na tela — bate`)
  : nao(`o resumo diz ${passagens} passagens e a folha mostra ${f.blocos} blocos`)

pessoas === f.pessoas.length
  ? ok(`"${pessoas} pessoas" e ${f.pessoas.length} nomes listados — bate`)
  : nao(`o resumo diz ${pessoas} pessoas e a lista tem ${f.pessoas.length} nomes`)

console.log('\n— 6. a tentativa barrada aparece (recusa provocada de verdade) —')
const barradasAntes = Number(
  sql(`select count(*) from audit_logs where entidade='ordem' and negado=true`)[0] ?? '0',
)

// A RECUSA É PROVOCADA PELO CAMINHO REAL: portal do cliente, CPF que não
// confere. Nada é escrito à mão no banco — se a auditoria parar de gravar, ou a
// consulta parar de ler, esta conferência cai junto. Não é destrutivo: a O.S.
// continua exatamente onde estava, esperando o cliente.
const anon = await nav.newContext({ viewport: { width: 420, height: 900 } })
const cli = await anon.newPage()
await cli.goto(`${QA_BASE}/os/${token}`, { waitUntil: 'networkidle' })
await cli.getByRole('button', { name: /não aprovar/i }).click()
await cli.fill('#documento', '000.000.000-00')
await cli.getByRole('button', { name: /confirmar recusa/i }).click()
// A página tem MAIS DE UM `role="alert"`, e o primeiro é uma região viva
// vazia: `querySelector` pegava esse e a conferência lia string vazia enquanto
// a recusa acontecia direitinho. Junta todos e procura no conjunto.
await cli
  .waitForFunction(() => /não confere|muitas tentativas/i.test(document.body.innerText), null, {
    timeout: 15000,
  })
  .catch(() => null)
const avisoAoCliente = await cli.evaluate(() =>
  [...document.querySelectorAll('[role="alert"]')]
    .map((e) => e.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' '),
)

// O `;` da frente não é enfeite: sem ele, `)` seguido de `/` vira DIVISÃO.
;/não confere|muitas tentativas/i.test(avisoAoCliente)
  ? ok(`o portal recusou o documento errado: "${avisoAoCliente.slice(0, 60)}…"`)
  : nao(`o portal não recusou o CPF errado — resposta: "${avisoAoCliente}"`)

const barradasDepois = Number(
  sql(`select count(*) from audit_logs where entidade='ordem' and negado=true`)[0] ?? '0',
)
barradasDepois > barradasAntes
  ? ok(`a auditoria gravou a tentativa barrada (${barradasAntes} → ${barradasDepois})`)
  : nao('a recusa aconteceu na tela e NÃO foi parar na auditoria')

await dono.goto(URL_FOLHA, { waitUntil: 'networkidle' })
await dono.reload({ waitUntil: 'networkidle' })
f = await lerFolha(dono)
const barradasNoResumo = numeroDo('barradas')

barradasNoResumo > 0
  ? ok(`a folha passou a contar ${barradasNoResumo} tentativa(s) barrada(s)`)
  : nao('a recusa está na auditoria e a folha continua dizendo que não houve nenhuma')

f.negadosNaTela > 0
  ? ok('e a linha vem marcada — quem lê no papel vê que aquilo foi recusado')
  : nao('a folha contou a barrada no resumo mas não marcou a linha')

const linhaNegada = f.linhas.find((l) => l.negado)
linhaNegada && /recusado pelo sistema/i.test(linhaNegada.oque || '')
  ? ok(`a marca é escrita, não só cor: "${linhaNegada.oque}"`)
  : nao('a linha barrada se distingue só por cor — no papel em preto e branco some')

// A auditoria nasce como CHAVE (`portal.documento.errado`), curta e estável de
// propósito. Numa folha que vai para a mão de um cliente ou de um fiscal, chave
// crua é ruído de máquina — e foi exatamente assim que ela saiu na primeira
// impressão desta tela.
const chaveCrua = f.linhas.find((l) => /(^|\s)[a-z]+(\.[a-z_]+){1,}(\s|$)/.test(l.oque || ''))
chaveCrua
  ? nao(`a folha imprime a chave crua da auditoria: "${chaveCrua.oque}"`)
  : ok('nenhuma chave crua de auditoria na folha — tudo em português')

console.log('\n— 7. no papel —')
await dono.emulateMedia({ media: 'print' })

/**
 * A MEDIÇÃO PRECISA RODAR NOS DOIS TEMAS, e essa lição custou uma conferência
 * verde que não conferia nada.
 *
 * O texto lavado no papel só acontece com o operador no MODO ESCURO: são os
 * tokens do tema escuro atravessando para a impressão. Como o roteiro entra
 * sem escolher tema, ele caía no claro — onde o texto já é preto — e a
 * conferência passava enquanto o defeito continuava lá, inteiro, para quem
 * trabalha no escuro. Verde por não ter olhado é pior que vermelho.
 *
 * A folha tem de sair com tinta independentemente do tema em que o operador
 * apertou "imprimir". Ele não pensa nisso, e não deve ter de pensar.
 */
const medirNoPapel = () =>
  dono.evaluate(() => {
  const vis = (sel) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).display !== 'none' : null
  }
  // A cor com que cada peça sai da impressora, e não só se ela sai.
  const tinta = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const m = getComputedStyle(el).color.match(/[\d.]+/g)
    if (!m) return null
    const [r, g, b] = m.slice(0, 3).map(Number)
    // Luminância relativa (WCAG). Sobre papel branco, quanto MENOR, mais legível.
    const c = [r, g, b].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return { rgb: [r, g, b], lum: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  }
  return {
    lateral: vis('[class*="lateral"]'),
    acoes: vis('[class*="rastroAcoes"]'),
    rodape: vis('[class*="rastroRodape"]'),
    fundo: getComputedStyle(document.body).backgroundColor,
    oque: tinta('[class*="rastroOque"]'),
    pessoa: tinta('li[class*="rastroPessoa"] strong'),
    quem: tinta('[class*="rastroQuem"]'),
  }
  })

const papel = await medirNoPapel()

papel.lateral === false || papel.lateral === null
  ? ok('o menu lateral some no papel')
  : nao('o menu lateral seria impresso junto com o documento')

papel.acoes === false || papel.acoes === null
  ? ok('os botões somem no papel')
  : nao('os botões seriam impressos — botão em papel é tinta gasta')

papel.rodape !== false
  ? ok('o rodapé com a data de emissão fica')
  : nao('o rodapé sumiu: a folha sai sem dizer de quando é')

f.rodape && /\d{2}\/\d{2}\/\d{4}/.test(f.rodape)
  ? ok('e o rodapé traz a data por extenso')
  : nao(`o rodapé não tem data: "${f.rodape}"`)

// A CONFERÊNCIA QUE FALTAVA. A primeira impressão desta folha saiu com a
// COLUNA DO MEIO — o que aconteceu — em cinza clarinho sobre papel branco:
// texto de tema escuro que ninguém mandou apagar. Some tudo o que importa, e
// nenhuma conferência de "o elemento está visível?" pega isso, porque o
// elemento ESTÁ visível: ele só não tem tinta. Contraste ≥ 4,5:1 sobre branco
// é luminância ≤ 0,18.
for (const tema of ['claro', 'escuro']) {
  await dono.context().addCookies([{ name: 'dtechmed_tema', value: tema, url: QA_BASE }])
  await dono.goto(URL_FOLHA, { waitUntil: 'networkidle' })
  await dono.emulateMedia({ media: 'print' })
  const m = await medirNoPapel()
  const pecas = [
    ['o que aconteceu', m.oque],
    ['quem mexeu', m.pessoa],
    ['o autor', m.quem],
  ]
  for (const [nome, peca] of pecas) {
    if (!peca) {
      nao(`não achei "${nome}" no papel (tema ${tema}) para medir a tinta`)
      continue
    }
    peca.lum <= 0.18
      ? ok(`tema ${tema}: "${nome}" sai com tinta (rgb ${peca.rgb.join(',')})`)
      : nao(`tema ${tema}: "${nome}" sai LAVADO — rgb(${peca.rgb.join(',')}) some na impressão`)
  }
}

console.log('\n— 8. id que não existe —')
const r = await dono.goto(`${QA_BASE}/painel/equipamentos/nao-existe-mesmo/rastreabilidade`, {
  waitUntil: 'domcontentloaded',
})
r && r.status() === 404
  ? ok('id inventado devolve 404')
  : nao(`id inventado devolveu ${r?.status()} — devia ser 404`)

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ RASTREABILIDADE INTEIRA VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
