'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { entrar } from './acoes'
import estilo from './entrar.module.css'

/**
 * O formulário de acesso.
 *
 * Escolhas que mudam o uso de verdade:
 *
 *  • O foco começa no e-mail, então quem chega já pode digitar.
 *  • O erro é anunciado por `role="alert"` — quem usa leitor de tela ouve o
 *    que aconteceu em vez de ficar preso num formulário mudo.
 *  • O botão desabilita durante o envio, senão o duplo clique ansioso dispara
 *    duas autenticações e consome duas tentativas do limite.
 *  • O olho da senha existe porque senha forte é longa, e digitar às cegas num
 *    celular no meio da rua é como a pessoa erra e trava a conta.
 */
export function Formulario({ destino }: { destino?: string }) {
  const [estado, acao, enviando] = useActionState(entrar, {})
  const [mostrar, setMostrar] = useState(false)
  // O React limpa os campos não controlados depois que a ação do servidor
  // volta. Para a senha isso é desejável; para o e-mail é maçante — quem
  // errou a senha teria de digitar o endereço inteiro de novo, toda vez.
  const [email, setEmail] = useState('')

  return (
    <form action={acao} className={estilo.form} noValidate>
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}

      <div className={estilo.campo}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="voce@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={estado.campo === 'email' || undefined}
        />
      </div>

      <div className={estilo.campo}>
        <label htmlFor="senha">Senha</label>
        <div className={estilo.senhaLinha}>
          <input
            id="senha"
            name="senha"
            type={mostrar ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="Sua senha"
            aria-invalid={estado.campo === 'senha' || undefined}
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

      {estado.erro ? (
        <p className={estilo.erro} role="alert">
          {estado.erro}
        </p>
      ) : null}

      <button type="submit" className={estilo.botao} disabled={enviando}>
        {enviando ? 'Verificando…' : 'Entrar'}
      </button>

      <p className={estilo.ajuda}>
        <Link href="/esqueci">Esqueci minha senha</Link> — o link de troca chega pelo WhatsApp
        cadastrado na conta.
      </p>
    </form>
  )
}
