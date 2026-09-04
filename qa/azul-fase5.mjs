// =============================================================================
// AZUL MÁQUINA · FASE 5 — a esteira diz volume, idade e gargalo
// =============================================================================
// A esteira é o órgão vital deste sistema, e até esta passada ela dizia uma
// coisa só: quantos. As duas perguntas que fazem alguém sair da cadeira são "há
// quanto tempo" e "onde está represando", e nenhuma das duas saía dali.
//
// O que cada conferência guarda, e por que ela existe:
//
//   1. A RAMPA NÃO TEM VERDE, ÂMBAR NEM TEAL. É a conferência mais importante
//      do arquivo. A rampa codifica PROXIMIDADE DA ENTREGA, e as três cores
//      proibidas significam outra coisa neste sistema: verde e âmbar são
//      ESTADO, teal é INFERÊNCIA DA MÁQUINA. A esteira era violeta→verde, e o
//      efeito era ela disputar o olho com o alerta — a única coisa na tela que
//      precisa ser vista de longe.
//
//      O teste é o canal AZUL ser o maior dos três em cada número. Não é
//      esperteza: a rampa inteira, nos dois temas, tem azul dominante por
//      construção (#2A4A92 a #0E80AA no claro, #4B78E2 a #52C9F4 no escuro),
//      enquanto verde, âmbar e teal têm verde ou vermelho na frente. Uma regra
//      só, sem lista de cores para manter em dia.
//
//   2. O GARGALO É O DEGRAU CERTO. Comparado contra a média que o BANCO
//      calcula, não contra a que a tela mostra — senão a conferência só provaria
//      que a tela concorda consigo mesma.
//
//   3. NO MÁXIMO UM. Dois gargalos não é um aviso mais forte, é nenhum: o olho
//      não escolhe entre dois "olhe aqui".
//
//   4. O SELO NÃO É TEAL. A direção pedia `⌁ Gargalo`, e o `⌁` teal é a
//      assinatura de inferência da máquina neste sistema. O gargalo é um
//      `max()` sobre uma média — aritmética, sem confiança e sem fonte para
//      clicar, que são as duas obrigações de toda saída de IA aqui. Vesti-lo de
//      teal ensinaria a ler teal como "calculado" e gastaria a tinta antes de
//      as funções de IA de verdade chegarem.
//
//   5. O MOTORISTA NÃO VÊ DINHEIRO NA ESTEIRA. O corte é na consulta, e a prova
//      é dupla: nada de "R$" na tela dele, E o valor não vem no HTML — que é
//      onde um corte feito só na renderização vazaria.
//
//   6. A BARRA É PROPORCIONAL, e as oito ficam na MESMA LINHA. A régua só
//      compara se todas partirem da mesma altura; com a barra logo abaixo de
//      uma meta de altura variável, cada degrau punha a dele num lugar.
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

// Os degraus, na ordem da jornada, e as etapas que cada um reúne. É a mesma
// lista de `src/server/consultas/painel.ts`; repetida aqui de propósito, porque
// uma conferência que importa a definição que ela deveria conferir não confere
// nada — ela concorda.
const DEGRAUS = [
  ['A retirar', ['ORDEM_RETIRADA_GERADA', 'RETIRADA_AGENDADA']],
  ['Em rota', ['EM_ROTA_RETIRADA']],
  ['Dar entrada', ['COLETADO']],
  ['Em análise', ['RECEBIDO_NA_EMPRESA', 'EM_ANALISE']],
  ['Orçamento parado', ['ORCAMENTO_INTERNO', 'ORCAMENTO_ENVIADO']],
  ['Em manutenção', ['ORCAMENTO_APROVADO', 'EM_MANUTENCAO']],
  ['A faturar', ['MANUTENCAO_CONCLUIDA', 'APROVACAO_GESTAO', 'FATURAMENTO']],
  ['A entregar', ['FATURADO', 'EM_ROTA_ENTREGA']],
]

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
  return { p, ctx }
}

/** O que a tela mostra em cada degrau, já separado por peça. */
const lerEsteira = (p) =>
  p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Etapas da esteira"]')
    if (!nav) return null
    const cor = (el) => {
      const m = getComputedStyle(el).color.match(/\d+/g)
      return m ? m.slice(0, 3).map(Number) : null
    }
    return [...nav.children].map((a) => {
      const num = a.querySelector('[class*="degrauNum"]')
      const selo = a.querySelector('[class*="degrauSelo"]')
      const barra = a.querySelector('[class*="degrauBarra"] i')
      const classe = String(a.className)
      return {
        rotulo: a.querySelector('[class*="degrauRot"]')?.innerText ?? '',
        numero: Number(num?.innerText ?? '0'),
        corDoNumero: num ? cor(num) : null,
        meta: a.querySelector('[class*="degrauMeta"]')?.innerText ?? '',
        temSelo: !!selo,
        textoDoSelo: selo?.innerText ?? '',
        corDoSelo: selo ? cor(selo) : null,
        larguraDaBarra: barra ? parseFloat(getComputedStyle(barra).width) : null,
        topoDaBarra: barra
          ? Math.round(barra.getBoundingClientRect().top - nav.getBoundingClientRect().top)
          : null,
        ativo: /degrauAtivo/.test(classe),
        grita: /degrauGrita/.test(classe),
      }
    })
  })

// ---------------------------------------------------------------------------
// O ROTEIRO ENVELHECE AS PRÓPRIAS ORDENS — e devolve tudo no fim.
// ---------------------------------------------------------------------------
// O cenário da bateria monta as ordens na hora, então todas nascem com zero
// dia de represa e NENHUM degrau passa o piso de um dia. Rodando assim, o
// roteiro só provaria que o piso segura — e a cor do selo, que é a conferência
// que eu mais quero trancada, nunca seria lida porque o selo nunca apareceria.
//
// Então ele cria a condição: guarda o `atualizadoEm` das ordens de um degrau,
// empurra para trás, confere, e devolve os valores originais no `finally`. Sem
// a devolução, os roteiros que rodam depois herdariam duas ordens "atrasadas
// há nove dias" que ninguém atrasou — e reprovariam acusando o produto.
const ETAPAS_ALVO = "('ORCAMENTO_INTERNO','ORCAMENTO_ENVIADO')"
const original = sql(
  `SELECT id, "atualizadoEm" FROM ordens WHERE etapa IN ${ETAPAS_ALVO}`,
).map((l) => l.split('|'))

if (original.length === 0) {
  console.log('  · nenhuma ordem em "Orçamento parado" para envelhecer; o gargalo será conferido com o que houver')
} else {
  sql(`UPDATE ordens SET "atualizadoEm" = now() - interval '9 days' WHERE etapa IN ${ETAPAS_ALVO}`)
}

const devolver = () => {
  if (original.length === 0) return
  const valores = original.map(([id, at]) => `('${id}', '${at}'::timestamptz)`).join(',')
  sql(`UPDATE ordens o SET "atualizadoEm" = v.at FROM (VALUES ${valores}) AS v(id, at) WHERE o.id = v.id`)
}

process.on('exit', devolver)

const { p } = await entrar('lucas@dtechmed.com.br')
await p.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const tela = await lerEsteira(p)
if (!tela) { nao('não achei a esteira'); await nav.close(); process.exit(1) }

// ---------------------------------------------------------------------------
console.log('\n1) A RAMPA é cobalto→azul-céu: nada de verde, âmbar ou teal')
// ---------------------------------------------------------------------------
// Fora da regra ficam três, e cada exclusão tem motivo:
//   · o degrau ABERTO é chapado de cobalto e escreve em branco;
//   · o degrau que GRITA volta ao vermelho — alerta manda mais que posição;
//   · o degrau em ZERO recua para o cinza, que também é azul-dominante e
//     passaria de qualquer jeito, mas fica de fora para a regra falar só da
//     rampa.
const foraDaRampa = []
for (const d of tela) {
  if (d.ativo || d.grita || d.numero === 0) continue
  const [r, g, b] = d.corDoNumero ?? [0, 0, 0]
  if (!(b > g && b > r)) foraDaRampa.push(`${d.rotulo}: rgb(${r},${g},${b})`)
}
foraDaRampa.length === 0
  ? ok(`os ${tela.filter((d) => !d.ativo && !d.grita && d.numero > 0).length} degraus da rampa saem em azul dominante`)
  : nao(`degrau fora da rampa (verde, âmbar ou teal): ${foraDaRampa.join(' · ')}`)

// E o trilho, que é a rampa desenhada de uma vez só.
const trilho = await p.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Etapas da esteira"]')
  const c = getComputedStyle(nav, '::before')
  return { fundo: c.backgroundImage, z: c.zIndex, topo: c.top }
})
const coresDoTrilho = [...trilho.fundo.matchAll(/rgba?\(([^)]+)\)/g)]
  .map((m) => m[1].split(',').map((n) => parseFloat(n)))
  .filter((c) => c[0] + c[1] + c[2] > 0)
const trilhoAzul = coresDoTrilho.length > 0 && coresDoTrilho.every(([r, g, b]) => b > g && b > r)
trilhoAzul
  ? ok(`o trilho carrega a rampa inteira em ${coresDoTrilho.length} paradas, todas azuis`)
  : nao(`o trilho tem cor fora da rampa: ${trilho.fundo.slice(0, 90)}`)

// ---------------------------------------------------------------------------
console.log('\n2) O GARGALO é o degrau de maior represa — conferido contra o banco')
// ---------------------------------------------------------------------------
// A média que o banco calcula, por degrau, ponderada pela contagem — a mesma
// conta que a consulta faz, escrita do lado de cá.
const porEtapa = new Map(
  sql(`SELECT etapa, count(*), coalesce(avg(extract(epoch from (now()-"atualizadoEm"))/86400),0)
         FROM ordens
        WHERE etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO','SOLICITACAO_RECEBIDA')
        GROUP BY etapa`).map((l) => {
    const [etapa, n, media] = l.split('|')
    return [etapa, { n: Number(n), media: Number(media) }]
  }),
)
const doBanco = DEGRAUS.map(([rotulo, etapas]) => {
  let n = 0
  let soma = 0
  for (const e of etapas) {
    const l = porEtapa.get(e)
    if (!l) continue
    n += l.n
    soma += l.media * l.n
  }
  return { rotulo, n, media: n > 0 ? soma / n : null }
})
// A eleição, com os mesmos dois freios da consulta: piso de um dia, e empate
// para o degrau mais a montante.
let esperado = null
for (const d of doBanco) {
  if (d.n === 0 || d.media == null || d.media < 1) continue
  if (!esperado || d.media > esperado.media) esperado = d
}
const naTela = tela.find((d) => d.temSelo) ?? null

if (esperado && naTela) {
  esperado.rotulo.toUpperCase() === naTela.rotulo.toUpperCase()
    ? ok(`o gargalo é "${naTela.rotulo}", com ${esperado.media.toFixed(1)} dias de represa — o maior do banco`)
    : nao(`gargalo errado: a tela diz "${naTela.rotulo}", o banco diz "${esperado.rotulo}" (${esperado.media.toFixed(1)}d)`)
} else if (!esperado && !naTela) {
  ok('nenhum degrau passa de um dia de represa, e nenhum selo foi apontado — o piso segura')
} else if (esperado && !naTela) {
  nao(`o banco tem gargalo em "${esperado.rotulo}" (${esperado.media.toFixed(1)}d) e a tela não aponta nenhum`)
} else {
  nao(`a tela aponta "${naTela.rotulo}" como gargalo, e no banco nada passa de um dia`)
}

// ---------------------------------------------------------------------------
console.log('\n3) NO MÁXIMO UM gargalo — dois avisos é nenhum aviso')
// ---------------------------------------------------------------------------
const selos = tela.filter((d) => d.temSelo).length
selos <= 1
  ? ok(`a esteira aponta ${selos} gargalo`)
  : nao(`${selos} degraus marcados como gargalo ao mesmo tempo`)

// ---------------------------------------------------------------------------
console.log('\n4) O SELO NÃO É TEAL — a tinta de IA fica reservada')
// ---------------------------------------------------------------------------
if (!naTela) {
  console.log('  · sem gargalo na tela agora; a cor do selo não pôde ser lida — NÃO TESTADO')
} else {
  const [r, g, b] = naTela.corDoSelo ?? [0, 0, 0]
  // Teal é verde-água: verde à frente do vermelho e do azul não muito atrás.
  // Âmbar é o contrário — vermelho na frente. A regra separa os dois sem
  // depender do valor exato do token.
  const teal = g > r && g >= b
  !teal
    ? ok(`o selo sai em rgb(${r},${g},${b}) — âmbar, não teal`)
    : nao(`o selo do gargalo está em teal, rgb(${r},${g},${b}) — teal é tinta exclusiva de IA`)
  // O `;` na frente não é enfeite: linha que começa com `/` continua a
  // anterior como DIVISÃO, e o arquivo deixa de compilar.
  ;/\bGARGALO\b/i.test(naTela.textoDoSelo)
    ? ok(`o selo diz "${naTela.textoDoSelo}"`)
    : nao(`o selo não nomeia o gargalo: "${naTela.textoDoSelo}"`)
}

// ---------------------------------------------------------------------------
console.log('\n5) A BARRA é proporcional, e as oito ficam na MESMA LINHA')
// ---------------------------------------------------------------------------
const maior = Math.max(...tela.map((d) => d.numero))
const desproporcional = []
if (maior > 0) {
  const larguraDoMaior = tela.find((d) => d.numero === maior)?.larguraDaBarra ?? 0
  for (const d of tela) {
    if (d.numero === 0) continue
    const esperadaP = d.numero / maior
    const real = larguraDoMaior > 0 ? (d.larguraDaBarra ?? 0) / larguraDoMaior : 0
    if (Math.abs(real - esperadaP) > 0.04) {
      desproporcional.push(`${d.rotulo}: ${d.numero}/${maior} devia dar ${(esperadaP * 100).toFixed(0)}%, deu ${(real * 100).toFixed(0)}%`)
    }
  }
}
desproporcional.length === 0
  ? ok('cada barra é a fração do maior degrau')
  : nao(`barra fora de proporção: ${desproporcional.join(' · ')}`)

const topos = [...new Set(tela.map((d) => d.topoDaBarra))]
topos.length === 1
  ? ok(`as oito barras pousam na mesma altura (${topos[0]}px) — a régua fecha`)
  : nao(`as barras estão em ${topos.length} alturas diferentes: ${topos.join(', ')}px`)

// ---------------------------------------------------------------------------
console.log('\n6) O MOTORISTA não vê dinheiro na esteira — e ele nem chega ao HTML')
// ---------------------------------------------------------------------------
const { p: pm } = await entrar('adriano@dtechmed.com.br')
await pm.goto(`${QA_BASE}/painel`, { waitUntil: 'networkidle' })
const doMotorista = await lerEsteira(pm)
if (!doMotorista) {
  nao('o motorista não enxerga a esteira')
} else {
  const comDinheiro = doMotorista.filter((d) => /R\$/.test(d.meta))
  comDinheiro.length === 0
    ? ok('nenhum degrau mostra valor para o motorista')
    : nao(`o motorista vê dinheiro na esteira: ${comDinheiro.map((d) => `${d.rotulo} "${d.meta}"`).join(' · ')}`)

  // A metade que importa: o corte é na CONSULTA. Se ele fosse só na tela, o
  // valor viajaria no HTML e qualquer um leria no inspetor.
  const html = await pm.content()
  const valores = tela.map((d) => d.meta).filter((m) => /R\$/.test(m))
  const vazando = valores.filter((v) => html.includes(v.match(/R\$[^·]*/)[0].trim()))
  vazando.length === 0
    ? ok('nenhum dos valores do administrador aparece no HTML do motorista')
    : nao(`valor vazou no HTML do motorista: ${vazando.join(' · ')}`)
}

// E o administrador continua vendo — senão o teste acima passaria com a
// funcionalidade quebrada para todo mundo.
const adminVeDinheiro = tela.some((d) => /R\$/.test(d.meta))
adminVeDinheiro
  ? ok('o administrador continua vendo o valor represado')
  : nao('ninguém vê dinheiro na esteira — o corte pegou quem podia ver também')

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ FASE 5 INTEIRA VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
