import { describe, expect, it } from 'vitest'
import { NIVEL, nivelDe, podeCriarPapel, podeExcluirPapel, podeMexerEm } from './niveis'

/**
 * A hierarquia é a trava que sustenta todas as outras.
 *
 * Um erro aqui não aparece na tela nem quebra teste nenhum: aparece no dia em
 * que alguém descobre que podia ter subido um degrau. Por isso o que se testa
 * não é "a função devolve booleano" — é cada par de papéis que importa, com
 * nome, para que a regra fique escrita duas vezes: uma no código e uma aqui.
 */

const TODOS = Object.keys(NIVEL)

describe('a tabela de níveis', () => {
  it('põe o dono da plataforma sozinho no topo', () => {
    const maior = Math.max(...TODOS.filter((p) => p !== 'SUPER_ADMIN').map(nivelDe))
    expect(nivelDe('SUPER_ADMIN')).toBeGreaterThan(maior)
  })

  it('não repete número entre dois papéis diferentes', () => {
    // Empate faria dois papéis distintos virarem "iguais" para todas as
    // perguntas abaixo — e um deles ganharia poderes do outro sem que ninguém
    // tivesse escrito isso.
    const numeros = TODOS.map(nivelDe)
    expect(new Set(numeros).size).toBe(numeros.length)
  })

  it('trata papel desconhecido como o chão, e nunca como o topo', () => {
    expect(nivelDe('INVENTADO')).toBe(0)
    expect(nivelDe('')).toBe(0)
    expect(podeMexerEm('INVENTADO', 'MOTORISTA')).toBe(false)
    expect(podeCriarPapel('INVENTADO', 'MOTORISTA')).toBe(false)
  })
})

describe('criar — nomear um igual pode', () => {
  it('deixa o administrador da empresa nomear outro administrador', () => {
    // É o pedido que originou esta regra: uma empresa não pode depender de um
    // administrador só.
    expect(podeCriarPapel('ADMIN_EMPRESA', 'ADMIN_EMPRESA')).toBe(true)
  })

  it('deixa o administrador criar qualquer perfil abaixo dele', () => {
    for (const p of ['GESTOR', 'FINANCEIRO', 'ATENDENTE', 'TECNICO', 'MOTORISTA']) {
      expect(podeCriarPapel('ADMIN_EMPRESA', p)).toBe(true)
    }
  })

  it('não deixa ninguém criar um dono de plataforma', () => {
    expect(podeCriarPapel('ADMIN_EMPRESA', 'SUPER_ADMIN')).toBe(false)
    expect(podeCriarPapel('GESTOR', 'SUPER_ADMIN')).toBe(false)
  })

  it('não deixa o gestor se promover a administrador', () => {
    expect(podeCriarPapel('GESTOR', 'ADMIN_EMPRESA')).toBe(false)
  })
})

describe('mexer — editar, trocar a senha, desativar', () => {
  it('recusa entre iguais, inclusive entre dois administradores', () => {
    // Editar carrega o campo de senha; desativar corta o acesso na hora. Entre
    // iguais, as duas coisas são "tomar a conta do outro" e "trancar o outro
    // para fora", e ganharia quem clicasse primeiro.
    expect(podeMexerEm('ADMIN_EMPRESA', 'ADMIN_EMPRESA')).toBe(false)
    expect(podeMexerEm('GESTOR', 'GESTOR')).toBe(false)
  })

  it('deixa o administrador mexer em quem está abaixo', () => {
    expect(podeMexerEm('ADMIN_EMPRESA', 'GESTOR')).toBe(true)
    expect(podeMexerEm('ADMIN_EMPRESA', 'MOTORISTA')).toBe(true)
  })

  it('deixa o dono da plataforma mexer em qualquer administrador', () => {
    // É o escape: administrador que perdeu a senha, ou que saiu da empresa, é
    // resolvido por quem está acima dos dois.
    expect(podeMexerEm('SUPER_ADMIN', 'ADMIN_EMPRESA')).toBe(true)
  })

  it('nunca deixa ninguém mexer em quem está acima', () => {
    expect(podeMexerEm('GESTOR', 'ADMIN_EMPRESA')).toBe(false)
    expect(podeMexerEm('ADMIN_EMPRESA', 'SUPER_ADMIN')).toBe(false)
    expect(podeMexerEm('MOTORISTA', 'TECNICO')).toBe(false)
  })
})

describe('excluir — desfazer o cadastro recém-criado', () => {
  it('aceita o igual, para o e-mail digitado errado ter conserto', () => {
    // Quem chama continua obrigado a recusar quem já entrou ou tem rastro: o
    // que passa por aqui é o cadastro de dez minutos atrás.
    expect(podeExcluirPapel('ADMIN_EMPRESA', 'ADMIN_EMPRESA')).toBe(true)
  })

  it('não aceita quem está acima', () => {
    expect(podeExcluirPapel('ADMIN_EMPRESA', 'SUPER_ADMIN')).toBe(false)
  })
})

describe('a regra geral, varrida em todos os pares', () => {
  it('nunca deixa alguém criar, mexer ou excluir acima do próprio nível', () => {
    for (const quem of TODOS) {
      for (const alvo of TODOS) {
        if (nivelDe(alvo) > nivelDe(quem)) {
          expect(podeCriarPapel(quem, alvo)).toBe(false)
          expect(podeMexerEm(quem, alvo)).toBe(false)
          expect(podeExcluirPapel(quem, alvo)).toBe(false)
        }
      }
    }
  })

  it('mantém mexer mais apertado que criar em todo par', () => {
    for (const quem of TODOS) {
      for (const alvo of TODOS) {
        if (podeMexerEm(quem, alvo)) expect(podeCriarPapel(quem, alvo)).toBe(true)
      }
    }
  })
})
