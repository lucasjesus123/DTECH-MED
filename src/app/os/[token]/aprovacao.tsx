'use client'

import { useActionState, useRef, useState } from 'react'
import { QuadroAssinatura, type QuadroRef } from '@/components/quadro-assinatura'
import { responderOrcamento } from '@/server/acoes/portal'
import estilo from './portal.module.css'

/**
 * A decisão do cliente sobre o orçamento.
 *
 * Aprovar pede documento, nome e assinatura — é o que transforma a ordem em
 * contrato. Recusar pede só o documento: obrigar alguém a assinar para dizer
 * "não" é fricção sem propósito e azeda a relação.
 */
export function Aprovacao({ token, total }: { token: string; total: string }) {
  const [estado, acao, enviando] = useActionState(responderOrcamento, {} as never)
  const quadro = useRef<QuadroRef>(null)
  const [modo, setModo] = useState<'escolher' | 'aprovar' | 'reprovar'>('escolher')
  const [temAssinatura, setTemAssinatura] = useState(false)
  const [documento, setDocumento] = useState('')
  const [nome, setNome] = useState('')

  if ('ok' in estado && estado.ok) {
    return (
      <p className={estilo.avisoOk}>
        Recebemos sua resposta. Já avisamos a equipe e você recebe a confirmação no
        WhatsApp em instantes.
      </p>
    )
  }

  if (modo === 'escolher') {
    return (
      <div className={estilo.escolha}>
        <button type="button" className={estilo.btnAprovar} onClick={() => setModo('aprovar')}>
          Aprovar {total}
        </button>
        <button type="button" className={estilo.btnRecusar} onClick={() => setModo('reprovar')}>
          Não aprovar
        </button>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        // O traço vira data URL só na hora do envio: manter no estado a cada
        // movimento do dedo faria o React redesenhar a tela o tempo todo.
        if (modo === 'aprovar') fd.set('dataUrl', quadro.current?.capturar() ?? '')
        acao(fd)
      }}
      className={estilo.form}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decisao" value={modo === 'aprovar' ? 'aprovar' : 'reprovar'} />

      <div className={estilo.campo}>
        <label htmlFor="documento">Confirme seu CPF ou CNPJ</label>
        <input
          id="documento"
          name="documento"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="Só os números"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
        />
        <span className={estilo.ajuda}>
          É o mesmo que está no cadastro desta ordem. Serve para confirmar que é
          você quem está respondendo.
        </span>
      </div>

      {modo === 'aprovar' ? (
        <>
          <div className={estilo.campo}>
            <label htmlFor="assinanteNome">Seu nome completo</label>
            <input
              id="assinanteNome"
              name="assinanteNome"
              required
              autoComplete="name"
              placeholder="Quem está aprovando"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className={estilo.campo}>
            <label>Assinatura</label>
            <QuadroAssinatura
              ref={quadro}
              rotulo="Assine com o dedo"
              aoMudar={setTemAssinatura}
            />
          </div>

          <p className={estilo.termo}>
            Ao aprovar, você autoriza a execução dos serviços e a aplicação das peças
            descritas acima, no valor de <strong>{total}</strong>. Esta aprovação
            assinada passa a valer como contrato de manutenção.
          </p>
        </>
      ) : (
        <div className={estilo.campo}>
          <label htmlFor="motivo">Quer contar o motivo? (opcional)</label>
          <textarea
            id="motivo"
            name="motivo"
            rows={3}
            placeholder="Valor acima do esperado, prazo, vou consertar em outro lugar…"
          />
        </div>
      )}

      {'motivo' in estado && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <div className={estilo.botoes}>
        <button
          type="submit"
          className={modo === 'aprovar' ? estilo.btnAprovar : estilo.btnRecusar}
          disabled={enviando || (modo === 'aprovar' && (!temAssinatura || !nome.trim() || !documento.trim()))}
        >
          {enviando
            ? 'Registrando…'
            : modo === 'aprovar'
              ? 'Confirmar aprovação'
              : 'Confirmar recusa'}
        </button>
        <button type="button" className={estilo.btnVoltar} onClick={() => setModo('escolher')}>
          Voltar
        </button>
      </div>
    </form>
  )
}
