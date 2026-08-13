import { describe, expect, it } from 'vitest'
import { TEMPLATES, montarMensagem, normalizarNumero, type DadosMensagem } from './mensagens'

const completo: DadosMensagem = {
  contato: 'Mariana',
  cliente: 'Clínica Bella Pelle',
  equipamento: 'Laser Lavieen Duo',
  numeroOrdem: 2419,
  quando: '12/08 às 14h22',
  motorista: 'Adriano Martins',
  endereco: 'Av. Benjamin Constant, 1180',
  valor: 'R$ 1.840,00',
  prazo: '5 dias úteis',
  garantiaDias: 90,
  linkPortal: 'https://dtechmed.com.br/os/abc123',
  empresa: 'DTECH MED',
  tecnico: 'Rafael Souza',
  qtdFotos: 8,
  motivo: 'Peça fora de linha',
}

/** Só o obrigatório: é aqui que "undefined" costuma vazar. */
const minimo: DadosMensagem = {
  cliente: 'Odonto São Bento',
  numeroOrdem: 7,
  empresa: 'DTECH MED',
}

describe('todo template sobrevive ao mínimo de dados', () => {
  for (const tipo of Object.keys(TEMPLATES)) {
    it(`${tipo} não vaza undefined nem null`, () => {
      const m = montarMensagem(tipo, minimo)
      expect(m, `${tipo} devolveu vazio`).toBeTruthy()
      expect(m).not.toMatch(/undefined/i)
      expect(m).not.toMatch(/\bnull\b/)
      expect(m).not.toMatch(/NaN/)
      // Chave de template não interpolada é o outro jeito clássico de quebrar.
      expect(m).not.toMatch(/\{\{|\}\}/)
    })

    it(`${tipo} não deixa linha em branco solta`, () => {
      for (const dados of [completo, minimo]) {
        const m = montarMensagem(tipo, dados)!
        // Três quebras seguidas significam que uma linha condicional sumiu e
        // deixou o buraco — o tipo de coisa que ninguém revisa antes de mandar.
        expect(m, `${tipo} com buraco no meio`).not.toMatch(/\n\s*\n\s*\n/)
        expect(m.startsWith('\n')).toBe(false)
        expect(m.endsWith('\n')).toBe(false)
      }
    })

    it(`${tipo} assina com o nome da empresa`, () => {
      expect(montarMensagem(tipo, completo)).toContain('DTECH MED')
    })
  }
})

describe('saudação', () => {
  it('chama a pessoa pelo nome quando ele existe', () => {
    expect(montarMensagem('ordem.coletada', completo)).toMatch(/^Oi, Mariana!/)
  })

  it('sem o nome da pessoa, fala com a empresa — nunca com um espaço vazio', () => {
    const m = montarMensagem('ordem.coletada', minimo)!
    expect(m).toMatch(/^Olá, Odonto São Bento!/)
  })
})

describe('equipamento', () => {
  it('usa marca e modelo quando informados', () => {
    expect(montarMensagem('ordem.recebida', completo)).toContain('Laser Lavieen Duo')
  })

  it('sem o modelo, usa um termo genérico legível', () => {
    const m = montarMensagem('ordem.recebida', minimo)!
    expect(m).toContain('seu equipamento')
  })
})

describe('conteúdo específico de cada etapa', () => {
  it('a coleta informa motorista, local e horário', () => {
    const m = montarMensagem('ordem.coletada', completo)!
    expect(m).toContain('Adriano Martins')
    expect(m).toContain('Av. Benjamin Constant, 1180')
    expect(m).toContain('12/08 às 14h22')
  })

  it('o orçamento leva o valor e o link de aprovação', () => {
    const m = montarMensagem('orcamento.enviado', completo)!
    expect(m).toContain('R$ 1.840,00')
    expect(m).toContain('https://dtechmed.com.br/os/abc123')
    expect(m).toContain('90 dias')
  })

  it('a entrega sem reparo explica o motivo em vez de só avisar', () => {
    const m = montarMensagem('entrega.em_rota_sem_reparo', completo)!
    expect(m).toMatch(/n[ãa]o foi aprovado/i)
  })
})

describe('tipo desconhecido', () => {
  it('devolve null em vez de mandar mensagem vazia ao cliente', () => {
    expect(montarMensagem('etapa.que.nao.existe', completo)).toBeNull()
  })
})

describe('normalização do número', () => {
  it('aceita o que a central digita de verdade', () => {
    expect(normalizarNumero('(51) 98044-9274')).toBe('5551980449274')
    expect(normalizarNumero('51 98044-9274')).toBe('5551980449274')
    expect(normalizarNumero('5551980449274')).toBe('5551980449274')
    expect(normalizarNumero('+55 51 98044 9274')).toBe('5551980449274')
  })

  it('aceita fixo com DDD', () => {
    expect(normalizarNumero('(51) 3714-1000')).toBe('555137141000')
  })

  it('recusa o que não dá para discar', () => {
    // Enviar para um número errado não é engano, é vazamento: a mensagem do
    // cliente cai na caixa de outra pessoa.
    expect(normalizarNumero('123')).toBeNull()
    expect(normalizarNumero('')).toBeNull()
    expect(normalizarNumero(null)).toBeNull()
    expect(normalizarNumero(undefined)).toBeNull()
    expect(normalizarNumero('abc')).toBeNull()
  })

  it('recusa número com DDD válido mas assinante impossível', () => {
    // Este passou despercebido na primeira versão: tem 11 dígitos e DDD 55,
    // que existe (Santa Maria), então a validação de DDD aprovava. Mas o
    // assinante "019804492" começa com zero e não é discável.
    expect(normalizarNumero('55019804492')).toBeNull()
    // Celular brasileiro começa com 9 desde o nono dígito.
    expect(normalizarNumero('5551180449274')).toBeNull()
    // Fixo começa entre 2 e 5.
    expect(normalizarNumero('555117141000')).toBeNull()
  })

  it('devolve só dígitos, sem sinal nem separador', () => {
    const n = normalizarNumero('+55 (51) 98044-9274')!
    expect(n).toMatch(/^\d+$/)
  })
})
