'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { pedirLink } from './acoes'
import estilo from '../entrar/entrar.module.css'

/**
 * Pedir o link de volta.
 *
 * A tela tem UM campo e UMA resposta possível. É de propósito: a única coisa
 * que ela pode fazer de errado é contar se aquele e-mail existe, e a forma de
 * não contar é não ter nada que varie.
 *
 * Depois do envio o formulário some. Deixá-lo na tela convidaria a pessoa a
 * apertar de novo achando que não funcionou — e o segundo pedido esbarraria no
 * freio de dois minutos sem que ela entendesse por quê.
 */
export function Formulario() {
  const [estado, acao, enviando] = useActionState(pedirLink, {})

  if (estado.enviado) {
    return (
      <div className={estilo.form}>
        <p className={estilo.aviso} role="status">
          Se esse e-mail estiver cadastrado, o link de recuperação saiu agora pelo{' '}
          <strong>WhatsApp</strong> da conta. Ele vale por 30 minutos e funciona uma vez só.
        </p>
        <p className={estilo.ajuda}>
          Não chegou? Pode ser que a conta não tenha WhatsApp cadastrado. Fale com o responsável
          pela sua empresa — ele gera um acesso novo para você em um minuto.
        </p>
        <Link href="/entrar" className={estilo.botao}>
          Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <form action={acao} className={estilo.form} noValidate>
      <div className={estilo.campo}>
        <label htmlFor="email">E-mail do seu acesso</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="voce@empresa.com.br"
        />
      </div>

      {estado.erro ? (
        <p className={estilo.erro} role="alert">
          {estado.erro}
        </p>
      ) : null}

      <button type="submit" className={estilo.botao} disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link de recuperação'}
      </button>

      <p className={estilo.ajuda}>
        O link chega pelo WhatsApp cadastrado na sua conta — este sistema não manda e-mail.{' '}
        <Link href="/entrar">Voltar para o login</Link>
      </p>
    </form>
  )
}
