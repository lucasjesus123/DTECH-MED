import { statSync } from 'node:fs'
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
  /**
   * Sob qual pasta da empresa a foto vai.
   *
   * Era `ordemId`, porque no começo só existia foto de ordem. Depois vieram a
   * peça e o equipamento do catálogo, e a escolha era duplicar todo o
   * tratamento de imagem — recusar o que não é imagem de verdade, aplicar a
   * orientação do EXIF e então descartá-lo, reescrever o arquivo, gerar
   * miniatura — ou generalizar o único parâmetro que muda. A duplicata daria
   * dois lugares para corrigir a próxima falha de validação, e um deles ficaria
   * para trás.
   *
   * Continua sendo um caminho que o SERVIDOR monta, nunca um que chega da
   * requisição: `sanitizarPedaco` recusa `..` e barra, então nenhum id
   * inventado escreve fora da pasta da empresa.
   */
  escopo: string
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

  // A DECODIFICAÇÃO TAMBÉM PODE FALHAR, e não só a leitura do cabeçalho.
  //
  // O `metadata()` acima lê o CABEÇALHO. Um arquivo pode ter cabeçalho válido e
  // corpo quebrado — foto que o celular parou de enviar no meio, cartão de
  // memória com defeito, transferência interrompida —, e aí quem estoura é o
  // `resize`, com uma mensagem da biblioteca de imagem: "vipspng: libpng read
  // error". Sem este `try`, esse erro sobe até a página e o técnico recebe uma
  // tela de erro do servidor no lugar de um aviso, sem entender que o problema
  // é a foto e que basta tirar outra.
  //
  // É o caso comum no campo, não o exótico: 4G ruim, envio interrompido.
  let normalizada: { data: Buffer; info: { width: number; height: number } }
  let thumb: Buffer
  try {
    // Lado maior em 1600px: acima disso não se ganha detalhe útil para provar o
    // estado do equipamento, e o peso atrapalha quem está num 4G ruim.
    normalizada = await sharp(bruto)
      .rotate() // aplica a orientação do EXIF antes de descartá-lo
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    thumb = await sharp(bruto)
      .rotate()
      .resize(320, 320, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer()
  } catch {
    return {
      ok: false,
      motivo: 'A imagem chegou incompleta ou corrompida. Tire a foto de novo.',
    }
  }

  const hash = hashArquivo(normalizada.data)
  const base = path.join(entrada.tenantId, sanitizarPedaco(entrada.escopo), 'fotos')
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

/* ==========================================================================
   AS FOTOS DO SITE
   --------------------------------------------------------------------------
   Estas são de outra natureza que as de cima, e por isso ficam num lugar
   separado com regras próprias.

   As fotos de ordem de serviço são PRIVADAS: pertencem a uma empresa, provam o
   estado de um equipamento, e saem por uma rota que confere sessão e escopo.
   As do site são o oposto — existem para serem vistas por qualquer pessoa que
   abrir a página. Servi-las pela rota autenticada seria pedir login para ver a
   home.

   O que elas herdam das outras é o cuidado no caminho: o nome nunca vem do
   cliente. Só os slots conhecidos entram, e é o servidor que monta o arquivo.

   Ficam no acervo (`/app/storage`), e não em `public/`, por um motivo prático:
   `public/` está dentro da imagem do Docker, que é descartada e reconstruída a
   cada publicação. Foto enviada pelo painel ali sumiria no deploy seguinte,
   sem aviso. O acervo é volume, e sobrevive.
   ========================================================================== */

/** A pasta das fotos do site dentro do acervo. */
const PASTA_SITE = 'site'

/**
 * Recebe uma foto do site pelo painel.
 *
 * Mesmo tratamento das outras — os BYTES decidem se é imagem, e o arquivo é
 * reescrito para descartar EXIF e qualquer coisa enxertada no fim. A diferença
 * é o tamanho: esta vai ocupar a tela inteira num monitor grande, então o lado
 * maior vai a 2200px em vez de 1600.
 */
export async function guardarFotoDoSite(entrada: {
  slot: string
  arquivo: File
}): Promise<{ ok: true; bytes: number; largura: number; altura: number } | { ok: false; motivo: string }> {
  const { arquivo } = entrada

  if (!/^[a-z0-9]+$/.test(entrada.slot)) return { ok: false, motivo: 'Lugar de foto desconhecido.' }
  if (!arquivo || arquivo.size === 0) return { ok: false, motivo: 'O arquivo chegou vazio.' }
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
    return { ok: false, motivo: 'O arquivo enviado não é uma imagem válida.' }
  }
  if (!meta.width || !meta.height) {
    return { ok: false, motivo: 'Não foi possível ler as dimensões da imagem.' }
  }
  // Foto de site que entra com 400px de largura fica borrada em tela cheia, e
  // o dono só descobre depois de publicar. Melhor recusar com o número na mão.
  if (meta.width < 900) {
    return {
      ok: false,
      motivo: `A imagem tem ${meta.width}px de largura. Para o site, o mínimo é 900px — abaixo disso ela aparece borrada em tela grande.`,
    }
  }

  const normalizada = await sharp(bruto)
    .rotate()
    .resize(2200, 2200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  await gravar(path.join(PASTA_SITE, `${entrada.slot}.jpg`), normalizada.data)

  return {
    ok: true,
    bytes: normalizada.data.length,
    largura: normalizada.info.width,
    altura: normalizada.info.height,
  }
}

/**
 * A "versão" da foto enviada para um slot, ou `null` se não houver nenhuma.
 *
 * O número é o instante da última gravação. Ele entra na URL da imagem, e é o
 * que faz a troca de foto aparecer NA HORA.
 *
 * Sem ele, o defeito é dos que enganam: o Next guarda a versão otimizada de
 * cada imagem indexada pela URL. Trocar o arquivo mantendo a URL faz o site
 * continuar servindo a foto velha, do cache, por tempo indeterminado. O dono
 * envia a nova, vê a antiga, envia de novo, e conclui que o sistema não salva.
 * Aconteceu neste projeto com as fotos de `public/fotos`.
 *
 * Síncrona de propósito: quem chama é a montagem da página, que precisa do
 * caminho antes de renderizar.
 */
export function versaoFotoDoSite(slot: string): number | null {
  if (!/^[a-z0-9]+$/.test(slot)) return null
  try {
    const st = statSync(seguro(path.join(PASTA_SITE, `${slot}.jpg`)))
    return Math.trunc(st.mtimeMs)
  } catch {
    return null
  }
}

/** Lê os bytes de uma foto do site. `null` se não existir. */
export async function lerFotoDoSite(slot: string): Promise<Buffer | null> {
  if (!/^[a-z0-9]+$/.test(slot)) return null
  return lerArquivo(path.join(PASTA_SITE, `${slot}.jpg`))
}

/** Tira a foto enviada, fazendo o site voltar para a que vem na imagem. */
export async function apagarFotoDoSite(slot: string): Promise<void> {
  if (!/^[a-z0-9]+$/.test(slot)) return
  await apagarArquivo(path.join(PASTA_SITE, `${slot}.jpg`))
}

/**
 * Reduz um pedaço de caminho ao que não consegue sair da pasta.
 *
 * `seguro()` já barra a travessia no destino final, mas ele reclama tarde: o
 * erro aparece na gravação, longe de quem montou o caminho. Aqui a limpeza
 * acontece na origem, e o resultado é sempre um nome só — sem barra, sem `..`,
 * sem nada que o sistema de arquivos leia como "suba um nível".
 *
 * O escopo é sempre um id que o servidor tem em mãos (a ordem, a peça, o
 * equipamento), nunca texto vindo da requisição. Isto é cinto e suspensório,
 * de propósito: no dia em que alguém passar um valor de formulário aqui por
 * engano, o pior que acontece é uma pasta com nome esquisito.
 */
function sanitizarPedaco(bruto: string): string {
  const limpo = bruto.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!limpo) throw new Error('Escopo de arquivo vazio depois da limpeza.')
  return limpo
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
