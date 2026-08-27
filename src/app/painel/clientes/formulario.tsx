'use client'

import { useActionState } from 'react'
import { salvarCliente } from '@/server/acoes/cadastros'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export default function FormularioCliente() {
  const [estado, acao, pendente] = useActionState(salvarCliente, inicial)

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>Novo cliente</p>

      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
      {estado.ok && estado.mensagem ? <p className={estilo.sucesso} role="status">{estado.mensagem}</p> : null}

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Nome ou razão social *
          <input className={estilo.campo} name="nome" required minLength={3} />
        </label>
        <label className={estilo.rotulo}>
          CPF ou CNPJ *
          <input className={estilo.campo} name="documento" required inputMode="numeric" />
        </label>
        <label className={estilo.rotulo}>
          WhatsApp *
          <input className={estilo.campo} name="whatsapp" required inputMode="tel" placeholder="51 99999-9999" />
        </label>
        <label className={estilo.rotulo}>
          Telefone fixo
          <input className={estilo.campo} name="telefone" inputMode="tel" />
        </label>
        <label className={estilo.rotulo}>
          E-mail
          <input className={estilo.campo} name="email" type="email" />
        </label>
        <label className={estilo.rotulo}>
          Quem é o contato
          <input className={estilo.campo} name="contatoNome" />
        </label>
      </div>

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          CEP
          <input className={estilo.campo} name="cep" inputMode="numeric" />
        </label>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Logradouro
          <input className={estilo.campo} name="logradouro" />
        </label>
        <label className={estilo.rotulo}>
          Número
          <input className={estilo.campo} name="numero" />
        </label>
        <label className={estilo.rotulo}>
          Complemento
          <input className={estilo.campo} name="complemento" placeholder="Sala, andar" />
        </label>
        <label className={estilo.rotulo}>
          Bairro
          <input className={estilo.campo} name="bairro" />
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input className={estilo.campo} name="cidade" />
        </label>
        <label className={estilo.rotulo}>
          UF
          <input className={estilo.campo} name="uf" maxLength={2} />
        </label>
      </div>

      <label className={estilo.rotulo}>
        Observações internas
        <textarea className={estilo.area} name="observacoes" rows={2} />
        <span className={estilo.dica}>O cliente não vê este campo.</span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Cadastrar cliente'}
        </button>
      </div>
    </form>
  )
}
