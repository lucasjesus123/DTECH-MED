import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

/**
 * O robots.txt.
 *
 * Ele não é sobre "deixar o Google entrar" — o padrão já é entrar. Ele existe
 * para MANTER FORA o que não deve ser indexado, e aqui isso é a metade do
 * sistema: o painel, os aplicativos de campo, as rotas de API e o portal do
 * cliente.
 *
 * O portal (`/os/...`) é o caso mais sério. O link chega ao cliente por
 * WhatsApp e não pede senha — é um token longo na URL que faz o papel de
 * chave. Se um desses links for indexado, a ordem de serviço de uma clínica
 * passa a ser achável no Google por qualquer pessoa. O `noindex` no cabeçalho
 * da própria página é a trava de verdade; esta entrada é a segunda.
 *
 * `/entrar` fica de fora do índice por outro motivo: página de login
 * indexada só serve para aparecer na busca do nome da empresa acima da home,
 * e para dar alvo a quem varre a internet procurando formulário de senha.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/painel', '/app', '/api', '/os', '/entrar'],
    },
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  }
}
