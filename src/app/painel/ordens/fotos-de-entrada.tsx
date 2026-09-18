'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anexarFotos } from '@/server/acoes/ordem'
import { comprimirFoto } from '../../app/comprimir'
import estilo from '../painel.module.css'

/**
 * AS SEIS FOTOS DE ENTRADA, TIRADAS DE ONDE O APARELHO ESTÁ.
 *
 * =============================================================================
 * A PAREDE QUE ISTO DERRUBA
 * =============================================================================
 * `COLETADO → RECEBIDO_NA_EMPRESA` exige seis fotos, e a exigência está certa:
 * é o estado em que o aparelho chegou, antes de alguém encostar a chave, e é o
 * que resolve "voltou riscado" três meses depois. Ela não sai daqui.
 *
 * O que estava errado era o LUGAR. Só o aplicativo do técnico tirava foto, e a
 * janela da central dizia, em cima de uma ordem parada: *"Faltam 6 das seis
 * fotos de entrada. Quem tira é o técnico, pelo aplicativo."* Quando o cliente
 * traz o aparelho no balcão, quem está com ele na mão é a pessoa do balcão — e
 * ela lia uma frase mandando esperar alguém que está a três metros dali, sem
 * nenhum botão para resolver.
 *
 * O dono descreveu o efeito com precisão: *"chega na parte da coleta do
 * equipamento, eu não consigo ir adiante"*.
 *
 * O servidor sempre permitiu: `anexarFotos` não tem trava de perfil, porque a
 * foto não é privilégio de ninguém — é registro. Faltava a tela.
 *
 * =============================================================================
 * POR QUE COMPRIME AQUI TAMBÉM
 * =============================================================================
 * O mesmo `comprimirFoto` do celular do técnico e do motorista. A central às
 * vezes é um notebook em rede boa, mas às vezes é o telefone do dono no balcão
 * — e seis fotos de 5 MB num 4G de loja é o mesmo problema, no mesmo lugar.
 *
 * Sobe UMA A UMA, pelo mesmo motivo: num sinal ruim, mandar as seis de uma vez
 * é tudo ou nada, e falhar a última perde as seis.
 */
export default function FotosDeEntrada({
  ordemId,
  jaTem,
  aoSubir,
}: {
  ordemId: string
  /** Quantas fotos de RECEBIMENTO a ordem já tem. */
  jaTem: number
  /** Chamado quando pelo menos uma foto entrou, para a janela recarregar. */
  aoSubir: () => void
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [andamento, setAndamento] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  const enviando = andamento !== null

  const faltam = Math.max(0, 6 - jaTem)

  async function enviar(lista: FileList) {
    setErro(null)
    const arquivos = Array.from(lista).slice(0, 12)
    if (arquivos.length === 0) return
    setAndamento({ feitas: 0, total: arquivos.length })

    let entraram = 0
    for (const [i, arquivo] of arquivos.entries()) {
      try {
        const menor = await comprimirFoto(arquivo)
        const form = new FormData()
        form.set('ordemId', ordemId)
        form.set('categoria', 'RECEBIMENTO')
        form.append('fotos', menor.arquivo)
        const r = await anexarFotos(form)
        if (!r.ok) {
          setErro(r.motivo)
          break
        }
        entraram++
      } catch {
        // Uma foto que o navegador não consegue ler não pode derrubar as
        // outras cinco: anota e segue. O contador embaixo mostra a verdade.
        setErro('Uma das imagens não pôde ser lida. As outras foram enviadas.')
      }
      setAndamento({ feitas: i + 1, total: arquivos.length })
    }

    setAndamento(null)
    if (entrada.current) entrada.current.value = ''
    if (entraram > 0) {
      iniciar(() => {
        router.refresh()
        aoSubir()
      })
    }
  }

  return (
    <div className={estilo.osFotos}>
      <p className={estilo.osFotosTitulo}>
        Fotos de entrada
        <span className={estilo.osFotosConta}>
          {jaTem} de 6{faltam === 0 ? ' · completo' : ''}
        </span>
      </p>

      <p className={estilo.dica} style={{ marginTop: 0 }}>
        {faltam === 0
          ? 'As seis já estão registradas. Pode dar entrada no equipamento.'
          : `Fotografe o aparelho como ele chegou — antes de alguém encostar a chave. É esta imagem que separa o que veio assim do que aconteceu aqui dentro. Faltam ${faltam}.`}
      </p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      {/* O rótulo É o botão: um `<input type=file>` cru é feio e, no celular,
          não deixa claro que abre a câmera. `capture` não vai aqui de
          propósito — na central isso pode ser um notebook, e forçar a câmera
          impediria de anexar a foto que o cliente mandou por WhatsApp. */}
      <label className={estilo.osFotosBotao} aria-disabled={enviando}>
        {enviando ? `Enviando ${andamento.feitas} de ${andamento.total}…` : 'Anexar fotos'}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          disabled={enviando}
          className={estilo.soLeitor}
          onChange={(e) => {
            if (e.target.files) void enviar(e.target.files)
          }}
        />
      </label>
    </div>
  )
}
