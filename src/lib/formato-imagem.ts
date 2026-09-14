/**
 * O QUE O ARQUIVO É — e não o que ele diz que é.
 *
 * =============================================================================
 * O BURACO QUE ISTO FECHA
 * =============================================================================
 * O `storage.ts` prometia, no próprio comentário, que *"a validação olha os
 * BYTES do arquivo, não o `Content-Type` que o navegador declarou"*. A promessa
 * era meia verdade, e a metade que faltava era a que importa:
 *
 *     if (!TIPOS.has(arquivo.type))     // ← o MIME que o CLIENTE declarou
 *     ...
 *     meta = await sharp(bruto).metadata()   // ← o sharp fareja o formato REAL
 *
 * `arquivo.type` vem do navegador e se troca num cabeçalho. O `sharp` de fato
 * recusa o que não é imagem — mas ele aceita QUALQUER imagem que saiba ler, e
 * ele sabe ler muito mais do que JPEG, PNG e WebP. Nesta instalação ele lê HEIF
 * de buffer (`libvips 8.18.3`), e o decodificador de HEIF é o libheif — o mesmo
 * da GHSA-rgj7-g3m4-5g8c.
 *
 * Então o caminho existia inteiro: qualquer pessoa com login de técnico ou de
 * motorista montava um `.heic` malicioso, declarava `image/jpeg`, passava pela
 * lista de tipos, e o arquivo chegava ao decodificador vulnerável.
 *
 * =============================================================================
 * POR QUE A CONFERÊNCIA VEM ANTES DO SHARP, E NÃO DEPOIS
 * =============================================================================
 * A correção óbvia seria olhar `meta.format` depois do `metadata()`. Ela fecha
 * o buraco pela metade: para saber o formato, o `metadata()` já precisou ABRIR
 * o arquivo — quer dizer, o decodificador vulnerável já rodou antes de a
 * conferência acontecer. Tarde demais.
 *
 * Aqui a leitura é dos primeiros bytes, por conta própria, sem biblioteca de
 * imagem nenhuma. Um formato que não está na lista é recusado **antes** de o
 * `sharp` encostar nele.
 *
 * =============================================================================
 * ISTO CONTINUA VALENDO NA PRÓXIMA CVE
 * =============================================================================
 * Atualizar o `sharp` fecha a falha de hoje. Esta lista fecha a categoria: no
 * dia em que aparecer um furo no decodificador de TIFF, de GIF ou de SVG, o
 * arquivo nem chega lá. É a diferença entre tapar um buraco e estreitar a porta.
 *
 * Módulo puro: sem sharp, sem banco, sem ambiente. É testado em
 * `formato-imagem.test.ts`.
 */

/** Os únicos três formatos que o sistema aceita receber. */
export type FormatoDeImagem = 'jpeg' | 'png' | 'webp'

/**
 * As assinaturas de bytes de cada formato aceito.
 *
 * São os primeiros bytes que o próprio formato obriga a existir — não há como
 * um JPEG de verdade não começar com `FF D8 FF`. Por isso a conferência não
 * depende de extensão, de nome nem de cabeçalho HTTP: nenhum dos três está
 * dentro do arquivo.
 */
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function comecaCom(b: Buffer, bytes: number[]): boolean {
  if (b.length < bytes.length) return false
  return bytes.every((v, i) => b[i] === v)
}

/**
 * O formato REAL do arquivo, lido dos bytes. `null` quando não é um dos três.
 *
 * O WebP é o único que precisa de duas leituras: ele é um contêiner RIFF, e o
 * que diz "isto é WebP" são os quatro bytes da posição 8 — os quatro primeiros
 * dizem só "isto é RIFF", que também é o começo de um WAV.
 */
export function formatoReal(bruto: Buffer): FormatoDeImagem | null {
  if (comecaCom(bruto, JPEG)) return 'jpeg'
  if (comecaCom(bruto, PNG)) return 'png'
  if (
    bruto.length >= 12 &&
    bruto.toString('ascii', 0, 4) === 'RIFF' &&
    bruto.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

/**
 * A frase que a pessoa lê quando o arquivo é recusado.
 *
 * Ela não diz "assinatura de bytes inválida": quem está com o celular na mão,
 * na casa do cliente, precisa saber o que FAZER. Também não diz qual formato
 * foi detectado — isso só ajudaria quem está testando o que passa.
 */
export const RECUSA_DE_FORMATO =
  'Este arquivo não é JPG, PNG ou WebP. Alguns celulares salvam em HEIC: nos ajustes da câmera, escolha "Mais compatível" e fotografe de novo.'
