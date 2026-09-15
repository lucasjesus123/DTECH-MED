'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anexarOsAssinada } from '@/server/acoes/documentos'
import estilo from '../../painel.module.css'

/**
 * ANEXAR A O.S. QUE O CLIENTE DEVOLVEU ASSINADA.
 *
 * =============================================================================
 * O CAMINHO QUE FALTAVA
 * =============================================================================
 * O pedido do dono, na descrição da etapa 2:
 *
 *   "A PESSOA ASSINA COM O CPF E RUBRICA NA TELA DO CELULAR **OU MANDA A O.S
 *    ASSINADA PELO GOV E ANEXAMOS NO PRONTUÁRIO**"
 *
 * O primeiro caminho já existia. O segundo não existia em lugar nenhum — e é
 * justamente o caminho dos clientes grandes: hospital e órgão público muitas
 * vezes não podem assinar com o dedo numa tela, porque o jurídico exige
 * certificado. Essas ordens ficavam com o "pode tocar" dito por telefone e
 * nada guardado.
 *
 * =============================================================================
 * ELE NÃO ANDA A ESTEIRA, E ISSO É DE PROPÓSITO
 * =============================================================================
 * Anexar é juntar prova, não aprovar orçamento. Quem move a ordem continua
 * sendo a máquina de estados, com as travas dela. Se este botão avançasse a
 * etapa, um PDF qualquer chamado "assinado.pdf" viraria aprovação de orçamento
 * — e ninguém teria conferido a assinatura.
 *
 * Quem confere é gente: abre o arquivo, vê o carimbo do gov.br, e aí sim
 * aprova pelo caminho normal. O sistema guarda o que recebeu e diz quem
 * juntou, quando, e com que hash — que é o que ele pode honestamente afirmar.
 */
export default function AnexarAssinada({ ordemId }: { ordemId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [nome, setNome] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const campo = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    const arquivo = dados.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      setMsg({ ok: false, texto: 'Escolha o arquivo assinado antes de anexar.' })
      return
    }
    setMsg(null)
    iniciar(async () => {
      const r = await anexarOsAssinada(ordemId, dados)
      setMsg({ ok: r.ok, texto: r.ok ? r.mensagem : r.motivo })
      if (r.ok) {
        // O campo é limpo só no sucesso: depois de um erro, o arquivo escolhido
        // continua ali para a pessoa tentar de novo sem procurá-lo na pasta.
        if (campo.current) campo.current.value = ''
        setNome(null)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={enviar}>
      <div className={estilo.acoesForm}>
        <label className={estilo.btnSec} style={{ cursor: 'pointer' }}>
          {nome ?? 'Escolher o PDF assinado'}
          <input
            ref={campo}
            type="file"
            name="arquivo"
            accept="application/pdf,.pdf"
            className={estilo.soLeitor}
            onChange={(e) => {
              setMsg(null)
              setNome(e.target.files?.[0]?.name ?? null)
            }}
          />
        </label>
        <button type="submit" className={estilo.btn} disabled={pendente || !nome}>
          {pendente ? 'Anexando…' : 'Anexar ao prontuário'}
        </button>
      </div>

      {msg ? (
        <p className={msg.ok ? estilo.aviso : estilo.erro} role="alert" style={{ marginTop: 'var(--s3)' }}>
          {msg.texto}
        </p>
      ) : null}
    </form>
  )
}
