'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceitarOrdemDoTecnico } from '@/server/acoes/ordem'
import { comprimirFoto, emMB } from '../../comprimir'
import estilo from '../../app.module.css'

/**
 * O ACEITE DO TÉCNICO — E O ACEITE É A FOTO.
 *
 * O pedido do dono foi "precisa ele aceitar a O.S., o primeiro passo é já tirar
 * foto imediata". Isso podia virar duas coisas muito diferentes: um botão
 * "aceitar" e, depois, um lembrete para fotografar; ou um aceite que só existe
 * com a foto dentro.
 *
 * É a segunda, e a razão aparece no dia em que o aparelho volta com um arranhão
 * que ninguém sabe de onde veio. A primeira foto é a FRONTEIRA entre o que
 * chegou assim e o que aconteceu aqui dentro. Um aceite sem foto marcaria a
 * hora em que alguém assumiu um aparelho que ninguém viu — que é exatamente o
 * buraco que a foto existe para fechar.
 *
 * Por isso não há botão de aceitar: há um botão de fotografar, e fotografar é
 * aceitar. `capture="environment"` abre a câmera de trás direto, sem passar
 * pela galeria: a foto tem de ser do aparelho que está na bancada AGORA, e a
 * galeria é o caminho para a foto de outro dia.
 *
 * A imagem é reduzida no próprio celular antes de subir — mesma razão do resto
 * do aplicativo: 5 MB num 4G ruim é uma barra de progresso que não anda, e uma
 * pessoa que desiste de fotografar.
 */
export function AceiteDoTecnico({
  ordemId,
  equipamento,
}: {
  ordemId: string
  equipamento: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [, iniciar] = useTransition()
  const router = useRouter()

  async function aoEscolher(lista: FileList | null) {
    const arquivo = lista?.[0]
    if (!arquivo) return
    setErro(null)
    setEnviando(true)
    try {
      const r = await comprimirFoto(arquivo)
      const form = new FormData()
      form.set('ordemId', ordemId)
      form.set('foto', r.arquivo)
      const resp = await aceitarOrdemDoTecnico(form)
      if (!resp.ok) {
        setErro(resp.motivo)
        return
      }
      iniciar(() => router.refresh())
    } catch (e) {
      setErro(
        `Não deu para enviar a foto (${e instanceof Error ? e.message : 'erro desconhecido'}). Tente de novo.`,
      )
    } finally {
      setEnviando(false)
      // Zera a entrada: sem isto, escolher a MESMA foto de novo não dispara
      // evento nenhum, e a tela fica parada parecendo travada.
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <section className={estilo.aceiteTecnico}>
      <span className={estilo.grav}>Assumir este aparelho</span>
      <p className={estilo.aceiteTexto}>
        Fotografe o <strong>{equipamento}</strong> como ele chegou. Essa primeira imagem é o que
        separa o que veio assim do que acontecer aqui dentro — e é ela que assume a O.S. no seu
        nome.
      </p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => aoEscolher(e.target.files)}
      />
      <button
        type="button"
        className={estilo.btnFoto}
        disabled={enviando}
        onClick={() => entrada.current?.click()}
      >
        {enviando ? 'Enviando a foto…' : 'Fotografar e assumir'}
      </button>
      <p className={estilo.ajudaCampo}>
        A foto é reduzida no seu celular antes de subir, para funcionar em sinal ruim. Limite por
        imagem: {emMB(8 * 1024 * 1024)}.
      </p>
    </section>
  )
}
