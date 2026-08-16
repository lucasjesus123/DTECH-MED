'use client'

import { useRef, useState, useTransition } from 'react'
import {
  enviarFotoDoSite,
  removerFotoDoSite,
  type SlotFoto,
} from '@/server/acoes/site-fotos'
import estilo from './editor.module.css'

/**
 * A aba de fotos do editor.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A FOTO NÃO ESPERA O "SALVAR"
 * ---------------------------------------------------------------------------
 * O resto do editor junta as mudanças e grava tudo de uma vez, com versão. A
 * foto vale no instante em que é enviada, e isso é diferente de propósito.
 *
 * Uma imagem de 3 MB não cabe no mesmo pacote que os textos: teria que viajar
 * dentro do estado do React, ficar na memória do navegador enquanto a pessoa
 * mexe em outras abas, e subir junto num pedido gigante que falha inteiro se
 * cair a conexão. Trocar nove fotos assim seria um pedido de 25 MB que ou vai
 * todo ou não vai nada.
 *
 * Cada foto sobe sozinha, na hora, e a tela diz o que aconteceu com aquela.
 * Em troca, o botão "Salvar" lá em cima não tem nada a ver com esta aba — e a
 * tela precisa deixar isso explícito, senão a pessoa envia a foto, esquece de
 * salvar o resto, e acha que perdeu a foto também.
 */
export default function Fotos({ inicial }: { inicial: SlotFoto[] }) {
  const [lugares, setLugares] = useState(inicial)

  if (lugares.length === 0) {
    return <p className={estilo.descricao}>Não foi possível carregar os lugares de foto.</p>
  }

  return (
    <>
      <p className={estilo.descricao}>
        Cada foto vale <strong>assim que você envia</strong> — esta aba não depende do
        botão Salvar. JPG, PNG ou WebP, no mínimo 900px de largura e até 8 MB.
      </p>
      <p className={estilo.descricao}>
        Tirar a foto enviada faz o site voltar para a que veio de fábrica. O histórico
        de versões guarda os <strong>textos</strong>: restaurar uma versão antiga não
        traz fotos antigas de volta.
      </p>

      {lugares.map((l) => (
        <Lugar
          key={l.slot}
          lugar={l}
          aoMudar={(enviada) =>
            setLugares((atual) =>
              atual.map((x) => (x.slot === l.slot ? { ...x, enviada } : x)),
            )
          }
        />
      ))}
    </>
  )
}

function Lugar({
  lugar,
  aoMudar,
}: {
  lugar: SlotFoto
  aoMudar: (enviada: boolean) => void
}) {
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [trabalhando, iniciar] = useTransition()
  // Muda a cada troca, para o navegador buscar a miniatura de novo em vez de
  // mostrar a que ele já tem guardada.
  const [carimbo, setCarimbo] = useState(() => 0)
  const entrada = useRef<HTMLInputElement>(null)

  function enviar(arquivo: File) {
    const dados = new FormData()
    dados.set('slot', lugar.slot)
    dados.set('arquivo', arquivo)
    iniciar(async () => {
      const r = await enviarFotoDoSite(dados)
      setAviso({ tipo: r.ok ? 'ok' : 'erro', texto: r.ok ? r.mensagem : r.motivo })
      if (r.ok) {
        aoMudar(true)
        setCarimbo(Date.now())
      }
      // O campo é limpo mesmo quando dá certo: sem isso, escolher o MESMO
      // arquivo de novo não dispara o `change` do navegador, e a pessoa clica
      // achando que reenviou.
      if (entrada.current) entrada.current.value = ''
    })
  }

  function remover() {
    iniciar(async () => {
      const r = await removerFotoDoSite(lugar.slot)
      setAviso({ tipo: r.ok ? 'ok' : 'erro', texto: r.ok ? r.mensagem : r.motivo })
      if (r.ok) {
        aoMudar(false)
        setCarimbo(Date.now())
      }
    })
  }

  return (
    <fieldset className={estilo.grupo}>
      <legend>{lugar.rotulo}</legend>

      <div className={estilo.fotoLinha}>
        <div className={estilo.fotoMiniatura}>
          {lugar.enviada ? (
            /* `img` comum, e não o componente otimizado: aqui a imagem tem 96px
               e muda a cada envio. Otimizar valeria menos que o pedido a mais, e
               a versão otimizada teria que ser invalidada a cada troca. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/foto-site/${lugar.slot}?v=${carimbo}`}
              alt={`Foto atual: ${lugar.rotulo}`}
              width={96}
              height={72}
            />
          ) : (
            <span className={estilo.fotoVazia}>de fábrica</span>
          )}
        </div>

        <div className={estilo.fotoTexto}>
          <p className={estilo.descricao}>{lugar.ajuda}</p>

          <div className={estilo.fotoBotoes}>
            <label className={estilo.fotoEscolher}>
              {lugar.enviada ? 'Trocar' : 'Enviar foto'}
              <input
                ref={entrada}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={trabalhando}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) enviar(f)
                }}
              />
            </label>

            {lugar.enviada ? (
              <button
                type="button"
                className={estilo.acrescentar}
                onClick={remover}
                disabled={trabalhando}
              >
                Tirar e voltar para a de fábrica
              </button>
            ) : null}
          </div>

          {trabalhando ? <p className={estilo.descricao}>Enviando…</p> : null}
          {aviso && !trabalhando ? (
            <p
              className={aviso.tipo === 'ok' ? estilo.avisoOk : estilo.avisoErro}
              role="status"
            >
              {aviso.texto}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  )
}
