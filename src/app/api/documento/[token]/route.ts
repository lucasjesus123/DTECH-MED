import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { lerArquivo } from '@/server/arquivos/storage'

/**
 * Entrega um PDF pelo token do documento.
 *
 * O cliente recebe este link no WhatsApp e o abre sem estar logado — então o
 * token é a credencial. Por isso ele é opaco e de alta entropia: com o número
 * do documento, quem recebeu o 41 tentaria o 42 e leria o contrato de outra
 * clínica.
 *
 * A busca é EXCLUSIVAMENTE pelo token. Não existe parâmetro de ordem, de
 * empresa nem de caminho — não há o que manipular para alcançar outro arquivo.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // Formato conferido antes de tocar o banco: descarta sondagem barata.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return new NextResponse('Documento não encontrado', { status: 404 })
  }

  const doc = await prisma.documento.findUnique({
    where: { tokenAcesso: token },
    select: { caminho: true, numero: true, tipo: true },
  })
  if (!doc) return new NextResponse('Documento não encontrado', { status: 404 })

  const bytes = await lerArquivo(doc.caminho)
  if (!bytes) return new NextResponse('Documento indisponível', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // `inline` abre no visualizador do celular em vez de baixar — é o que a
      // pessoa espera ao tocar num anexo do WhatsApp.
      'Content-Disposition': `inline; filename="${doc.numero}.pdf"`,
      // Documento de cliente não entra em cache compartilhado.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
