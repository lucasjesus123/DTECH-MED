import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

/**
 * O sitemap.
 *
 * O site tem uma página só, e mesmo assim o arquivo vale: é por ele que o
 * Google Search Console confirma qual é a URL canônica e quando a página
 * mudou. Sem ele, o buscador descobre a home pelos links de fora e fica sem
 * saber se `dtechmed.com.br`, `www.dtechmed.com.br` e a versão com barra no
 * fim são a mesma coisa.
 *
 * As âncoras (`#servicos`, `#a-empresa`) NÃO entram. Fragmento não é URL
 * distinta para o buscador; listá-lo seria repetir a mesma página cinco vezes
 * e diluir o sinal.
 *
 * `lastModified` sai do relógio do servidor no momento do pedido.
 */

/**
 * Gerado a cada pedido, pelo mesmo motivo explicado no `robots.ts`: o `url`
 * abaixo sai do `APP_URL`, e um sitemap resolvido no build guardaria o domínio
 * antigo para sempre depois de uma troca de endereço.
 */
export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: env.APP_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
