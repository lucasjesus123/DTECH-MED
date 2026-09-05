// =============================================================================
// DÁ PARA ENXERGAR, E DÁ PARA CLICAR
// =============================================================================
// Este roteiro nasceu de três reclamações do dono do sistema, no mesmo dia, e
// as três eram sobre a mesma coisa: a tela não respondia ao olho nem ao dedo.
//
//   "O MEU SISTEMA NOVO ESTÁ TUDO ESCURO PARECE APAGADO"
//   "AO CLICAR EM CIMA DA DATA ABRA JÁ PARA EU PODER CRIAR ALGO EM CIMA"
//   "NA SEMANA DEIXA ELA MELHOR E MAIOR"
//
// Nenhuma das três dava erro em lugar nenhum. Nenhuma apareceria em `tsc`, em
// `eslint`, num teste unitário ou num roteiro que confere "o elemento existe?"
// — os elementos existiam, com os textos certos, nos lugares certos. O que
// faltava era CONTRASTE, ALVO e ESPAÇO, e essas três coisas só se conferem
// medindo o que o navegador realmente desenhou.
//
// O que cada conferência guarda:
//
//   1. O CAMPO TEM ARESTA, NOS DOIS TEMAS. A borda era #E0E5F1 sobre um campo
//      #E9EDF7: 1,07:1, existia no código e não no olho. No escuro, 1,34:1. A
//      WCAG pede 3:1 para a borda que identifica um componente, e é isso que se
//      mede aqui — contra o preenchimento do PRÓPRIO campo, que é o vizinho
//      que decide se a aresta aparece.
//
//   2. O RÓTULO TEM TINTA. Dez pixels em caixa alta no cinza mais fraco da
//      escala. Caixa alta já tira a silhueta da palavra, que é por onde se lê
//      rápido; no cinza fraco vira tarja.
//
//   3. O DIA INTEIRO É CLICÁVEL. O alvo era o número no canto: catorze pixels
//      num quadrado de noventa e dois. Esta conferência clica de propósito
//      LONGE do número — no rodapé da célula — que é onde o dedo cai.
//
//   4. E A PÁGINA VAI ATÉ O FORMULÁRIO. No mês são seis fileiras de grade na
//      frente: o formulário nascia fora da tela, a pessoa clicava, a página
//      recarregava igual, e a conclusão é "não abriu nada". Na semana, com uma
//      fileira só, sempre funcionou — foi por isso que o defeito passou.
//
//   5. A SEMANA É ALTA — E NÃO INFINITA. `max-height` e `overflow` no `<td>`
//      são IGNORADOS pelo navegador: a altura de uma célula é decidida pela
//      linha. A regra de rolagem existia e nunca rolou nada; um dia com 64
//      eventos levava a semana a 1638px. Aqui se mede o `<td>` E o corpo que
//      rola dentro dele, porque conferir só um dos dois deixa passar.
// =============================================================================
import pw from '/opt/node22/lib/node_modules/playwright/index.js'
const { chromium } = pw
const QA_BASE = process.env.QA_BASE || 'http://127.0.0.1:3111'
const SENHA = process.env.QA_SENHA || 'Dtech' + '@2026'

let ruins = 0
const ok = (t) => console.log(`  ✅ ${t}`)
const nao = (t) => { console.log(`  🔴 ${t}`); ruins++ }

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const erros = []
async function entrar(tema) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } })
  await ctx.addCookies([{ name: 'dtechmed_tema', value: tema, url: QA_BASE }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { if (!/DeprecationWarning|\(node:\d+\)/.test(String(e))) erros.push(String(e)) })
  await p.goto(`${QA_BASE}/entrar`, { waitUntil: 'networkidle' })
  await p.fill('#email', 'lucas@dtechmed.com.br')
  await p.fill('#senha', SENHA)
  await p.getByRole('button', { name: /entrar/i }).click()
  await p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20000 })
  return p
}

/** Contraste WCAG entre duas cores `rgb(...)`. */
const contraste = (a, b) => {
  const lum = (cor) => {
    const m = String(cor).match(/[\d.]+/g)
    if (!m) return null
    const [r, g, bb] = m.slice(0, 3).map(Number)
    const c = [r, g, bb].map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const la = lum(a)
  const lb = lum(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---------------------------------------------------------------------------
console.log('\n1) O CAMPO TEM ARESTA, e o rótulo tem tinta — nos dois temas')
// ---------------------------------------------------------------------------
// Três telas de formulário diferentes, para que a conferência valha para o
// SISTEMA e não para a tela que reclamaram. Os tokens são os mesmos; se um dia
// alguém sobrescrever o campo numa tela só, é aqui que aparece.
// `/painel/clientes/novo` NÃO EXISTE — o cadastro de cliente não tem rota
// própria. Eu escrevi o endereço de cabeça e a conferência acusou "não achei
// campo", que é o comportamento certo dela e o errado meu: rota inventada num
// roteiro vira um vermelho que faz procurar defeito onde não há.
// `&marcar=1` no calendário: o formulário do dia mora numa JANELA agora, e ela
// só abre a pedido. Sem o parâmetro não há campo nenhum naquela tela para
// medir — e a conferência acusava ausência de campo como se fosse defeito de
// contraste.
const TELAS = [
  '/painel/ordens/nova',
  '/painel/calendario?ver=dia&marcar=1',
  '/painel/clientes',
]

for (const tema of ['claro', 'escuro']) {
  const p = await entrar(tema)
  for (const tela of TELAS) {
    await p.goto(`${QA_BASE}${tela}`, { waitUntil: 'networkidle' })
    const m = await p.evaluate(() => {
      // Pelo `.campo`, e não pelo tipo do input: é o TOKEN que está sendo
      // conferido, e ele veste texto, busca, telefone, data e área de texto.
      // Listar tipos deixou `/painel/clientes` de fora, que usa `type="search"`.
      const inp = document.querySelector('[class*="campo"], [class*="area"]')
      const lab = document.querySelector('label[class*="rotulo"]')
      if (!inp) return null
      const si = getComputedStyle(inp)
      /**
       * O FUNDO DE VERDADE ATRÁS DE UM ELEMENTO — subindo até achar tinta.
       *
       * A primeira versão pegava `closest('div, form, label')`. Como o `<input>`
       * mora DENTRO do `<label>`, quem respondia era o próprio rótulo, cujo
       * fundo é transparente — e transparente, lido como `rgba(0,0,0,0)`, vira
       * PRETO na conta de contraste. No tema escuro isso passava por sorte
       * (texto claro sobre "preto" dá contraste alto) e no claro reprovava um
       * rótulo que na tela lê a 7,4:1. Conferência que erra dos dois lados é
       * pior que conferência nenhuma: ela ensina a ignorar o vermelho.
       */
      const fundoReal = (el) => {
        for (let e = el; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor
          if (c && !/rgba\([^)]*,\s*0\)/.test(c) && c !== 'transparent') return c
        }
        return getComputedStyle(document.body).backgroundColor
      }
      return {
        fundo: si.backgroundColor,
        borda: si.borderColor,
        larguraBorda: si.borderWidth,
        rotulo: lab ? getComputedStyle(lab).color : null,
        rotuloTam: lab ? parseFloat(getComputedStyle(lab).fontSize) : null,
        atras: lab ? fundoReal(lab) : null,
      }
    })
    if (!m) { nao(`${tema} · ${tela}: não achei campo nenhum para medir`); continue }

    const c = contraste(m.borda, m.fundo)
    c !== null && c >= 3
      ? ok(`${tema} · ${tela.split('/').pop()}: borda ${c.toFixed(2)}:1 contra o campo`)
      : nao(`${tema} · ${tela}: borda de ${c?.toFixed(2) ?? '?'}:1 — o campo não tem aresta`)

    // O rótulo é texto pequeno: o piso de texto é 4,5:1.
    const cr = contraste(m.rotulo, m.atras)
    cr !== null && cr >= 4.5
      ? ok(`${tema} · o rótulo lê a ${cr.toFixed(1)}:1, em ${m.rotuloTam}px`)
      : nao(`${tema} · rótulo a ${cr?.toFixed(1) ?? '?'}:1 em ${m.rotuloTam}px — apagado`)
  }
  await p.context().close()
}

// ---------------------------------------------------------------------------
console.log('\n2) CLICAR NO DIA — no corpo da célula, longe do número')
// ---------------------------------------------------------------------------
const p = await entrar('claro')
await p.goto(`${QA_BASE}/painel/calendario?ver=mes`, { waitUntil: 'networkidle' })

const celula = p.locator('td[class*="calDia"]').nth(15)
const cx = await celula.boundingBox()
// 12px acima do rodapé da célula: o ponto mais distante possível do número, e
// o lugar onde o dedo cai quando alguém "clica no dia".
await p.mouse.click(cx.x + cx.width / 2, cx.y + cx.height - 12)
await p.waitForTimeout(1200)

/**
 * O QUE SE CONFERE MUDOU JUNTO COM O DESENHO — e as duas versões desta
 * conferência contam a história.
 *
 * Antes o formulário era um painel EMBAIXO da grade, e o que provava que ele
 * tinha aberto era a página ter ROLADO até ele (`window.scrollY > 200`). Agora
 * ele é uma JANELA no meio da tela: a página não rola, e rolagem zero deixou de
 * ser sintoma de "não abriu" para virar o comportamento correto.
 *
 * O que prova a abertura agora é a janela existir, estar CENTRADA e DENTRO da
 * tela — que é o que ela promete e o que o painel antigo não conseguia dar.
 */
const depois = await p.evaluate(() => {
  const j = document.querySelector('[role="dialog"][class*="janela"]')
  const r = j?.getBoundingClientRect()
  return {
    url: location.href,
    form: !!j && !!document.querySelector('input[name=titulo]'),
    titulo: j?.querySelector('[class*="janelaTitulo"]')?.textContent ?? null,
    marcados: document.querySelectorAll('[class*="calDiaEscolhido"]').length,
    centrada: r ? Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) < 4 : false,
    naTela: r ? r.top >= 0 && r.bottom <= window.innerHeight + 1 : false,
    fecharPara: j?.querySelector('[class*="janelaX"]')?.getAttribute('href') ?? null,
  }
})

// O `;` da frente: `}))` seguido de `/` vira DIVISÃO sem ele.
;/\bdia=\d{4}-\d{2}-\d{2}/.test(depois.url)
  ? ok('clicar no corpo da célula escolhe o dia')
  : nao(`clicar no corpo da célula não fez nada — a URL ficou ${depois.url}`)

depois.form && /\d/.test(depois.titulo ?? '')
  ? ok(`a janela abre no dia certo: "${depois.titulo}"`)
  : nao(`a janela de marcar não abriu (título lido: ${depois.titulo})`)

depois.centrada && depois.naTela
  ? ok('ela nasce centrada e inteira dentro da tela')
  : nao(`a janela abriu fora de lugar (centrada=${depois.centrada}, na tela=${depois.naTela})`)

// FECHAR NÃO PODE PERDER O LUGAR. O "Fechar" antigo montava `?mes=` por conta
// própria e levava para o MÊS: quem estava na semana do mês que vem, com o
// filtro em "Preventiva", perdia os dois de uma vez.
depois.fecharPara && !/marcar=1/.test(depois.fecharPara) && /ver=mes/.test(depois.fecharPara)
  ? ok(`fechar volta ao mesmo lugar: ${depois.fecharPara}`)
  : nao(`o fechar da janela vai para um lugar estranho: ${depois.fecharPara}`)

depois.marcados === 1
  ? ok('a grade marca qual dia está com a janela aberta')
  : nao(`${depois.marcados} dias marcados na grade — esperava exatamente 1`)

// ---------------------------------------------------------------------------
console.log('\n3) A SEMANA É ALTA, e o dia cheio rola por dentro')
// ---------------------------------------------------------------------------
await p.goto(`${QA_BASE}/painel/calendario?ver=semana`, { waitUntil: 'networkidle' })
const semana = await p.evaluate(() => {
  const tds = [...document.querySelectorAll('td[class*="calDia"]')]
  return tds.map((td) => {
    const corpo = td.querySelector('[class*="calDiaCorpo"]')
    const num = td.querySelector('[class*="calNumero"]')
    return {
      td: Math.round(td.getBoundingClientRect().height),
      corpo: corpo ? Math.round(corpo.getBoundingClientRect().height) : null,
      rola: corpo ? getComputedStyle(corpo).overflowY : null,
      numero: num ? parseFloat(getComputedStyle(num).fontSize) : null,
      eventos: td.querySelectorAll('[class*="calEvento"]').length,
    }
  })
})

const alturas = semana.map((s) => s.td)
const alta = Math.min(...alturas) >= 380
alta
  ? ok(`as sete colunas têm ${Math.min(...alturas)}px — a semana ocupa a tela`)
  : nao(`coluna de ${Math.min(...alturas)}px: a semana continua do tamanho do mês`)

// O TETO. Sem ele a semana some: um dia com 64 eventos fazia 1638px.
const estourou = alturas.filter((h) => h > 600)
estourou.length === 0
  ? ok(`nenhuma coluna passa de 600px (a maior tem ${Math.max(...alturas)}px)`)
  : nao(`${estourou.length} coluna(s) esticaram até ${Math.max(...alturas)}px — a semana virou lista`)

// O CORPO INTERNO PRECISA EXISTIR. Se a classe virar `undefined`, ele some do
// HTML e o teto acima passa a depender de sorte — foi assim que eu descobri
// que `.calDiaCorpo` só estava declarada como descendente no CSS.
const semCorpo = semana.filter((s) => s.corpo === null)
semCorpo.length === 0
  ? ok('todas as células têm corpo próprio (a classe do CSS module resolveu)')
  : nao(`${semCorpo.length} célula(s) sem \`.calDiaCorpo\` — a classe virou undefined`)

const cheio = semana.find((s) => s.eventos > 10)
if (cheio) {
  cheio.rola === 'auto' || cheio.rola === 'scroll'
    ? ok(`o dia de ${cheio.eventos} eventos rola por dentro em ${cheio.corpo}px`)
    : nao(`o dia de ${cheio.eventos} eventos não rola: overflow ${cheio.rola}`)
} else {
  console.log('  ⚪ nenhum dia cheio na semana semeada — o teto não pôde ser exercitado')
}

const num = semana[0]?.numero ?? 0
num >= 18
  ? ok(`o número do dia é título na semana (${num}px), e não etiqueta de canto`)
  : nao(`número do dia com ${num}px na semana — do tamanho do mês`)

erros.length === 0
  ? ok('nenhum erro de JavaScript durante a varredura')
  : nao(`erros no console: ${erros.slice(0, 3).join(' | ')}`)

await nav.close()
console.log(ruins === 0 ? '\n✅ ENXERGA E CLICA — TUDO VERDE' : `\n🔴 ${ruins} problema(s)`)
process.exit(ruins === 0 ? 0 : 1)
