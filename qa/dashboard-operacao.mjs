// O Dashboard ganhou a aba OPERAÇÃO: seis gráficos, cada um com a base em
// tabela. Este roteiro confere os desenhos contra o BANCO — não contra a tela —
// e verifica que a aba "Hoje" continua inteira e que o dinheiro só aparece para
// quem pode ver dinheiro, nas DUAS abas.
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
import { execFileSync } from 'node:child_process'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const psql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','5599','-U','postgres','-d','dtechmed','-tAc',
  "select set_config('app.is_super_admin','on',false); " + q], { encoding: 'utf8' })
  .trim().split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
/** Uma linha só. */
const sql = (q) => psql(q).pop() ?? ''

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

// ---------------------------------------------------------------------------
console.log('\n1) O Dashboard tem duas abas, e "Hoje" continua a padrão')
// ---------------------------------------------------------------------------
// A aba nova não pode ter roubado a tela de quem abre o sistema de manhã: quem
// entra em /painel tem de continuar caindo na esteira, sem parâmetro nenhum.
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const abas = p.locator('nav[aria-label="Visões do painel"]')
;(await abas.count()) > 0 ? ok('a barra de visões existe') : nao('não há barra de visões no Dashboard')
for (const a of ['Hoje', 'Operação']) {
  ;(await abas.getByRole('link', { name: a, exact: true }).count()) > 0
    ? ok(`aba "${a}"`) : nao(`sem aba "${a}"`)
}
const marcadaPadrao = await abas.locator('[aria-current=page]').innerText().catch(() => '')
;/hoje/i.test(marcadaPadrao)
  ? ok('sem parâmetro, o Dashboard abre em "Hoje"')
  : nao(`sem parâmetro, o Dashboard abriu em "${marcadaPadrao}"`)

// A esteira — o órgão vital — continua onde estava.
const temEsteira = (await p.locator('nav[aria-label="Etapas da esteira"]').count()) > 0
const temTitulo = (await p.locator('h1').innerText()).includes('Onde a esteira está agora')
temEsteira && temTitulo
  ? ok('a aba "Hoje" continua inteira: título e esteira')
  : nao(`a aba "Hoje" mudou — esteira:${temEsteira} título:${temTitulo}`)

// ---------------------------------------------------------------------------
console.log('\n2) A aba Operação abre, e traz os quatro indicadores')
// ---------------------------------------------------------------------------
await abas.getByRole('link', { name: 'Operação', exact: true }).click()
await p.waitForURL(/ver=operacao/, { timeout: 15000 })
await p.waitForLoadState('networkidle')
;(await p.locator('h1').innerText()).includes('Como a operação está indo')
  ? ok('o título muda com a aba') : nao('o título não acompanhou a aba')

const corpo = await p.locator('body').innerText()
for (const i of ['VOLUME', 'DO BALCÃO À ENTREGA', 'NA CASA AGORA', 'ENTREGUES EM 12 MESES']) {
  corpo.toUpperCase().includes(i) ? ok(`indicador "${i}"`) : nao(`sem indicador "${i}"`)
}

// ---------------------------------------------------------------------------
console.log('\n2b) AS QUATRO PEÇAS DE ASSINATURA estão na tela')
// ---------------------------------------------------------------------------
/**
 * Term, BigNumber, Delta e Exec são o que dá a hierarquia desta tela: um número
 * de 56px ao lado de um rótulo de 10px em caixa alta. Quatro indicadores do
 * mesmo tamanho — o que havia antes — não têm hierarquia nenhuma: o olho varre
 * os quatro e não encontra a resposta.
 */
const termos = await p.locator('[class*="term"]').count()
termos >= 7
  ? ok(`${termos} cabeçalhos em Term (o herói + os seis blocos)`)
  : nao(`só ${termos} Term na tela — os títulos soltos voltaram?`)

// `strong[class*="big"]`, e não `[class*="big"]`: o segundo casaria também com
// `bigValor` e `bigSufixo`, que são filhos do herói — e a conferência de "um
// por tela", logo abaixo, acusaria três heróis onde há um.
const heroi = await p.locator('strong[class*="big"]').first().innerText().catch(() => '')
;/\d/.test(heroi)
  ? ok(`o número-herói existe e traz número: ${JSON.stringify(heroi.replace(/\n/g, ' '))}`)
  : nao('sem número-herói na tela')

// UM por tela. O segundo mata o primeiro: dois candidatos a "o mais
// importante" fazem o olho voltar a varrer tudo.
const quantosHerois = await p.locator('strong[class*="big"]').count()
quantosHerois === 1
  ? ok('e é o único — um número-herói por tela')
  : nao(`${quantosHerois} números-herói na mesma tela`)

/**
 * O DELTA DO ACÚMULO. A seta vem do sinal, mas a COR vem de quem chama:
 * acumular é ruim mesmo subindo. Se o tom fosse deduzido do sinal, "+13 na
 * fila" sairia verde — a pior notícia da tela, pintada de boa.
 */
const delta = p.locator('[class*="delta"]').first()
const textoDelta = await delta.innerText().catch(() => '')
;/[+−-]?\d/.test(textoDelta)
  ? ok(`o acúmulo virou Delta: ${JSON.stringify(textoDelta.replace(/\n/g, ' '))}`)
  : nao('sem o Delta do acúmulo')

// A janela é escrita aqui inteira porque `JANELA`, mais abaixo no arquivo,
// ainda não existe neste ponto — `const` não sobe.
const DOZE = `(date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '11 months') at time zone 'America/Sao_Paulo'`
const acumuloNoBanco = Number(sql(`
  select (select count(*) from ordens where "abertaEm" >= ${DOZE})
       - (select count(*) from ordens where "entregueEm" is not null
            and "entregueEm" >= ${DOZE})`))
const corDelta = await delta.evaluate((el) => getComputedStyle(el).color)
// Acúmulo positivo tem de vestir a cor de problema, não a de sucesso.
const ehVermelho = /rgb\(2[0-9][0-9]|rgb\(1[89][0-9]/.test(corDelta)
acumuloNoBanco > 0
  ? (ehVermelho ? ok(`acúmulo de +${acumuloNoBanco} veste a cor de problema`)
                : nao(`acúmulo de +${acumuloNoBanco} não está vermelho: ${corDelta}`))
  : ok(`acúmulo de ${acumuloNoBanco} — sem acúmulo para conferir a cor`)

const exec = await p.locator('[class*="exec"]').first().innerText().catch(() => '')
;/EXEC/i.test(exec)
  ? ok(`a ação em Exec: ${JSON.stringify(exec.replace(/\n/g, ' '))}`)
  : nao('sem o Exec no cartão-herói')

// Lixo de renderização. A busca é no texto ORIGINAL: "fiNANceiro" contém "nan".
const lixo = (await p.locator('body').innerText()).match(/\bundefined\b|\bNaN\b|\[object Object\]/)
lixo ? nao(`"${lixo[0]}" na tela`) : ok('nenhum lixo de renderização')

// ---------------------------------------------------------------------------
console.log('\n3) Os seis blocos estão na tela')
// ---------------------------------------------------------------------------
// Os cabeçalhos são `Term` — `● › NOME // ESTADO` — e não mais título solto.
const titulos = (await p.locator('[class*="term"]').allInnerTexts()).join(' | ').toUpperCase()
const BLOCOS = [
  'ENTROU E SAIU',
  'QUANTO TEMPO LEVA',
  'ONDE ESTÁ PARADO',
  'O QUE MAIS QUEBRA',
  'QUEM TRAZ O TRABALHO',
  'FATURADO E RECEBIDO',
]
for (const b of BLOCOS) {
  titulos.includes(b) ? ok(`bloco "${b}"`) : nao(`falta o bloco "${b}"`)
}

// Todo gráfico tem NOME acessível: quem usa leitor de tela ouve o resumo, e não
// "imagem".
const svgs = await p.locator('svg[role=img]').count()
const comNome = await p.locator('svg[role=img][aria-label]').count()
svgs > 0 && svgs === comNome
  ? ok(`os ${svgs} desenhos têm rótulo acessível`)
  : nao(`${svgs} desenhos, ${comNome} com rótulo`)

// ---------------------------------------------------------------------------
console.log('\n4) ENTROU × SAIU: a base bate com o banco, mês a mês')
// ---------------------------------------------------------------------------
/**
 * A base é conferida LINHA POR LINHA, e não pelo total.
 *
 * Um erro de fuso desloca uma ordem de um mês para o outro e deixa o total
 * intacto — é justamente o erro que este agrupamento pode cometer, e o único
 * que o total esconderia por completo.
 */
const JANELA = `(date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '11 months')`
const doBanco = psql(`
  select to_char(m,'YYYY-MM') || ':' ||
    (select count(*) from ordens o
      where date_trunc('month', o."abertaEm" at time zone 'America/Sao_Paulo') = m) || ':' ||
    (select count(*) from ordens o
      where o."entregueEm" is not null
        and date_trunc('month', o."entregueEm" at time zone 'America/Sao_Paulo') = m)
  from generate_series(${JANELA},
                       date_trunc('month', (now() at time zone 'America/Sao_Paulo')),
                       interval '1 month') m
  order by m`)

// A base do primeiro gráfico é o primeiro <details> da tela.
const base1 = p.locator('details[class*="baseNumeros"]').first()
await base1.locator('summary').click()
await p.waitForTimeout(300)
const linhas1 = await base1.locator('tbody tr').evaluateAll((trs) =>
  trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))

linhas1.length === doBanco.length
  ? ok(`a base tem ${linhas1.length} meses, como o banco`)
  : nao(`a base tem ${linhas1.length} meses e o banco tem ${doBanco.length}`)

let divergiu = null
doBanco.forEach((l, i) => {
  const [mes, abertas, entregues] = l.split(':')
  const linha = linhas1[i]
  if (!linha) { divergiu ??= `${mes}: sem linha na tela`; return }
  if (linha[1] !== abertas || linha[2] !== entregues) {
    divergiu ??= `${mes}: banco ${abertas}/${entregues}, tela ${linha[1]}/${linha[2]}`
  }
  // O saldo é conta feita na tela, e conta feita na tela é conta que pode errar.
  const saldo = Number(abertas) - Number(entregues)
  const esperado = `${saldo >= 0 ? '+' : ''}${saldo}`
  if (linha[3] !== esperado) divergiu ??= `${mes}: saldo deveria ser ${esperado} e é ${linha[3]}`
})
divergiu ? nao(`a base diverge do banco — ${divergiu}`) : ok('os 12 meses batem: abertas, entregues e saldo')

// E o indicador do topo é a soma da própria base — não outra consulta.
const somaAbertas = doBanco.reduce((s, l) => s + Number(l.split(':')[1]), 0)
// O número-herói substituiu o indicador "Abertas em 12 meses". O rótulo para
// leitor de tela viaja dentro dele, então a comparação tira os não-dígitos.
// Lê o ELEMENTO DO VALOR, e não o `strong` inteiro: o rótulo para leitor de
// tela vive lá dentro, e extrair "todos os dígitos" do conjunto colava o
// número do rótulo no do valor.
const valorTopo = (await p.locator('[class*="bigValor"]').first().innerText().catch(() => '')).trim()
valorTopo === String(somaAbertas)
  ? ok(`"Abertas em 12 meses" = ${somaAbertas}, a soma da base`)
  : nao(`o indicador diz ${valorTopo} e a base soma ${somaAbertas}`)

// ---------------------------------------------------------------------------
console.log('\n4b) QUANTO TEMPO LEVA: mês sem entrega não é mês de zero dia')
// ---------------------------------------------------------------------------
/**
 * O gráfico achatava os dois casos em zero, e o mês com dez entregas no mesmo
 * dia ficava idêntico aos onze meses vazios: uma grade inteira em branco. Só há
 * barra — e número em cima dela — no mês que teve entrega.
 */
const mesesComEntrega = Number(sql(`
  select count(*) from (
    select distinct date_trunc('month', "entregueEm" at time zone 'America/Sao_Paulo') as m
      from ordens
     where "entregueEm" is not null
       and "entregueEm" >= ${JANELA} at time zone 'America/Sao_Paulo') u`))
const svgPrazo = p.locator('[class*="bloco"]', { hasText: 'Quanto tempo leva' }).locator('svg')
const rotulosPrazo = await svgPrazo.locator('text[class*="grafValor"]').count().catch(() => 0)
const barrasPrazo = await svgPrazo.locator('rect').count().catch(() => 0)
if (mesesComEntrega === 0) {
  // Sem nenhuma entrega, o bloco tem de dizer isso por escrito — grade sem
  // barra nenhuma parece gráfico quebrado.
  const aviso = await p.locator('[class*="bloco"]', { hasText: 'Quanto tempo leva' })
    .locator('[class*="vazio"]').count()
  aviso > 0 ? ok('sem entregas, o bloco explica em vez de desenhar uma grade vazia')
            : nao('sem entregas, o bloco desenhou uma grade sem nenhuma barra')
} else {
  rotulosPrazo === mesesComEntrega && barrasPrazo === mesesComEntrega
    ? ok(`${mesesComEntrega} ${mesesComEntrega === 1 ? 'mês teve' : 'meses tiveram'} entrega, e só ${mesesComEntrega === 1 ? 'ele tem' : 'eles têm'} barra e número`)
    : nao(`${mesesComEntrega} meses com entrega, mas ${barrasPrazo} barras e ${rotulosPrazo} números`)
}

// ---------------------------------------------------------------------------
console.log('\n5) ONDE ESTÁ PARADO: as fatias somam o que está na casa')
// ---------------------------------------------------------------------------
// A esteira do "hoje" já mostra os degraus; o que este bloco acrescenta é a
// PROPORÇÃO. Uma proporção que não fecha em 100% é pior que proporção nenhuma.
const naCasa = sql(`select count(*) from ordens where etapa not in ('FINALIZADO','CANCELADO')`)
const barras = await p.locator('[class*="grafBarras"] [class*="grafBarraValor"]').allInnerTexts()
const somaBarras = barras.reduce((s, t) => s + Number(String(t).trim().split(/\s|·/)[0] || 0), 0)
String(somaBarras) === naCasa
  ? ok(`as etapas somam ${somaBarras}, igual às ${naCasa} ordens em aberto no banco`)
  : nao(`as barras somam ${somaBarras} e o banco tem ${naCasa} em aberto`)

// A BARRA PRECISA SER VISÍVEL. Ela nasceu sem a classe de cor: um bloco
// transparente dentro do trilho cinza, com a linha certa e o desenho invisível
// — e o desenho é a única parte que se lê de relance.
const pintura = await p.locator('[class*="grafBarras"] [class*="grafBarraPista"] > span')
  .first()
  .evaluate((el) => ({ fundo: getComputedStyle(el).backgroundColor, largura: el.style.width }))
  .catch(() => null)
const transparente = !pintura || /rgba\(0, 0, 0, 0\)|transparent/.test(pintura.fundo)
!transparente && parseFloat(pintura.largura) > 0
  ? ok(`as barras têm cor (${pintura.fundo}) e largura (${pintura.largura})`)
  : nao(`a barra está invisível: ${JSON.stringify(pintura)}`)

const naCasaTopo = await p.locator('[class*="indicador"]', { hasText: /Na casa agora/i })
  .locator('[class*="indValor"]').innerText().catch(() => '')
naCasaTopo.trim() === naCasa
  ? ok(`"Na casa agora" = ${naCasa}`)
  : nao(`"Na casa agora" diz ${naCasaTopo} e o banco diz ${naCasa}`)

// ---------------------------------------------------------------------------
console.log('\n6) O QUE MAIS QUEBRA e QUEM TRAZ: o topo da lista é o do banco')
// ---------------------------------------------------------------------------
const topoAparelho = sql(`
  select e.marca || ' ' || e.modelo || ':' || count(*)
    from ordens o join equipamentos e on e.id = o."equipamentoId"
   where o."abertaEm" >= now() - interval '365 days'
   group by e.marca, e.modelo order by count(*) desc, e.marca asc limit 1`)
const [apNome, apN] = topoAparelho.split(':')
const linhaAp = await p.locator('[class*="bloco"]', { hasText: 'O que mais quebra' })
  .locator('tbody tr').first().innerText().catch(() => '')
const textoAp = linhaAp.replace(/\s+/g, ' ').trim()
textoAp.startsWith(apNome) && textoAp.includes(apN)
  ? ok(`o aparelho que mais quebra é ${apNome} (${apN} O.S.), como no banco`)
  : nao(`o banco diz "${apNome}" com ${apN} e a tela diz "${textoAp}"`)

const topoCliente = sql(`
  select c.nome || ':' || count(distinct o.id)
    from ordens o join clientes c on c.id = o."clienteId"
   where o."abertaEm" >= now() - interval '365 days'
   group by c.id, c.nome order by count(distinct o.id) desc, c.nome asc limit 1`)
const [clNome, clN] = topoCliente.split(':')
const linhaCl = await p.locator('[class*="bloco"]', { hasText: 'Quem traz o trabalho' })
  .locator('tbody tr').first().innerText().catch(() => '')
const textoCl = linhaCl.replace(/\s+/g, ' ').trim()
textoCl.startsWith(clNome) && textoCl.includes(clN)
  ? ok(`quem mais traz é ${clNome} (${clN} O.S.), como no banco`)
  : nao(`o banco diz "${clNome}" com ${clN} e a tela diz "${textoCl}"`)

// O nome do cliente é LINK: quem vê o número quer ver a ficha, e não procurá-la.
const linkCliente = await p.locator('[class*="bloco"]', { hasText: 'Quem traz o trabalho' })
  .locator('tbody a[href^="/painel/clientes/"]').count()
linkCliente > 0
  ? ok('os clientes da lista levam à ficha')
  : nao('os nomes da lista não são links')

// ---------------------------------------------------------------------------
console.log('\n7) O DINHEIRO: faturado × recebido bate com o banco')
// ---------------------------------------------------------------------------
const dinBanco = psql(`
  select to_char(m,'YYYY-MM') || ':' ||
    (select coalesce(sum(f."valorTotalCentavos"),0) from faturas f
      where date_trunc('month', f."emitidaEm" at time zone 'America/Sao_Paulo') = m) || ':' ||
    (select coalesce(sum(g."valorCentavos"),0) from pagamentos g
      where g."estornadoEm" is null
        and date_trunc('month', g."recebidoEm" at time zone 'America/Sao_Paulo') = m)
  from generate_series(${JANELA},
                       date_trunc('month', (now() at time zone 'America/Sao_Paulo')),
                       interval '1 month') m
  order by m`)

const baseDin = p.locator('details[class*="baseNumeros"]').last()
await baseDin.locator('summary').click()
await p.waitForTimeout(300)
const linhasDin = await baseDin.locator('tbody tr').evaluateAll((trs) =>
  trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())))

const brl = (centavos) =>
  (Number(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
let divDin = null
dinBanco.forEach((l, i) => {
  const [mes, fat, rec] = l.split(':')
  const linha = linhasDin[i]
  if (!linha) { divDin ??= `${mes}: sem linha`; return }
  // O formato do sistema tem "R$" e espaço; a comparação é pelo NÚMERO.
  const soNum = (t) => t.replace(/[^\d,.-]/g, '')
  if (soNum(linha[1]) !== brl(fat) || soNum(linha[2]) !== brl(rec)) {
    divDin ??= `${mes}: banco ${brl(fat)}/${brl(rec)}, tela ${soNum(linha[1])}/${soNum(linha[2])}`
  }
  // A DIFERENÇA é o buraco do caixa — o número pelo qual o bloco existe.
  if (soNum(linha[3]) !== brl(Number(fat) - Number(rec))) {
    divDin ??= `${mes}: a diferença deveria ser ${brl(Number(fat) - Number(rec))} e é ${soNum(linha[3])}`
  }
})
divDin ? nao(`o dinheiro diverge do banco — ${divDin}`) : ok('faturado, recebido e a diferença batem nos 12 meses')

// ---------------------------------------------------------------------------
console.log('\n8) O MOTORISTA não vê dinheiro em NENHUMA das duas abas')
// ---------------------------------------------------------------------------
/**
 * A aba "Hoje" mostrava "A receber R$ 23.335,00" para todo mundo — era a única
 * tela do sistema em que a trava faltava, e logo a primeira que qualquer pessoa
 * abre ao entrar. O corte agora é na consulta das duas abas.
 */
const m = await entrar('adriano@dtechmed.com.br')
for (const [nomeAba, url] of [['Hoje', '/painel'], ['Operação', '/painel?ver=operacao']]) {
  await m.goto(`${QA_BASE}${url}`, { waitUntil: 'networkidle' })
  const t = await m.locator('body').innerText()
  ;/R\$\s?\d/.test(t)
    ? nao(`${nomeAba}: vazou valor em reais para o motorista`)
    : ok(`${nomeAba}: nenhum valor em reais para o motorista`)
}

/**
 * E o corte é de VERDADE.
 *
 * Esconder o cartão no CSS deixaria o número dentro do HTML, onde qualquer um
 * lê no inspetor — e é exatamente a diferença entre "não mostrar" e "não
 * mandar". O valor procurado vem do BANCO, e não escrito à mão: um número fixo
 * no roteiro pararia de significar alguma coisa no dia em que o cenário
 * mudasse, e passaria a verde para sempre.
 */
const aReceberCentavos = sql(`
  select coalesce(sum("valorTotalCentavos" - "valorPagoCentavos")
                  filter (where status in ('ABERTA','PARCIAL')), 0) from faturas`)
const recebidoNoMes = sql(`
  select coalesce(sum("valorPagoCentavos")
                  filter (where "quitadaEm" >= date_trunc('month', now())), 0) from faturas`)
const fonte = await m.evaluate(async (base) => {
  const r = await fetch(`${base}/painel`, { credentials: 'include' })
  return r.text()
}, QA_BASE)
const marcas = [aReceberCentavos, recebidoNoMes]
  .filter((c) => Number(c) > 0)
  .flatMap((c) => [String(c), (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })])
const vazou = marcas.find((v) => fonte.includes(v))
if (marcas.length === 0) {
  nao('NÃO VERIFICADO: o cenário não tem fatura em aberto nem recebimento no mês')
} else {
  vazou
    ? nao(`o valor do dinheiro chegou ao HTML do motorista: "${vazou}"`)
    : ok(`nenhum dos ${marcas.length} valores do dinheiro aparece no HTML do motorista`)
}

// A coluna de faturamento por cliente também some — e a tabela continua de pé.
await m.goto(`${QA_BASE}/painel?ver=operacao`, { waitUntil: 'networkidle' })
const cabecalhos = (await m.locator('[class*="bloco"]', { hasText: 'Quem traz o trabalho' })
  .locator('thead th').allInnerTexts()).map((t) => t.trim().toUpperCase())
!cabecalhos.includes('FATURADO') && cabecalhos.length === 2
  ? ok('para o motorista, "Quem traz o trabalho" tem duas colunas e nenhuma é dinheiro')
  : nao(`colunas erradas para o motorista: ${cabecalhos.join(' / ')}`)

// A grade dos indicadores não fica com um buraco onde estava o cartão do
// dinheiro: três cartões, três colunas.
const cartoes = await m.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
  .then(() => m.locator('[class*="resumo"] > [class*="indicador"]').count())
const colunas = await m.locator('[class*="resumo"]').first()
  .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
cartoes === 3 && colunas === 3
  ? ok('sem o cartão do dinheiro, a grade vira de três — sem buraco')
  : nao(`${cartoes} cartões em ${colunas} colunas`)

// ---------------------------------------------------------------------------
console.log('\n9) Os dois temas, em 1440 e 390')
// ---------------------------------------------------------------------------
// Doze barras num SVG de largura fixa é exatamente o tipo de bloco que empurra
// a página para o lado no celular.
for (const tema of ['escuro', 'claro']) {
  await p.evaluate((x) => { document.cookie = `dtechmed_tema=${x}; path=/; max-age=31536000` }, tema)
  for (const larg of [1440, 390]) {
    await p.setViewportSize({ width: larg, height: 900 })
    for (const url of ['/painel', '/painel?ver=operacao']) {
      await p.goto(`${QA_BASE}${url}`, { waitUntil: 'networkidle' })
      await p.waitForTimeout(400)
      const rola = await p.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      if (rola) nao(`${url} em ${tema}/${larg}px: rola de lado`)
    }
  }
  ok(`${tema}: as duas abas cabem em 1440 e 390`)
}

await p.setViewportSize({ width: 1500, height: 1100 })
await p.goto(`${QA_BASE}/painel?ver=operacao`, { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.screenshot({ path: '/tmp/dashboard-operacao.png', fullPage: true })

console.log(`\nERROS DE TELA: ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)
if (erros.length > 0) ruins += erros.length
await nav.close()
console.log(ruins === 0 ? '\n✅ dashboard: a operação em gráficos, com as bases conferidas\n' : `\n🔴 ${ruins} problema(s)\n`)
process.exit(ruins === 0 ? 0 : 1)
