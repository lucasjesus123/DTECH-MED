'use client'

import { useEffect, useRef } from 'react'
import estilo from './site.module.css'

/**
 * Vídeo de fundo da primeira dobra.
 *
 * Um vídeo pesado atrás do texto é fácil de fazer e fácil de fazer mal. Este
 * componente existe por causa das três situações em que o jeito ingênuo
 * atrapalha quem está do outro lado:
 *
 *  1. QUEM PEDE PARA REDUZIR MOVIMENTO. `prefers-reduced-motion` não é
 *     capricho: para parte das pessoas, movimento de fundo causa enjoo de
 *     verdade. Aqui o vídeo nem começa — fica o primeiro quadro, parado.
 *  2. QUEM ESTÁ NO 4G COM O APARELHO PARADO. É literalmente o nosso visitante.
 *     Com `Save-Data` ligado ou conexão lenta declarada, o vídeo não baixa;
 *     fica o pôster, que pesa uns 60 KB em vez de vários megabytes.
 *  3. QUEM JÁ ROLOU A PÁGINA. Vídeo decodificando fora da tela gasta bateria
 *     para nada. Sai da viewport, pausa; volta, retoma.
 *
 * E se o arquivo não existir, nada quebra: o `<video>` sem fonte válida mostra
 * o pôster, e sem pôster mostra o fundo pintado pelo CSS, que já é a cor certa.
 * A página nunca aparece com um retângulo preto no lugar do vídeo.
 */
export function FundoVideo({ pôster }: { pôster: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return

    const querParado = window.matchMedia('(prefers-reduced-motion: reduce)')

    // A API de rede ainda não é padrão em todos os navegadores; quando não
    // existe, seguimos com o vídeo, que é o comportamento desejado.
    const rede = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
      }
    ).connection
    const conexaoMagra =
      rede?.saveData === true || /(^|-)2g$/.test(rede?.effectiveType ?? '')

    if (querParado.matches || conexaoMagra) {
      v.removeAttribute('autoplay')
      v.pause()
      return
    }

    // `play()` devolve uma promessa que o navegador rejeita quando decide não
    // reproduzir sozinho. Sem o catch, isso vira erro não tratado no console de
    // quem visita — e um erro no carregamento derruba os reveals junto.
    const tocar = () => void v.play().catch(() => {})
    tocar()

    const olho = new IntersectionObserver(
      ([e]) => (e?.isIntersecting ? tocar() : v.pause()),
      { threshold: 0.05 },
    )
    olho.observe(v)

    const mudouPreferencia = () => (querParado.matches ? v.pause() : tocar())
    querParado.addEventListener('change', mudouPreferencia)

    return () => {
      olho.disconnect()
      querParado.removeEventListener('change', mudouPreferencia)
    }
  }, [])

  return (
    <video
      ref={ref}
      className={estilo.dobraVideo}
      poster={pôster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      // Decorativo: quem usa leitor de tela não perde nada por não ouvir falar
      // dele, e o conteúdo que importa está no texto ao lado.
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="/video/oficina.webm" type="video/webm" />
      <source src="/video/oficina.mp4" type="video/mp4" />
    </video>
  )
}
