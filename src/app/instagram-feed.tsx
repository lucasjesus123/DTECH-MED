import { EMPRESA } from '@/lib/empresa'

/**
 * A grade das últimas publicações do Instagram.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEM
 * ---------------------------------------------------------------------------
 * De um endereço JSON que um serviço de feed gera depois que você conecta a
 * conta lá (Behold, LightWidget, SnapWidget e afins). O serviço fica com o
 * trabalho chato: fazer o login no Instagram, guardar o token e renová-lo
 * antes de vencer.
 *
 * Do lado de cá, quem busca é o NOSSO SERVIDOR, uma vez por hora. Isso importa
 * mais do que parece: nenhum script de terceiro entra na página, a política de
 * segurança continua fechada, o visitante não é rastreado pelo serviço, e o
 * visual é o nosso e não o do widget.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O FORMATO É LIDO COM TANTA PACIÊNCIA
 * ---------------------------------------------------------------------------
 * Cada serviço nomeia os campos do seu jeito: uns mandam `mediaUrl`, outros
 * `media_url`, outros `thumbnailUrl`. Uns devolvem a lista na raiz, outros
 * dentro de `posts` ou de `data`.
 *
 * Em vez de escolher um e amarrar o site a ele, a leitura aceita todos os
 * nomes conhecidos. O custo são vinte linhas; o ganho é você poder trocar de
 * serviço um dia sem mexer em código, e é não descobrir na hora do deploy que
 * o campo tinha outro nome.
 *
 * ---------------------------------------------------------------------------
 * O QUE ACONTECE QUANDO DÁ ERRADO
 * ---------------------------------------------------------------------------
 * Nada aparece, e o resto da seção segue de pé. Serviço fora do ar, endereço
 * errado, formato mudado — em todos os casos o componente devolve `null` e o
 * bloco "Bastidores da oficina" continua com o texto e o botão de seguir.
 *
 * Feed é enfeite; o botão que leva ao perfil é o essencial. Enfeite que cai
 * não pode derrubar o essencial junto.
 */

type Publicacao = {
  id: string
  link: string
  imagem: string
  texto: string
  ehVideo: boolean
}

/** Quantas mostrar. Seis fecha duas linhas de três, e três de duas no celular. */
const QUANTAS = 6

/** Primeiro valor de texto não vazio entre as chaves candidatas. */
function campo(o: Record<string, unknown>, ...nomes: string[]): string | null {
  for (const n of nomes) {
    const v = o[n]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function interpretar(bruto: unknown): Publicacao[] {
  const lista = Array.isArray(bruto)
    ? bruto
    : typeof bruto === 'object' && bruto !== null
      ? ((bruto as Record<string, unknown>).posts ??
        (bruto as Record<string, unknown>).data ??
        (bruto as Record<string, unknown>).media ??
        [])
      : []

  if (!Array.isArray(lista)) return []

  const saida: Publicacao[] = []
  for (const cru of lista) {
    if (typeof cru !== 'object' || cru === null) continue
    const o = cru as Record<string, unknown>

    // Em vídeo, `mediaUrl` costuma ser o arquivo do vídeo — pesado e que não
    // renderiza numa tag de imagem. A miniatura vem primeiro por isso.
    const imagem = campo(o, 'thumbnailUrl', 'thumbnail_url', 'mediaUrl', 'media_url', 'imageUrl', 'image', 'url')
    const link = campo(o, 'permalink', 'permalink_url', 'link', 'postUrl')
    if (!imagem || !link) continue

    const tipo = (campo(o, 'mediaType', 'media_type', 'type') ?? '').toUpperCase()

    saida.push({
      id: campo(o, 'id', 'mediaId', 'media_id') ?? link,
      link,
      imagem,
      texto: (campo(o, 'caption', 'text', 'title') ?? '').slice(0, 160),
      ehVideo: tipo.includes('VIDEO') || tipo.includes('REEL'),
    })
    if (saida.length === QUANTAS) break
  }
  return saida
}

async function buscar(): Promise<Publicacao[]> {
  try {
    const r = await fetch(EMPRESA.instagramFeed, {
      // Uma hora. Buscar a cada visita castigaria o serviço e deixaria a home
      // dependente do tempo de resposta dele.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' },
    })
    if (!r.ok) return []
    return interpretar(await r.json())
  } catch {
    // Silencioso de propósito: o rodapé de um site institucional não é lugar
    // de mostrar erro de integração para o cliente.
    return []
  }
}

export async function InstagramFeed({ className }: { className?: string }) {
  if (!EMPRESA.instagramFeed) return null

  const posts = await buscar()
  if (posts.length === 0) return null

  return (
    <ul className={className}>
      {posts.map((p) => (
        <li key={p.id}>
          <a href={p.link} target="_blank" rel="noopener noreferrer">
            {/* `img` cru, e não o componente de imagem do Next: o otimizador
                dele precisaria da lista de domínios externos autorizada em
                configuração, e o endereço do CDN do Instagram muda. Aqui a
                imagem já passa pelo nosso espelho, que é o que a política de
                segurança exige de qualquer jeito. */}
            <img
              src={`/api/insta-imagem?u=${encodeURIComponent(p.imagem)}`}
              alt={p.texto || 'Publicação da DTECH MED no Instagram'}
              loading="lazy"
              decoding="async"
              width={400}
              height={400}
            />
            {p.ehVideo ? <span aria-hidden="true">▶</span> : null}
          </a>
        </li>
      ))}
    </ul>
  )
}
