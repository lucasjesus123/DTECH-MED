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
 * `lastModified` sai da data do processo, que é a hora em que este build subiu
 * — que é exatamente quando o conteúdo mudou pela última vez.
 */
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
