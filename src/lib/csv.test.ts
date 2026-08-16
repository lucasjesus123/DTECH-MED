import { describe, expect, it } from 'vitest'
import { lerCsv, montarCsv } from './csv'

describe('montarCsv', () => {
  const col = [
    { chave: 'nome', titulo: 'Nome', valor: (x: { nome: string }) => x.nome },
  ]

  it('neutraliza fórmula do Excel', () => {
    const csv = montarCsv([{ nome: '=HYPERLINK("http://ruim","clique")' }], col)
    expect(csv).toContain(`"'=HYPERLINK(""http://ruim"",""clique"")"`)
    expect(csv).not.toMatch(/;=HYPER/)
  })

  it('neutraliza os quatro sinais de fórmula', () => {
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      const csv = montarCsv([{ nome: s }], col)
      const linha = csv.split('\r\n')[1]!
      expect(linha.startsWith("'")).toBe(true)
    }
  })

  it('põe a marca de bytes para o acento abrir certo', () => {
    expect(montarCsv([{ nome: 'Clínica' }], col).charCodeAt(0)).toBe(0xfeff)
  })

  it('separa por ponto e vírgula e escapa aspas', () => {
    const c = [
      { chave: 'a', titulo: 'A', valor: (x: { a: string }) => x.a },
      { chave: 'b', titulo: 'B', valor: (x: { b: string }) => x.b },
    ]
    const csv = montarCsv([{ a: 'Rua Tal, 100', b: 'diz "oi"' }], c)
    expect(csv).toContain('A;B')
    expect(csv).toContain('Rua Tal, 100')      // vírgula não precisa de aspas com separador ;
    expect(csv).toContain('"diz ""oi"""')
  })
})

describe('lerCsv', () => {
  it('lê ponto e vírgula', () => {
    expect(lerCsv('Nome;Documento\r\nAna;123')).toEqual([{ nome: 'Ana', documento: '123' }])
  })

  it('lê vírgula', () => {
    expect(lerCsv('Nome,Documento\nAna,123')).toEqual([{ nome: 'Ana', documento: '123' }])
  })

  it('não confunde vírgula de endereço com separador', () => {
    const r = lerCsv('Nome;Endereco\nAna;"Rua Tal, 100"')
    expect(r[0]!.endereco).toBe('Rua Tal, 100')
  })

  it('ignora a marca de bytes no primeiro título', () => {
    expect(lerCsv('﻿Nome;X\nAna;1')[0]!.nome).toBe('Ana')
  })

  it('normaliza acento e maiúscula do cabeçalho', () => {
    expect(lerCsv('Razão Social;E-MAIL\nX;a@b.c')[0]).toEqual({ razao_social: 'X', e_mail: 'a@b.c' })
  })

  it('aceita quebra de linha dentro de aspas', () => {
    const r = lerCsv('Nome;Obs\nAna;"linha 1\nlinha 2"')
    expect(r).toHaveLength(1)
    expect(r[0]!.obs).toBe('linha 1\nlinha 2')
  })

  it('pula linha vazia no fim', () => {
    expect(lerCsv('Nome\nAna\n\n')).toHaveLength(1)
  })

  it('devolve vazio para arquivo em branco', () => {
    expect(lerCsv('   ')).toEqual([])
  })

  it('o que sai volta a entrar igual', () => {
    const itens = [{ nome: 'Clínica "A", Ltda', doc: '=1' }]
    const csv = montarCsv(itens, [
      { chave: 'nome', titulo: 'Nome', valor: (x) => x.nome },
      { chave: 'doc', titulo: 'Documento', valor: (x) => x.doc },
    ])
    const volta = lerCsv(csv)
    expect(volta[0]!.nome).toBe('Clínica "A", Ltda')
    // a aspa de proteção fica: é o preço de o Excel não executar a fórmula
    expect(volta[0]!.documento).toBe("'=1")
  })
})
