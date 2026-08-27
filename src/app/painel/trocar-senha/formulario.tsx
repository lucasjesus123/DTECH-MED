'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { encerrarTodasAsSessoes, trocarSenha } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * Troca de senha.
 *
 * Pede a senha atual mesmo com a sessão válida: um notebook deixado aberto na
 * recepção não pode virar uma conta tomada em dois cliques.
 *
 * O botão de encerrar todas as sessões fica ao lado, e não escondido em outra
 * tela. Quem desconfia que alguém entrou na conta dele quer resolver isso no
 * mesmo minuto em que troca a senha.
 */
export default function Formulario({ nome }: { nome: string }) {
  const [estado, acao, pendente] = useActionState(trocarSenha, inicial)
  const [saindo, iniciarSaida] = useTransition()
  const router = useRouter()

  function encerrarTudo() {
    iniciarSaida(async () => {
      await encerrarTodasAsSessoes()
      router.push('/entrar')
    })
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
        <p className={estilo.blocoTitulo}>{nome}</p>

        {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
        {estado.ok && estado.mensagem ? <p className={estilo.sucesso} role="status">{estado.mensagem}</p> : null}

        <label className={estilo.rotulo}>
          Senha atual
          <input className={estilo.campo} name="atual" type="password" required autoComplete="current-password" />
        </label>

        <label className={estilo.rotulo}>
          Nova senha
          <input className={estilo.campo} name="nova" type="password" required minLength={10} autoComplete="new-password" />
          <span className={estilo.dica}>
            No mínimo 10 caracteres. Uma frase que só você usa vale mais que uma
            palavra com símbolos trocados — é mais longa e mais fácil de lembrar.
          </span>
        </label>

        <label className={estilo.rotulo}>
          Repita a nova senha
          <input className={estilo.campo} name="confirmacao" type="password" required autoComplete="new-password" />
        </label>

        <div className={estilo.acoesForm}>
          <button type="submit" className={estilo.btn} disabled={pendente}>
            {pendente ? 'Trocando…' : 'Trocar senha'}
          </button>
        </div>
      </form>

      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Se você desconfia de acesso indevido</p>
        <p className={estilo.texto}>
          Encerrar todas as sessões derruba qualquer aparelho conectado com a sua
          conta — inclusive este. Você entra de novo em seguida.
        </p>
        <div className={estilo.passos}>
          <button type="button" className={estilo.btnPerigo} onClick={encerrarTudo} disabled={saindo}>
            {saindo ? 'Encerrando…' : 'Encerrar todas as sessões'}
          </button>
        </div>
      </div>
    </div>
  )
}
