import { NextResponse } from 'next/server'
import { comEscopo } from '@/lib/db'
import { lerArquivo } from '@/server/arquivos/storage'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Entrega a foto de um equipamento.
 *
 * Diferente do PDF, a foto exige SESSÃO: ela é material interno da oficina, e
 * não algo que se manda ao cliente por link.
 *
 * O ponto que fecha o isolamento entre franquias: o caminho do arquivo não vem
 * da URL, vem da LINHA no banco — e a leitura passa pelo escopo da empresa da
 * sessão. Quem tentar o id de uma foto de outra franquia recebe 404, porque
 * para ele a linha não existe.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await ctx.params
  const { searchParams } = new URL(req.url)
  const miniatura = searchParams.get('t') === '1'

  const foto = await comEscopo(contextoDe(sessao), (tx) =>
    tx.foto.findUnique({
      where: { id },
      select: { caminho: true, caminhoThumb: true },
    }),
  )
  if (!foto) return new NextResponse('Foto não encontrada', { status: 404 })

  const alvo = miniatura ? (foto.caminhoThumb ?? foto.caminho) : foto.caminho
  const bytes = await lerArquivo(alvo)
  if (!bytes) return new NextResponse('Arquivo indisponível', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Imutável: o nome do arquivo é derivado do hash do conteúdo, então uma
      // foto diferente tem outro id e outro endereço.
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
