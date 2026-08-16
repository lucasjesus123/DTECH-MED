import { describe, expect, it } from 'vitest'
import { CONTEUDO_PADRAO, interpretarConteudo } from './conteudo'

/**
 * O que este arquivo protege.
 *
 * O conteúdo do site vive no banco, num campo JSON, e o formato dele muda toda
 * vez que uma seção nova é acrescentada ao site. O risco não é teórico: no dia
 * em que um campo novo aparece, o registro gravado meses antes não o tem — e
 * uma leitura que conferisse o formato ANTES de completar recusaria o registro
 * inteiro. O site voltaria ao texto de fábrica, e o dono perderia tudo o que
 * escreveu, sem nenhum erro na tela.
 *
 * É o defeito clássico de esquema evolutivo, e o teste abaixo é a única coisa
 * que impede alguém de reintroduzi-lo por engano numa refatoração.
 */
describe('interpretarConteudo', () => {
  it('completa campo novo em conteúdo gravado antes de ele existir', () => {
    // Exatamente o que está gravado hoje: a seção de busca sem o código de
    // verificação do Google, que só passou a existir na virada do domínio.
    const gravado = {
      ...CONTEUDO_PADRAO,
      seo: { titulo: 'Título que o dono escreveu', descricao: 'Descrição que o dono escreveu' },
    }

    const { conteudo, usouPadrao } = interpretarConteudo(gravado)

    expect(usouPadrao).toBe(false)
    // O que ele escreveu continua lá.
    expect(conteudo.seo.titulo).toBe('Título que o dono escreveu')
    expect(conteudo.seo.descricao).toBe('Descrição que o dono escreveu')
    // E o campo novo nasce vazio, em vez de derrubar o registro.
    expect(conteudo.seo.verificacaoGoogle).toBe('')
  })

  it('preserva o código de verificação quando ele foi preenchido', () => {
    const gravado = {
      ...CONTEUDO_PADRAO,
      seo: { ...CONTEUDO_PADRAO.seo, verificacaoGoogle: 'AbC123_codigo-do-google' },
    }
    const { conteudo } = interpretarConteudo(gravado)
    expect(conteudo.seo.verificacaoGoogle).toBe('AbC123_codigo-do-google')
  })

  it('mantém o texto escrito quando uma seção inteira ainda não existe no gravado', () => {
    // Simula um registro anterior a uma seção nova: aqui, sem `seo` nenhum.
    const { seo: _fora, ...semSeo } = CONTEUDO_PADRAO
    const gravado = {
      ...semSeo,
      identidade: { ...CONTEUDO_PADRAO.identidade, nome: 'DTECH MED FRANQUIA X' },
    }

    const { conteudo, usouPadrao } = interpretarConteudo(gravado)

    expect(usouPadrao).toBe(false)
    expect(conteudo.identidade.nome).toBe('DTECH MED FRANQUIA X')
    expect(conteudo.seo.titulo).toBe(CONTEUDO_PADRAO.seo.titulo)
  })

  it('não deixa um array virar mistura do antigo com o novo', () => {
    // Lista trocada é lista trocada. Fundir item a item faria um serviço
    // removido reaparecer com os campos do que ficou no lugar dele.
    expect(CONTEUDO_PADRAO.servicos.lista.length).toBeGreaterThan(1)

    const gravado = {
      ...CONTEUDO_PADRAO,
      servicos: { ...CONTEUDO_PADRAO.servicos, lista: [CONTEUDO_PADRAO.servicos.lista[0]!] },
    }
    const { conteudo } = interpretarConteudo(gravado)
    expect(conteudo.servicos.lista).toHaveLength(1)
    expect(conteudo.servicos.lista[0]!.titulo).toBe(CONTEUDO_PADRAO.servicos.lista[0]!.titulo)
  })

  it('cai no padrão quando o gravado está corrompido, em vez de derrubar o site', () => {
    // Site no ar com o texto de fábrica é ruim. Site fora do ar é pior.
    for (const lixo of [null, undefined, 'texto solto', 42, { seo: 'isto devia ser objeto' }]) {
      const { conteudo, usouPadrao } = interpretarConteudo(lixo)
      expect(usouPadrao).toBe(true)
      expect(conteudo.identidade.nome).toBe(CONTEUDO_PADRAO.identidade.nome)
    }
  })

  it('recusa texto acima do limite em vez de gravar o que o site não comporta', () => {
    const gravado = {
      ...CONTEUDO_PADRAO,
      seo: { ...CONTEUDO_PADRAO.seo, titulo: 'x'.repeat(500) },
    }
    const { usouPadrao, erro } = interpretarConteudo(gravado)
    expect(usouPadrao).toBe(true)
    expect(erro).toBeTruthy()
  })
})
