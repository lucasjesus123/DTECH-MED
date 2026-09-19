import { describe, expect, it } from 'vitest'
import { ipDaRequisicao } from '@/server/auth/guarda'

/**
 * DE ONDE VEM O ENDEREÇO QUE A TRILHA REGISTRA.
 *
 * Este teste não existia, e o defeito que ele prende passou despercebido por
 * isso. A função lia o elemento mais à esquerda do `x-forwarded-for`, que é
 * justamente o pedaço que o visitante escreve sobre si mesmo: o nginx da frente
 * usa `$proxy_add_x_forwarded_for`, que preserva o que veio e acrescenta o
 * endereço real ATRÁS.
 *
 * Duas coisas dependiam disso e as duas estavam furadas: o IP da auditoria, que
 * passava a ser o que o visitante digitou, e o freio de chutes do portal
 * público, que separa os baldes por IP — com o IP sob controle de quem tenta, o
 * balde é novo a cada requisição e o freio não freia nada.
 */
describe('o endereço de quem fez a requisição', () => {
  const h = (pares: Record<string, string>) => new Headers(pares)

  it('sem confiar no proxy, não acredita em cabeçalho nenhum', () => {
    // Fora de um proxy conhecido, os dois cabeçalhos são campo livre. IP
    // forjado na trilha é pior que nenhum IP, porque parece confiável.
    expect(ipDaRequisicao(h({ 'x-forwarded-for': '1.2.3.4' }), false)).toBeNull()
    expect(ipDaRequisicao(h({ 'x-real-ip': '1.2.3.4' }), false)).toBeNull()
    expect(ipDaRequisicao(h({}), false)).toBeNull()
  })

  it('prefere o X-Real-IP, que o cliente não consegue acrescentar', () => {
    // Os dois proxies escrevem este cabeçalho a partir do endereço da conexão.
    expect(ipDaRequisicao(h({ 'x-real-ip': '203.0.113.9' }), true)).toBe('203.0.113.9')
  })

  it('o cliente não escolhe o próprio endereço mentindo no X-Forwarded-For', () => {
    // O CASO QUE DEU ORIGEM AO CONSERTO. O visitante manda um IP inventado; o
    // nginx acrescenta o real atrás. Antes, a função devolvia o inventado.
    const cabecalhos = h({
      'x-forwarded-for': '1.2.3.4, 198.51.100.7',
      'x-real-ip': '198.51.100.7',
    })
    expect(ipDaRequisicao(cabecalhos, true)).toBe('198.51.100.7')
    expect(ipDaRequisicao(cabecalhos, true)).not.toBe('1.2.3.4')
  })

  it('sem X-Real-IP, lê o ÚLTIMO da lista, que é o que o proxy acrescentou', () => {
    // Reserva para um proxy que só mande o x-forwarded-for. O primeiro elemento
    // é o que o cliente escreveu; o último é o que o proxy viu.
    expect(ipDaRequisicao(h({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }), true)).toBe(
      '198.51.100.7',
    )
  })

  it('uma cadeia de vários saltos ainda termina no salto mais próximo', () => {
    expect(
      ipDaRequisicao(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 198.51.100.7' }), true),
    ).toBe('198.51.100.7')
  })

  it('aguenta cabeçalho malformado sem devolver lixo', () => {
    expect(ipDaRequisicao(h({ 'x-forwarded-for': '' }), true)).toBeNull()
    expect(ipDaRequisicao(h({ 'x-forwarded-for': '   ' }), true)).toBeNull()
    expect(ipDaRequisicao(h({ 'x-forwarded-for': ',,' }), true)).toBeNull()
    expect(ipDaRequisicao(h({ 'x-real-ip': '  ' }), true)).toBeNull()
  })

  it('X-Real-IP vazio cai para o X-Forwarded-For em vez de devolver vazio', () => {
    expect(
      ipDaRequisicao(h({ 'x-real-ip': '  ', 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }), true),
    ).toBe('198.51.100.7')
  })
})
