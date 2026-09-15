'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  agendarVisitaPreventiva,
  desmarcarVisitaPreventiva,
  gerarOrdemDaVisita,
} from '@/server/acoes/preventiva'
import CalendarioPreventiva, { type VisitaNoCalendario } from './calendario-preventiva'
import estilo from '../painel.module.css'

type Resposta = { ok: true; dados?: unknown } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export type VisitaDaAgenda = VisitaNoCalendario & {
  /** 'R$ 234,00' — já formatado no servidor. */
  valor: string
  periodicidade: string
  clienteTemZap: boolean
  serie: string | null
  observacao: string | null
  /** 'dd/mm/aaaa às HH:MM' ou nulo. */
  avisadoEm: string | null
  avisoErro: string | null
}

/**
 * A AGENDA DA PREVENTIVA — calendário à esquerda, o que fazer à direita.
 *
 * =============================================================================
 * O FLUXO INTEIRO, EM TRÊS PASSOS
 * =============================================================================
 *   1. VEJA ONDE CABE       o calendarinho, que responde de relance
 *   2. MARQUE COM O CLIENTE  dia, hora, quem vai — e avise no WhatsApp
 *   3. GERE A ORDEM          no dia, a visita entra na esteira de sempre
 *
 * Os três acontecem na MESMA tela e na mesma ordem em que a cabeça de quem
 * trabalha os faz. Antes havia só o passo 3: um botão "Gerar ordem" numa
 * tabela, e os passos 1 e 2 aconteciam por WhatsApp, fora do sistema.
 *
 * =============================================================================
 * POR QUE O PAINEL DA DIREITA MUDA, E NÃO ABRE JANELA
 * =============================================================================
 * Marcar visita é escolher entre dias. Uma janela por cima tapa exatamente o
 * calendário que a pessoa está usando para decidir — e ela fecha, olha, abre de
 * novo. Ao lado, os dois ficam visíveis: clicar no dia 20 muda o painel e o
 * calendário continua ali, mostrando que o 19 e o 21 estão livres.
 *
 * =============================================================================
 * O ESTADO VIVE AQUI, E ELE É UM SÓ
 * =============================================================================
 * `escolhida` — o id da visita aberta. O calendário o recebe para destacar o
 * selo, e a lista para destacar a linha. Um estado só significa que não há como
 * a grade mostrar uma visita e o formulário editar outra.
 */
export default function AgendaPreventiva({
  visitas,
  pessoas,
  hoje,
  mesInicial,
  janela,
}: {
  visitas: VisitaDaAgenda[]
  pessoas: Array<{ id: string; nome: string }>
  hoje: string
  mesInicial: string
  janela: [string, string]
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const aberta = visitas.find((v) => v.id === escolhida) ?? null

  return (
    <div className={estilo.prevGrade}>
      <CalendarioPreventiva
        visitas={visitas}
        hoje={hoje}
        mesInicial={mesInicial}
        janela={janela}
        visitaEmFoco={escolhida}
        aoEscolher={(id) => setEscolhida((atual) => (atual === id ? null : id))}
      />

      <div className={estilo.prevLado}>
        {aberta ? (
          <PainelDaVisita
            /* A CHAVE CARREGA O ESTADO GRAVADO, e não só o id.
               Os campos do formulário são `defaultValue`: eles só leem o valor
               no momento em que nascem. Com a chave sendo apenas o id, salvar
               não remontava nada — o servidor devolvia "quem vai: Rafael" e o
               seletor continuava mostrando "Decidir depois", como se a
               gravação tivesse falhado.
               Trocando a chave quando o que foi gravado muda, o formulário
               renasce lendo a verdade do servidor. */
            key={`${aberta.id}:${aberta.dia}:${aberta.hora ?? ''}:${aberta.responsavelId ?? ''}`}
            visita={aberta}
            pessoas={pessoas}
            hoje={hoje}
            aoFechar={() => setEscolhida(null)}
          />
        ) : (
          <ProximasVisitas visitas={visitas} hoje={hoje} aoEscolher={setEscolhida} />
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   SEM NADA ESCOLHIDO: O QUE VEM PRIMEIRO
   =========================================================================
   O lado direito nunca fica vazio. Uma coluna em branco esperando um clique
   ensina que a tela está incompleta; a lista do que vem primeiro é o que
   alguém veio ver de qualquer jeito, e ela mesma é o convite a clicar.
   ========================================================================= */
function ProximasVisitas({
  visitas,
  hoje,
  aoEscolher,
}: {
  visitas: VisitaDaAgenda[]
  hoje: string
  aoEscolher: (id: string) => void
}) {
  const proximas = visitas
    .filter((v) => v.status !== 'REALIZADA')
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(0, 8)

  return (
    <section className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>O que vem primeiro</span>
        <span className={estilo.fraco}>clique para marcar</span>
      </p>

      {proximas.length === 0 ? (
        <p className={estilo.texto}>
          Nenhuma revisão pendente. Abra um contrato e o calendário se enche sozinho.
        </p>
      ) : (
        <ul className={estilo.prevLista}>
          {proximas.map((v) => (
            <li key={v.id}>
              <button type="button" className={estilo.prevItem} onClick={() => aoEscolher(v.id)}>
                <span className={estilo.prevItemQuando}>
                  <strong>{diaCurto(v.dia)}</strong>
                  <span>{v.hora ?? distancia(v.dia, hoje)}</span>
                </span>
                <span className={estilo.prevItemQuem}>
                  <strong>{v.cliente}</strong>
                  <span>{v.equipamento}</span>
                </span>
                <span
                  className={`${estilo.tag} ${
                    v.status === 'AGENDADA'
                      ? estilo.tagOk
                      : v.dia < hoje
                        ? estilo.tagAlerta
                        : estilo.tagNeutra
                  }`}
                >
                  {v.status === 'AGENDADA' ? 'marcada' : v.dia < hoje ? 'venceu' : 'a marcar'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* =========================================================================
   COM UMA VISITA ESCOLHIDA: MARCAR, AVISAR, GERAR
   ========================================================================= */
function PainelDaVisita({
  visita,
  pessoas,
  hoje,
  aoFechar,
}: {
  visita: VisitaDaAgenda
  pessoas: Array<{ id: string; nome: string }>
  hoje: string
  aoFechar: () => void
}) {
  const [estado, acao, salvando] = useActionState(agendarVisitaPreventiva, inicial)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  // O efeito faz UMA coisa: recarregar quando deu certo. Ler o erro de dentro
  // dele e copiá-lo para estado seria `setState` em efeito — segunda
  // renderização por nada, e o lint da casa recusa com razão.
  useEffect(() => {
    if (estado.ok) router.refresh()
  }, [estado, router])

  const recusa = erro ?? (!estado.ok && estado.motivo ? estado.motivo : null)
  const marcada = visita.status === 'AGENDADA'

  return (
    <section className={`${estilo.bloco} ${estilo.prevPainel}`}>
      <div className={estilo.prevPainelCab}>
        <div>
          <p className={estilo.grav}>Contrato nº {String(visita.contrato).padStart(4, '0')}</p>
          <p className={estilo.prevPainelNome}>{visita.cliente}</p>
          <p className={estilo.fraco}>
            {visita.equipamento}
            {visita.serie ? ` · série ${visita.serie}` : ''} · {visita.periodicidade} ·{' '}
            {visita.valor} por visita
          </p>
        </div>
        <button type="button" className={estilo.acaoRara} onClick={aoFechar}>
          fechar
        </button>
      </div>

      {/* A DATA DO CONTRATO NUNCA SOME DA TELA.
          Ela é o que o cliente assinou; a combinada é o que a equipe prometeu.
          Escondê-la faria a terceira remarcação seguida parecer normal. */}
      <p className={estilo.prevPrevista}>
        O contrato previa <strong>{diaLongo(visita.previstaPara)}</strong>
        {visita.dia !== visita.previstaPara ? (
          <> — combinado para {diaLongo(visita.dia)}, {folga(visita.previstaPara, visita.dia)}.</>
        ) : visita.previstaPara < hoje ? (
          <> — já venceu.</>
        ) : (
          <>.</>
        )}
      </p>

      {recusa ? (
        <p className={estilo.erro} role="alert">
          {recusa}
        </p>
      ) : null}
      {estado.ok ? (
        <p className={estilo.sucesso} role="status">
          Visita marcada.
        </p>
      ) : null}

      {marcada && visita.avisadoEm ? (
        <p className={estilo.sucesso} role="status">
          Cliente avisado no WhatsApp em {visita.avisadoEm}.
        </p>
      ) : null}
      {visita.avisoErro ? (
        <p className={estilo.avisoCaixaForte} role="status">
          O aviso não saiu: {visita.avisoErro}
        </p>
      ) : null}

      <form action={acao} className={estilo.form}>
        <input type="hidden" name="visitaId" value={visita.id} />

        <div className={estilo.grade}>
          <label className={estilo.rotulo}>
            Dia da visita *
            <input
              className={estilo.campo}
              type="date"
              name="dia"
              required
              defaultValue={marcada ? visita.dia : visita.previstaPara}
            />
          </label>
          <label className={estilo.rotulo}>
            Hora
            <input className={estilo.campo} type="time" name="hora" defaultValue={visita.hora ?? ''} />
            <span className={estilo.dica}>Pode ficar em branco — &ldquo;de manhã&rdquo; também é combinado.</span>
          </label>
        </div>

        <label className={estilo.rotulo}>
          Quem vai
          <select
            className={estilo.selecao}
            name="responsavelId"
            defaultValue={visita.responsavelId ?? ''}
            style={{ width: '100%' }}
          >
            <option value="">Decidir depois</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={estilo.rotulo}>
          Combinado com o cliente
          <textarea
            className={estilo.area}
            name="observacao"
            rows={2}
            defaultValue={visita.observacao ?? ''}
            placeholder="Horário de acesso à clínica, quem recebe, o que levar…"
          />
        </label>

        {/* AVISAR É ESCOLHA, E NÃO CONSEQUÊNCIA.
            Quem já combinou por telefone não quer mandar a mesma coisa de novo;
            quem marcou sozinho precisa avisar. Marcado por padrão porque o
            caso comum é o segundo — e desmarcar é um clique. */}
        <label className={estilo.filtroCaixa}>
          <input type="checkbox" name="avisar" defaultChecked={visita.clienteTemZap} disabled={!visita.clienteTemZap} />
          Avisar {visita.cliente} no WhatsApp
        </label>
        {!visita.clienteTemZap ? (
          <span className={estilo.dica}>
            Este cliente não tem WhatsApp no cadastro — a visita é marcada do mesmo jeito, mas
            ninguém é avisado.
          </span>
        ) : null}

        <div className={estilo.acoesForm}>
          <button type="submit" className={estilo.btn} disabled={salvando}>
            {salvando ? 'Marcando…' : marcada ? 'Salvar a mudança' : 'Marcar a visita'}
          </button>

          {marcada ? (
            <button
              type="button"
              className={estilo.acaoRara}
              disabled={pendente}
              onClick={() => {
                setErro(null)
                iniciar(async () => {
                  const r = await desmarcarVisitaPreventiva(visita.id)
                  if (r.ok) router.refresh()
                  else setErro(r.motivo)
                })
              }}
            >
              desmarcar
            </button>
          ) : null}
        </div>
      </form>

      {/* ===================================================================
          O PASSO 3, e por que ele fica separado por uma linha
          ===================================================================
          Marcar é combinar; gerar a ordem é começar o trabalho — e a partir
          daí a visita sai da preventiva e entra na esteira de 18 etapas, com
          retirada, foto, assinatura e laudo. Colar os dois botões faria o
          segundo parecer o "confirmar" do primeiro. */}
      <div className={estilo.prevGerar}>
        <div>
          <strong>No dia, gere a ordem de serviço.</strong>
          <p className={estilo.fraco}>
            A visita entra na mesma esteira de qualquer conserto — retirada, foto, laudo e
            faturamento. Não existe caminho paralelo para a preventiva.
          </p>
        </div>
        {visita.ordemId ? (
          <Link href={`/painel/ordens/${visita.ordemId}`} className={estilo.btnSec}>
            Abrir a O.S.
          </Link>
        ) : (
          <button
            type="button"
            className={estilo.btnSec}
            disabled={pendente}
            onClick={() => {
              setErro(null)
              iniciar(async () => {
                const form = new FormData()
                form.set('visitaId', visita.id)
                const r = await gerarOrdemDaVisita(form)
                if (r.ok && r.dados) router.push(`/painel/ordens/${r.dados.id}`)
                else if (!r.ok) setErro(r.motivo)
              })
            }}
          >
            {pendente ? 'Abrindo…' : 'Gerar a ordem'}
          </button>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   Datas em português, sem biblioteca. Todas recebem 'AAAA-MM-DD' e tratam a
   string como UTC ao meio-dia: o fuso já foi aplicado no servidor, e reabrir a
   conversão aqui só traria de volta o dia 12 aparecendo como 11.
   --------------------------------------------------------------------------- */

const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`)

const FMT_CURTO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const FMT_LONGO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })

const diaCurto = (dia: string) => FMT_CURTO.format(meioDia(dia)).replace('.', '')
const diaLongo = (dia: string) => FMT_LONGO.format(meioDia(dia))

/** Quantos dias separam duas datas, como número inteiro de dias. */
function dias(de: string, ate: string): number {
  return Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / 86_400_000)
}

/** "em 3 dias", "hoje", "há 2 dias" — a leitura que a data sozinha não dá. */
function distancia(dia: string, hoje: string): string {
  const n = dias(hoje, dia)
  if (n === 0) return 'hoje'
  if (n === 1) return 'amanhã'
  if (n === -1) return 'ontem'
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`
}

/** O quanto o combinado saiu do previsto, dito como gente fala. */
function folga(previsto: string, combinado: string): string {
  const n = dias(previsto, combinado)
  if (n === 0) return 'no mesmo dia'
  const q = Math.abs(n)
  return n > 0 ? `${q} dia${q === 1 ? '' : 's'} depois` : `${q} dia${q === 1 ? '' : 's'} antes`
}
