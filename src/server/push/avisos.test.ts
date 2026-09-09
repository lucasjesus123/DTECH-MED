import { describe, expect, it, vi } from 'vitest'

/**
 * O ENVIO DO AVISO — e o que se faz com a resposta do fabricante.
 *
 * =============================================================================
 * O QUE ESTE TESTE PROTEGE
 * =============================================================================
 * A parte sutil do Web Push não é mandar: é CLASSIFICAR a resposta.
 *
 *   201/200  chegou
 *   404/410  o aparelho não existe mais → a linha tem de ser APAGADA
 *   qualquer  o servidor do fabricante caiu, a rede oscilou → tentar de novo
 *
 * Confundir os dois últimos é o defeito caro, e ele é silencioso dos dois
 * lados: tratar 410 como falha passageira faz o sistema gastar uma tentativa
 * por corrida, para sempre, num endereço morto; tratar uma queda como morte
 * apaga a inscrição de um motorista que está trabalhando, e ele para de receber
 * sem nunca saber por quê.
 *
 * =============================================================================
 * POR QUE O `web-push` É DUBLADO AQUI
 * =============================================================================
 * Ele fala TLS mesmo com endereço `http://` — é o comportamento certo dele, e
 * torna um servidor de mentira em texto puro inútil. Subir HTTPS com certificado
 * autoassinado dentro do teste traria uma dependência a mais para provar o que
 * não é nosso: a criptografia e o transporte são responsabilidade da
 * biblioteca, e ela tem os testes dela.
 *
 * O que é NOSSO é o que este arquivo mede: quem entra em `enviados`, quem entra
 * em `mortos` (e vai ser apagado do banco) e quem entra em `falharam`.
 */

const enviados: unknown[] = []

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: (sub: { endpoint: string }, corpo: string) => {
      enviados.push({ endpoint: sub.endpoint, corpo })
      // O caminho do endereço decide a resposta — é assim que um teste cobre
      // os três destinos sem rede nenhuma.
      if (sub.endpoint.includes('/410')) return Promise.reject({ statusCode: 410 })
      if (sub.endpoint.includes('/404')) return Promise.reject({ statusCode: 404 })
      if (sub.endpoint.includes('/500')) return Promise.reject({ statusCode: 500 })
      if (sub.endpoint.includes('/caiu')) return Promise.reject(new Error('socket hang up'))
      return Promise.resolve({ statusCode: 201 })
    },
  },
}))

const inscricao = (endpoint: string) => ({ endpoint, p256dh: 'chave', auth: 'segredo' })

async function comChaves() {
  vi.stubEnv('VAPID_PUBLIC_KEY', 'publica-de-teste')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'privada-de-teste')
  vi.resetModules()
  return import('./avisos')
}

describe('o aviso no celular', () => {
  it('separa quem recebeu, quem morreu e quem só falhou', async () => {
    const { enviarAviso } = await comChaves()

    const r = await enviarAviso(
      [
        inscricao('https://push.exemplo/ok/1'),
        inscricao('https://push.exemplo/ok/2'),
        inscricao('https://push.exemplo/410/3'),
        inscricao('https://push.exemplo/500/4'),
      ],
      { titulo: 'Retirada marcada', corpo: 'Clínica X · 14:00', destino: '/app/motorista' },
    )

    expect(r.enviados).toBe(2)
    // 410 = apagar a linha. É o único tipo de caso em que a inscrição some.
    expect(r.mortos).toEqual(['https://push.exemplo/410/3'])
    // 500 = tentar de novo. A inscrição continua viva.
    expect(r.falharam).toEqual(['https://push.exemplo/500/4'])
  })

  it('o 404 conta como aparelho morto, igual ao 410', async () => {
    const { enviarAviso } = await comChaves()
    const r = await enviarAviso([inscricao('https://push.exemplo/404/x')], {
      titulo: 'x',
      corpo: 'y',
      destino: '/app',
    })
    expect(r.enviados).toBe(0)
    expect(r.mortos).toHaveLength(1)
    expect(r.falharam).toHaveLength(0)
  })

  it('erro sem código HTTP é falha passageira, não morte', async () => {
    // Cabo arrancado, DNS que não respondeu, socket derrubado: nada disso diz
    // que o aparelho sumiu. Apagar a inscrição aqui seria calar o celular de
    // alguém por causa de um soluço de rede.
    const { enviarAviso } = await comChaves()
    const r = await enviarAviso([inscricao('https://push.exemplo/caiu/x')], {
      titulo: 'x',
      corpo: 'y',
      destino: '/app',
    })
    expect(r.mortos).toHaveLength(0)
    expect(r.falharam).toHaveLength(1)
  })

  it('manda o corpo que o service worker sabe ler', async () => {
    const { enviarAviso } = await comChaves()
    enviados.length = 0
    await enviarAviso([inscricao('https://push.exemplo/ok/9')], {
      titulo: 'Retirada marcada para você',
      corpo: 'Odonto São Bento · 09/09 14:00',
      destino: '/app/motorista',
      etiqueta: 'parada-abc',
    })
    const corpo = JSON.parse((enviados[0] as { corpo: string }).corpo)
    // Os quatro campos que `public/sw.js` lê no evento `push`. Um nome trocado
    // aqui e o aviso chega em branco no celular, sem erro em lugar nenhum.
    expect(corpo).toEqual({
      titulo: 'Retirada marcada para você',
      corpo: 'Odonto São Bento · 09/09 14:00',
      destino: '/app/motorista',
      etiqueta: 'parada-abc',
    })
  })

  it('sem chave VAPID não manda nada, e não quebra', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.resetModules()
    const { enviarAviso, ligado } = await import('./avisos')

    expect(ligado()).toBe(false)
    enviados.length = 0
    const r = await enviarAviso([inscricao('https://push.exemplo/ok/9')], {
      titulo: 'x',
      corpo: 'y',
      destino: '/app',
    })
    // Devolve vazio em silêncio: a empresa que não configurou não tem aviso, e
    // isso não é erro nenhum — o job da fila conclui em vez de falhar seis
    // vezes e ficar vermelho para sempre.
    expect(r).toEqual({ enviados: 0, mortos: [], falharam: [] })
    expect(enviados).toHaveLength(0)
  })
})
