import { describe, expect, it } from 'vitest'
import { Papel } from '@/generated/prisma/enums'
import {
  TELAS,
  casaDoPapel,
  padraoDoPapel,
  podeAbrir,
  primeiraTela,
  telasDoPapel,
  telasEfetivas,
} from './telas'

/**
 * O CATÁLOGO DE ABAS É REGRA DE PERMISSÃO, e por isso tem teste.
 *
 * A regra que sustenta o modelo inteiro — "a marcação SUBTRAI, nunca SOMA" —
 * mora numa função de dez linhas que quatro telas chamam. Um `padraoDoPapel`
 * escrito sem cuidado transforma "o motorista não precisa do painel" em "o
 * motorista alcança o Financeiro", e nada na tela acusaria.
 */
describe('o teto de cada papel', () => {
  it('não deixa a marcação SOMAR: motorista marcando Financeiro continua sem Financeiro', () => {
    const efetivas = telasEfetivas(Papel.MOTORISTA, ['financeiro', 'usuarios', 'auditoria'])
    expect(efetivas.map((t) => t.chave)).not.toContain('financeiro')
    expect(podeAbrir(Papel.MOTORISTA, ['financeiro'], 'financeiro')).toBe(false)
  })

  it('deixa a marcação SUBTRAIR: atendente marcado só em clientes vê só clientes', () => {
    const efetivas = telasEfetivas(Papel.ATENDENTE, ['clientes'])
    expect(efetivas.map((t) => t.chave)).toEqual(['clientes'])
  })

  it('o super admin atravessa qualquer aba', () => {
    expect(podeAbrir(Papel.SUPER_ADMIN, ['clientes'], 'financeiro')).toBe(true)
  })
})

describe('o padrão de quem não marcou nada', () => {
  it('o motorista nasce com o aplicativo, e não com sete abas do painel', () => {
    const padrao = padraoDoPapel(Papel.MOTORISTA)
    expect(padrao.map((t) => t.chave)).toEqual(['aplicativos'])
    // E o teto continua maior que o padrão: dar a aba a ele ainda é possível.
    expect(telasDoPapel(Papel.MOTORISTA).length).toBeGreaterThan(padrao.length)
  })

  it('o motorista sem marcação não abre o Dashboard nem o Calendário', () => {
    expect(podeAbrir(Papel.MOTORISTA, null, 'painel')).toBe(false)
    expect(podeAbrir(Papel.MOTORISTA, [], 'calendario')).toBe(false)
  })

  it('mas abre os dois se o administrador marcar de propósito', () => {
    expect(podeAbrir(Papel.MOTORISTA, ['calendario'], 'calendario')).toBe(true)
  })

  it('o técnico NÃO é enxugado: laudo, peça e ordem moram no painel', () => {
    const chaves = padraoDoPapel(Papel.TECNICO).map((t) => t.chave)
    expect(chaves).toContain('ordens')
    expect(chaves).toContain('estoque')
  })

  it('marcação com chaves que não existem mais cai no padrão, e não em nada', () => {
    // 'agenda' e 'ao-vivo' viraram a aba 'rota' no redesenho dos grupos.
    const efetivas = telasEfetivas(Papel.ATENDENTE, ['agenda', 'ao-vivo'])
    expect(efetivas.length).toBeGreaterThan(0)
  })
})

describe('para onde cada pessoa vai depois de entrar', () => {
  it('quem trabalha em campo vai para o próprio aplicativo', () => {
    expect(casaDoPapel(Papel.MOTORISTA)).toBe('/app/motorista')
    expect(casaDoPapel(Papel.TECNICO)).toBe('/app/tecnico')
    expect(primeiraTela(Papel.MOTORISTA, null)).toBe('/app/motorista')
  })

  it('quem tem o Dashboard cai no Dashboard', () => {
    expect(primeiraTela(Papel.ADMIN_EMPRESA, null)).toBe('/painel')
  })

  it('quem foi apertado numa aba só cai NESSA aba, e não num muro', () => {
    const destino = primeiraTela(Papel.FINANCEIRO, ['financeiro'])
    expect(destino).toBe('/painel/financeiro')
  })

  it('o destino do login é sempre uma tela que a própria pessoa consegue abrir', () => {
    // A garantia que impede laço de redirecionamento entre `exigirAba` e o
    // destino que ele escolhe.
    const casos: Array<[Papel, string[] | null]> = [
      [Papel.MOTORISTA, null],
      [Papel.TECNICO, null],
      [Papel.ATENDENTE, ['clientes']],
      [Papel.FINANCEIRO, ['financeiro']],
      [Papel.GESTOR, null],
      [Papel.ADMIN_EMPRESA, ['usuarios']],
    ]
    for (const [papel, marcadas] of casos) {
      const destino = primeiraTela(papel, marcadas)
      if (destino.startsWith('/app')) continue
      const tela = TELAS.find((t) => t.href === destino)
      expect(tela, `${papel} caiu em ${destino}, que não é aba nenhuma`).toBeDefined()
      expect(podeAbrir(papel, marcadas, tela!.chave), `${papel} não abre ${destino}`).toBe(true)
    }
  })
})
