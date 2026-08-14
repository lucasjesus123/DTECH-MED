import { readFileSync } from 'node:fs'
import sharp from 'sharp'

/**
 * Gera os ícones do PWA a partir da marca de verdade.
 *
 * Em código, e não como binário largado no repositório, porque assim trocar a
 * cor é editar uma linha e rodar de novo — em vez de abrir um editor de imagem,
 * exportar quatro tamanhos na mão e esquecer um.
 *
 * A versão anterior desenhava um "D" em Arial dentro de um quadrado roxo. Era
 * um marcador de lugar, e ficou no ar tempo demais. Agora o desenho é o símbolo
 * oficial — a cruz médica fundida ao D — lido direto de
 * `public/marca/dtechmed-simbolo.svg`, que é a mesma fonte que o site usa. Um
 * lugar só para mudar quando a marca mudar.
 */

const SIMBOLO = 'public/marca/dtechmed-simbolo.svg'
const FUNDO = '#08040F' // o quase-preto do sistema
const TINTA = '#A78BFA' // o violeta que brilha sobre ele

/** Puxa o `viewBox` e o miolo do SVG da marca, sem depender de parser. */
function lerSimbolo() {
  const bruto = readFileSync(SIMBOLO, 'utf8')
  const vb = bruto.match(/viewBox="([^"]+)"/)?.[1]
  const miolo = bruto.match(/<g[^>]*>([\s\S]*?)<\/g>/)?.[0]
  const transform = miolo?.match(/transform="([^"]+)"/)?.[1]
  const d = bruto.match(/<path d="([^"]+)"/)?.[1]
  if (!vb || !transform || !d) {
    throw new Error(`Não consegui ler ${SIMBOLO}. O formato mudou?`)
  }
  const [, , larg, alt] = vb.split(/\s+/).map(Number)
  return { larg, alt, transform, d }
}

/**
 * Monta o ícone num tamanho.
 *
 * `margem` é a área de respiro em volta do desenho. Ícone que encosta na borda
 * do quadrado parece apertado em qualquer lugar que o mostre — e o Android
 * ainda recorta um círculo por cima, o que comeria as pontas da cruz.
 */
function icone(n: number, margem = 0.24) {
  const { larg, alt, transform, d } = lerSimbolo()
  const util = n * (1 - margem * 2)
  const escala = Math.min(util / larg, util / alt)
  const x = (n - larg * escala) / 2
  const y = (n - alt * escala) / 2

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">` +
      `<rect width="${n}" height="${n}" rx="${n * 0.2}" fill="${FUNDO}"/>` +
      `<g transform="translate(${x} ${y}) scale(${escala})">` +
      `<g transform="${transform}" fill="${TINTA}" fill-rule="evenodd">` +
      `<path d="${d}"/>` +
      `</g></g></svg>`,
  )
}

async function main() {
  for (const n of [192, 512]) {
    await sharp(icone(n)).png({ compressionLevel: 9 }).toFile(`public/icone-${n}.png`)
  }
  // No favicon a margem é menor: em 16 ou 32 pixels, respiro demais deixa o
  // desenho pequeno demais para se reconhecer na aba.
  for (const n of [32, 64, 180]) {
    const arquivo = n === 180 ? 'public/apple-touch-icon.png' : `public/favicon-${n}.png`
    await sharp(icone(n, 0.14)).png({ compressionLevel: 9 }).toFile(arquivo)
  }
  await sharp(icone(64, 0.14)).png({ compressionLevel: 9 }).toFile('public/favicon.png')
  console.log('Ícones gerados a partir do símbolo oficial.')
}

void main()
