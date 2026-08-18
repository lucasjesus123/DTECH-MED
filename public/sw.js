/*
 * Service worker do app de campo.
 *
 * ===========================================================================
 * POR QUE ELE EXISTE
 * ===========================================================================
 * O aplicativo é usado na rua: dentro da van, no subsolo de uma clínica, num
 * hospital com paredes de concreto. Sem service worker, cada oscilação de sinal
 * vira o dinossauro do navegador — e a pessoa perde a tela, o contexto e a
 * confiança na ferramenta. Ela então volta a anotar no papel, que é o que o
 * sistema existe para acabar.
 *
 * ===========================================================================
 * O QUE ELE FAZ, E O QUE ELE NÃO FAZ
 * ===========================================================================
 * FAZ: guarda a casca do aplicativo — código, estilos, ícones, fontes — e uma
 * página de "sem conexão" que explica o que está acontecendo e o que a pessoa
 * pode fazer. Com isso o app ABRE offline em vez de quebrar.
 *
 * NÃO FAZ: não guarda resposta de POST, não guarda ação de servidor, e não
 * finge que salvou. Assinatura, foto e mudança de etapa só valem confirmadas
 * pelo servidor — é dinheiro, é prova e é a palavra da empresa com o cliente.
 * Um "salvo" mentiroso em campo é pior que um erro honesto: o motorista vai
 * embora achando que registrou.
 *
 * Por isso a estratégia é diferente por tipo de pedido:
 *
 *   estático (/_next/static, ícones, fontes)  → cache primeiro, é imutável
 *   navegação (abrir uma tela)                → rede primeiro, cache de socorro
 *   qualquer outra coisa                      → rede, sem cache
 */

const VERSAO = 'dtechmed-campo-v1'
const CASCA = `${VERSAO}-casca`
const PAGINAS = `${VERSAO}-paginas`

/** O mínimo para a tela abrir e se explicar. */
const ESSENCIAL = ['/sem-conexao', '/icone-192.png', '/icone-512.png', '/manifest.webmanifest']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const c = await caches.open(CASCA)
      // `Promise.allSettled`: um ícone que falhe não pode impedir a instalação
      // inteira do service worker.
      await Promise.allSettled(ESSENCIAL.map((u) => c.add(u)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Limpa as versões antigas. Sem isto, cada publicação deixa um cache
      // órfão no aparelho de quem usa, para sempre.
      const nomes = await caches.keys()
      await Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (evento) => {
  const req = evento.request

  // Só GET. POST é ação — assinatura, foto, etapa — e ação não se guarda.
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // A ação de servidor do Next viaja como GET com este cabeçalho em alguns
  // casos de navegação; ela nunca deve sair do cache.
  if (req.headers.get('rsc') || url.searchParams.has('_rsc')) return

  // --- estático: imutável, cache primeiro ---------------------------------
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)
  ) {
    evento.respondWith(
      (async () => {
        const guardado = await caches.match(req)
        if (guardado) return guardado
        const resposta = await fetch(req)
        if (resposta.ok) (await caches.open(CASCA)).put(req, resposta.clone())
        return resposta
      })(),
    )
    return
  }

  // --- navegação: rede primeiro, cache de socorro --------------------------
  //
  // Rede primeiro porque o dado importa: a rota de hoje mudou, a parada foi
  // reatribuída, a ordem andou. Servir a versão de ontem sem avisar seria pior
  // que não abrir. O cache entra só quando a rede não responde — e aí a tela
  // que aparece é a última verdadeira que a pessoa viu, não uma invenção.
  if (req.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          const resposta = await fetch(req)
          if (resposta.ok && url.pathname.startsWith('/app')) {
            ;(await caches.open(PAGINAS)).put(req, resposta.clone())
          }
          return resposta
        } catch {
          const guardado = await caches.match(req)
          if (guardado) return guardado
          const socorro = await caches.match('/sem-conexao')
          if (socorro) return socorro
          return new Response('Sem conexão.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
  }
})
