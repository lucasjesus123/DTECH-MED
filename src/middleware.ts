import { NextResponse, type NextRequest } from 'next/server'

/**
 * Porteiro das rotas privadas e origem da Content-Security-Policy.
 *
 * A CSP vive aqui, e não no next.config, por um motivo concreto que só
 * apareceu quando o login foi testado no navegador de verdade:
 *
 *   `script-src 'self'` bloqueia os scripts INLINE que o Next injeta para
 *   inicializar a página. Sem eles a página não hidrata — e um formulário
 *   sem hidratação vira POST puro, a página recarrega inteira e todo o
 *   estado se perde. Na prática, quem errava a senha tinha de digitar o
 *   e-mail de novo, e o segundo envio nem chegava a autenticar.
 *
 * A saída errada seria abrir `'unsafe-inline'` em script-src, que é o mesmo
 * que desligar a proteção contra XSS. A saída certa é um **nonce por
 * requisição**: cada carregamento gera um número de uso único, só os scripts
 * marcados com ele executam, e um script injetado por um atacante não tem
 * como adivinhá-lo. O Next lê o nonce do próprio cabeçalho e o aplica.
 *
 * Sobre a autorização: aqui só se verifica a PRESENÇA do cookie, nunca a
 * validade da sessão. Este código roda no runtime de borda, sem banco, então
 * validar de verdade é impossível daqui — e fingir que dá seria pior que não
 * fazer nada. Quem autoriza é `exigirSessao()` em cada página e cada ação.
 */

const PRIVADAS = ['/painel', '/app']
const METODOS_ACEITOS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

function montarCSP(nonce: string, producao: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' deixa um script já autorizado carregar seus próprios
    // pedaços, que é como o Next divide o código. Em desenvolvimento o
    // recarregamento a quente exige eval; em produção, não.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${producao ? '' : "'unsafe-eval'"}`.trim(),
    // O 'unsafe-inline' em estilo é exigência do CSS crítico embutido. É bem
    // menos perigoso que em script: folha de estilo não executa código.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // blob: é a assinatura desenhada no visor; data: são os ícones embutidos.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(producao ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!METODOS_ACEITOS.has(req.method)) {
    return new NextResponse('Método não permitido', { status: 405 })
  }

  // Requisição que muda estado tem que vir da própria origem. Segunda camada
  // contra CSRF, além do SameSite=Strict do cookie de sessão.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origem = req.headers.get('origin')
    if (origem) {
      const permitidas = (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
      if (permitidas.length && !permitidas.includes(origem)) {
        return new NextResponse('Origem não permitida', { status: 403 })
      }
    }
  }

  if (PRIVADAS.some((p) => pathname.startsWith(p))) {
    if (!req.cookies.get('dtm_sessao')) {
      const url = req.nextUrl.clone()
      url.pathname = '/entrar'
      // Guarda para onde a pessoa queria ir, para devolvê-la ali depois do
      // login em vez de largá-la na home.
      url.searchParams.set('destino', pathname)
      return NextResponse.redirect(url)
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = montarCSP(nonce, process.env.NODE_ENV === 'production')

  // O Next lê `x-nonce` da requisição e carimba os scripts que ele injeta.
  const cabecalhos = new Headers(req.headers)
  cabecalhos.set('x-nonce', nonce)
  cabecalhos.set('content-security-policy', csp)

  const resposta = NextResponse.next({ request: { headers: cabecalhos } })
  resposta.headers.set('content-security-policy', csp)
  return resposta
}

export const config = {
  matcher: [
    // Fora: arquivos estáticos e imagens, que não executam script e não
    // precisam de nonce. Deixá-los passar pelo middleware só gastaria CPU.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
}
