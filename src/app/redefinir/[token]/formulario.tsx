'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { redefinir } from '../../esqueci/acoes'
import estilo from '../../entrar/entrar.module.css'

/**
 * Gastar o link e escolher a senha nova.
 *
 * O token vem num campo oculto e não da URL lida pelo JavaScript: assim a ação
 * do servidor recebe exatamente o que a página entregou, e não o que alguém
 * conseguiu enfiar no endereço depois.
 *
 * O olho da senha existe pelo mesmo motivo da tela de entrar: senha de dez
 * caracteres digitada às cegas no celular é senha errada na primeira tentativa
 * — e aqui errar significa perder o link, porque ele vale uma vez só.
 */
export function Formulario({ token }: { token: string }) {
  const [estado, acao, enviando] = useActionState(redefinir, {})
  const [mostrar, setMostrar] = useState(false)

  if (estado.ok) {
    return (
      <div className={estilo.form}>
        <p className={estilo.aviso} role="status">
          <strong>Senha trocada.</strong> Todas as sessões abertas dessa conta foram encerradas —
          se alguém estava dentro dela, saiu agora.
        </p>
        <Link href="/entrar" className={estilo.botao}>
          Entrar com a senha nova
        </Link>
      </div>
    )
  }

  return (
    <form action={acao} className={estilo.form} noValidate>
      <input type="hidden" name="token" value={token} />

      <div className={estilo.campo}>
        <label htmlFor="nova">Nova senha</label>
        <div className={estilo.senhaLinha}>
          <input
            id="nova"
            name="nova"
            type={mostrar ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            required
            minLength={10}
            placeholder="Ao menos 10 caracteres"
          />
          <button
            type="button"
            className={estilo.olho}
            onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? 'Ocultar a senha' : 'Mostrar a senha'}
            aria-pressed={mostrar}
          >
            {mostrar ? 'ocultar' : 'mostrar'}
          </button>
        </div>
      </div>

      <div className={estilo.campo}>
        <label htmlFor="confirmacao">Repita a nova senha</label>
        <input
          id="confirmacao"
          name="confirmacao"
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          required
          placeholder="A mesma senha de novo"
        />
      </div>

      {estado.erro ? (
        <p className={estilo.erro} role="alert">
          {estado.erro}
        </p>
      ) : null}

      <button type="submit" className={estilo.botao} disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar nova senha'}
      </button>

      <p className={estilo.ajuda}>
        Ao salvar, todas as sessões abertas dessa conta são encerradas. É o que garante que quem
        tiver entrado sem permissão saia junto. <Link href="/entrar">Voltar para o login</Link>
      </p>
    </form>
  )
}
