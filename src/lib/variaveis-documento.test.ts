import { describe, expect, it } from 'vitest'
import { VARIAVEIS, marcadoresDe, renderizarModelo, valoresDeExemplo, variaveisPorGrupo } from './variaveis-documento'

/**
 * Estes testes existem porque um erro aqui sai IMPRESSO num documento que
 * alguém assina — e o pior deles é silencioso: um marcador trocado por vazio
 * deixa uma frase truncada que ninguém relê antes de mandar para assinatura.
 */

describe('o catálogo', () => {
  it('não tem chave repetida', () => {
    const chaves = VARIAVEIS.map((v) => v.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
  })

  it('só usa minúsculas, número e sublinhado', () => {
    // O marcador é case-insensitive na leitura, mas o catálogo é a fonte: uma
    // chave com maiúscula aqui nunca casaria com o `toLowerCase()` do render.
    for (const v of VARIAVEIS) expect(v.chave).toMatch(/^[a-z0-9_]+$/)
  })

  it('toda variável tem rótulo e exemplo', () => {
    // O exemplo é o que a pré-visualização mostra antes de existir dado real.
    for (const v of VARIAVEIS) {
      expect(v.rotulo.trim()).not.toBe('')
      expect(v.exemplo.trim()).not.toBe('')
    }
  })

  it('agrupa sem perder ninguém', () => {
    const total = variaveisPorGrupo().reduce((n, [, lista]) => n + lista.length, 0)
    expect(total).toBe(VARIAVEIS.length)
  })
})

describe('renderizar', () => {
  it('troca o marcador pelo valor', () => {
    const r = renderizarModelo('Olá {{cliente_nome}}, tudo bem?', { cliente_nome: 'Clínica Bella Pelle' })
    expect(r.texto).toBe('Olá Clínica Bella Pelle, tudo bem?')
    expect(r.desconhecidos).toEqual([])
    expect(r.vazios).toEqual([])
  })

  it('aceita espaço dentro das chaves', () => {
    // É o que sai de um copiar-e-colar de editor de texto. Recusar faria a
    // pessoa caçar um espaço invisível.
    const r = renderizarModelo('{{ cliente_nome }}', { cliente_nome: 'Ana' })
    expect(r.texto).toBe('Ana')
  })

  it('é indiferente a maiúscula no marcador', () => {
    const r = renderizarModelo('{{CLIENTE_NOME}}', { cliente_nome: 'Ana' })
    expect(r.texto).toBe('Ana')
  })

  it('troca o mesmo marcador todas as vezes que ele aparece', () => {
    const r = renderizarModelo('{{cliente_nome}} … {{cliente_nome}}', { cliente_nome: 'Ana' })
    expect(r.texto).toBe('Ana … Ana')
  })

  it('DEIXA VISÍVEL o marcador que não existe, e o denuncia', () => {
    // A regra que protege o documento. Trocar por vazio produziria
    // "LOCATÁRIO(A): , portador do documento" — que é assinado sem ninguém ver.
    const r = renderizarModelo('LOCATÁRIO: {{cliente_nomee}}, portador', {})
    expect(r.texto).toBe('LOCATÁRIO: {{cliente_nomee}}, portador')
    expect(r.desconhecidos).toEqual(['cliente_nomee'])
  })

  it('põe um traço no marcador conhecido que está sem valor, e o denuncia', () => {
    // Conhecido mas vazio é outra coisa: o laudo antes de o técnico escrever.
    // O traço mostra que ali havia um campo, em vez de truncar a frase.
    const r = renderizarModelo('Laudo: {{os_diagnostico}}.', { os_diagnostico: '' })
    expect(r.texto).toBe('Laudo: —.')
    expect(r.vazios).toEqual(['os_diagnostico'])
  })

  it('trata ausente e vazio do mesmo jeito', () => {
    const r = renderizarModelo('{{os_diagnostico}}', {})
    expect(r.texto).toBe('—')
    expect(r.vazios).toEqual(['os_diagnostico'])
  })

  it('não denuncia o mesmo problema duas vezes', () => {
    const r = renderizarModelo('{{xpto}} {{xpto}} {{os_prazo}} {{os_prazo}}', {})
    expect(r.desconhecidos).toEqual(['xpto'])
    expect(r.vazios).toEqual(['os_prazo'])
  })

  it('não mexe em chave solta nem em texto sem marcador', () => {
    expect(renderizarModelo('valor de R$ 1.750,00', {}).texto).toBe('valor de R$ 1.750,00')
    expect(renderizarModelo('{ cliente_nome }', {}).texto).toBe('{ cliente_nome }')
    expect(renderizarModelo('{{}}', {}).texto).toBe('{{}}')
  })

  it('o valor substituído NÃO é reinterpretado', () => {
    // Se um cliente se chamasse "{{empresa_cnpj}}", o nome dele não pode virar
    // o CNPJ da empresa no meio do contrato. `replace` com função não reprocessa
    // o que devolveu — este teste é o que trava essa porta.
    const r = renderizarModelo('Cliente: {{cliente_nome}}', { cliente_nome: '{{empresa_cnpj}}' })
    expect(r.texto).toBe('Cliente: {{empresa_cnpj}}')
  })
})

describe('marcadores de um modelo', () => {
  it('lista na ordem e sem repetir', () => {
    expect(marcadoresDe('{{b}} {{a}} {{b}}')).toEqual(['b', 'a'])
  })
  it('modelo sem marcador nenhum', () => {
    expect(marcadoresDe('texto seco')).toEqual([])
  })
})

describe('valores de exemplo', () => {
  it('cobrem o catálogo inteiro — a pré-visualização nunca mostra buraco', () => {
    const ex = valoresDeExemplo()
    const corpo = VARIAVEIS.map((v) => `{{${v.chave}}}`).join(' ')
    const r = renderizarModelo(corpo, ex)
    expect(r.vazios).toEqual([])
    expect(r.desconhecidos).toEqual([])
    expect(r.texto).not.toContain('{{')
    // Sem asserção sobre o travessão: ele aparece de verdade dentro dos
    // endereços de exemplo ("Av. Benjamin Constant, 1180 — Lajeado/RS"). Quem
    // prova o ponto é `vazios` estar vazio — nenhum marcador virou traço.
  })
})
