import { describe, expect, it } from 'vitest'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { acaoDaVez } from '@/lib/esteira'
import type { Sessao } from '@/server/auth/sessao'
import {
  TELAS_V2,
  casaDoPapelV2,
  menuDaSessao,
  podeVer,
  primeiraTelaV2,
  telaPorChave,
  telasDaSessao,
} from './navegacao'

/**
 * O MENU É PERMISSÃO, e por isso tem teste.
 *
 * =============================================================================
 * AS DUAS COISAS QUE PRECISAM CONTINUAR VALENDO
 * =============================================================================
 *   1. O PAPEL é o teto. Nenhuma marcação de abas faz alguém alcançar uma tela
 *      que o papel dele não alcança.
 *   2. A MARCAÇÃO subtrai. A configuração que o administrador já fez no sistema
 *      antigo — *"deixar uma pessoa vendo apenas o Financeiro"* — continua
 *      valendo no sistema novo.
 *
 * A segunda é a que morreria em silêncio. Se o menu novo lesse só o papel,
 * ligar a `uiV2` de uma empresa devolveria a todo mundo o alcance cheio do
 * papel — e ninguém receberia erro nenhum: as telas simplesmente voltariam a
 * aparecer.
 */

function sessaoDe(papel: Papel, telas: string[] = []): Sessao {
  return {
    userId: 'u1',
    nome: 'Fulano de Tal',
    email: 'fulano@exemplo.com',
    papel,
    tenantId: 't1',
    tenantNome: 'DTECH Lajeado',
    trocarSenha: false,
    telas,
    visitando: false,
    uiV2: true,
  }
}

describe('o teto do papel', () => {
  it('não deixa um motorista alcançar o Financeiro, nem marcando', () => {
    const s = sessaoDe(Papel.MOTORISTA, ['financeiro', 'usuarios', 'config'])
    const chaves = telasDaSessao(s).map((t) => t.chave)
    expect(chaves).not.toContain('financeiro')
    expect(chaves).not.toContain('usuarios')
    expect(chaves).not.toContain('config')
  })

  it('não deixa um técnico alcançar a administração', () => {
    const s = sessaoDe(Papel.TECNICO)
    const chaves = telasDaSessao(s).map((t) => t.chave)
    expect(chaves).not.toContain('usuarios')
    expect(chaves).not.toContain('integracoes')
    expect(chaves).not.toContain('modelos')
  })

  it('não deixa um atendente ver a Conferência da gestão', () => {
    expect(podeVer(sessaoDe(Papel.ATENDENTE), telaPorChave('conferencia')!)).toBe(false)
  })

  it('deixa a gestão ver a esteira inteira — ela é o único papel que enxerga o todo', () => {
    const s = sessaoDe(Papel.GESTOR)
    const chaves = telasDaSessao(s).map((t) => t.chave)
    expect(chaves).toContain('ordens')
    expect(chaves).toContain('bancada')
    expect(chaves).toContain('conferencia')
    expect(chaves).toContain('financeiro')
  })
})

describe('a marcação subtrai', () => {
  it('um financeiro marcado só em Financeiro não recebe as outras telas', () => {
    // A tela `financeiro` do sistema novo espelha a chave `financeiro` do
    // antigo, e é assim que a configuração de quem já usa o sistema continua
    // valendo depois de ligar a flag.
    const s = sessaoDe(Papel.FINANCEIRO, ['financeiro'])
    const chaves = telasDaSessao(s).map((t) => t.chave)
    expect(chaves).toContain('financeiro')
    expect(chaves).not.toContain('painel')
    expect(chaves).not.toContain('clientes')
  })

  it('quem não marcou nada fica com o padrão do papel', () => {
    const s = sessaoDe(Papel.ATENDENTE)
    const chaves = telasDaSessao(s).map((t) => t.chave)
    expect(chaves).toContain('painel')
    expect(chaves).toContain('ordens')
    expect(chaves).toContain('clientes')
  })
})

describe('o super admin', () => {
  it('atravessa — as telas dele são outras, e quando ele visita é para ver tudo', () => {
    const s = sessaoDe(Papel.SUPER_ADMIN, ['nada-disso-existe'])
    expect(telasDaSessao(s)).toHaveLength(TELAS_V2.length)
  })
})

describe('o menu montado', () => {
  it('não deixa cabeçalho de grupo órfão', () => {
    for (const papel of Object.values(Papel)) {
      for (const grupo of menuDaSessao(sessaoDe(papel))) {
        expect(grupo.itens.length, `grupo "${grupo.titulo}" vazio para ${papel}`).toBeGreaterThan(0)
      }
    }
  })

  it('mantém a ordem OPERAÇÃO → GESTÃO → ADMINISTRAÇÃO', () => {
    const titulos = menuDaSessao(sessaoDe(Papel.ADMIN_EMPRESA)).map((g) => g.titulo)
    expect(titulos).toEqual(['OPERAÇÃO DIÁRIA', 'GESTÃO', 'ADMINISTRAÇÃO'])
  })

  it('nunca oferece um item que a guarda da página vai recusar', () => {
    // Este é o defeito clássico de sistema com permissão: o menu oferece uma
    // tela que a tela recusa. As duas leem `podeVer`, e este teste é o que
    // impede alguém de reintroduzir uma segunda lista.
    for (const papel of Object.values(Papel)) {
      const s = sessaoDe(papel)
      for (const grupo of menuDaSessao(s)) {
        for (const item of grupo.itens) {
          expect(podeVer(s, telaPorChave(item.chave)!)).toBe(true)
        }
      }
    }
  })
})

describe('para onde cada um vai', () => {
  it('manda o motorista para o app de campo, e não para uma tela de mesa', () => {
    expect(casaDoPapelV2(Papel.MOTORISTA)).toBe('/campo')
  })

  it('manda o técnico para a bancada — é onde o dia dele começa', () => {
    expect(casaDoPapelV2(Papel.TECNICO)).toBe('/sistema/bancada')
  })

  it('nunca devolve um endereço que a pessoa não consegue abrir', () => {
    // Quem teve o acesso apertado até uma tela só era mandado para a home e
    // caía em "sem permissão" pela porta de entrada do sistema. A resposta é
    // montada do que ela TEM, então não há como criar esse beco.
    const s = sessaoDe(Papel.FINANCEIRO, ['financeiro'])
    const destino = primeiraTelaV2(s)
    expect(destino).toBe('/sistema/financeiro')
    const tela = TELAS_V2.find((t) => t.href === destino)!
    expect(podeVer(s, tela)).toBe(true)
  })
})

describe('quem tem trabalho na esteira tem ONDE fazê-lo', () => {
  /**
   * A TRAVA CONTRA O BECO SEM SAÍDA.
   *
   * ===========================================================================
   * O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR
   * ===========================================================================
   * `acaoDaVez` diz que o FINANCEIRO confirma o pagamento. A folha que colhe
   * esse pagamento mora na ficha da O.S. E a lista de telas não dava a ficha da
   * O.S. ao financeiro.
   *
   * Nada acusava. Os testes de unidade da esteira passavam — a ação existia. Os
   * testes do menu passavam — a lista estava coerente consigo mesma. O papel
   * simplesmente não conseguia trabalhar, e só uma jornada de navegador, com o
   * Fábio clicando em "Emitir cobrança" e caindo em "sem permissão", mostrou.
   *
   * Duas listas que se contradizem em silêncio pedem um teste que fale as duas
   * línguas. É este.
   *
   * ===========================================================================
   * A EXCEÇÃO, E POR QUE ELA É UMA SÓ
   * ===========================================================================
   * O MOTORISTA também tem ações na esteira e também não tem a tela de O.S. —
   * de propósito: ele trabalha pela fila do app de campo, e a ficha o manda
   * para lá. "Fora da lista" só é aceitável quando existe outro lugar para
   * fazer o mesmo trabalho. Por isso a exceção é nominal e está escrita aqui:
   * acrescentar um nome a ela é uma decisão visível, não um esquecimento.
   */
  const TRABALHA_NO_APP_DE_CAMPO: Papel[] = [Papel.MOTORISTA]

  it('todo papel com botão-da-vez alcança a ficha da O.S. — ou o app de campo', () => {
    const semCasa: string[] = []

    for (const papel of Object.values(Papel)) {
      if (papel === Papel.SUPER_ADMIN) continue
      if (TRABALHA_NO_APP_DE_CAMPO.includes(papel)) continue

      const temAcao = Object.values(EtapaOrdem).some((e) => acaoDaVez(e, papel) !== null)
      if (!temAcao) continue

      const ficha = telaPorChave('ordens')!
      const alcanca = ficha.papeis.includes(papel)
      if (!alcanca) semCasa.push(papel)
    }

    // Se este teste quebrar, existe um papel a quem o sistema dá trabalho e
    // nega a tela onde o trabalho acontece. Não é uma tela a menos no menu: é
    // uma pessoa que abre o sistema, vê a própria fila, clica, e lê "sem
    // permissão" — todo dia, em todos os caminhos.
    expect(semCasa).toEqual([])
  })

  it('o motorista continua FORA da ficha, e isso é desenho', () => {
    expect(telaPorChave('ordens')!.papeis).not.toContain(Papel.MOTORISTA)
    expect(casaDoPapelV2(Papel.MOTORISTA)).toBe('/campo')
  })
})
