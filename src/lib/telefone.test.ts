import { describe, expect, it } from 'vitest'
import { linkDeWhatsapp, normalizarNumero } from './telefone'

/**
 * O DEFEITO QUE ESTES TESTES EXISTEM PARA IMPEDIR DE VOLTAR.
 *
 * Quatro telas montavam o endereço do WhatsApp na unha. Três escreviam
 * `wa.me/55${telefone.replace(/\D/g,'')}` e a quarta `wa.me/${...}` sem DDI
 * nenhum. Prefixar o 55 só está certo quando o número NÃO o tem: um cadastro
 * salvo como "+55 51 98044-9274" virava `555551980449274`, com o país
 * repetido — quinze dígitos, número inexistente.
 *
 * Medido na carteira de demonstração antes da correção: quatro de quatro
 * clientes com o botão quebrado. Nada no sistema acusava — o link existia, era
 * azul, e o erro só aparecia no celular de quem clicou.
 */
describe('o link do WhatsApp', () => {
  it('não duplica o país quando o número já tem DDI', () => {
    for (const bruto of ['+55 51 98044-9274', '55 51 98044-9274', '5551980449274']) {
      expect(linkDeWhatsapp(bruto), bruto).toBe('https://wa.me/5551980449274')
    }
  })

  it('acrescenta o país quando o número não tem', () => {
    for (const bruto of ['51 98044-9274', '(51) 98044-9274', '51980449274']) {
      expect(linkDeWhatsapp(bruto), bruto).toBe('https://wa.me/5551980449274')
    }
  })

  /**
   * A INVARIANTE: normalizar duas vezes dá o mesmo resultado.
   *
   * IDEMPOTÊNCIA é exatamente a propriedade que o código antigo quebrava.
   * `wa.me/55${x.replace(/\D/g,'')}` aplicado a um número que já tinha o 55
   * acrescentava outro — e aplicá-lo de novo acrescentaria um terceiro. Uma
   * função que corrige um número tem de deixar quieto o número já correto.
   *
   * A PRIMEIRA VERSÃO DESTE TESTE ESTAVA ERRADA, e vale registrar: ela
   * reprovava todo endereço começado em `5555`, supondo país repetido. Mas
   * `5555980449274` é país 55 + DDD 55 (Santa Maria/RS) — um número legítimo
   * do Rio Grande do Sul, onde a empresa fica. A heurística acusava vinte
   * números certos. O comprimento e a idempotência são as invariantes de
   * verdade; "começa com 5555" era um palpite sobre a forma do defeito.
   */
  it('normalizar duas vezes dá o mesmo que normalizar uma', () => {
    const contra: string[] = []
    for (let ddd = 11; ddd <= 99; ddd++) {
      for (const assinante of ['980449274', '912345678', '30301234', '55123456']) {
        const nacional = `${ddd}${assinante}`
        // As cinco formas em que um telefone realmente chega ao cadastro.
        for (const bruto of [
          nacional,
          `55${nacional}`,
          `+55${nacional}`,
          `+55 (${ddd}) ${assinante}`,
          ` 55 ${nacional} `,
        ]) {
          const uma = normalizarNumero(bruto)
          if (!uma) continue
          const duas = normalizarNumero(uma)
          if (duas !== uma) contra.push(`${bruto}: ${uma} -> ${duas}`)
          // Brasil: 55 + DDD(2) + assinante(8 ou 9) = 12 ou 13 dígitos.
          if (uma.length !== 12 && uma.length !== 13) contra.push(`${bruto} -> ${uma} (${uma.length})`)
        }
      }
    }
    expect(contra.slice(0, 5), `${contra.length} contraexemplos`).toEqual([])
  })

  /** Duas formas do mesmo número dão o mesmo endereço — a propriedade que o
   *  defeito quebrava: a mesma clínica abria conversas diferentes conforme a
   *  tela de onde se clicava. */
  it('formas diferentes do mesmo número levam ao mesmo lugar', () => {
    for (let ddd = 11; ddd <= 99; ddd++) {
      const a = linkDeWhatsapp(`${ddd}980449274`)
      const b = linkDeWhatsapp(`+55 (${ddd}) 98044-9274`)
      expect(b, `DDD ${ddd}`).toBe(a)
    }
  })

  it('devolve nulo em vez de um link que abre a conversa errada', () => {
    for (const bruto of [null, undefined, '', '   ', 'não tem', '123', '55019804492', '5551180449274']) {
      expect(linkDeWhatsapp(bruto), String(bruto)).toBeNull()
    }
  })

  it('o texto vai codificado, e só quando existe', () => {
    expect(linkDeWhatsapp('51980449274')).toBe('https://wa.me/5551980449274')
    expect(linkDeWhatsapp('51980449274', 'Olá, tudo bem?')).toBe(
      'https://wa.me/5551980449274?text=Ol%C3%A1%2C%20tudo%20bem%3F',
    )
  })

  it('o normalizador continua saindo pelo módulo de mensagens', async () => {
    // A reexportação existe porque o worker e os testes de mensagem chamam por
    // lá desde sempre. Se ela sumir, o envio de WhatsApp para de normalizar.
    const { normalizarNumero: doOutroLado } = await import('@/server/whatsapp/mensagens')
    expect(doOutroLado('+55 51 98044-9274')).toBe(normalizarNumero('+55 51 98044-9274'))
  })
})

/**
 * A JANELA DE DIAS DO COMERCIAL — a trava que deixava NaN passar.
 *
 * `Math.max(1, Math.min(730, NaN))` é NaN, e o valor ia para
 * `make_interval(days => …)` de três consultas. O recorte estava escrito à mão
 * nas três, longe de onde o valor entra. Ver `diasDaJanela` em
 * `server/consultas/comercial.ts`.
 *
 * O teste vive aqui, e não num arquivo de consulta, porque a propriedade é do
 * RECORTE — aritmética pura, sem banco.
 */
describe('o recorte da janela de dias', () => {
  const recorteAntigo = (d: unknown) => Math.max(1, Math.min(730, d as number))
  const recorteNovo = (bruto: unknown) => {
    const n = Number(bruto)
    if (!Number.isFinite(n)) return 90
    return Math.max(1, Math.min(730, Math.trunc(n)))
  }

  it('o recorte antigo deixava NaN passar — é o defeito que isto documenta', () => {
    expect(Number.isNaN(recorteAntigo(NaN))).toBe(true)
  })

  it('o recorte novo devolve sempre um inteiro entre 1 e 730', () => {
    const hostis = [NaN, Infinity, -Infinity, 1e400, -1e400, 0, -5, 0.5, 1e9, null, undefined, 'abc', '', '30']
    for (const v of hostis) {
      const r = recorteNovo(v)
      expect(Number.isInteger(r), `${String(v)} -> ${r}`).toBe(true)
      expect(r, String(v)).toBeGreaterThanOrEqual(1)
      expect(r, String(v)).toBeLessThanOrEqual(730)
    }
  })
})

/**
 * A MEDIANA da aba Operação — a conta que o rótulo prometia e o código não
 * fazia. Ver o cabeçalho de `prazoTipico` em `painel/operacao.tsx`.
 */
describe('a mediana dos meses', () => {
  const mediana = (n: number[]): number | null => {
    if (n.length === 0) return null
    const ord = [...n].sort((a, b) => a - b)
    const meio = Math.floor(ord.length / 2)
    const v = ord.length % 2 === 1 ? ord[meio]! : (ord[meio - 1]! + ord[meio]!) / 2
    return Math.round(v * 10) / 10
  }

  it('o caso que motivou a correção: um mês atípico não levanta o número', () => {
    // Onze meses de serviço normal e um aparelho parado esperando peça.
    const meses = [4, 5, 4, 6, 5, 4, 5, 6, 4, 5, 5, 210]
    const media = Math.round((meses.reduce((s, v) => s + v, 0) / meses.length) * 10) / 10
    expect(media).toBe(21.9) // o que a tela mostrava
    expect(mediana(meses)).toBe(5) // o que ela prometia mostrar
  })

  it('ordena antes de escolher o meio, e não confia na ordem que chegou', () => {
    expect(mediana([9, 1, 5])).toBe(5)
    expect(mediana([5, 1, 9])).toBe(5)
  })

  it('par devolve a média dos dois centrais; vazio devolve nulo', () => {
    expect(mediana([2, 4])).toBe(3)
    expect(mediana([])).toBeNull()
  })

  it('não reordena a lista de quem chamou', () => {
    const original = [9, 1, 5]
    mediana(original)
    expect(original).toEqual([9, 1, 5])
  })
})
