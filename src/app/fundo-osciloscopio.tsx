'use client'

import { useEffect, useRef } from 'react'
import estilo from './site.module.css'

/**
 * Fundo da primeira dobra: um osciloscópio.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO, E NÃO UM VÍDEO
 * ---------------------------------------------------------------------------
 * Para conteúdo sintético, o canvas ganha do vídeo em tudo o que importa aqui:
 * pesa uns 3 KB em vez de 2 a 4 MB (e o nosso visitante costuma estar no 4G,
 * com o aparelho parado), fica nítido em qualquer resolução, para de verdade
 * quando alguém pede menos movimento, e não decodifica quadro fora da tela.
 *
 * Vídeo continua sendo a escolha certa para FILMAGEM REAL — mão de técnico,
 * bancada, aparelho abrindo. Essa vaga segue de pé em `FundoVideo`: no dia em
 * que o arquivo existir, ele entra na frente deste desenho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM OSCILOSCÓPIO
 * ---------------------------------------------------------------------------
 * Porque é o instrumento do ofício. A DTECH calibra, mede e emite laudo — a
 * grade de medição e o traço de sinal são o que se vê na bancada dela.
 *
 * A distinção importa: grade decorativa atrás de um site é um dos vícios mais
 * batidos que existem. Grade de MEDIÇÃO, num negócio que mede, é o assunto.
 *
 * ---------------------------------------------------------------------------
 * O QUE MANTÉM ISTO LEVE
 * ---------------------------------------------------------------------------
 *  · a grade é desenhada UMA vez, num canvas fora da tela, e depois só copiada
 *    a cada quadro. Redesenhar centenas de linhas 30 vezes por segundo seria o
 *    grosso do custo, e é trabalho repetido à toa;
 *  · 30 quadros por segundo, não 60. É fundo: ninguém olha direto, e a metade
 *    do trabalho não se percebe;
 *  · para inteiro fora da viewport e quando a aba perde o foco;
 *  · `alpha: false` no contexto deixa o navegador pular a composição com o que
 *    está atrás.
 */

/**
 * Dois traços: o de cima é o sinal medido, o de baixo é a referência.
 *
 * As opacidades e os brilhos foram baixados depois de ver a página no ar. O
 * desenho estava competindo com a chamada em vez de ficar atrás dela: a onda
 * cruzava o texto e o olho ia junto com ela. Fundo bom é o que só se nota
 * quando se procura.
 *
 * Se um dia quiser voltar a subir, mexa aqui e em GRADE logo abaixo — os dois
 * juntos, senão a grade fica mais forte que o sinal, que é o contrário de um
 * osciloscópio de verdade.
 */
const TRACOS = [
  { amplitude: 0.20, frequencia: 1.7, velocidade: 0.55, largura: 1.4, opacidade: 0.4, brilho: 9 },
  { amplitude: 0.11, frequencia: 2.9, velocidade: -0.34, largura: 1.0, opacidade: 0.18, brilho: 5 },
] as const

/** As três camadas da grade, da mais discreta para a mais forte. */
const GRADE = {
  quadriculado: 0.24,
  linhaDeZero: 0.28,
  marcasDeEscala: 0.2,
} as const

export function FundoOsciloscopio() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const tela = ref.current
    if (!tela) return
    const ctx = tela.getContext('2d', { alpha: false })
    if (!ctx) return

    const querParado = window.matchMedia('(prefers-reduced-motion: reduce)')

    // Retina é bonita, mas dobra o número de pixels a pintar. Num fundo, 1,5x
    // já não tem diferença visível — e economiza metade do trabalho.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let larg = 0
    let alt = 0
    let grade: HTMLCanvasElement | null = null

    const tinta = () => {
      const raiz = getComputedStyle(document.documentElement)
      return {
        fundo: raiz.getPropertyValue('--bg-1').trim() || '#0E0718',
        linha: raiz.getPropertyValue('--borda').trim() || '#2C1A47',
        traco: raiz.getPropertyValue('--vio-claro').trim() || '#A78BFA',
        eixo: raiz.getPropertyValue('--sinal').trim() || '#2DD4A0',
      }
    }

    /** Desenha a grade uma vez só, para ser copiada a cada quadro. */
    function prepararGrade(cor: ReturnType<typeof tinta>) {
      const g = document.createElement('canvas')
      g.width = larg
      g.height = alt
      const gc = g.getContext('2d')
      if (!gc) return null

      gc.fillStyle = cor.fundo
      gc.fillRect(0, 0, larg, alt)

      const passo = 44 * dpr
      gc.lineWidth = 1
      gc.strokeStyle = cor.linha
      gc.globalAlpha = GRADE.quadriculado

      gc.beginPath()
      for (let x = 0; x <= larg; x += passo) {
        gc.moveTo(Math.round(x) + 0.5, 0)
        gc.lineTo(Math.round(x) + 0.5, alt)
      }
      for (let y = 0; y <= alt; y += passo) {
        gc.moveTo(0, Math.round(y) + 0.5)
        gc.lineTo(larg, Math.round(y) + 0.5)
      }
      gc.stroke()

      // A linha de zero, mais forte: é a referência contra a qual se mede.
      gc.globalAlpha = GRADE.linhaDeZero
      gc.strokeStyle = cor.eixo
      gc.beginPath()
      gc.moveTo(0, Math.round(alt / 2) + 0.5)
      gc.lineTo(larg, Math.round(alt / 2) + 0.5)
      gc.stroke()

      // Marcas de escala no eixo, como as de um instrumento de verdade.
      gc.globalAlpha = GRADE.marcasDeEscala
      gc.beginPath()
      for (let x = 0; x <= larg; x += passo / 4) {
        gc.moveTo(Math.round(x) + 0.5, alt / 2 - 3 * dpr)
        gc.lineTo(Math.round(x) + 0.5, alt / 2 + 3 * dpr)
      }
      gc.stroke()
      gc.globalAlpha = 1

      return g
    }

    let cor = tinta()

    function medir() {
      const r = tela!.getBoundingClientRect()
      larg = Math.max(1, Math.round(r.width * dpr))
      alt = Math.max(1, Math.round(r.height * dpr))
      tela!.width = larg
      tela!.height = alt
      cor = tinta()
      grade = prepararGrade(cor)
    }

    medir()

    function quadro(t: number) {
      if (!grade) return
      ctx!.drawImage(grade, 0, 0)

      const meio = alt / 2
      for (const tr of TRACOS) {
        ctx!.save()
        ctx!.globalAlpha = tr.opacidade
        ctx!.strokeStyle = cor.traco
        ctx!.lineWidth = tr.largura * dpr
        ctx!.lineJoin = 'round'
        ctx!.lineCap = 'round'
        // O brilho vem de `shadowBlur` no traço, que é como um fósforo de tubo
        // realmente espalha luz — e não de um halo colorido posto por trás.
        ctx!.shadowColor = cor.traco
        ctx!.shadowBlur = tr.brilho * dpr

        ctx!.beginPath()
        const passo = 6 * dpr
        for (let x = 0; x <= larg; x += passo) {
          const u = x / larg
          const fase = t * 0.00042 * tr.velocidade
          // Duas senoides de períodos incomensuráveis: o desenho nunca se
          // repete de forma perceptível, sem precisar de aleatoriedade.
          const y =
            meio +
            Math.sin(u * Math.PI * 2 * tr.frequencia + fase * Math.PI * 2) *
              alt * tr.amplitude *
              (0.62 + 0.38 * Math.sin(u * Math.PI * 1.3 - fase * 3.1))
          if (x === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }
        ctx!.stroke()
        ctx!.restore()
      }
    }

    // --- Laço, com todas as travas de economia ----------------------------
    let animando = 0
    let visivel = true

    const rodar = (t: number) => {
      quadro(t)
      animando = requestAnimationFrame(rodar)
    }

    function comecar() {
      if (animando || !visivel || querParado.matches || document.hidden) return
      animando = requestAnimationFrame(rodar)
    }
    function parar() {
      if (animando) cancelAnimationFrame(animando)
      animando = 0
    }

    // Um quadro parado sempre, mesmo para quem não quer movimento: a grade e o
    // traço continuam lá, só não andam. Reduzir movimento não é apagar a tela.
    quadro(0)
    comecar()

    const olho = new IntersectionObserver(
      ([e]) => {
        visivel = e?.isIntersecting ?? false
        if (visivel) comecar()
        else parar()
      },
      { threshold: 0.01 },
    )
    olho.observe(tela)

    const aoTrocarAba = () => (document.hidden ? parar() : comecar())
    document.addEventListener('visibilitychange', aoTrocarAba)

    const aoPreferir = () => {
      parar()
      quadro(0)
      comecar()
    }
    querParado.addEventListener('change', aoPreferir)

    // Redimensionar redesenha a grade, que é caro. Um respiro evita fazer isso
    // sessenta vezes enquanto alguém arrasta a borda da janela.
    let respiro: ReturnType<typeof setTimeout>
    const aoRedimensionar = () => {
      clearTimeout(respiro)
      respiro = setTimeout(() => {
        medir()
        quadro(0)
      }, 180)
    }
    window.addEventListener('resize', aoRedimensionar)

    return () => {
      parar()
      olho.disconnect()
      document.removeEventListener('visibilitychange', aoTrocarAba)
      querParado.removeEventListener('change', aoPreferir)
      window.removeEventListener('resize', aoRedimensionar)
      clearTimeout(respiro)
    }
  }, [])

  return <canvas ref={ref} className={estilo.dobraCanvas} aria-hidden="true" />
}
