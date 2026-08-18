'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { anexarFotos } from '@/server/acoes/ordem'
import estilo from '../../app.module.css'

/**
 * As fotos do motorista, na porta do cliente.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELAS EXISTEM
 * ---------------------------------------------------------------------------
 * O aparelho sai da clínica inteiro e chega na bancada com um risco no painel.
 * Sem foto do momento em que saiu, essa conversa não tem como terminar bem para
 * ninguém — a assistência não consegue provar que não foi ela, e o cliente não
 * consegue provar que foi. Seis fotos na retirada e seis na entrega fecham as
 * duas pontas do transporte, que é o trecho em que o equipamento fica fora da
 * vista dos dois lados.
 *
 * ---------------------------------------------------------------------------
 * DECISÕES QUE VÊM DA RUA
 * ---------------------------------------------------------------------------
 *  • **`capture="environment"`** abre a câmera traseira direto, sem passar pela
 *    galeria. Quem está de pé segurando um aparelho não navega em pastas.
 *  • **Envio uma a uma, com o progresso à vista.** Mandar seis de uma vez num
 *    4G ruim significa: ou vão todas, ou não vai nenhuma, e a pessoa fica
 *    olhando para uma barra parada sem saber se pode sair. Uma a uma, o que já
 *    subiu está garantido.
 *  • **Offline trava o botão, não engana.** Mostrar "enviado" sem confirmação
 *    do servidor é o defeito que faz o motorista ir embora achando que
 *    registrou.
 *  • **Sem excluir depois de enviada.** Foto de campo é prova; apagar prova em
 *    campo é o oposto do motivo de ela existir. Se saiu errada, tira outra.
 */
export function FotosDeCampo({
  ordemId,
  tipo,
  jaEnviadas,
}: {
  ordemId: string
  tipo: 'RETIRADA' | 'ENTREGA'
  jaEnviadas: number
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviadas, setEnviadas] = useState(jaEnviadas)
  const [subindo, setSubindo] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const TETO = 6
  const restam = TETO - enviadas

  async function enviar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    setErro(null)

    if (!navigator.onLine) {
      setErro('Sem internet agora. As fotos precisam chegar ao servidor para valer como registro.')
      return
    }

    const arquivos = Array.from(lista).slice(0, restam)
    setSubindo({ feitas: 0, total: arquivos.length })

    for (const [i, arquivo] of arquivos.entries()) {
      const fd = new FormData()
      fd.append('ordemId', ordemId)
      fd.append('categoria', tipo)
      fd.append('fotos', arquivo)

      const r = await anexarFotos(fd)
      if (!r.ok) {
        setErro(`${r.motivo} (${i} de ${arquivos.length} enviadas)`)
        setSubindo(null)
        setEnviadas((n) => n + i)
        router.refresh()
        return
      }
      setSubindo({ feitas: i + 1, total: arquivos.length })
    }

    setEnviadas((n) => n + arquivos.length)
    setSubindo(null)
    if (entrada.current) entrada.current.value = ''
    router.refresh()
  }

  return (
    <section className={estilo.blocoCampo}>
      <p className={estilo.grav}>
        {tipo === 'RETIRADA' ? 'Fotos de como o aparelho saiu' : 'Fotos da entrega'}
      </p>
      <p className={estilo.notaCampo}>
        Até {TETO}. {enviadas > 0 ? `${enviadas} já registrada${enviadas > 1 ? 's' : ''}.` : 'Nenhuma ainda.'}{' '}
        {tipo === 'RETIRADA'
          ? 'É o que prova o estado em que ele estava quando saiu daqui.'
          : 'É o que prova o estado em que ele chegou.'}
      </p>

      {erro ? <p className={estilo.erroCampo}>{erro}</p> : null}

      {subindo ? (
        <p className={estilo.notaCampo} aria-live="polite">
          Enviando {subindo.feitas} de {subindo.total}…
        </p>
      ) : null}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => void enviar(e.target.files)}
      />

      <button
        type="button"
        className={estilo.btnFoto}
        disabled={restam <= 0 || subindo !== null}
        onClick={() => entrada.current?.click()}
      >
        {restam <= 0
          ? `${TETO} fotos registradas`
          : subindo
            ? 'Enviando…'
            : `Tirar foto (faltam ${restam})`}
      </button>
    </section>
  )
}
