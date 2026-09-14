import { describe, expect, it } from 'vitest'
import { conferirSegredo, empresaDoNome, envelopeUazapi } from './webhook'

/**
 * O QUE ESTES TESTES PROTEGEM.
 *
 * Um webhook é uma porta que a internet inteira alcança e que não tem login.
 * O que separa o provedor de um estranho é só a conferência feita aqui — e
 * conferência frouxa numa porta dessas não dá erro em tela nenhuma: o sistema
 * simplesmente passa a acreditar em quem mandar o corpo certo.
 */

describe('a conferência do segredo', () => {
  it('aceita o segredo certo e recusa o errado', () => {
    expect(conferirSegredo('abc123', 'abc123')).toBe(true)
    expect(conferirSegredo('abc124', 'abc123')).toBe(false)
  })

  it('recusa quando não há segredo configurado — falha FECHADO', () => {
    // Instalação que ainda não configurou nada não pode aceitar qualquer
    // chamada: ela tem é de recusar todas até alguém configurar.
    expect(conferirSegredo('qualquer', undefined)).toBe(false)
    expect(conferirSegredo('qualquer', '')).toBe(false)
    expect(conferirSegredo(null, 'oSegredo')).toBe(false)
    expect(conferirSegredo('', 'oSegredo')).toBe(false)
  })

  it('recusa tamanho diferente sem estourar', () => {
    // `timingSafeEqual` do Node lança se os tamanhos diferem. Se isso subisse,
    // a rota devolveria 500 — e 500 diferente de 404 já conta ao atacante que
    // ele acertou o formato.
    expect(() => conferirSegredo('curto', 'um-segredo-bem-mais-longo')).not.toThrow()
    expect(conferirSegredo('curto', 'um-segredo-bem-mais-longo')).toBe(false)
  })

  it('não distingue prefixo certo de prefixo errado', () => {
    // O ataque é medir o tempo: se comparar caractere a caractere, "aaaa" e
    // "zzzz" contra "aaaz" gastariam tempos diferentes e entregariam o segredo.
    expect(conferirSegredo('aaaz', 'aaaa')).toBe(false)
    expect(conferirSegredo('zzzz', 'aaaa')).toBe(false)
  })
})

describe('de qual empresa o evento veio', () => {
  it('lê o tenant do nome que nós mesmos demos à instância', () => {
    expect(empresaDoNome('dtechmed_cmtx123abc')).toBe('cmtx123abc')
  })

  it('recusa nome de outro sistema ou fora do padrão', () => {
    expect(empresaDoNome('outrosistema_cmtx123')).toBeNull()
    expect(empresaDoNome('dtechmed_')).toBeNull()
    expect(empresaDoNome(undefined)).toBeNull()
    // Nada que possa virar caminho, consulta ou curinga entra como id.
    expect(empresaDoNome('dtechmed_../../etc/passwd')).toBeNull()
    expect(empresaDoNome("dtechmed_' OR 1=1--")).toBeNull()
    expect(empresaDoNome('dtechmed_%')).toBeNull()
  })
})

describe('o envelope que a uazapi entrega', () => {
  it('aceita o formato PLANO confirmado em produção', () => {
    const r = envelopeUazapi.safeParse({
      owner: '554796187355',
      instanceName: 'dtechmed_abc',
      token: 'TOKEN_DA_INSTANCIA',
      chat: { phone: '555193667706', name: 'Fulano' },
      message: { messageid: '3EB0538DA65A59F6D8A251', fromMe: false, text: 'Olá' },
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.token).toBe('TOKEN_DA_INSTANCIA')
  })

  it('sobrevive a campo novo e a campo que sumiu', () => {
    // O provedor muda o payload sem avisar. Um evento a mais não pode derrubar
    // o receptor, e o único indispensável é o token.
    expect(envelopeUazapi.safeParse({ token: 't', campoQueNaoExistia: 42 }).success).toBe(true)
    expect(envelopeUazapi.safeParse({ token: 't' }).success).toBe(true)
  })

  it('RECUSA corpo sem token — sem ele não há de quem o evento é', () => {
    expect(envelopeUazapi.safeParse({ message: { text: 'oi' } }).success).toBe(false)
    expect(envelopeUazapi.safeParse({ token: '' }).success).toBe(false)
    expect(envelopeUazapi.safeParse('não é objeto').success).toBe(false)
  })
})
