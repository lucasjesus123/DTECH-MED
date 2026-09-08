import { describe, expect, it } from 'vitest'
import { MOLDES_PRONTOS } from './moldes-prontos'
import { VARIAVEIS, marcadoresDe, renderizarModelo, valoresDeExemplo } from './variaveis-documento'
import { TIPOS_MODELAVEIS } from './tipos-de-documento'

/**
 * Um molde pronto com marcador errado é pior que nenhum: ele sai IMPRESSO no
 * papel, escrito como está, no contrato que alguém já mandou assinar. Estes
 * testes são a porta que ele não passa.
 */
describe('os moldes prontos', () => {
  it('existe um para cada tipo que a tela oferece', () => {
    for (const tipo of TIPOS_MODELAVEIS) {
      expect(MOLDES_PRONTOS[tipo], `falta molde pronto para ${tipo}`).toBeTruthy()
    }
  })

  const conhecidas = new Set(VARIAVEIS.map((v) => v.chave))

  for (const [tipo, molde] of Object.entries(MOLDES_PRONTOS)) {
    it(`${tipo} só usa variável que o sistema conhece`, () => {
      const errados = marcadoresDe(molde.corpo).filter((m) => !conhecidas.has(m))
      expect(errados, `variáveis desconhecidas: ${errados.join(', ')}`).toEqual([])
    })

    it(`${tipo} renderiza sem sobrar chave nenhuma`, () => {
      const { texto, desconhecidos } = renderizarModelo(molde.corpo, valoresDeExemplo())
      expect(desconhecidos).toEqual([])
      expect(texto).not.toMatch(/\{\{|\}\}/)
      expect(texto).not.toMatch(/undefined|\bnull\b/)
    })

    it(`${tipo} tem nome e descrição para a lista`, () => {
      expect(molde.nome.length).toBeGreaterThan(3)
      expect(molde.descricao.length).toBeGreaterThan(10)
      // O limite da coluna `descricao` no formulário é 200.
      expect(molde.descricao.length).toBeLessThanOrEqual(200)
    })
  }

  it('o contrato traz as cláusulas que não podem faltar', () => {
    const c = MOLDES_PRONTOS.CONTRATO_PRESTACAO.corpo
    for (const termo of ['GARANTIA', 'FORO', 'OBJETO', 'PAGAMENTO', 'GUARDA']) {
      expect(c, `o contrato ficou sem a cláusula de ${termo}`).toContain(termo)
    }
  })
})
