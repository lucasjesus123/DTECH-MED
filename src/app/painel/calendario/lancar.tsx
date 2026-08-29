'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarCompromisso } from '@/server/acoes/compromissos'
import { lancarConta } from '@/server/acoes/caixa'
import estilo from '../painel.module.css'

/**
 * O QUE SE LANÇA NUM DIA DO CALENDÁRIO.
 *
 * =============================================================================
 * DUAS COISAS NASCEM AQUI, DUAS SÃO ATALHOS — E A DIFERENÇA NÃO É PREGUIÇA
 * =============================================================================
 * O Calendário junta seis fontes, mas só duas delas podem nascer de uma data
 * solta:
 *
 *   COMPROMISSO   nasce aqui. É a única coisa que não é consequência de nada.
 *   CONTA         nasce aqui. Um vencimento é uma data com um valor.
 *
 *   PARADA        precisa de uma ORDEM. Não existe "retirada" sem um aparelho
 *                 de alguém para buscar — marcar uma parada solta criaria uma
 *                 viagem sem destino.
 *   PREVENTIVA    precisa de um CONTRATO. A visita é o cumprimento dele.
 *
 * As duas últimas viram LINKS que levam à tela onde elas realmente nascem, com
 * a data já escolhida. Fingir que elas nascem aqui — abrindo um formulário que
 * no fim pediria "escolha a ordem" — seria empurrar a pessoa para a mesma tela,
 * dois cliques depois e com a sensação de ter sido enganada.
 *
 * =============================================================================
 * O MOTORISTA NÃO VÊ A CONTA
 * =============================================================================
 * O mesmo corte que já existe na grade: `comDinheiro` decide o que a consulta
 * traz. Aqui ele decide o que a tela OFERECE — porque um botão "lançar conta"
 * que responde "seu perfil não pode" é pior que botão nenhum.
 */

type Pessoa = { id: string; nome: string }

export default function LancarNoDia({
  dia,
  mes,
  pessoas,
  comDinheiro,
  podeMarcarParada,
}: {
  dia: string
  mes: string
  pessoas: Pessoa[]
  comDinheiro: boolean
  podeMarcarParada: boolean
}) {
  const [aba, setAba] = useState<'compromisso' | 'conta'>('compromisso')
  const router = useRouter()

  const [estCompromisso, acaoCompromisso, pendCompromisso] = useActionState(salvarCompromisso, {
    ok: true as const,
    mensagem: '',
  })
  const [estConta, acaoConta, pendConta] = useActionState(lancarConta, {
    ok: true as const,
    mensagem: '',
  })

  const legivel = new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    weekday: 'long',
  })

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>Marcar em {legivel}</p>

      <div className={estilo.abas} role="group" aria-label="O que marcar">
        <button
          type="button"
          className={aba === 'compromisso' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
          onClick={() => setAba('compromisso')}
          aria-pressed={aba === 'compromisso'}
        >
          Compromisso
        </button>
        {comDinheiro ? (
          <button
            type="button"
            className={aba === 'conta' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            onClick={() => setAba('conta')}
            aria-pressed={aba === 'conta'}
          >
            Conta
          </button>
        ) : null}
      </div>

      {aba === 'compromisso' ? (
        <form
          action={acaoCompromisso}
          className={estilo.form}
          onSubmit={() => setTimeout(() => router.refresh(), 1200)}
        >
          <input type="hidden" name="dia" value={dia} />
          {!estCompromisso.ok ? (
            <p className={estilo.erro} role="alert">{estCompromisso.motivo}</p>
          ) : estCompromisso.mensagem ? (
            <p className={estilo.sucesso} role="status">{estCompromisso.mensagem}</p>
          ) : null}

          <label className={estilo.rotulo}>
            O que é *
            <input
              className={estilo.campo}
              name="titulo"
              required
              maxLength={160}
              placeholder="Visitar a Clínica Bella Pelle antes de orçar"
            />
          </label>

          <div className={estilo.formLinha}>
            <label className={estilo.rotulo}>
              Hora
              <input className={estilo.campo} name="hora" type="time" />
              {/* Opcional de propósito: "quinta de manhã" é um compromisso
                  legítimo, e exigir hora faria alguém inventar 09:00. */}
              <span className={estilo.dica}>Opcional.</span>
            </label>
            <label className={estilo.rotulo}>
              Quem vai
              <select className={estilo.campo} name="responsavelId" defaultValue="">
                <option value="">Ninguém em especial</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </label>
          </div>

          <label className={estilo.rotulo}>
            Observação
            <input className={estilo.campo} name="observacao" maxLength={500} />
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendCompromisso}>
              {pendCompromisso ? 'Marcando…' : 'Marcar compromisso'}
            </button>
          </div>
        </form>
      ) : (
        <form
          action={acaoConta}
          className={estilo.form}
          onSubmit={() => setTimeout(() => router.refresh(), 1200)}
        >
          {/* O vencimento vem do dia clicado — é o motivo de a pessoa estar
              aqui em vez de no Financeiro. */}
          <input type="hidden" name="vencimento" value={dia} />
          {!estConta.ok ? (
            <p className={estilo.erro} role="alert">{estConta.motivo}</p>
          ) : estConta.mensagem ? (
            <p className={estilo.sucesso} role="status">{estConta.mensagem}</p>
          ) : null}

          <div className={estilo.formLinha}>
            <label className={estilo.rotulo}>
              O que é *
              <input className={estilo.campo} name="descricao" required maxLength={160} />
            </label>
            <label className={estilo.rotulo}>
              Tipo
              <select className={estilo.campo} name="tipo" defaultValue="PAGAR">
                <option value="PAGAR">A pagar</option>
                <option value="RECEBER">A receber</option>
              </select>
            </label>
            <label className={estilo.rotulo}>
              Valor (R$) *
              <input className={estilo.campo} name="valor" required inputMode="decimal" placeholder="1.250,00" />
            </label>
          </div>

          <div className={estilo.formLinha}>
            <label className={estilo.rotulo}>
              Para quem / de quem
              <input className={estilo.campo} name="contraparte" maxLength={120} />
            </label>
            <label className={estilo.rotulo}>
              Categoria
              <input className={estilo.campo} name="categoria" maxLength={60} />
            </label>
          </div>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendConta}>
              {pendConta ? 'Lançando…' : 'Lançar conta neste dia'}
            </button>
          </div>
          <p className={estilo.dica}>
            Ela nasce esperando aprovação — quem lança não é quem aprova.
          </p>
        </form>
      )}

      {/* ---- as duas que nascem noutra tela ---- */}
      <p className={estilo.dica} style={{ marginTop: 'var(--s4)' }}>
        Parada de rota e visita preventiva não se marcam a partir de uma data solta: a parada precisa
        de uma O.S. com aparelho para buscar, e a preventiva é o cumprimento de um contrato.
      </p>
      <div className={estilo.modeloCartaoAcoes}>
        {podeMarcarParada ? (
          <Link className={estilo.btnSec} href="/painel/rota">
            Marcar parada na Rota
          </Link>
        ) : null}
        <Link className={estilo.btnSec} href="/painel/preventiva">
          Agendar preventiva
        </Link>
        <Link className={estilo.linkAcao} href={`/painel/calendario?mes=${mes}`}>
          Fechar
        </Link>
      </div>
    </div>
  )
}
