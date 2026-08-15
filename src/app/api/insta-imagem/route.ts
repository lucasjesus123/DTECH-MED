import { NextResponse } from 'next/server'

/**
 * Espelho das imagens do Instagram.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO APONTAR DIRETO PARA A IMAGEM DO INSTAGRAM
 * ---------------------------------------------------------------------------
 * Três motivos, e cada um sozinho já bastaria:
 *
 *  1. A política de segurança do site só aceita imagem do próprio domínio
 *     (`img-src 'self'`). Apontar para fora exigiria abrir uma exceção — e
 *     exceção em política de segurança é coisa que se abre uma vez e fica
 *     aberta para sempre.
 *  2. O endereço que o Instagram devolve EXPIRA. Ele vem com uma assinatura
 *     com prazo; em algumas horas a mesma URL passa a devolver erro. Um site
 *     que aponta direto para lá amanhece com seis retângulos quebrados no
 *     rodapé, e ninguém percebe até um cliente comentar.
 *  3. Passando por aqui, o navegador do visitante nunca fala com o Instagram.
 *     Ou seja: quem entra no site não é rastreado por eles.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO É UM PROXY ABERTO
 * ---------------------------------------------------------------------------
 * Uma rota que busca a URL que mandarem é um convite: dá para usar o nosso
 * servidor para varrer a rede interna da VPS, bater em `169.254.169.254` atrás
 * de credencial de nuvem, ou simplesmente consumir nossa banda espelhando
 * arquivo alheio. É a família de falhas chamada SSRF, e é das mais exploradas
 * que existem.
 *
 * A trava é a lista fechada de domínios abaixo, conferida no HOST já
 * interpretado pelo `URL` — não com `includes()` no texto da URL, que aceitaria
 * `https://cdninstagram.com.site-do-atacante.ru/`. Fora da lista, 400, sem
 * sequer tentar a conexão.
 */

/**
 * Os domínios de onde o Instagram serve mídia. A comparação exige ponto antes
 * do sufixo (ou igualdade exata) para `malcdninstagram.com` não passar.
 */
const PERMITIDOS = ['cdninstagram.com', 'fbcdn.net', 'instagram.com']

function hostPermitido(host: string): boolean {
  return PERMITIDOS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** 10 MB. Foto de rede social não chega perto; o teto existe contra surpresa. */
const LIMITE_BYTES = 10 * 1024 * 1024

export async function GET(req: Request) {
  const bruta = new URL(req.url).searchParams.get('u')
  if (!bruta) return new NextResponse('Falta o parâmetro u', { status: 400 })

  let alvo: URL
  try {
    alvo = new URL(bruta)
  } catch {
    return new NextResponse('Endereço inválido', { status: 400 })
  }

  if (alvo.protocol !== 'https:') return new NextResponse('Só https', { status: 400 })
  if (!hostPermitido(alvo.hostname)) return new NextResponse('Domínio não permitido', { status: 400 })

  let resposta: Response
  try {
    resposta = await fetch(alvo, {
      // Sem `redirect: 'follow'` para outro domínio: o Instagram poderia
      // redirecionar para qualquer lugar e a lista de permitidos viraria
      // decoração.
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'image/*' },
    })
  } catch {
    return new NextResponse('Não consegui buscar a imagem', { status: 502 })
  }

  if (!resposta.ok) return new NextResponse('Imagem indisponível', { status: 502 })

  const tipo = resposta.headers.get('content-type') ?? ''
  // O que volta precisa SER imagem. Sem esta conferência, um dia o CDN devolve
  // uma página de erro em HTML e nós a serviríamos do nosso domínio.
  if (!tipo.startsWith('image/')) return new NextResponse('Não é imagem', { status: 502 })

  const bytes = await resposta.arrayBuffer()
  if (bytes.byteLength > LIMITE_BYTES) return new NextResponse('Imagem grande demais', { status: 502 })

  return new NextResponse(bytes, {
    headers: {
      'content-type': tipo,
      // Uma hora no navegador, um dia na borda. A foto de uma publicação não
      // muda depois de publicada; o que muda é a lista, e essa é recarregada
      // pelo componente que monta a grade.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
    },
  })
}
