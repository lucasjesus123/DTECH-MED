'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { agendar } from '@/server/acoes/agenda'
import { FUSO } from '@/lib/datas'
import estilo from '../../painel.module.css'

type Parada = {
  id: string
  dia: string
  hora: string | null
  tipo: 'RETIRADA' | 'ENTREGA'
  numero: number
  cliente: string
  cidade: string | null
}

export type AgendaMotorista = { id: string; nome: string; paradas: Parada[] }

export type DadosDaParada = {
  ordemId: string
  numero: number
  tipo: 'RETIRADA' | 'ENTREGA'
  cliente: string
  /** Os dias oferecidos, em 'AAAA-MM-DD', vindos do servidor no fuso da casa. */
  dias: string[]
  motoristas: AgendaMotorista[]
  semMotorista: Parada[]
  endereco: string
  contatoNome: string
  contatoTelefone: string
  observacoes: string
}

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * MARCAR A PARADA SEM SAIR DA FICHA — e vendo a agenda de quem vai dirigir.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * O passo "Retirada agendada" é recusado pelo motor enquanto não houver parada
 * marcada, com a mensagem certa ("Marque a parada na Agenda de rota antes").
 * Certa e inútil: quem está na ficha tinha de decorar o número da O.S., abrir
 * outra tela, achar a ordem na fila, marcar, e voltar. Agora o mesmo botão abre
 * a marcação aqui, e o passo anda em seguida — a `agendar` é a mesma da Agenda
 * de rota, com a mesma trava de perfil e o mesmo aviso ao cliente.
 *
 * =============================================================================
 * O QUE A GRADE DE DIAS MOSTRA — E O QUE ELA SE RECUSA A MOSTRAR
 * =============================================================================
 * Ela mostra QUANTAS paradas aquele motorista já tem em cada dia, e quais.
 * Isso é fato registrado.
 *
 * Ela não pinta "livre" nem "disponível", e a diferença não é de palavra. O
 * sistema não sabe a jornada de ninguém, quanto dura cada parada, a distância
 * entre dois endereços, nem que o motorista avisou que sexta não vem. Um "dia
 * livre" calculado sem nada disso seria uma promessa que quem marca é que teria
 * de cumprir — e no dia em que não desse, a culpa cairia na tela.
 *
 * Quem agenda conhece a rua e a equipe. O sistema entrega o número honesto e a
 * leitura fica com ela.
 */
export default function AgendarParada({
  dados,
  titulo,
  aoFechar,
}: {
  dados: DadosDaParada
  /** O nome do passo que abriu esta janela, para ela dizer o que vem depois. */
  titulo: string
  aoFechar: () => void
}) {
  // Fechar no ESC e travar a rolagem de trás — a janela vira a tela inteira
  // enquanto está aberta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [aoFechar])

  return (
    <div className={estilo.janelaFundo}>
      <button type="button" className={estilo.janelaSaida} onClick={aoFechar} aria-label="Fechar" />

      <div className={estilo.janela} role="dialog" aria-modal="true" aria-label="Marcar a parada">
        <div className={estilo.janelaCab}>
          <p className={estilo.janelaTitulo}>
            {dados.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'} da O.S. #
            {String(dados.numero).padStart(4, '0')}
          </p>
          <button type="button" className={estilo.janelaX} onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={estilo.janelaCorpo}>
          <FormularioDaParada dados={dados} titulo={titulo} aoFechar={aoFechar} />
        </div>
      </div>
    </div>
  )
}

/**
 * O FORMULÁRIO SOZINHO, sem a moldura da janela.
 *
 * =============================================================================
 * POR QUE ELE FOI SEPARADO
 * =============================================================================
 * Marcar a parada acontece em dois lugares agora: na ficha, onde ele abre por
 * cima como janela própria, e DENTRO da janela do passo a passo — que já é uma
 * janela. Uma janela abrindo por cima de outra é o que a pessoa que pediu esta
 * tela chamou de bagunça, com razão: dois fundos escuros empilhados, dois ×, e
 * nenhuma pista de qual dos dois o Esc vai fechar.
 *
 * Aqui dentro está só o miolo — os campos e os botões. Quem chama decide se põe
 * moldura em volta.
 */
export function FormularioDaParada({
  dados,
  titulo,
  aoFechar,
  aoMarcar,
}: {
  dados: DadosDaParada
  /** O nome do passo que espera esta parada, para o texto dizer o que vem depois. */
  titulo: string
  aoFechar: () => void
  /**
   * Chamado quando a parada foi marcada. Sem ele, marcar apenas fecha — que é
   * o certo na ficha, onde a página inteira recarrega. Na janela do passo a
   * passo é ela que precisa recarregar, e não a página atrás.
   */
  aoMarcar?: () => void
}) {
  const [estado, acao, pendente] = useActionState(agendar, inicial)
  const [motoristaId, setMotoristaId] = useState('')
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('09:00')
  const router = useRouter()

  // Marcou: quem chamou precisa recarregar para o passo seguinte aparecer
  // liberado — a ficha inteira, ou só a janela do passo a passo.
  useEffect(() => {
    if (estado.ok) {
      router.refresh()
      if (aoMarcar) aoMarcar()
      else aoFechar()
    }
  }, [estado, router, aoFechar, aoMarcar])

  const escolhido = dados.motoristas.find((m) => m.id === motoristaId) ?? null

  /** Quantas paradas cada dia tem, para o motorista escolhido. */
  const carga = useMemo(() => {
    const m = new Map<string, Parada[]>()
    const fonte = escolhido ? escolhido.paradas : []
    for (const p of fonte) {
      const l = m.get(p.dia)
      if (l) l.push(p)
      else m.set(p.dia, [p])
    }
    return m
  }, [escolhido])

  const doDia = (dia && carga.get(dia)) || []

  /**
   * Já existe parada desse motorista na mesma hora?
   *
   * Isto AVISA, não impede. Duas paradas às 9h no mesmo prédio são rotina; duas
   * em cidades diferentes não são, e o sistema não tem como distinguir. Bloquear
   * transformaria uma dúvida legítima em porta trancada.
   */
  const choque = doDia.some((p) => p.hora === hora)

  return (
    <>
      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <p className={estilo.dica} style={{ marginTop: 0 }}>
        {dados.cliente} · marcar aqui já libera <strong>{titulo}</strong>, e o cliente é avisado
        com o dia, a hora e o nome de quem vai.
      </p>

      <form action={acao} className={estilo.janelaForm}>
        <input type="hidden" name="ordemId" value={dados.ordemId} />
        <input type="hidden" name="tipo" value={dados.tipo} />
        <input type="hidden" name="data" value={dia} />
        <input type="hidden" name="motoristaId" value={motoristaId} />

        {/* ---- 1. QUEM VAI ------------------------------------------- */}
        <div>
          <p className={estilo.rotulo}>Quem vai</p>
          <div className={estilo.agTiras}>
            {dados.motoristas.map((m) => (
              <button
                key={m.id}
                type="button"
                className={
                  m.id === motoristaId ? `${estilo.agChip} ${estilo.agChipAtivo}` : estilo.agChip
                }
                aria-pressed={m.id === motoristaId}
                onClick={() => setMotoristaId(m.id === motoristaId ? '' : m.id)}
              >
                {m.nome}
                <span className={estilo.agChipConta}>
                  {m.paradas.length === 0 ? 'sem parada' : `${m.paradas.length} paradas`}
                </span>
              </button>
            ))}
            {dados.motoristas.length === 0 ? (
              <p className={estilo.texto}>
                Nenhum motorista cadastrado. Dá para marcar o dia mesmo assim e definir quem vai
                depois, na Agenda de rota.
              </p>
            ) : null}
          </div>
          {dados.semMotorista.length > 0 ? (
            <p className={estilo.dica}>
              Há {dados.semMotorista.length} parada(s) marcada(s) sem motorista definido nestes
              dias — elas ainda vão cair no colo de alguém.
            </p>
          ) : null}
        </div>

        {/* ---- 2. QUANDO --------------------------------------------- */}
        <div>
          <p className={estilo.rotulo}>
            Que dia {escolhido ? `· o que ${primeiroNome(escolhido.nome)} já tem` : ''}
          </p>
          <div className={estilo.agGradeDias}>
            {dados.dias.map((d) => {
              const n = (carga.get(d) ?? []).length
              return (
                <button
                  key={d}
                  type="button"
                  className={d === dia ? `${estilo.agDia} ${estilo.agDiaAtivo}` : estilo.agDia}
                  aria-pressed={d === dia}
                  onClick={() => setDia(d)}
                >
                  <span className={estilo.agDiaSemana}>{diaDaSemana(d)}</span>
                  <span className={estilo.agDiaNum}>{numeroDoDia(d)}</span>
                  {/* Sem motorista escolhido não há carga para mostrar, e um
                      "0" em toda célula leria como "todo dia está vazio". */}
                  {escolhido ? (
                    <span className={n >= 4 ? `${estilo.agCarga} ${estilo.agCargaCheia}` : estilo.agCarga}>
                      {n === 0 ? '—' : n}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {!dia ? <p className={estilo.dica}>Escolha o dia para continuar.</p> : null}
        </div>

        {/* ---- 3. O QUE JÁ ESTÁ MARCADO NAQUELE DIA ------------------ */}
        {dia && escolhido ? (
          doDia.length === 0 ? (
            <p className={estilo.dica}>
              {primeiroNome(escolhido.nome)} não tem nenhuma parada marcada em {porExtenso(dia)}.
            </p>
          ) : (
            <ul className={estilo.agLista}>
              {doDia.map((p) => (
                <li key={p.id} className={estilo.agParada}>
                  <strong>{p.hora ?? 'sem hora'}</strong>
                  <span>
                    #{String(p.numero).padStart(4, '0')} {p.cliente}
                    {p.cidade ? ` · ${p.cidade}` : ''}
                  </span>
                  <span className={estilo.tag}>{p.tipo === 'RETIRADA' ? 'retirada' : 'entrega'}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <div className={estilo.janelaGrade}>
          <label className={estilo.rotulo}>
            A partir das
            <input
              className={estilo.campo}
              type="time"
              name="hora"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </label>
          <label className={estilo.rotulo}>
            Até
            <input className={estilo.campo} type="time" name="janelaFim" />
            <span className={estilo.dica}>A janela combinada com o cliente.</span>
          </label>
        </div>

        {choque ? (
          <p className={estilo.aviso} role="status">
            {primeiroNome(escolhido!.nome)} já tem uma parada às {hora} neste dia. Dá para marcar
            assim mesmo — confira se dá tempo de ir de uma à outra.
          </p>
        ) : null}

        {/* ---- 4. ONDE ----------------------------------------------- */}
        <label className={estilo.rotulo}>
          Endereço da parada *
          <input
            className={estilo.campo}
            name="endereco"
            defaultValue={dados.endereco}
            required
            minLength={5}
          />
          <span className={estilo.dica}>
            Fica congelado nesta parada — se o cadastro mudar depois, o comprovante continua
            mostrando onde o motorista foi.
          </span>
        </label>

        <div className={estilo.janelaGrade}>
          <label className={estilo.rotulo}>
            Falar com
            <input className={estilo.campo} name="contatoNome" defaultValue={dados.contatoNome} />
          </label>
          <label className={estilo.rotulo}>
            Telefone no local
            <input
              className={estilo.campo}
              name="contatoTelefone"
              defaultValue={dados.contatoTelefone}
              inputMode="tel"
            />
          </label>
        </div>

        <label className={estilo.rotulo}>
          Ponto de referência
          <input
            className={estilo.campo}
            name="pontoReferencia"
            placeholder="Portão azul, ao lado da farmácia"
          />
        </label>

        <label className={estilo.rotulo}>
          Recado para o motorista
          <textarea
            className={estilo.area}
            name="observacoes"
            rows={2}
            defaultValue={dados.observacoes}
            placeholder="Levar carrinho, estacionar nos fundos…"
          />
        </label>

        <div className={estilo.acoesForm}>
          <button type="submit" className={estilo.btn} disabled={pendente || !dia}>
            {pendente ? 'Marcando…' : 'Marcar e avisar o cliente'}
          </button>
          <button type="button" className={estilo.btnSec} onClick={aoFechar} disabled={pendente}>
            Cancelar
          </button>
        </div>
        {!dia ? <p className={estilo.dica}>O botão libera quando você escolher o dia.</p> : null}
      </form>
    </>
  )
}

/**
 * As datas viram texto com o FUSO DECLARADO, e não com o do navegador.
 *
 * `new Date('2026-09-14')` é meia-noite UTC — que em Lajeado ainda é dia 13.
 * O `T12:00:00-03:00` põe o instante no meio do dia da casa, longe das duas
 * viradas, e o `timeZone` garante que a leitura saia igual em qualquer máquina.
 */
function comoData(dia: string): Date {
  return new Date(`${dia}T12:00:00-03:00`)
}

function diaDaSemana(dia: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: FUSO }).format(comoData(dia))
  return s.replace('.', '').slice(0, 3)
}

function numeroDoDia(dia: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: FUSO }).format(comoData(dia))
}

function porExtenso(dia: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: FUSO,
  }).format(comoData(dia))
}

/** "Adriano Bueno" → "Adriano". Nome inteiro em frase corrida fica formal demais. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
