import { NextResponse } from 'next/server'
import { comEscopo } from '@/lib/db'
import { lerArquivo } from '@/server/arquivos/storage'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * Entrega a foto de catálogo de uma peça ou de um equipamento.
 *
 * =============================================================================
 * O QUE FECHA O ISOLAMENTO ENTRE FRANQUIAS
 * =============================================================================
 * O caminho do arquivo NÃO vem da URL — vem da linha no banco, e a leitura
 * passa pelo escopo da empresa da sessão. Quem tentar o id de uma peça de outra
 * franquia recebe 404, porque para ele aquela linha não existe.
 *
 * É a mesma regra da foto de ordem, e ela é a diferença entre um identificador
 * que revela e um que não revela: com o caminho vindo da URL, bastaria trocar
 * um id para ler o acervo do vizinho.
 *
 * =============================================================================
 * POR QUE EXIGE SESSÃO
 * =============================================================================
 * O catálogo de peças é material interno: preço de custo, fornecedor e
 * localização na prateleira aparecem ao lado desta imagem. A foto sozinha não
 * revela nada disso, mas servi-la aberta transformaria os ids em um jeito de
 * mapear o estoque de uma franquia de fora.
 */

const TIPOS = new Set(['peca', 'equipamento'])

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tipo: string; id: string }> },
) {
  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Não autenticado', { status: 401 })

  const { tipo, id } = await ctx.params
  if (!TIPOS.has(tipo)) return new NextResponse('Tipo desconhecido', { status: 404 })

  const { searchParams } = new URL(req.url)
  const miniatura = searchParams.get('t') === '1'

  const linha = await comEscopo(contextoDe(sessao), (tx) =>
    tipo === 'peca'
      ? tx.peca.findUnique({
          where: { id },
          select: { fotoCaminho: true, fotoCaminhoThumb: true },
        })
      : tx.equipamento.findUnique({
          where: { id },
          select: { fotoCaminho: true, fotoCaminhoThumb: true },
        }),
  )
  if (!linha?.fotoCaminho) return new NextResponse('Sem foto', { status: 404 })

  const alvo = miniatura ? (linha.fotoCaminhoThumb ?? linha.fotoCaminho) : linha.fotoCaminho
  const bytes = await lerArquivo(alvo)
  if (!bytes) return new NextResponse('Arquivo indisponível', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Imutável: o nome do arquivo sai do hash do conteúdo, então trocar a
      // foto muda o endereço e o navegador nunca entrega a imagem velha.
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
