import { describe, expect, it } from 'vitest'
import { formatoReal } from './formato-imagem'

/**
 * O QUE ESTES TESTES PROTEGEM.
 *
 * O sistema recebe foto de quem está na rua com o celular na mão — é a prova de
 * que o aparelho saiu da clínica. Quem envia tem login, então a tentação é
 * confiar. Não dá: o que chega é um arquivo, e o que o arquivo DIZ ser não tem
 * relação nenhuma com o que ele É.
 *
 * O caso que trava aqui é o real: um HEIC disfarçado de JPEG. Ele passava pela
 * lista de tipos (que olhava o cabeçalho declarado) e chegava ao libheif.
 */

/** Os primeiros bytes de um arquivo de verdade de cada tipo. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
])

/**
 * Um HEIC de verdade começa assim: tamanho da caixa, `ftyp`, e a marca `heic`.
 * É exatamente este arquivo que o celular da Apple produz por padrão — e é o
 * que o libheif vulnerável abriria.
 */
const HEIC = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftypheic', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
])
const AVIF = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftypavif', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
])

describe('o que o sistema aceita de verdade', () => {
  it('reconhece os três formatos permitidos pelos bytes', () => {
    expect(formatoReal(JPEG)).toBe('jpeg')
    expect(formatoReal(PNG)).toBe('png')
    expect(formatoReal(WEBP)).toBe('webp')
  })
})

describe('o ataque que isto fecha', () => {
  it('um HEIC continua sendo HEIC, mesmo dizendo que é JPEG', () => {
    // O atacante controla o nome, a extensão e o Content-Type. Não controla
    // isto: os bytes que o próprio formato obriga a existir.
    expect(formatoReal(HEIC)).toBeNull()
  })

  it('um AVIF disfarçado também é recusado', () => {
    expect(formatoReal(AVIF)).toBeNull()
  })

  it('nenhum formato fora da lista passa — nem os que o sharp saberia ler', () => {
    const gif = Buffer.from('GIF89a__________', 'ascii')
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'ascii')
    const bmp = Buffer.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    for (const [nome, bytes] of Object.entries({ gif, tiff, svg, bmp })) {
      expect(formatoReal(bytes), `${nome} não podia passar`).toBeNull()
    }
  })
})

describe('não quebra com entrada estranha', () => {
  it('arquivo vazio ou curto demais não estoura', () => {
    expect(formatoReal(Buffer.alloc(0))).toBeNull()
    expect(formatoReal(Buffer.from([0xff, 0xd8]))).toBeNull()
    expect(formatoReal(Buffer.from('RIFF', 'ascii'))).toBeNull()
  })

  it('RIFF que não é WebP (um WAV) é recusado', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt ', 'ascii'),
    ])
    expect(formatoReal(wav)).toBeNull()
  })
})
