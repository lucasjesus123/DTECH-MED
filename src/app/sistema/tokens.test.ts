import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O CONTRASTE É REQUISITO, E POR ISSO É CONTA — NÃO OPINIÃO.
 *
 * =============================================================================
 * POR QUE UM TESTE, E NÃO UMA CONFERIDA NO OLHO
 * =============================================================================
 * "Está legível" é a frase mais perigosa de um sistema de cores. Ela é dita por
 * alguém com visão boa, num monitor bom, num escritório com a luz certa — e o
 * sistema é operado oito horas por dia por gente de todo tipo, inclusive na tela
 * de um celular sob sol.
 *
 * A régua é a das diretrizes de acessibilidade (WCAG 2.1 AA): 4,5:1 para texto
 * normal, 3:1 para texto grande e para elementos de interface. Este teste lê o
 * `tokens.css` de verdade — não uma cópia — e refaz a conta para cada par que
 * aparece na tela, nos DOIS temas.
 *
 * Se alguém trocar uma cor da paleta e ela cair abaixo do piso, o teste diz
 * qual par quebrou e por quanto. É o único jeito de a paleta sobreviver a um
 * ano de ajustes.
 *
 * =============================================================================
 * POR QUE OS BOTÕES SÓLIDOS TÊM COR PRÓPRIA
 * =============================================================================
 * A cor de um chip é medida contra o FUNDO DA TELA; a de um botão sólido é
 * medida contra o PRÓPRIO RÓTULO, que é branco. São perguntas diferentes, e a
 * mesma cor não responde às duas: o verde que brilha sobre o painel escuro
 * (#22C55E) dá 2,28:1 com texto branco em cima — reprovado. Por isso existem
 * `--ok-solida`, `--warn-solida` e `--danger-solida`, e por isso elas NÃO mudam
 * com o tema: o par botão+rótulo é o mesmo nos dois.
 */

const CSS = readFileSync(
  path.resolve(__dirname, 'tokens.css'),
  'utf8',
)

type Tema = 'claro' | 'escuro'

/**
 * Extrai a paleta de um tema a partir do arquivo real.
 *
 * Só interessam os tokens em hexadecimal sólido: os véus (`rgba`) são camadas
 * translúcidas e a conta deles depende do que está atrás. Eles são conferidos
 * indiretamente — o teste mede a TINTA do chip contra a superfície de baixo,
 * que é o pior caso.
 */
function paleta(tema: Tema): Record<string, string> {
  const cores: Record<string, string> = {}

  // `--nome: light-dark(#AAA, #BBB);`
  const duplo = /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9A-Fa-f]{3,8})\s*,\s*(#[0-9A-Fa-f]{3,8})\s*\)/g
  for (const m of CSS.matchAll(duplo)) {
    cores[m[1]!] = tema === 'claro' ? m[2]! : m[3]!
  }

  // `--nome: #AAA;` — vale nos dois temas.
  const simples = /--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,8})\s*;/g
  for (const m of CSS.matchAll(simples)) {
    cores[m[1]!] = m[2]!
  }

  return cores
}

function canal(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminancia(hex: string): number {
  const h = hex.replace('#', '')
  const cheio =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6)
  const r = parseInt(cheio.slice(0, 2), 16)
  const g = parseInt(cheio.slice(2, 4), 16)
  const b = parseInt(cheio.slice(4, 6), 16)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function razao(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const escuro = Math.min(la, lb)
  return (claro + 0.05) / (escuro + 0.05)
}

/** Um par que precisa passar: uma tinta sobre um fundo, com um piso. */
type Par = { tinta: string; fundo: string; piso: number; onde: string }

/** Texto normal. É o piso mais alto e o que cobre quase tudo. */
const AA = 4.5
/** Texto grande e componente de interface (borda, ícone, indicador). */
const AA_GRANDE = 3

const PARES: Par[] = [
  // --- o texto sobre cada superfície ---------------------------------------
  { tinta: 'text', fundo: 'bg', piso: AA, onde: 'texto na área de trabalho' },
  { tinta: 'text', fundo: 'surface', piso: AA, onde: 'texto dentro de um card' },
  { tinta: 'text', fundo: 'surface-2', piso: AA, onde: 'texto em superfície elevada' },
  { tinta: 'text-muted', fundo: 'bg', piso: AA, onde: 'texto de apoio na área de trabalho' },
  { tinta: 'text-muted', fundo: 'surface', piso: AA, onde: 'texto de apoio no card' },
  { tinta: 'text-muted', fundo: 'surface-2', piso: AA, onde: 'texto de apoio elevado' },

  // --- a marca, quando ela é LIDA ------------------------------------------
  { tinta: 'brand-txt', fundo: 'bg', piso: AA, onde: 'link e número em cor de marca' },
  { tinta: 'brand-txt', fundo: 'surface', piso: AA, onde: 'marca dentro do card' },
  { tinta: 'brand-txt', fundo: 'surface-2', piso: AA, onde: 'marca em superfície elevada' },

  // --- as tintas de estado, nos chips --------------------------------------
  // O chip tem um véu translúcido da mesma cor atrás. Medir a tinta contra a
  // superfície NUA é o pior caso: com o véu o contraste só sobe.
  { tinta: 'ok', fundo: 'surface', piso: AA, onde: 'chip de concluído' },
  { tinta: 'ok', fundo: 'surface-2', piso: AA, onde: 'chip de concluído, elevado' },
  { tinta: 'warn', fundo: 'surface', piso: AA, onde: 'chip de atenção' },
  { tinta: 'warn', fundo: 'surface-2', piso: AA, onde: 'chip de atenção, elevado' },
  { tinta: 'danger', fundo: 'surface', piso: AA, onde: 'chip de erro' },
  { tinta: 'danger', fundo: 'surface-2', piso: AA, onde: 'chip de erro, elevado' },
  { tinta: 'info', fundo: 'surface', piso: AA, onde: 'chip informativo' },
  { tinta: 'pending', fundo: 'surface', piso: AA, onde: 'chip de etapa não alcançada' },
  { tinta: 'pending', fundo: 'surface-2', piso: AA, onde: 'chip de etapa, elevado' },
  { tinta: 'ai', fundo: 'surface', piso: AA, onde: 'score de saúde (teal)' },

  // --- os botões sólidos, contra o próprio rótulo branco --------------------
  { tinta: 'sobre-brand', fundo: 'brand-solida', piso: AA, onde: 'botão primário' },
  { tinta: 'sobre-brand', fundo: 'brand-press', piso: AA, onde: 'botão primário pressionado' },
  { tinta: 'sobre-brand', fundo: 'ok-solida', piso: AA, onde: 'botão de desfecho' },
  { tinta: 'sobre-brand', fundo: 'warn-solida', piso: AA, onde: 'botão de recuo' },
  { tinta: 'sobre-brand', fundo: 'danger-solida', piso: AA, onde: 'botão destrutivo' },

  // --- a casca: ela é escura SEMPRE, nos dois temas -------------------------
  { tinta: 'casca-txt', fundo: 'casca', piso: AA, onde: 'nome na lateral' },
  { tinta: 'casca-txt-2', fundo: 'casca', piso: AA, onde: 'item de menu em repouso' },
  { tinta: 'casca-txt-2', fundo: 'casca-2', piso: AA, onde: 'item de menu sob o dedo' },
  { tinta: 'casca-txt', fundo: 'casca-2', piso: AA, onde: 'item de menu aberto' },
  { tinta: 'brand', fundo: 'casca', piso: AA, onde: 'papel no crachá e ícone aceso' },
  { tinta: 'brand', fundo: 'casca-2', piso: AA, onde: 'ícone do item aberto' },

  // --- elementos de interface, piso de 3:1 ---------------------------------
  { tinta: 'border-viva', fundo: 'surface', piso: AA_GRANDE, onde: 'borda de campo de formulário' },
  { tinta: 'brand', fundo: 'bg', piso: AA_GRANDE, onde: 'anel de foco na área de trabalho' },
  { tinta: 'brand', fundo: 'surface', piso: AA_GRANDE, onde: 'anel de foco dentro do card' },
]

describe.each<Tema>(['claro', 'escuro'])('contraste no tema %s', (tema) => {
  const cores = paleta(tema)

  it('encontrou todos os tokens que os pares citam', () => {
    const faltando = new Set<string>()
    for (const p of PARES) {
      if (!cores[p.tinta]) faltando.add(p.tinta)
      if (!cores[p.fundo]) faltando.add(p.fundo)
    }
    // Um token renomeado no CSS e não renomeado aqui faria os testes abaixo
    // passarem sem medir nada — o pior tipo de teste verde.
    expect([...faltando]).toEqual([])
  })

  it.each(PARES)('$onde: $tinta sobre $fundo', ({ tinta, fundo, piso, onde }) => {
    const a = cores[tinta]!
    const b = cores[fundo]!
    const r = razao(a, b)
    expect(
      r,
      `${onde} — ${tinta} (${a}) sobre ${fundo} (${b}) dá ${r.toFixed(2)}:1, e o piso é ${piso}:1`,
    ).toBeGreaterThanOrEqual(piso)
  })
})

describe('a paleta não tem armadilha', () => {
  it('não deixa o botão sólido depender do tema — o rótulo dele é branco nos dois', () => {
    const claro = paleta('claro')
    const escuro = paleta('escuro')
    for (const token of ['brand-solida', 'brand-press', 'ok-solida', 'warn-solida', 'danger-solida']) {
      expect(
        claro[token],
        `${token} muda com o tema, e o contraste dele é contra o próprio rótulo`,
      ).toBe(escuro[token])
    }
  })

  it('mantém a casca idêntica nos dois temas — ela é moldura, e moldura não pisca', () => {
    const claro = paleta('claro')
    const escuro = paleta('escuro')
    for (const token of ['casca', 'casca-2', 'casca-linha', 'casca-txt', 'casca-txt-2']) {
      expect(claro[token], `${token} deveria ser fixa`).toBe(escuro[token])
    }
  })
})
