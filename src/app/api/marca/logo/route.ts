import { NextResponse } from 'next/server'
import { comEscopo } from '@/lib/db'
import { lerArquivo } from '@/server/arquivos/storage'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Entrega a logo da empresa de QUEM ESTÁ PEDINDO.
 *
 * =============================================================================
 * A ROTA NÃO RECEBE IDENTIFICADOR NENHUM, E ISSO É O DESENHO
 * =============================================================================
 * A empresa vem da sessão, e o caminho do arquivo vem da linha do banco lida
 * dentro do escopo dela. Não há id na URL para trocar, então não há como pedir
 * a marca do vizinho — o isolamento entre franquias aqui não depende de um
 * `where` que alguém possa esquecer de escrever amanhã.
 *
 * É a mesma regra da foto de catálogo, levada ao limite: lá o id existe e é
 * conferido; aqui ele nem existe.
 */
export async function GET() {
  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Não autenticado', { status: 401 })

  const marca = await comEscopo(contextoDe(sessao), (tx) =>
    tx.marcaEmpresa.findFirst({ select: { logoCaminho: true } }),
  )
  if (!marca?.logoCaminho) return new NextResponse('Sem logo', { status: 404 })

  const bytes = await lerArquivo(marca.logoCaminho)
  if (!bytes) return new NextResponse('Arquivo indisponível', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      // O nome do arquivo sai do hash do conteúdo: trocar a logo muda o
      // endereço, então o navegador nunca entrega a marca velha. Mas o
      // ENDEREÇO desta rota é fixo — por isso o cache é curto, e a tela pede
      // com um carimbo de versão quando quer ver a troca na hora.
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
