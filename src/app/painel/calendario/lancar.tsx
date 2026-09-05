'use client'

import Link from 'next/link'
import { useActionState, useEffect } from 'react'
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
type JaMarcado = {
  id: string
  titulo: string
  detalhe: string | null
  href: string
  atrasado: boolean
}

export default function LancarNoDia({
  dia,
  pessoas,
  podeMarcarParada,
  fechar,
  jaMarcado,
}: {
  dia: string
  pessoas: Pessoa[]
  podeMarcarParada: boolean
  /** Endereço de volta, montado pela página — só ela sabe a visão e o filtro. */
  fechar: string
  /** O que já está marcado neste dia. */
  jaMarcado: JaMarcado[]
}) {
  const router = useRouter()

  /**
   * ESC FECHA, E O FUNDO PARA DE ROLAR.
   *
   * Só isto precisa de JavaScript. Todo o resto da janela é HTML servido pelo
   * servidor: ela existe porque o endereço diz `marcar=1`, e o X e o fundo são
   * links comuns de volta. Com o JavaScript fora do ar a janela abre, funciona
   * e fecha — o que se perde é o ESC e a trava de rolagem, que são conforto.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(fechar)
    }
    document.addEventListener('keydown', aoTeclar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [fechar, router])

  const [estCompromisso, acaoCompromisso, pendCompromisso] = useActionState(salvarCompromisso, {
    ok: true as const,
    mensagem: '',
  })

  const porExtenso = new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    weekday: 'long',
  })
  /**
   * SÓ A PRIMEIRA LETRA — e não `text-transform: capitalize` no CSS.
   *
   * O CSS levanta TODA palavra, e "segunda-feira, 14 de setembro" saía como
   * "Segunda-Feira, 14 De Setembro". Em português a preposição fica minúscula,
   * e "Feira" com maiúscula no meio do nome do dia é erro que se lê de longe.
   */
  const legivel = porExtenso.charAt(0).toUpperCase() + porExtenso.slice(1)

  /**
   * =============================================================================
   * ISTO É UMA JANELA, E ANTES ERA UM PAINEL EMBAIXO DA GRADE
   * =============================================================================
   * O painel ficava depois da tabela. Na SEMANA, que tem uma fileira só, ele
   * aparecia junto e funcionava. No MÊS, com seis fileiras na frente, nascia
   * fora da tela: a pessoa clicava no dia, a página recarregava igualzinha, e a
   * conclusão óbvia era "não abriu nada".
   *
   * A primeira correção foi uma âncora `#marcar`, que rolava a página até ele.
   * Resolvia o "não abriu" e não resolvia o resto: quem clica num dia quer
   * responder uma pergunta SOBRE AQUELE DIA, e para isso não pode ter de sair
   * da grade e voltar. Janela no meio da tela, com o calendário atrás, é o
   * desenho certo — e é o que o dono do sistema pediu, apontando um concorrente
   * que faz assim.
   *
   * =============================================================================
   * SEM JAVASCRIPT PARA ABRIR
   * =============================================================================
   * A janela existe porque o ENDEREÇO diz `marcar=1`. Quem abre é o servidor;
   * o X e o fundo são links comuns de volta. Não há `showModal()`, não há
   * estado de aberto/fechado para dessincronizar, e o botão "voltar" do
   * navegador fecha a janela como qualquer um espera.
   */
  return (
    <div className={estilo.janelaFundo}>
      {/* O FUNDO É UM LINK, e por isso clicar fora fecha. `aria-hidden` +
          `tabIndex={-1}` porque para o leitor de tela ele não é um destino: o
          X do cabeçalho já é o "fechar" anunciado, e dois seriam ruído. */}
      <Link href={fechar} className={estilo.janelaSaida} aria-hidden="true" tabIndex={-1} />
      <div
        className={estilo.janela}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tituloDaJanela"
      >
        <div className={estilo.janelaCab}>
          <p className={estilo.janelaTitulo} id="tituloDaJanela">
            {legivel}
          </p>
          <Link href={fechar} className={estilo.janelaX} aria-label="Fechar">
            ×
          </Link>
        </div>

        <div className={estilo.janelaCorpo}>
          {/* O QUE JÁ ESTÁ MARCADO VEM ANTES DO FORMULÁRIO.
              A pergunta que traz alguém a clicar num dia é "o que tem neste
              dia?" — e só depois "quero pôr mais uma coisa". Uma janela que só
              oferece criar obriga a fechá-la e ir procurar na grade o que já
              havia ali. */}
          {jaMarcado.length > 0 ? (
            <div className={estilo.janelaJa}>
              <p className={estilo.janelaJaTitulo}>
                {jaMarcado.length === 1 ? 'Já marcado neste dia' : `Já marcados neste dia (${jaMarcado.length})`}
              </p>
              <ul className={estilo.janelaJaLista}>
                {jaMarcado.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href} className={estilo.janelaJaItem}>
                      <span className={estilo.janelaJaNome}>{e.titulo}</span>
                      {e.detalhe ? <span className={estilo.fraco}>{e.detalhe}</span> : null}
                      {e.atrasado ? <span className={estilo.janelaJaAtraso}>passou da data</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={estilo.janelaVazio}>Nada marcado neste dia ainda.</p>
          )}

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
            {/* O "Fechar" montava `?mes=` por conta própria e, ao fechar,
                levava para o MÊS: quem estava na semana do mês que vem, com o
                filtro em "Preventiva", perdia os dois. O endereço agora vem
                pronto da página, que é quem sabe onde a pessoa estava. */}
            <Link className={estilo.linkAcao} href={fechar}>
              Fechar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
