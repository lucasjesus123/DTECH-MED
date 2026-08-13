'use client'

import { useActionState } from 'react'
import { pedirRetirada, type RespostaLead } from '@/server/acoes/lead'
import estilo from './site.module.css'

const inicial: RespostaLead = { ok: false, motivo: '' }

/**
 * O formulário de solicitação.
 *
 * Pede o mínimo: nome, telefone e o que houve. Cada campo obrigatório a mais é
 * uma pessoa a menos que termina de preencher — e quem está com a clínica
 * parada quer resolver, não cadastrar.
 *
 * O texto do defeito pede a descrição em português do cliente. É esse relato
 * que o técnico lê antes de encostar no aparelho, e "faz um barulho quando
 * esquenta" vale mais que qualquer código de erro escolhido de uma lista.
 */
export function FormularioRetirada({ whatsapp }: { whatsapp: string }) {
  const [estado, acao, pendente] = useActionState(pedirRetirada, inicial)

  if (estado.ok) {
    return (
      <div className={estilo.recebido}>
        <p className={estilo.recebidoTitulo}>Recebemos seu pedido.</p>
        <p>
          A gente responde em até 24 horas úteis já com a data da retirada. Se for
          urgente, chame direto no{' '}
          <a href={`https://wa.me/${whatsapp}`} className={estilo.linkZap}>
            WhatsApp
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <form action={acao} className={estilo.formSite}>
      {estado.motivo ? (
        <p className={estilo.formErro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <div className={estilo.formGrade}>
        <label className={estilo.formCampo}>
          <span>Seu nome *</span>
          <input name="nome" required minLength={3} autoComplete="name" />
        </label>
        <label className={estilo.formCampo}>
          <span>WhatsApp *</span>
          <input name="telefone" required inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" />
        </label>
        <label className={estilo.formCampo}>
          <span>Clínica ou empresa</span>
          <input name="empresa" autoComplete="organization" />
        </label>
        <label className={estilo.formCampo}>
          <span>Cidade</span>
          <input name="cidade" autoComplete="address-level2" />
        </label>
        <label className={estilo.formCampo}>
          <span>E-mail</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label className={estilo.formCampo}>
          <span>Equipamento</span>
          <input name="equipamento" placeholder="Marca e modelo, se souber" />
        </label>
      </div>

      <label className={estilo.formCampo}>
        <span>O que está acontecendo? *</span>
        <textarea
          name="mensagem"
          required
          minLength={10}
          rows={4}
          placeholder="Do seu jeito mesmo. Ex.: liga, mas desliga sozinho depois de uns dez minutos."
        />
      </label>

      {/* Campo-armadilha: escondido para gente, visível para robô. Não usa
          display:none porque parte dos robôs já ignora campos ocultos assim. */}
      <div className={estilo.armadilha} aria-hidden="true">
        <label>
          Deixe este campo em branco
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" className={estilo.btn} disabled={pendente}>
        {pendente ? 'Enviando…' : 'Solicitar retirada'}
      </button>

      <p className={estilo.formNota}>
        Usamos seus dados só para atender este chamado. Nada de lista de
        disparo.
      </p>
    </form>
  )
}
