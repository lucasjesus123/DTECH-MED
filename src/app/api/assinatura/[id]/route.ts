import { NextResponse } from 'next/server'
import { comEscopo } from '@/lib/db'
import { lerArquivo } from '@/server/arquivos/storage'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Entrega a imagem de uma assinatura.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA ROTA PRECISOU EXISTIR
 * ---------------------------------------------------------------------------
 * A assinatura era coletada no visor, gravada com hash, latitude e longitude —
 * e nunca era vista por ninguém. O painel mostrava o NOME de quem assinou e a
 * data; o traço em si só aparecia no PDF, se alguém abrisse o PDF.
 *
 * Isso esvazia a prova justamente onde ela é usada. "O cliente diz que não
 * recebeu" se resolve mostrando o rabisco, o nome e o documento de quem
 * recebeu, na tela, com a pessoa ao telefone — não pedindo para alguém procurar
 * um PDF numa lista.
 *
 * ---------------------------------------------------------------------------
 * A SEGURANÇA, IGUAL À DA FOTO
 * ---------------------------------------------------------------------------
 * Exige SESSÃO: assinatura é material interno, e é o documento mais sensível
 * que este sistema guarda — tem o traço da mão de uma pessoa e, na entrega, o
 * CPF dela.
 *
 * E o caminho do arquivo NÃO vem da URL: vem da linha no banco, lida dentro do
 * escopo da empresa da sessão. Quem tentar o id de uma assinatura de outra
 * franquia recebe 404, porque para ele aquela linha não existe. Sem isso, o id
 * na URL viraria um caminho de arquivo dirigido por quem chama.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Não autenticado', { status: 401 })

  const { id } = await ctx.params

  const assinatura = await comEscopo(contextoDe(sessao), (tx) =>
    tx.assinatura.findUnique({ where: { id }, select: { caminhoImagem: true } }),
  )
  if (!assinatura) return new NextResponse('Assinatura não encontrada', { status: 404 })

  const bytes = await lerArquivo(assinatura.caminhoImagem)
  if (!bytes) return new NextResponse('Arquivo indisponível', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      // O visor grava PNG: fundo transparente, que é o que faz o traço ficar
      // legível tanto no tema claro quanto no escuro.
      'Content-Type': 'image/png',
      // Uma assinatura não muda. Se mudasse, seria outra assinatura.
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
