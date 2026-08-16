import { NextResponse } from 'next/server'
import { lerFotoDoSite } from '@/server/arquivos/storage'
import { FOTOS, type NomeFoto } from '../../foto'

/**
 * Serve as fotos que o dono enviou pelo painel.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELA NÃO MORA EM /api, COMO AS OUTRAS ROTAS DE ARQUIVO
 * ---------------------------------------------------------------------------
 * Ela nasceu em `/api/foto-site/`, que parecia o lugar óbvio, e estava errado
 * por duas razões que só apareceram medindo a resposta de verdade:
 *
 *  1. **O `next.config` marca tudo sob `/api` como `no-store`** — regra certa,
 *     porque ali trafega dado de cliente de uma franquia. O efeito colateral
 *     era a foto da primeira dobra, a maior imagem do site, sendo baixada de
 *     novo a cada visita de cada pessoa.
 *  2. **O `robots.txt` proíbe `/api`** — também certo, para o painel e o portal
 *     do cliente não caírem no índice. Só que isso impedia o Google de buscar a
 *     imagem principal da home ao renderizar a página.
 *
 * As duas regras continuam valendo e continuam certas. O que estava no lugar
 * errado era a foto: ela não é uma interface de programa, é um arquivo público,
 * igual ao que mora em `public/`. A única diferença é que este foi gravado em
 * disco depois do build.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELA É PÚBLICA, E AS OUTRAS ROTAS DE ARQUIVO NÃO SÃO
 * ---------------------------------------------------------------------------
 * `/api/foto/[id]` entrega foto de ordem de serviço: ela pertence a uma
 * empresa, prova o estado de um equipamento de um cliente, e por isso passa por
 * sessão e escopo.
 *
 * Estas aqui são a home. Existem para serem vistas por quem nunca entrou no
 * sistema. Pedir sessão seria pedir login para ver o site.
 *
 * O que continua valendo é a trava do caminho, e ela é mais estreita que a das
 * outras: o nome não é só higienizado, ele precisa ser um dos slots
 * DECLARADOS no código. Não existe caminho a percorrer, porque não existe
 * caminho vindo de fora — só um nome de uma lista fechada.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slot: string }> },
) {
  const { slot } = await ctx.params

  // Lista fechada. `..`, `/`, nome de arquivo do sistema — nada disso está na
  // lista, então nada disso passa.
  if (!(slot in FOTOS)) return new NextResponse('Não encontrado', { status: 404 })

  const bytes = await lerFotoDoSite(FOTOS[slot as NomeFoto])
  if (!bytes) return new NextResponse('Não encontrado', { status: 404 })

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/jpeg',
      /**
       * Um ano, imutável.
       *
       * Parece agressivo para uma imagem que o dono troca pelo painel, e é
       * justamente o contrário: a URL carrega `?v=<instante da gravação>`, então
       * trocar a foto MUDA A URL. O que está guardado nos caches nunca precisa
       * ser invalidado, porque nunca mais é pedido.
       *
       * É a diferença entre "cache curto e torcer" e "cache eterno de uma coisa
       * que não muda". A segunda é a que faz a foto nova aparecer na hora E a
       * antiga não ser baixada de novo por quem já a tem.
       */
      'cache-control': 'public, max-age=31536000, immutable',
      // A foto do site não é segredo, mas também não precisa ser embutida por
      // terceiros nem interpretada como outra coisa.
      'x-content-type-options': 'nosniff',
      'content-length': String(bytes.length),
    },
  })
}
