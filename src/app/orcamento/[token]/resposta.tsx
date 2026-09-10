'use client'

import { useActionState, useState } from 'react'
import { responderProposta } from '@/server/acoes/portal'
import estilo from '../../os/[token]/portal.module.css'

/**
 * APROVAR OU RECUSAR — em dois toques, e sem rabisco.
 *
 * =============================================================================
 * POR QUE AQUI NÃO SE PEDE ASSINATURA DESENHADA
 * =============================================================================
 * A aprovação do orçamento PÓS-LAUDO pede o rabisco no quadro: ali o aparelho
 * já está na oficina, o valor vira contrato de execução, e a assinatura é a
 * prova que sustenta a cobrança de um serviço já feito.
 *
 * Isto é uma proposta comercial: ninguém pegou o aparelho ainda, e o próximo
 * passo é justamente a assinatura da RETIRADA, com o motorista na porta. Pedir
 * rabisco de dedo no celular para dizer "pode fazer" acrescenta atrito no ponto
 * exato em que a pessoa está decidindo se contrata — e não prova nada que o
 * documento conferido e o carimbo de tempo já não provem.
 *
 * O documento continua sendo pedido: é ele que separa LER de DECIDIR. Quem tem
 * o link consegue ver o preço; só quem é o cliente consegue aprovar.
 */
export function Resposta({ token, total }: { token: string; total: string }) {
  const [estado, acao, enviando] = useActionState(responderProposta, {} as never)
  const [modo, setModo] = useState<'escolher' | 'aprovar' | 'recusar'>('escolher')
  const [documento, setDocumento] = useState('')
  const [nome, setNome] = useState('')

  if ('ok' in estado && estado.ok) {
    return (
      <p className={estilo.avisoOk}>
        Recebemos sua resposta. Já avisamos a equipe e você recebe a confirmação no WhatsApp em
        instantes.
      </p>
    )
  }

  if (modo === 'escolher') {
    return (
      <div className={estilo.escolha}>
        <button type="button" className={estilo.btnAprovar} onClick={() => setModo('aprovar')}>
          Aprovar {total}
        </button>
        <button type="button" className={estilo.btnRecusar} onClick={() => setModo('recusar')}>
          Não vou fazer agora
        </button>
      </div>
    )
  }

  return (
    <form action={acao} className={estilo.form}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decisao" value={modo === 'aprovar' ? 'aprovar' : 'recusar'} />

      {'motivo' in estado && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <div className={estilo.campo}>
        <label htmlFor="documento">CPF ou CNPJ do cadastro</label>
        <input
          id="documento"
          name="documento"
          inputMode="numeric"
          autoComplete="off"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          required
        />
        <span className={estilo.ajuda}>
          É como a gente confirma que é você mesmo respondendo, e não alguém que recebeu o link
          repassado.
        </span>
      </div>

      {modo === 'aprovar' ? (
        <>
          <div className={estilo.campo}>
            <label htmlFor="assinanteNome">Seu nome completo</label>
            <input
              id="assinanteNome"
              name="assinanteNome"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <p className={estilo.termo}>
            Ao confirmar, você aprova este orçamento de <strong>{total}</strong> e autoriza a
            abertura da ordem de serviço. A retirada do aparelho é combinada em seguida, e você
            assina o comprovante quando o motorista chegar.
          </p>
        </>
      ) : (
        <div className={estilo.campo}>
          <label htmlFor="motivo">Quer contar o motivo? (opcional)</label>
          <textarea id="motivo" name="motivo" rows={3} />
          <span className={estilo.ajuda}>
            Ajuda a gente a rever o preço ou o prazo, se for o caso.
          </span>
        </div>
      )}

      <div className={estilo.botoes}>
        <button
          type="submit"
          className={modo === 'aprovar' ? estilo.btnAprovar : estilo.btnRecusar}
          disabled={enviando || documento.trim().length < 11 || (modo === 'aprovar' && !nome.trim())}
        >
          {enviando
            ? 'Enviando…'
            : modo === 'aprovar'
              ? `Confirmar aprovação de ${total}`
              : 'Confirmar recusa'}
        </button>
        <button type="button" className={estilo.btnVoltar} onClick={() => setModo('escolher')}>
          Voltar
        </button>
      </div>
    </form>
  )
}
