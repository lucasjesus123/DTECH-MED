/**
 * COMPRIMIR A FOTO NO APARELHO, ANTES DE SUBIR.
 *
 * ---------------------------------------------------------------------------
 * O PROBLEMA É A CLÍNICA, NÃO O SERVIDOR
 * ---------------------------------------------------------------------------
 * Um celular de 2024 tira foto de 12 megapixels: 4 a 6 MB cada. Seis dessas
 * são uns 30 MB. Num 4G bom isso é meio minuto; dentro de uma clínica — parede
 * de concreto, subsolo, sala blindada de raio-X — vira três, cinco minutos, e é
 * comum não terminar.
 *
 * O que acontece então é o pior desfecho possível: o motorista espera, cansa,
 * e vai embora sem as seis fotos. A prova que existia para resolver "o aparelho
 * chegou riscado" simplesmente não foi tirada. Não adianta o servidor ser
 * rápido; o gargalo é a subida, e ela acontece no pior lugar da cidade.
 *
 * Reduzindo aqui, cada foto sai com 200 a 400 KB. Os mesmos 30 MB viram uns
 * 2 MB — de minutos para segundos, no mesmo sinal ruim.
 *
 * ---------------------------------------------------------------------------
 * POR QUE 1600px E QUALIDADE 0,72
 * ---------------------------------------------------------------------------
 * A foto serve para mostrar o estado do aparelho: um risco no painel, uma
 * tampa amassada, o número de série legível. 1600px no lado maior mostra tudo
 * isso com folga — é mais que a tela de qualquer computador do escritório vai
 * usar para exibi-la.
 *
 * Acima de 0,72 de qualidade o arquivo cresce rápido e o olho não vê diferença
 * em foto de objeto; abaixo, o JPEG começa a borrar textura fina, que é
 * justamente onde mora um arranhão.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE NÃO SE QUEBRA: NA DÚVIDA, SOBE A ORIGINAL
 * ---------------------------------------------------------------------------
 * Se qualquer coisa falhar — navegador antigo, foto num formato estranho,
 * memória insuficiente, arquivo corrompido — esta função devolve o arquivo
 * ORIGINAL. Nunca lança, nunca devolve vazio.
 *
 * Perder velocidade é um aborrecimento; perder a foto é perder a prova. Uma
 * otimização que pode custar o registro não vale o que economiza.
 */

/** O lado maior da imagem depois de reduzida. */
const LADO_MAIOR = 1600
const QUALIDADE = 0.72
/** Abaixo disso não vale a pena mexer: já está pequena. */
const PISO_BYTES = 400 * 1024

export type Reducao = {
  arquivo: File
  /** Bytes antes e depois — a tela mostra o que economizou. */
  antes: number
  depois: number
  /** Falso quando a original foi mantida, por qualquer motivo. */
  comprimida: boolean
}

export async function comprimirFoto(original: File): Promise<Reducao> {
  const intacta: Reducao = {
    arquivo: original,
    antes: original.size,
    depois: original.size,
    comprimida: false,
  }

  try {
    if (!original.type.startsWith('image/')) return intacta
    // PNG de tela e HEIC convertido já vêm pequenos às vezes; e uma foto de
    // 300 KB não ganha nada em ser reprocessada.
    if (original.size <= PISO_BYTES) return intacta
    if (typeof createImageBitmap !== 'function') return intacta

    /**
     * `createImageBitmap` já aplica a orientação do EXIF.
     *
     * Sem `imageOrientation: 'from-image'`, a foto tirada com o celular na
     * vertical sobe deitada — o sensor grava paisagem e marca a rotação num
     * campo do EXIF que o desenho no canvas ignora. É o defeito clássico de
     * redimensionamento no navegador, e ele aparece só depois, no painel.
     */
    const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' })

    const maior = Math.max(bitmap.width, bitmap.height)
    const escala = maior > LADO_MAIOR ? LADO_MAIOR / maior : 1
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura
    const ctx = tela.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return intacta
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      tela.toBlob(resolve, 'image/jpeg', QUALIDADE),
    )
    // Libera a memória do canvas no celular, que é onde ela falta.
    tela.width = 0
    tela.height = 0

    if (!blob || blob.size === 0) return intacta
    // Se o "comprimido" ficou maior, a original era melhor. Acontece com
    // imagem já muito otimizada.
    if (blob.size >= original.size) return intacta

    const nome = original.name.replace(/\.[^.]+$/, '') || 'foto'
    return {
      arquivo: new File([blob], `${nome}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
      antes: original.size,
      depois: blob.size,
      comprimida: true,
    }
  } catch {
    // Qualquer imprevisto: sobe a original. Ver o comentário do topo.
    return intacta
  }
}

/** "2,4 MB" — para a tela dizer o que aconteceu, em unidade de gente. */
export function emMB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
