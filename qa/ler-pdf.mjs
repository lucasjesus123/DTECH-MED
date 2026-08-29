import zlib from 'node:zlib'

/**
 * O TEXTO DE DENTRO DE UM PDF, SEM BIBLIOTECA.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * Conferir que o PDF "responde 200 e tem 9 KB" prova que um arquivo saiu — não
 * prova que ele diz a coisa certa. Um contrato gerado a partir do modelo errado,
 * ou com o valor de outra ordem, tem exatamente o mesmo tamanho e o mesmo
 * cabeçalho de um certo.
 *
 * A máquina não tem `pdftotext`, e trazer uma biblioteca de PDF só para ler
 * quarenta linhas de teste custa mais do que estas trinta.
 *
 * =============================================================================
 * AS DUAS ARMADILHAS QUE ISTO JÁ CAIU
 * =============================================================================
 * 1. NEM TODO FLUXO É TEXTO. O logo da empresa é um fluxo de imagem, e ele
 *    contém parênteses por acaso. Sem filtrar, o "texto extraído" vira um
 *    punhado de bytes binários — e o teste responde "não achei" com a mesma
 *    cara de quem procurou de verdade. O filtro é `BT` (begin text).
 *
 * 2. O pdfkit NÃO ESCREVE `(texto) Tj`. Com fonte embutida ele escreve
 *    `[<hexadecimal> 110 <mais hex>] TJ` — os números no meio são o ajuste de
 *    espaçamento entre pares de letras. Procurar só por parênteses devolve
 *    string vazia, e vazio "passa" em qualquer asserção de "não contém".
 *
 * É por isso que este arquivo tem um teste próprio de sanidade: `textoDoPdf`
 * devolvendo vazio é indistinguível de "o documento está errado", e a segunda
 * hipótese é a que o teste deveria estar medindo.
 */
export function textoDoPdf(buf) {
  const fluxos = []
  let i = 0
  while (true) {
    const ini = buf.indexOf('stream', i)
    if (ini < 0) break
    let a = ini + 6
    if (buf[a] === 0x0d) a++
    if (buf[a] === 0x0a) a++
    const fim = buf.indexOf('endstream', a)
    if (fim < 0) break
    try {
      const aberto = zlib.inflateSync(buf.subarray(a, fim)).toString('latin1')
      if (aberto.includes('BT')) fluxos.push(aberto)
    } catch {
      // Fluxo não comprimido ou de imagem: não interessa para o texto.
    }
    i = fim + 9
  }

  const junto = fluxos.join('\n')
  const pedacos = []

  // `<hex>` — o formato do pdfkit com fonte embutida. Os bytes são latin-1, que
  // é o que o PDF usa nas fontes simples; por isso `String.fromCharCode` basta
  // e o acento sai certo ("Assistência" chega como ea no meio do hex).
  for (const m of junto.matchAll(/<([0-9a-fA-F]+)>/g)) {
    const hex = m[1]
    if (hex.length % 2 !== 0) continue
    let s = ''
    for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
    pedacos.push(s)
  }

  // `(texto)` — o formato com as fontes padrão. Os dois convivem no mesmo
  // arquivo quando o documento mistura fontes.
  for (const m of junto.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)) {
    pedacos.push(m[1].replace(/\\([()\\])/g, '$1'))
  }

  return pedacos.join(' ')
}
