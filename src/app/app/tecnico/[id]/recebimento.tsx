'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { EtapaOrdem } from '@/generated/prisma/enums'
import { anexarFotos, avancar } from '@/server/acoes/ordem'
import { comprimirFoto, emMB } from '../../comprimir'
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
 *
 * A redução mora em `../../comprimir`, junto com a do motorista. Havia uma
 * cópia aqui, e ela carregava dois defeitos que a versão compartilhada não
 * tem: não aplicava a orientação do EXIF — foto tirada com o celular em pé
 * subia deitada, e só se descobria no painel — e mandava as oito de uma vez,
 * num único envio. Num sinal ruim isso é tudo ou nada: falhou a última,
 * perderam-se as oito.
 *
 * Agora sobe uma a uma. O que já entrou está garantido.
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
  const [passo, setPasso] = useState<{ feitas: number; total: number; oQue: string } | null>(null)
  const [economia, setEconomia] = useState<{ antes: number; depois: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const enviando = passo !== null
  const [pendente, iniciar] = useTransition()

  const total = fotos.length
  const faltam = Math.max(0, 6 - total)
  const podeEntrar = etapa === EtapaOrdem.COLETADO && faltam === 0

  async function enviarFotos(lista: FileList) {
    setErro(null)
    const arquivos = Array.from(lista).slice(0, 8)
    setPasso({ feitas: 0, total: arquivos.length, oQue: 'preparando' })
    let antes = 0
    let depois = 0

    try {
      for (const [i, arquivo] of arquivos.entries()) {
        // Uma de cada vez, e nunca em paralelo: comprimir oito fotos de 12
        // megapixels ao mesmo tempo estoura a memória de celular simples, e o
        // navegador mata a aba — que aqui é o técnico perder tudo.
        setPasso({ feitas: i, total: arquivos.length, oQue: 'preparando' })
        const r0 = await comprimirFoto(arquivo)
        antes += r0.antes
        depois += r0.depois

        setPasso({ feitas: i, total: arquivos.length, oQue: 'enviando' })
        const fd = new FormData()
        fd.set('ordemId', ordemId)
        fd.set('categoria', 'RECEBIMENTO')
        fd.append('fotos', r0.arquivo)

        const r = await anexarFotos(fd)
        if (!r.ok) {
          setErro(`${r.motivo} (${i} de ${arquivos.length} enviadas)`)
          router.refresh()
          return
        }
      }
      if (depois < antes) setEconomia({ antes, depois })
      router.refresh()
    } catch {
      setErro('Não foi possível preparar as fotos. Tente de novo.')
    } finally {
      setPasso(null)
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
            {passo
              ? passo.oQue === 'preparando'
                ? `Preparando ${passo.feitas + 1} de ${passo.total}…`
                : `Enviando ${passo.feitas + 1} de ${passo.total}…`
              : 'Tirar foto'}
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

      {/* O que a redução economizou. É o que explica por que subiu rápido — e
          o que se olha quando alguém disser que "o app está lento hoje". */}
      {economia ? (
        <p className={estilo.notaFotos}>
          Enviado {emMB(economia.depois)} no lugar de {emMB(economia.antes)}.
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
