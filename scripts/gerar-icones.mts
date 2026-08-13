import sharp from 'sharp'

/**
 * Gera os ícones do PWA a partir da marca, em código.
 *
 * Em código, e não como arquivo binário no repositório, porque assim mudar a
 * cor da marca é editar uma linha e rodar de novo — em vez de abrir um editor
 * de imagem e exportar quatro tamanhos na mão, esquecendo um.
 */
const svg = (n: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">` +
      `<rect width="${n}" height="${n}" rx="${n * 0.18}" fill="#08040F"/>` +
      `<rect x="${n * 0.2}" y="${n * 0.2}" width="${n * 0.6}" height="${n * 0.6}" rx="${n * 0.1}" fill="#6D28D9"/>` +
      `<text x="50%" y="50%" font-family="Arial,Helvetica,sans-serif" font-size="${n * 0.42}" ` +
      `font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">D</text></svg>`,
  )

async function main() {
  for (const n of [192, 512]) await sharp(svg(n)).png().toFile(`public/icone-${n}.png`)
  await sharp(svg(64)).png().toFile('public/favicon.png')
  console.log('Ícones do PWA gerados em public/')
}
void main()
