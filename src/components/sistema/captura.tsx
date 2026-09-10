'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { anexarFotos, assinarNoVisor } from '@/server/acoes/ordem'
import { avancarNaEsteira } from '@/server/acoes/sistema'
import estilo from './pecas.module.css'

/**
 * `<CaptureFlow>` — a captura guiada, numa folha só.
 *
 * =============================================================================
 * O PADRÃO 9 DA DIREÇÃO, E POR QUE ELE É O MAIS IMPORTANTE DESTE SISTEMA
 * =============================================================================
 * Registrar uma coleta, uma entrada na bancada ou uma entrega é: foto(s)
 * obrigatória(s), termo com nome e documento, assinatura no dedo, observação, e
 * um botão de finalizar. Tudo numa folha. Sem pular etapa.
 *
 * Aqui isso não é conforto de interface — é a hora em que a prova nasce. A
 * folha de rastreabilidade da O.S. conta ao cliente, ao fabricante e à
 * vigilância sanitária quantas provas existem e de que dia são; se esta tela
 * deixar alguém finalizar sem foto, a resposta daquela O.S. será "não há".
 *
 * =============================================================================
 * POR QUE O BOTÃO NÃO FICA SÓ APAGADO
 * =============================================================================
 * Botão desabilitado sem explicação é a maneira mais comum de travar alguém em
 * campo: a pessoa aperta, nada acontece, e ela não tem como descobrir o que
 * falta. Aqui a lista do que falta fica escrita acima do botão, e some item por
 * item conforme a pessoa cumpre.
 *
 * =============================================================================
 * A ORDEM DAS CHAMADAS, E O QUE ACONTECE SE UMA FALHAR
 * =============================================================================
 * Fotos primeiro, assinatura depois. É de propósito: a assinatura é a chamada
 * que AVANÇA a etapa, e ela precisa ser a última coisa a acontecer. Se as fotos
 * falharem, nada avançou e a pessoa tenta de novo; se avançasse antes, a O.S.
 * mudaria de mão sem as imagens que a etapa promete.
 */

export type ModoCaptura = 'coleta' | 'entrega' | 'bancada'

const Camera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5h3l1.4-2h7.2L17 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </svg>
)

type FotoLocal = { arquivo: File; url: string }

/**
 * A TINTA DA ASSINATURA — a única cor literal do sistema novo.
 *
 * Ela não vem dos tokens de propósito. O traço é desenhado num `<canvas>` e
 * vira uma IMAGEM guardada, que depois entra no PDF do comprovante. Uma
 * assinatura pintada com a cor do texto do tema escuro sairia branca no
 * documento — invisível exatamente onde ela precisa ser lida, meses depois,
 * numa discussão sobre quem recebeu o aparelho.
 *
 * O valor é o mesmo `--text` do tema claro, para o traço na tela combinar com o
 * papel que ele vai virar.
 */
const TINTA_DA_ASSINATURA = '#0B1020'

export default function CaptureFlow({
  ordemId,
  modo,
  minimoFotos,
  passos,
  titulo,
  /** Para onde ir quando terminar. O app de campo volta para a lista de tarefas. */
  aoTerminar,
}: {
  ordemId: string
  modo: ModoCaptura
  /**
   * Quantas fotos a etapa exige.
   *
   * Seis no recebimento não é número escolhido aqui: é o que o motor da esteira
   * exige (`MIN_6_FOTOS`) para deixar o aparelho entrar na oficina. Este campo
   * existe para a TELA poder avisar antes, em vez de a pessoa descobrir levando
   * uma recusa depois de assinar.
   */
  minimoFotos: number
  /** Os saltos a disparar no fim, quando não é a assinatura que avança. */
  passos: EtapaOrdem[]
  titulo: string
  aoTerminar?: string
}) {
  const router = useRouter()
  const [fotos, setFotos] = useState<FotoLocal[]>([])
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [obs, setObs] = useState('')
  const [assinou, setAssinou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const tela = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)

  const precisaAssinatura = modo !== 'bancada'

  // As URLs de pré-visualização são revogadas ao sair. Sem isso, uma tarde de
  // trabalho com seis fotos por O.S. deixa dezenas de blobs presos na memória
  // do celular — que é justamente o aparelho que não tem memória sobrando.
  useEffect(() => {
    return () => {
      for (const f of fotos) URL.revokeObjectURL(f.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function receberArquivos(lista: FileList | null) {
    if (!lista) return
    const novas = Array.from(lista).map((arquivo) => ({
      arquivo,
      url: URL.createObjectURL(arquivo),
    }))
    setFotos((f) => [...f, ...novas].slice(0, 12))
  }

  function tirarFoto(i: number) {
    setFotos((f) => {
      const alvo = f[i]
      if (alvo) URL.revokeObjectURL(alvo.url)
      return f.filter((_, j) => j !== i)
    })
  }

  // --- a assinatura no dedo -------------------------------------------------

  function pontoDoEvento(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = tela.current!
    const r = c.getBoundingClientRect()
    // O canvas tem tamanho de CSS e tamanho de bitmap, e eles não são iguais.
    // Sem esta conversão o traço sai deslocado do dedo — o defeito clássico de
    // quadro de assinatura, e o que faz a pessoa achar que a tela travou.
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    }
  }

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = tela.current
    if (!c) return
    c.setPointerCapture(e.pointerId)
    const ctx = c.getContext('2d')!
    const p = pontoDoEvento(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    desenhando.current = true
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const c = tela.current!
    const ctx = c.getContext('2d')!
    const p = pontoDoEvento(e)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = TINTA_DA_ASSINATURA
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setAssinou(true)
  }

  function parar(e: React.PointerEvent<HTMLCanvasElement>) {
    desenhando.current = false
    tela.current?.releasePointerCapture(e.pointerId)
  }

  function limparAssinatura() {
    const c = tela.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setAssinou(false)
  }

  // --- o que ainda falta ----------------------------------------------------

  const faltando: string[] = []
  if (fotos.length < minimoFotos) {
    const n = minimoFotos - fotos.length
    faltando.push(`${n} ${n === 1 ? 'foto' : 'fotos'} do aparelho`)
  }
  if (precisaAssinatura && nome.trim().length < 3) faltando.push('o nome de quem está recebendo')
  if (precisaAssinatura && !assinou) faltando.push('a assinatura no visor')

  const pronto = faltando.length === 0

  function finalizar() {
    setErro(null)
    iniciar(async () => {
      // 1. As fotos.
      if (fotos.length > 0) {
        const form = new FormData()
        form.set('ordemId', ordemId)
        form.set('categoria', categoriaDo(modo))
        for (const f of fotos) form.append('fotos', f.arquivo)
        const r = await anexarFotos(form)
        if (!r.ok) {
          setErro(r.motivo)
          return
        }
      }

      // 2. A assinatura — e é ela que avança a etapa nos fluxos de campo.
      if (precisaAssinatura) {
        const c = tela.current
        if (!c) return
        const form = new FormData()
        form.set('ordemId', ordemId)
        form.set('tipo', modo === 'coleta' ? 'RETIRADA' : 'ENTREGA')
        form.set('assinanteNome', nome.trim())
        form.set('assinanteDocumento', documento.trim())
        form.set('dataUrl', c.toDataURL('image/png'))

        // A coordenada é opcional de propósito: GPS falha em subsolo, em prédio
        // e em celular velho. Exigir localização deixaria o motorista preso na
        // porta do cliente.
        const geo = await pegarLocal()
        if (geo) {
          form.set('latitude', String(geo.lat))
          form.set('longitude', String(geo.lng))
          form.set('precisaoM', String(geo.precisao))
        }

        const r = await assinarNoVisor(form)
        if (!r.ok) {
          setErro(r.motivo)
          return
        }
      } else if (passos.length > 0) {
        // 3. Bancada: não há assinatura, então o salto é disparado aqui.
        const r = await avancarNaEsteira({ ordemId, passos, observacao: obs.trim() || undefined })
        if (!r.ok) {
          setErro(r.motivo)
          return
        }
      }

      router.push(aoTerminar ?? `/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  const vagas = Math.max(minimoFotos - fotos.length, 1)

  return (
    <section className={estilo.blocoForm}>
      <div className={estilo.blocoNum}>
        <span className={estilo.blocoNumSelo} aria-hidden="true">
          <Camera />
        </span>
        <h2 className={estilo.blocoNomeForm}>{titulo}</h2>
      </div>

      <div className={estilo.captura}>
        <div>
          <p className={estilo.campoDica}>
            {minimoFotos > 0
              ? `Fotografe o aparelho como ele está agora — no mínimo ${minimoFotos} ${minimoFotos === 1 ? 'foto' : 'fotos'}. É esta imagem que separa o que veio assim do que aconteceu aqui dentro.`
              : 'Fotos são opcionais nesta etapa, mas ajudam.'}
          </p>
          <div className={estilo.capturaFotos}>
            {fotos.map((f, i) => (
              <div key={f.url} className={estilo.capturaCheia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`Foto ${i + 1}`} />
                <button
                  type="button"
                  className={estilo.capturaTirar}
                  onClick={() => tirarFoto(i)}
                  aria-label={`Remover a foto ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}

            {Array.from({ length: vagas }).map((_, i) => (
              <label key={`vaga-${i}`} className={estilo.capturaVaga}>
                <Camera />
                <span>Tirar foto</span>
                {/* `capture` abre a câmera direto no celular, em vez da galeria.
                    Quem está com o aparelho na frente quer fotografar, não
                    procurar. */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => {
                    receberArquivos(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {precisaAssinatura ? (
          <>
            <div className={estilo.campos}>
              <label className={estilo.campo}>
                <span>Quem está recebendo</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                  autoComplete="name"
                />
              </label>
              <label className={estilo.campo}>
                <span>
                  CPF ou CNPJ {modo === 'entrega' ? '' : '(opcional)'}
                </span>
                <input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Só os números"
                  inputMode="numeric"
                />
              </label>
            </div>

            <div>
              <p className={estilo.campoDica}>
                Assine com o dedo. O nome acima vale mais que o traço: é ele que
                identifica a pessoa meses depois, quando a discussão aparecer.
              </p>
              <canvas
                ref={tela}
                className={estilo.assinatura}
                width={900}
                height={360}
                onPointerDown={comecar}
                onPointerMove={mover}
                onPointerUp={parar}
                onPointerCancel={parar}
              />
              <div className={estilo.assinaturaPe}>
                <span>{assinou ? 'Assinado' : 'Ainda em branco'}</span>
                <button type="button" className={estilo.acaoLinha} onClick={limparAssinatura}>
                  Limpar
                </button>
              </div>
            </div>
          </>
        ) : null}

        <label className={estilo.campo}>
          <span>Observações (opcional)</span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Algo fora do comum? Amassado, peça faltando, cliente ausente…"
          />
        </label>

        {faltando.length > 0 ? (
          <div className={estilo.faltando}>
            <strong>Falta para finalizar:</strong>
            {faltando.map((f) => (
              <span key={f}>· {f}</span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className={`${estilo.acaoLarga} ${estilo.acaoOk}`}
          disabled={!pronto || enviando}
          onClick={finalizar}
        >
          {enviando ? 'Enviando…' : 'Finalizar e enviar'}
        </button>

        {erro ? (
          <p className={estilo.acaoErro} role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function categoriaDo(modo: ModoCaptura): string {
  if (modo === 'coleta') return 'RETIRADA'
  if (modo === 'entrega') return 'ENTREGA'
  return 'RECEBIMENTO'
}

/**
 * A localização, quando o aparelho quiser dar.
 *
 * Cinco segundos de paciência e nenhuma insistência: se o GPS não responder, a
 * captura segue sem ele. Uma tela que espera coordenada é uma tela que trava na
 * porta do cliente.
 */
async function pegarLocal(): Promise<{ lat: number; lng: number; precisao: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisao: p.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: true },
    )
  })
}
