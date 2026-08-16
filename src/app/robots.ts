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

/**
 * Gerado a cada pedido, e não uma vez no build.
 *
 * Por padrão o Next resolve este arquivo durante a construção da imagem e
 * grava o resultado em disco. Com o `APP_URL` no meio, isso significa que o
 * endereço declarado ao Google fica CONGELADO no endereço que estava no `.env`
 * na hora do build — e uma troca de domínio, feita do jeito natural (editar o
 * `.env`, reiniciar), não mudaria uma vírgula aqui.
 *
 * O defeito é silencioso: o site novo responde certo, as páginas trazem a
 * canônica certa, e só o `robots.txt` e o `sitemap.xml` continuam apontando o
 * buscador para o domínio velho. Ninguém olha esses dois arquivos depois de uma
 * virada; o sintoma aparece semanas depois, no Search Console.
 *
 * Duas linhas de configuração custam menos que essa aula. São dois arquivos de
 * texto pedidos por robô, algumas vezes ao dia — gerar na hora não pesa nada.
 */
export const dynamic = 'force-dynamic'

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
