'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import estilo from './quadro-assinatura.module.css'

/**
 * Quadro de assinatura no visor.
 *
 * Usado no portal do cliente e no app do motorista. Detalhes que só aparecem
 * quando alguém assina de verdade, com o dedo, na calçada:
 *
 *  • `touch-action: none` no canvas. Sem isso, arrastar o dedo rola a página
 *    em vez de desenhar, e a pessoa acha que o app travou.
 *  • Eventos de ponteiro, não de mouse e toque separados. Um só caminho de
 *    código atende dedo, caneta e mouse, e não há o toque fantasma que os
 *    navegadores emitem depois do touchend.
 *  • O canvas é redimensionado pela densidade da tela. Sem isso o traço sai
 *    borrado no celular, e assinatura borrada num contrato é problema.
 *  • O traço é considerado válido a partir de alguns pontos, não do primeiro
 *    contato — um toque acidental não vale como assinatura.
 */

export type QuadroRef = {
  /** PNG em data URL, ou null se ainda não há traço suficiente. */
  capturar: () => string | null
  limpar: () => void
}

export function QuadroAssinatura({
  ref,
  rotulo = 'Assine no quadro',
  aoMudar,
}: {
  ref?: RefObject<QuadroRef | null>
  rotulo?: string
  aoMudar?: (temTraco: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const pontos = useRef(0)
  const [temTraco, setTemTraco] = useState(false)

  const preparar = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const r = cv.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    // Preserva o desenho ao redimensionar (ex.: girar o celular).
    const antes = pontos.current > 0 ? cv.toDataURL() : null
    cv.width = Math.round(r.width * dpr)
    cv.height = Math.round(r.height * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#14071F'
    if (antes) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height)
      img.src = antes
    }
  }, [])

  useEffect(() => {
    preparar()
    const ro = new ResizeObserver(preparar)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [preparar])

  const posicao = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const comecar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    // Captura o ponteiro: se o dedo escorregar para fora do quadro, o traço
    // continua sendo entregue aqui em vez de sumir no meio.
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    desenhando.current = true
    const p = posicao(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = posicao(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    pontos.current++
    // Alguns pontos, não o primeiro toque: encostar sem querer não é assinar.
    if (pontos.current === 6) {
      setTemTraco(true)
      aoMudar?.(true)
    }
  }

  const parar = () => {
    desenhando.current = false
  }

  const limpar = useCallback(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    pontos.current = 0
    setTemTraco(false)
    aoMudar?.(false)
  }, [aoMudar])

  useImperativeHandle(
    ref,
    () => ({
      capturar: () => (pontos.current >= 6 ? (canvasRef.current?.toDataURL('image/png') ?? null) : null),
      limpar,
    }),
    [limpar],
  )

  return (
    <div className={estilo.envolve}>
      <div className={`${estilo.quadro} ${temTraco ? estilo.assinado : ''}`}>
        <canvas
          ref={canvasRef}
          className={estilo.canvas}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={parar}
          onPointerCancel={parar}
          onPointerLeave={parar}
          aria-label={rotulo}
          role="img"
        />
        {!temTraco ? <span className={estilo.dica}>{rotulo}</span> : null}
        <span className={estilo.linhaBase} aria-hidden="true" />
      </div>
      <div className={estilo.acoes}>
        <span className={estilo.estado}>{temTraco ? 'Assinado' : 'Aguardando a assinatura'}</span>
        <button type="button" onClick={limpar} className={estilo.limpar}>
          Limpar
        </button>
      </div>
    </div>
  )
}
