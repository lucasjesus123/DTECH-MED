import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'
import { hashArquivo } from '@/lib/cripto'
import { env } from '@/lib/env'

/**
 * Guarda de arquivos: fotos de equipamento, assinaturas e PDFs.
 *
 * Duas regras que valem para tudo aqui:
 *
 *  1. **Nada é servido diretamente pelo servidor web.** Os arquivos ficam fora
 *     da pasta pública e só saem por uma rota que confere a sessão e a empresa.
 *     Se a foto do equipamento de uma clínica ficasse numa URL adivinhável, o
 *     isolamento entre franquias acabaria no primeiro `/uploads/`.
 *  2. **O caminho é montado pelo servidor, nunca recebido do cliente.** É assim
 *     que se fecha a travessia de diretório: sem `..` vindo de fora, não há o
 *     que escapar.
 */

const RAIZ = () => path.resolve(env.STORAGE_LOCAL_PATH)

/** 8 MB. Foto de celular moderno passa disso com folga se não for reduzida. */
const LIMITE_BYTES = 8 * 1024 * 1024

/** O que aceitamos de verdade — a extensão do nome não decide nada. */
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ResultadoUpload =
  | { ok: true; caminho: string; caminhoThumb: string; hash: string; largura: number; altura: number; bytes: number }
  | { ok: false; motivo: string }

/**
 * Recebe uma foto, valida, normaliza e grava.
 *
 * A validação olha os BYTES do arquivo, não o `Content-Type` que o navegador
 * declarou nem a extensão do nome. Os dois são texto livre; quem quer subir um
 * script disfarçado só precisa renomear para `.jpg`. O `sharp` recusa o que
 * não for imagem de verdade.
 *
 * Além de validar, reescrevemos a imagem. Isso descarta qualquer coisa
 * pendurada no arquivo original — metadados EXIF com a localização de casa do
 * técnico, e conteúdo enxertado no fim do arquivo.
 */
export async function guardarFoto(entrada: {
  tenantId: string
  ordemId: string
  arquivo: File
}): Promise<ResultadoUpload> {
  const { arquivo } = entrada

  if (arquivo.size === 0) return { ok: false, motivo: 'O arquivo chegou vazio. Tente fotografar de novo.' }
  if (arquivo.size > LIMITE_BYTES) {
    return {
      ok: false,
      motivo: `Foto muito pesada (${(arquivo.size / 1024 / 1024).toFixed(1)} MB). O limite é 8 MB.`,
    }
  }
  if (!TIPOS.has(arquivo.type)) {
    return { ok: false, motivo: 'Formato não aceito. Envie JPG, PNG ou WebP.' }
  }

  const bruto = Buffer.from(await arquivo.arrayBuffer())

  let meta: Metadata
  try {
    meta = await sharp(bruto).metadata()
  } catch {
    // Chegou aqui significa que o arquivo se dizia imagem e não é.
    return { ok: false, motivo: 'O arquivo enviado não é uma imagem válida.' }
  }
  if (!meta.width || !meta.height) {
    return { ok: false, motivo: 'Não foi possível ler as dimensões da imagem.' }
  }

  // Lado maior em 1600px: acima disso não se ganha detalhe útil para provar o
  // estado do equipamento, e o peso atrapalha quem está num 4G ruim.
  const normalizada = await sharp(bruto)
    .rotate() // aplica a orientação do EXIF antes de descartá-lo
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const thumb = await sharp(bruto)
    .rotate()
    .resize(320, 320, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer()

  const hash = hashArquivo(normalizada.data)
  const base = path.join(entrada.tenantId, entrada.ordemId, 'fotos')
  const nome = `${hash.slice(0, 16)}.jpg`
  const nomeThumb = `t_${nome}`

  await gravar(path.join(base, nome), normalizada.data)
  await gravar(path.join(base, nomeThumb), thumb)

  return {
    ok: true,
    caminho: path.join(base, nome),
    caminhoThumb: path.join(base, nomeThumb),
    hash,
    largura: normalizada.info.width,
    altura: normalizada.info.height,
    bytes: normalizada.data.length,
  }
}

/**
 * Grava a assinatura desenhada no visor.
 *
 * Chega como data URL do canvas. A validação é estrita de propósito: este é um
 * campo onde o cliente controla o conteúdo inteiro, e ele acaba dentro de um
 * PDF com valor de contrato.
 */
export async function guardarAssinatura(entrada: {
  tenantId: string
  ordemId: string
  dataUrl: string
}): Promise<{ ok: true; caminho: string; hash: string } | { ok: false; motivo: string }> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(entrada.dataUrl.trim())
  if (!m) return { ok: false, motivo: 'Assinatura em formato inesperado.' }

  const bytes = Buffer.from(m[1]!, 'base64')
  // 2 MB é muito para um traço; acima disso é sinal de que veio outra coisa.
  if (bytes.length > 2 * 1024 * 1024) return { ok: false, motivo: 'Assinatura grande demais.' }
  if (bytes.length < 200) return { ok: false, motivo: 'A assinatura ficou em branco.' }

  let png: Buffer
  try {
    // Reescreve como PNG: descarta qualquer coisa que não seja imagem.
    png = await sharp(bytes).png({ compressionLevel: 9 }).toBuffer()
  } catch {
    return { ok: false, motivo: 'Não foi possível ler a assinatura.' }
  }

  const hash = hashArquivo(png)
  const caminho = path.join(entrada.tenantId, entrada.ordemId, 'assinaturas', `${hash.slice(0, 16)}.png`)
  await gravar(caminho, png)
  return { ok: true, caminho, hash }
}

async function gravar(relativo: string, dados: Buffer): Promise<void> {
  const destino = seguro(relativo)
  await mkdir(path.dirname(destino), { recursive: true })
  await writeFile(destino, dados)
}

/**
 * Lê um arquivo do acervo.
 *
 * Quem chama JÁ deve ter confirmado que o caminho pertence à empresa da
 * sessão — a conferência acontece consultando a linha no banco, que o RLS
 * filtra. Esta função é a última barreira contra travessia de diretório.
 */
export async function lerArquivo(relativo: string): Promise<Buffer | null> {
  try {
    return await readFile(seguro(relativo))
  } catch {
    return null
  }
}

export async function apagarArquivo(relativo: string): Promise<void> {
  try {
    await unlink(seguro(relativo))
  } catch {
    // Arquivo já ausente não é erro: o efeito desejado já está valendo.
  }
}

/**
 * Resolve o caminho e recusa qualquer coisa que escape da raiz.
 *
 * `path.resolve` já normaliza `..`, mas a comparação com a raiz é o que
 * transforma isso em garantia: um caminho como `../../etc/passwd` resolve para
 * fora e é barrado aqui, não mais adiante.
 */
function seguro(relativo: string): string {
  const raiz = RAIZ()
  const destino = path.resolve(raiz, relativo)
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
    throw new Error('Caminho de arquivo fora do acervo.')
  }
  return destino
}
