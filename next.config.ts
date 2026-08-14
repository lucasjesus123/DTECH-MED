import type { NextConfig } from 'next'

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 *
 * Vão aqui, e não no nginx, de propósito: a gaveta da VPS é compartilhada com
 * outros sistemas, e amarrar a política ao servidor web faria a proteção
 * depender de uma configuração que não vive neste repositório. Aqui ela viaja
 * junto com o código e vale igual em qualquer lugar onde o app rodar.
 */
// A Content-Security-Policy NÃO fica aqui: ela precisa de um nonce por
// requisição, e isso só existe no middleware. Ver src/middleware.ts.
const nextConfig: NextConfig = {
  // Saída enxuta para o contêiner: só o necessário para servir.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // O pdfkit nunca pode ser empacotado: ele lê as métricas das fontes padrão de
  // arquivos `.afm` no próprio diretório, em tempo de execução. Empacotado, o
  // `require` some mas os arquivos não vão junto — e o erro só aparece na hora
  // de gerar o primeiro PDF, com `ENOENT: data/Helvetica.afm`. Verificado na
  // prática antes de escrever esta linha.
  //
  // O Dockerfile instala a árvore dele num estágio próprio e a copia para a
  // imagem final; esta declaração é o outro lado do mesmo acordo, garantindo
  // que o Next também o resolva do disco em vez de embutir.
  serverExternalPackages: ['pdfkit'],

  experimental: {
    // As Server Actions só aceitam requisição da própria origem.
    serverActions: { allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean) },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Um ano, com subdomínios. Só surte efeito sob HTTPS.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Câmera e localização são liberadas porque os apps de campo
          // dependem delas; o resto fica fechado.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
      {
        // Nada que venha do painel ou dos apps deve ser guardado em cache
        // compartilhado: é dado de cliente de uma franquia específica.
        source: '/(painel|app|api)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ]
  },
}

export default nextConfig
