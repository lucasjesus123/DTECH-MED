import { describe, expect, it } from 'vitest'
import { VARIAVEIS } from '@/lib/variaveis-documento'
import { MOLDES_PADRAO } from './moldes-padrao'

/**
 * A GUARDA DOS MOLDES PADRÃO.
 *
 * Eles são texto longo com `{{variavel}}` no meio, e o erro barato é digitar
 * `{{cliente_documeto}}`. Sem este teste, esse erro atravessa a revisão, entra
 * no banco na criação da empresa e só aparece no PDF — impresso, na frente do
 * cliente, como `{{cliente_documeto}}` no lugar do CNPJ dele.
 *
 * Aqui ele quebra a bateria antes de sair do repositório.
 */
const CHAVES = new Set(VARIAVEIS.map((v) => v.chave))

describe('moldes padrão de documento', () => {
  it('traz os três tipos que se modelam à mão', () => {
    expect(MOLDES_PADRAO.map((m) => m.tipo).sort()).toEqual([
      'CONTRATO_PRESTACAO',
      'NOTA_PROMISSORIA',
      'ORDEM_SERVICO',
    ])
  })

  it.each(MOLDES_PADRAO.map((m) => [m.nome, m] as const))(
    '%s só usa variáveis que existem',
    (_nome, molde) => {
      const usadas = [...molde.corpo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!)
      expect(usadas.length).toBeGreaterThan(0)
      const inventadas = [...new Set(usadas)].filter((c) => !CHAVES.has(c))
      expect(inventadas).toEqual([])
    },
  )

  it.each(MOLDES_PADRAO.map((m) => [m.nome, m] as const))(
    '%s não tem chave meio escrita',
    (_nome, molde) => {
      // `{{cliente_nome}` e `{cliente_nome}}` não viram variável: saem
      // impressos como estão. A contagem de chaves tem de fechar.
      expect((molde.corpo.match(/\{\{/g) ?? []).length).toBe(
        (molde.corpo.match(/\}\}/g) ?? []).length,
      )
      expect(molde.corpo).not.toMatch(/(?<!\{)\{(?!\{)\w+\}\}/)
    },
  )

  it('a nota promissória mantém a causa FORA do corpo do título', () => {
    /**
     * O que torna a promissória um título autônomo é a promessa pura de pagar
     * (Decreto 57.663/1966). Puxar o número da O.S. ou o equipamento para
     * dentro da promessa a amarraria à causa e a descaracterizaria.
     *
     * Por isso a origem fica abaixo de uma linha tracejada, sob um aviso
     * explícito. Este teste guarda essa fronteira: se alguém editar o molde e
     * subir a O.S. para cima da linha, a bateria fecha a porta.
     */
    const np = MOLDES_PADRAO.find((m) => m.tipo === 'NOTA_PROMISSORIA')!
    const corte = np.corpo.indexOf('INFORMAÇÕES COMPLEMENTARES')
    expect(corte).toBeGreaterThan(0)

    const titulo = np.corpo.slice(0, corte)
    expect(titulo).toMatch(/pagarei por esta única via de\s+NOTA PROMISSÓRIA/)
    expect(titulo).toContain('{{valor_aberto_extenso}}')
    // A causa não aparece na promessa.
    expect(titulo).not.toContain('{{equipamento_marca}}')
    expect(titulo).not.toContain('{{os_defeito}}')
  })

  it('o contrato cita os artigos que de fato regem cada cláusula', () => {
    const c = MOLDES_PADRAO.find((m) => m.tipo === 'CONTRATO_PRESTACAO')!
    expect(c.corpo).toContain('art. 26, inciso II, do Código de Defesa do Consumidor')
    expect(c.corpo).toContain('art. 40 do Código de Defesa do Consumidor')
    expect(c.corpo).toContain('art. 1.275, inciso III')
    expect(c.corpo).toContain('art. 393 do Código Civil')
    expect(c.corpo).toContain('Lei nº 13.709/2018')
  })

  it('todo molde qualifica as duas partes e tem onde assinar', () => {
    for (const m of MOLDES_PADRAO) {
      expect(m.corpo).toContain('{{cliente_nome}}')
      expect(m.corpo).toContain('{{cliente_documento}}')
      expect(m.corpo).toMatch(/_{10,}/)
    }
  })
})
