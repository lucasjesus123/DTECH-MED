'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { anexarFotos, avancar } from '@/server/acoes/ordem'
import estilo from '../../app.module.css'

type Foto = { id: string; legenda: string | null; autorNome: string }

/**
 * Entrada do equipamento na oficina.
 *
 * O mínimo de seis fotos é regra, não sugestão — e ela vive no servidor, na
 * máquina de estados. O botão desabilitado aqui é só cortesia: se alguém
 * chamar a ação direto, o motor recusa do mesmo jeito.
 *
 * As fotos são reduzidas no PRÓPRIO CELULAR antes de subir. O aparelho tira
 * imagem de 5 MB; seis delas num 4G ruim deixam o técnico esperando uma barra
 * de progresso que não anda, e ele acaba desistindo de fotografar.
 */
export function Recebimento({
  ordemId,
  etapa,
  etapaRotulo,
  fotos,
}: {
  ordemId: string
  etapa: EtapaOrdem
  etapaRotulo: string
  fotos: Foto[]
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const total = fotos.length
  const faltam = Math.max(0, 6 - total)
  const podeEntrar = etapa === EtapaOrdem.COLETADO && faltam === 0

  async function reduzir(arquivo: File): Promise<File> {
    // Acima de 1600px não se ganha detalhe útil para provar o estado do
    // aparelho — só peso, que na rua vira espera.
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    if (escala === 1 && arquivo.size < 900_000) return arquivo

    const cv = document.createElement('canvas')
    cv.width = Math.round(bitmap.width * escala)
    cv.height = Math.round(bitmap.height * escala)
    cv.getContext('2d')!.drawImage(bitmap, 0, 0, cv.width, cv.height)
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.82))
    bitmap.close()
    if (!blob) return arquivo
    return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  }

  async function enviarFotos(lista: FileList) {
    setErro(null)
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.set('ordemId', ordemId)
      fd.set('categoria', 'RECEBIMENTO')
      for (const arquivo of Array.from(lista).slice(0, 8)) {
        fd.append('fotos', await reduzir(arquivo))
      }
      const r = await anexarFotos(fd)
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    } catch {
      setErro('Não foi possível preparar as fotos. Tente de novo.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  function darEntrada() {
    iniciar(async () => {
      const r = await avancar({ ordemId, para: EtapaOrdem.RECEBIDO_NA_EMPRESA })
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  return (
    <>
      <section className={estilo.blocoFotos}>
        <span className={estilo.grav}>Como chegou</span>
        <p className={estilo.notaFotos}>
          São 6 fotos, no mínimo. É o que segura a discussão se daqui a um mês alguém
          disser que o arranhão foi aqui.
        </p>

        <div className={estilo.gradeFotos}>
          {fotos.map((f) => (
            <div key={f.id} className={estilo.slotCheio}>
              <Image
                src={`/api/foto/${f.id}?t=1`}
                alt={f.legenda ?? 'Foto do equipamento na entrada'}
                fill
                sizes="120px"
                className={estilo.imgFoto}
                unoptimized
              />
            </div>
          ))}
          {Array.from({ length: Math.max(faltam, total < 6 ? 1 : 0) }).map((_, i) => (
            <button
              key={`vazio-${i}`}
              type="button"
              className={estilo.slotVazio}
              onClick={() => entrada.current?.click()}
              aria-label="Adicionar foto"
            >
              +
            </button>
          ))}
        </div>

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          // `capture` abre a câmera direto em vez da galeria: o técnico está
          // com o aparelho na frente dele, não procurando arquivo antigo.
          capture="environment"
          multiple
          hidden
          onChange={(e) => e.target.files?.length && enviarFotos(e.target.files)}
        />

        <div className={estilo.contadorFotos}>
          <button
            type="button"
            className={estilo.btnFoto}
            onClick={() => entrada.current?.click()}
            disabled={enviando}
          >
            {enviando ? 'Enviando…' : 'Tirar foto'}
          </button>
          <span className={faltam > 0 ? estilo.contaFalta : estilo.contaOk}>
            {faltam > 0 ? `${total} de 6` : `${total} fotos`}
          </span>
        </div>
      </section>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      {etapa === EtapaOrdem.COLETADO ? (
        <button
          type="button"
          className={estilo.btnConfirmar}
          onClick={darEntrada}
          disabled={!podeEntrar || pendente}
        >
          {pendente
            ? 'Registrando…'
            : faltam === 0
              ? 'Dar entrada no equipamento'
              : faltam === 1
                ? 'Falta 1 foto para dar entrada'
                : `Faltam ${faltam} fotos para dar entrada`}
        </button>
      ) : (
        <p className={estilo.feitoGrande}>
          Equipamento já deu entrada. Situação: {etapaRotulo.toLowerCase()}.
        </p>
      )}
    </>
  )
}
