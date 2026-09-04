'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarCompromisso } from '@/server/acoes/compromissos'
import estilo from '../painel.module.css'

/**
 * O QUE SE LANÇA NUM DIA DO CALENDÁRIO.
 *
 * =============================================================================
 * UMA COISA NASCE AQUI, DUAS SÃO ATALHOS — E A DIFERENÇA NÃO É PREGUIÇA
 * =============================================================================
 * O Calendário junta quatro fontes, e só uma delas pode nascer de uma data
 * solta:
 *
 *   COMPROMISSO   nasce aqui. É a única coisa que não é consequência de nada.
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
 * A CONTA SAIU DAQUI JUNTO COM OS VENCIMENTOS
 * =============================================================================
 * Este painel já lançava conta a pagar e a receber no dia. Saiu quando o
 * calendário deixou de mostrar vencimentos — e teve de sair: lançar aqui uma
 * conta que a grade não mostra criaria algo invisível na própria tela em que
 * foi criado, que é pior do que não oferecer.
 *
 * Conta se lança no FINANCEIRO, que é onde ela aparece, vence, atrasa e recebe
 * baixa.
 */

type Pessoa = { id: string; nome: string }

export default function LancarNoDia({
  dia,
  mes,
  pessoas,
  podeMarcarParada,
}: {
  dia: string
  mes: string
  pessoas: Pessoa[]
  podeMarcarParada: boolean
}) {
  const router = useRouter()

  const [estCompromisso, acaoCompromisso, pendCompromisso] = useActionState(salvarCompromisso, {
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

      {/* SEM BARRA DE ABAS: sobrou uma coisa para escrever no dia. Uma aba
          sozinha é um controle que não escolhe nada — ela só ocupa a linha e
          faz a pessoa procurar a segunda opção que não existe. */}
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
