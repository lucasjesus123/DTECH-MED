'use client'

import { useActionState } from 'react'
import { atualizarPerfil, trocarSenha } from '@/server/acoes/plataforma'
import estilo from '../app.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * O cadastro e a senha, um embaixo do outro, em formulários SEPARADOS.
 *
 * Separados porque falham por motivos diferentes e no mesmo instante: um "a
 * senha atual não confere" não pode desfazer o telefone que a pessoa acabou de
 * corrigir, e um nome curto demais não pode segurar a troca de senha. Cada
 * bloco responde por si, e a resposta aparece onde a pessoa está olhando.
 */
export default function Formulario({
  nome,
  telefone,
  documento,
  email,
}: {
  nome: string
  telefone: string
  documento: string
  email: string
}) {
  const [dados, salvarDados, salvando] = useActionState(atualizarPerfil, inicial)
  const [senha, salvarSenha, trocando] = useActionState(trocarSenha, inicial)

  return (
    <div className={estilo.form}>
      <form action={salvarDados} className={estilo.form}>
        {dados.ok ? (
          <p className={estilo.feito} role="status">
            {dados.mensagem ?? 'Cadastro salvo.'}
          </p>
        ) : dados.motivo ? (
          <p className={estilo.erro} role="alert">
            {dados.motivo}
          </p>
        ) : null}

        <label className={estilo.campo}>
          <span>Nome completo</span>
          <input name="nome" defaultValue={nome} required minLength={3} autoComplete="name" />
        </label>

        <label className={estilo.campo}>
          <span>Telefone</span>
          <input
            name="telefone"
            defaultValue={telefone}
            inputMode="tel"
            autoComplete="tel"
            placeholder="51 98044-9274"
          />
        </label>

        <label className={estilo.campo}>
          <span>CPF</span>
          <input name="documento" defaultValue={documento} inputMode="numeric" placeholder="000.000.000-00" />
        </label>

        <p className={estilo.ajudaCampo}>
          Nome e CPF saem impressos no comprovante que o cliente assina. O telefone é por onde a
          central te procura.
        </p>

        <button type="submit" className={estilo.btnGrande} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar cadastro'}
        </button>
      </form>

      {/* O e-mail aparece, e não se edita: é a chave de entrada. Escondê-lo
          faria a pessoa achar que perdeu o login; deixá-lo editável faria uma
          conta tomada por dez minutos virar uma conta perdida para sempre. */}
      <p className={estilo.ajudaCampo}>
        Seu acesso é <strong>{email}</strong>. Para trocar de e-mail ou de função, fale com a
        gestão — nem uma coisa nem outra se muda sozinho.
      </p>

      <form action={salvarSenha} className={estilo.form}>
        <p className={estilo.agTitulo}>Trocar a senha</p>

        {senha.ok ? (
          <p className={estilo.feito} role="status">
            {senha.mensagem ?? 'Senha trocada.'}
          </p>
        ) : senha.motivo ? (
          <p className={estilo.erro} role="alert">
            {senha.motivo}
          </p>
        ) : null}

        <label className={estilo.campo}>
          <span>Senha atual</span>
          <input type="password" name="atual" required autoComplete="current-password" />
        </label>
        <label className={estilo.campo}>
          <span>Nova senha</span>
          <input type="password" name="nova" required autoComplete="new-password" />
        </label>
        <label className={estilo.campo}>
          <span>Repita a nova senha</span>
          <input type="password" name="confirmacao" required autoComplete="new-password" />
        </label>

        <button type="submit" className={estilo.btnGrande} disabled={trocando}>
          {trocando ? 'Trocando…' : 'Trocar a senha'}
        </button>
      </form>
    </div>
  )
}
