import { existsSync } from 'node:fs'
import path from 'node:path'
import Image from 'next/image'
import { versaoFotoDoSite } from '@/server/arquivos/storage'

/**
 * As fotos do site, com degradação graciosa.
 *
 * O problema que isto resolve: uma `<img>` apontando para arquivo que não
 * existe vira uma caixa quebrada, com o ícone de imagem partida — e isso é
 * pior que não ter foto nenhuma. É o defeito nº 33 da lista de anti-padrões,
 * e o mais fácil de deixar passar, porque em desenvolvimento o arquivo
 * costuma estar lá.
 *
 * Aqui a existência é conferida A CADA PEDIDO. Se o arquivo não existe, o
 * componente devolve `null` e quem chama mostra o que tiver de alternativa — a
 * marca d'água, o osciloscópio, ou nada. Ninguém vê caixa quebrada, e ninguém
 * precisa lembrar de tirar a tag.
 *
 * A cada pedido, e não uma vez na partida, porque as fotos agora entram pelo
 * painel: o dono envia uma e ela precisa aparecer no recarregar seguinte, não
 * no próximo deploy.
 */

const PASTA = 'fotos'

/** Os nomes que o site procura. Um por lugar onde foto muda o jogo. */
export const FOTOS = {
  /** Primeira dobra, tela cheia. A mais importante das sete. */
  oficina: 'oficina',
  /** Seção do prontuário: mão de técnico com ferramenta dentro do aparelho. */
  bancada: 'bancada',
  /** Os quatro tipos de equipamento que a DTECH atende. */
  estetica: 'estetica',
  medico: 'medico',
  odontologico: 'odontologico',
  hospitalar: 'hospitalar',
  /** Transporte: van ou caixa lacrada. */
  logistica: 'logistica',
  /** Segunda foto de bancada, para o carrossel não repetir tão cedo. */
  bancada2: 'bancada2',
  /** Um close do trabalho fino: composto sendo aplicado. */
  detalhe: 'detalhe',
} as const

export type NomeFoto = keyof typeof FOTOS

/**
 * Onde a foto está, ou `null`.
 *
 * ---------------------------------------------------------------------------
 * DUAS ORIGENS, NESTA ORDEM
 * ---------------------------------------------------------------------------
 *  1. **A que o dono enviou pelo painel**, guardada no acervo. Ganha sempre:
 *     se ele trocou a foto pela tela, é essa que ele quer ver.
 *  2. **A que veio na imagem do sistema**, em `public/fotos/`. É o piso — a
 *     foto de fábrica, que continua valendo enquanto ninguém enviar outra.
 *
 * Tirar a foto enviada pelo painel faz o site voltar sozinho para a de fábrica.
 * É o que transforma "trocar a foto" numa operação sem medo: dá para desfazer.
 *
 * Entre as de fábrica, a busca é por peso: AVIF pesa menos que WebP, que pesa
 * menos que JPEG, para a mesma qualidade aparente.
 *
 * ---------------------------------------------------------------------------
 * O `?v=` NÃO É ENFEITE
 * ---------------------------------------------------------------------------
 * O número é o instante em que o arquivo foi gravado. Sem ele, o Next
 * continuaria servindo a versão otimizada antiga — que ele guarda indexada pela
 * URL — e o dono enviaria a foto nova, veria a velha, enviaria de novo, e
 * concluiria que o sistema não salva. Aconteceu neste projeto, com as fotos de
 * `public/fotos` trocadas por arquivos de mesmo nome.
 */
export function acharFoto(nome: NomeFoto): string | null {
  const enviada = versaoFotoDoSite(FOTOS[nome])
  if (enviada !== null) return `/foto-site/${nome}?v=${enviada}`

  for (const ext of ['avif', 'webp', 'jpg']) {
    const rel = `/${PASTA}/${FOTOS[nome]}.${ext}`
    if (existsSync(path.join(process.cwd(), 'public', PASTA, `${FOTOS[nome]}.${ext}`))) {
      return rel
    }
  }
  return null
}

type Props = {
  nome: NomeFoto
  /** Descreve a CENA para quem não enxerga. Não repita o nome da seção. */
  alt: string
  className?: string
  /**
   * `true` só para a foto da primeira dobra. Ela é o maior elemento visível ao
   * abrir a página — o que o navegador mede como LCP — e precisa começar a
   * baixar imediatamente, sem esperar o resto da fila.
   */
  prioridade?: boolean
  larguras?: string
}

export function Foto({ nome, alt, className, prioridade = false, larguras }: Props) {
  const src = acharFoto(nome)
  if (!src) return null

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      priority={prioridade}
      // Sem isto o navegador baixa a imagem no tamanho da tela mesmo quando ela
      // ocupa um quarto dela — e no 4G isso é a diferença entre abrir e travar.
      sizes={larguras ?? '(max-width: 720px) 100vw, 50vw'}
      quality={78}
    />
  )
}
