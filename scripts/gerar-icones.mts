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
  // O `viewBox` PRECISA ter quatro números. `split` devolve o que houver, e sem
  // esta conferência `larg` e `alt` seguem como `number | undefined` até virarem
  // `NaN` no meio de um cálculo de escala — e o ícone sai com tamanho zero, sem
  // erro em lugar nenhum. Um SVG malformado tem que reclamar aqui, onde a
  // mensagem ainda diz qual arquivo olhar.
  const [, , larg, alt] = vb.split(/\s+/).map(Number)
  if (!Number.isFinite(larg) || !Number.isFinite(alt) || larg === undefined || alt === undefined) {
    throw new Error(`O viewBox de ${SIMBOLO} não tem largura e altura numéricas: "${vb}"`)
  }
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

/**
 * A imagem de compartilhamento (1200x630).
 *
 * E o retangulo que aparece quando alguem cola o link no WhatsApp, e o
 * WhatsApp e por onde a maioria dos clientes chega. Sem ela, o link vira uma
 * linha de texto cinza no meio da conversa; com ela, vira um cartao.
 *
 * O texto vai em fonte generica de sistema de proposito: a fonte da marca nao
 * existe dentro do renderizador de SVG, e pedir por ela daria uma substituicao
 * silenciosa e diferente em cada maquina que rodar este script. Aqui o peso
 * visual vem do simbolo e do contraste, nao do desenho da letra.
 */
function compartilhamento() {
  const L = 1200
  const A = 630
  const { larg, alt, transform, d } = lerSimbolo()

  const util = A * 0.42
  const escala = Math.min(util / larg, util / alt)
  const x = 96
  const y = (A - alt * escala) / 2 - 40

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">` +
      `<defs>` +
      `<radialGradient id="brilho" cx="18%" cy="30%" r="70%">` +
      `<stop offset="0%" stop-color="#4A0D8F" stop-opacity="0.85"/>` +
      `<stop offset="100%" stop-color="${FUNDO}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="${L}" height="${A}" fill="${FUNDO}"/>` +
      `<rect width="${L}" height="${A}" fill="url(#brilho)"/>` +
      `<g transform="translate(${x} ${y}) scale(${escala})">` +
      `<g transform="${transform}" fill="${TINTA}" fill-rule="evenodd">` +
      `<path d="${d}"/>` +
      `</g></g>` +
      `<text x="96" y="${A - 176}" fill="#F4F0FB" font-family="sans-serif" ` +
      `font-size="62" font-weight="700" letter-spacing="-1.5">DTECH MED</text>` +
      `<text x="96" y="${A - 116}" fill="#B9AAD4" font-family="sans-serif" font-size="34">` +
      `Assistência técnica de equipamentos</text>` +
      `<text x="96" y="${A - 72}" fill="#B9AAD4" font-family="sans-serif" font-size="34">` +
      `médicos, estéticos e odontológicos</text>` +
      `<rect x="96" y="${A - 46}" width="120" height="5" rx="2.5" fill="${TINTA}"/>` +
      `</svg>`,
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
  await sharp(compartilhamento()).png({ compressionLevel: 9 }).toFile('public/og.png')
  console.log('Ícones e imagem de compartilhamento gerados a partir do símbolo oficial.')
}

void main()
