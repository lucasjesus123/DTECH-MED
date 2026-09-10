'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarCompromisso, excluirCompromisso } from '@/server/acoes/compromissos'
import type { DetalheDoEvento } from '@/server/consultas/evento-do-calendario'
import estilo from '../painel.module.css'

/**
 * A JANELA DE UM EVENTO DO CALENDÁRIO.
 *
 * =============================================================================
 * O QUE ELA SUBSTITUI
 * =============================================================================
 * Clicar num risquinho da grade LEVAVA EMBORA. A parada abria a ficha da O.S., o
 * contrato abria o cliente, a preventiva abria a lista de preventivas — três
 * telas, todas fora do calendário, todas exigindo o botão "voltar" para
 * continuar olhando o mês.
 *
 * E o pulo era o menor dos custos. Quem clica num evento do calendário quase
 * nunca quer TRABALHAR aquela ordem; quer saber **o que é aquilo** — que horas,
 * com quem, onde, quem vai, já aceitou, está atrasado. A ficha da O.S. responde
 * um terço disso, com o resto do prontuário na frente.
 *
 * =============================================================================
 * O PULO CONTINUA EXISTINDO — COMO ESCOLHA
 * =============================================================================
 * Todo tipo de evento tem, no rodapé, o botão que leva para onde ele se
 * trabalha. A diferença é que agora isso tem nome ("Abrir a O.S. #0012") e
 * acontece porque alguém quis, e não como consequência de ter clicado para
 * olhar.
 *
 * =============================================================================
 * CARTÕES, E NÃO UMA LISTA DE PARES
 * =============================================================================
 * O endereço com o mapa, o recado da central e o contato no local são coisas de
 * peso diferente, e uma lista de "rótulo: valor" desenharia as três iguais. O
 * telefone que se clica para ligar não é um dado — é uma ação.
 */
export default function JanelaDoEvento({
  detalhe,
  fechar,
}: {
  detalhe: DetalheDoEvento
  /** Endereço de volta, montado pela página: só ela sabe a visão e o filtro. */
  fechar: string
}) {
  const router = useRouter()

  // Mesmo desenho da janela de marcar: ESC fecha e o fundo para de rolar. É a
  // única parte que precisa de JavaScript — a janela existe porque o ENDEREÇO
  // diz `evento=`, e o × e o fundo são links comuns de volta.
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

  const porExtenso = new Date(`${detalhe.dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  const legivel = porExtenso.charAt(0).toUpperCase() + porExtenso.slice(1)

  return (
    <div className={estilo.janelaFundo}>
      <Link href={fechar} className={estilo.janelaSaida} aria-hidden="true" tabIndex={-1} />
      <div
        className={`${estilo.janela} ${estilo.janelaLarga}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tituloDoEvento"
      >
        <div className={estilo.janelaCab}>
          <div>
            <p className={estilo.evTipo}>{ROTULO[detalhe.tipo]}</p>
            <p className={estilo.janelaTitulo} id="tituloDoEvento">
              {detalhe.titulo}
            </p>
            <p className={estilo.evQuando}>
              {legivel}
              {detalhe.tipo === 'parada' ? ` · ${detalhe.horario}` : ''}
              {detalhe.tipo === 'compromisso' && detalhe.hora ? ` · ${detalhe.hora}` : ''}
            </p>
          </div>
          <Link href={fechar} className={estilo.janelaX} aria-label="Fechar">
            ×
          </Link>
        </div>

        <div className={estilo.janelaCorpo}>
          {detalhe.atrasado ? (
            <p className={estilo.evAtraso}>
              Passou da data e continua em aberto.
            </p>
          ) : null}

          {detalhe.tipo === 'parada' ? <ADaParada d={detalhe} /> : null}
          {detalhe.tipo === 'preventiva' ? <ADaPreventiva d={detalhe} /> : null}
          {detalhe.tipo === 'contrato' ? <ADoContrato d={detalhe} /> : null}
          {detalhe.tipo === 'compromisso' ? (
            <ADoCompromisso d={detalhe} fechar={fechar} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

const ROTULO: Record<DetalheDoEvento['tipo'], string> = {
  parada: 'Parada de rota',
  preventiva: 'Visita preventiva',
  contrato: 'Contrato terminando',
  compromisso: 'Compromisso da equipe',
}

// ---------------------------------------------------------------------------
// PARADA
// ---------------------------------------------------------------------------

function ADaParada({ d }: { d: Extract<DetalheDoEvento, { tipo: 'parada' }> }) {
  const semMotorista = !d.motorista
  return (
    <>
      <div className={estilo.evGrade}>
        <Cartao titulo="Quem vai" alerta={semMotorista}>
          <p className={estilo.evForte}>{d.motorista ?? 'Ninguém designado ainda'}</p>
          <p className={estilo.evNota}>
            {d.aceitoEm
              ? `Aceitou a corrida em ${d.aceitoEm}.`
              : d.motorista
                ? 'Designado, ainda não aceitou.'
                : 'A parada aparece na Agenda de rota para quem pegar.'}
          </p>
          {d.saiuEm ? <p className={estilo.evNota}>Saiu em {d.saiuEm}.</p> : null}
          {d.concluidoEm ? <p className={estilo.evNota}>Concluída em {d.concluidoEm}.</p> : null}
          {d.motivoFalha ? <p className={estilo.evNota}>Não deu certo: {d.motivoFalha}</p> : null}
          <p className={estilo.evNota}>Situação: {d.situacao}.</p>
        </Cartao>

        <Cartao titulo="Onde">
          <p className={estilo.evTexto}>{d.endereco}</p>
          {d.referencia ? <p className={estilo.evNota}>Referência: {d.referencia}</p> : null}
          {d.posicaoRota !== null ? (
            <p className={estilo.evNota}>{d.posicaoRota}ª parada da rota do dia.</p>
          ) : null}
          <a
            className={estilo.btnSec}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.endereco)}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver no mapa
          </a>
        </Cartao>

        <Cartao titulo="Com quem falar">
          <p className={estilo.evForte}>{d.cliente}</p>
          {d.contato ? <p className={estilo.evNota}>Procurar por {d.contato}</p> : null}
          {/* O telefone do LOCAL vem antes do cadastro do cliente: quem está na
              porta precisa do número de quem abre a porta, não do financeiro. */}
          {d.telefoneContato ? (
            <a className={estilo.btnSec} href={`tel:${d.telefoneContato}`}>
              Ligar para o local
            </a>
          ) : null}
          {d.telefoneCliente && d.telefoneCliente !== d.telefoneContato ? (
            <a className={estilo.btnSec} href={`tel:${d.telefoneCliente}`}>
              Ligar para o cliente
            </a>
          ) : null}
        </Cartao>

        <Cartao titulo="O que buscar">
          <p className={estilo.evForte}>{d.equipamento}</p>
          {d.serie ? <p className={estilo.evNota}>Série {d.serie}</p> : null}
          <p className={estilo.evNota}>
            O.S. #{String(d.numeroOs).padStart(4, '0')} · passo {d.passo}: {d.passoNome}
          </p>
          <p className={estilo.evNota}>Etapa atual: {d.etapa}.</p>
          {d.viaCorreio ? (
            <p className={estilo.evNota}>Esta ordem veio pelo correio.</p>
          ) : null}
        </Cartao>
      </div>

      {d.recado ? (
        <div className={estilo.evRecado}>
          <p className={estilo.evRecadoRot}>Recado da central para o motorista</p>
          <p>{d.recado}</p>
        </div>
      ) : null}

      <div className={estilo.evAcoes}>
        <Link href={`/painel/ordens?abrir=${d.ordemId}`} className={estilo.btn}>
          Abrir a O.S. #{String(d.numeroOs).padStart(4, '0')}
        </Link>
        <Link href="/painel/rota" className={estilo.btnSec}>
          Ver a rota do dia
        </Link>
        <Link href={`/painel/clientes/${d.clienteId}`} className={estilo.btnSec}>
          Ficha do cliente
        </Link>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// PREVENTIVA
// ---------------------------------------------------------------------------

function ADaPreventiva({ d }: { d: Extract<DetalheDoEvento, { tipo: 'preventiva' }> }) {
  return (
    <>
      <div className={estilo.evGrade}>
        <Cartao titulo="De quem">
          <p className={estilo.evForte}>{d.cliente}</p>
          <p className={estilo.evNota}>
            Contrato #{String(d.contratoNumero).padStart(4, '0')} · {d.periodicidade}
          </p>
        </Cartao>
        <Cartao titulo="Qual aparelho">
          <p className={estilo.evForte}>{d.equipamento}</p>
          {d.serie ? <p className={estilo.evNota}>Série {d.serie}</p> : null}
        </Cartao>
        <Cartao titulo="Como está">
          <p className={estilo.evForte}>{d.situacao}</p>
          <p className={estilo.evNota}>
            {d.feitas} de {d.totalDeVisitas}{' '}
            {d.totalDeVisitas === 1 ? 'visita realizada' : 'visitas já realizadas'} neste contrato.
          </p>
          {d.numeroOs ? (
            <p className={estilo.evNota}>
              Virou a O.S. #{String(d.numeroOs).padStart(4, '0')}.
            </p>
          ) : (
            <p className={estilo.evNota}>Ainda não virou ordem de serviço.</p>
          )}
        </Cartao>
        {d.observacao ? (
          <Cartao titulo="Observação">
            <p className={estilo.evTexto}>{d.observacao}</p>
          </Cartao>
        ) : null}
      </div>

      <div className={estilo.evAcoes}>
        {d.ordemId ? (
          <Link href={`/painel/ordens?abrir=${d.ordemId}`} className={estilo.btn}>
            Abrir a O.S. #{String(d.numeroOs).padStart(4, '0')}
          </Link>
        ) : (
          <Link href="/painel/preventiva" className={estilo.btn}>
            Agendar esta visita
          </Link>
        )}
        <Link href={`/painel/clientes/${d.clienteId}`} className={estilo.btnSec}>
          Ficha do cliente
        </Link>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// CONTRATO
// ---------------------------------------------------------------------------

function ADoContrato({ d }: { d: Extract<DetalheDoEvento, { tipo: 'contrato' }> }) {
  return (
    <>
      <div className={estilo.evGrade}>
        <Cartao titulo="De quem">
          <p className={estilo.evForte}>{d.cliente}</p>
          <p className={estilo.evNota}>
            Contrato #{String(d.numero).padStart(4, '0')} · {d.periodicidade}
          </p>
        </Cartao>
        <Cartao titulo="Qual aparelho">
          <p className={estilo.evForte}>{d.equipamento}</p>
          {d.serie ? <p className={estilo.evNota}>Série {d.serie}</p> : null}
        </Cartao>
        <Cartao titulo="Período" alerta={d.atrasado}>
          <p className={estilo.evTexto}>
            {d.inicio} → {d.fim}
          </p>
          <p className={estilo.evNota}>{d.ativo ? 'Ainda ativo.' : 'Já encerrado.'}</p>
        </Cartao>
        <Cartao titulo="Visitas">
          <p className={estilo.evForte}>
            {d.feitas} de {d.totalDeVisitas}
          </p>
          <p className={estilo.evNota}>
            {d.proximaVisita
              ? `A próxima está prevista para ${d.proximaVisita}.`
              : 'Não há visita prevista em aberto.'}
          </p>
        </Cartao>
      </div>

      {d.observacoes ? (
        <div className={estilo.evRecado}>
          <p className={estilo.evRecadoRot}>Observações do contrato</p>
          <p>{d.observacoes}</p>
        </div>
      ) : null}

      {/* O VALOR DA VISITA NÃO APARECE, e a ausência é regra: o calendário é
          aberto ao motorista, e não tem corte de dinheiro porque não tem
          dinheiro nenhum. O contrato se renova no Financeiro. */}
      <div className={estilo.evAcoes}>
        <Link href={`/painel/clientes/${d.clienteId}`} className={estilo.btn}>
          Abrir o cliente e o contrato
        </Link>
        <Link href="/painel/preventiva" className={estilo.btnSec}>
          Ver as preventivas
        </Link>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// COMPROMISSO — o único que se MEXE daqui
// ---------------------------------------------------------------------------

function ADoCompromisso({
  d,
  fechar,
}: {
  d: Extract<DetalheDoEvento, { tipo: 'compromisso' }>
  fechar: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  /**
   * O COMPROMISSO É O ÚNICO EVENTO QUE NASCE NO CALENDÁRIO — e por isso é o
   * único que se resolve aqui.
   *
   * Parada, preventiva e contrato são consequência de outra coisa, e mexer
   * neles daqui seria mexer na O.S. e no contrato por uma janela de agenda. O
   * compromisso não tem outro dono: marcar como feito e apagar são as duas
   * coisas que se quer fazer com ele, e as duas estavam a uma tela de
   * distância.
   */
  function alternar() {
    setErro(null)
    iniciar(async () => {
      const r = await alternarCompromisso(d.id.slice(3))
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  function apagar() {
    setErro(null)
    iniciar(async () => {
      const r = await excluirCompromisso(d.id.slice(3))
      if (!r.ok) setErro(r.motivo)
      // Apagado, não há mais o que a janela mostre: ela fecha e volta à grade.
      else router.push(fechar)
    })
  }

  return (
    <>
      <div className={estilo.evGrade}>
        <Cartao titulo="Quando">
          <p className={estilo.evForte}>{d.hora ?? 'Sem hora marcada'}</p>
          <p className={estilo.evNota}>
            {d.hora ? 'Hora combinada.' : 'Compromisso do dia, sem hora — e isso é legítimo.'}
          </p>
        </Cartao>
        <Cartao titulo="Quem vai">
          <p className={estilo.evForte}>{d.responsavel ?? 'Ninguém em especial'}</p>
          {d.autor ? <p className={estilo.evNota}>Marcado por {d.autor}.</p> : null}
          <p className={estilo.evNota}>Anotado em {d.criadoEm}.</p>
        </Cartao>
        <Cartao titulo="Como está" alerta={d.atrasado}>
          <p className={estilo.evForte}>{d.concluido ? 'Feito' : 'Em aberto'}</p>
          <p className={estilo.evNota}>
            {d.concluido
              ? 'Ele fica na agenda de trás — é ela que responde "quando foi mesmo que estivemos lá".'
              : 'Ainda não foi resolvido.'}
          </p>
        </Cartao>
        {d.observacao ? (
          <Cartao titulo="Observação">
            <p className={estilo.evTexto}>{d.observacao}</p>
          </Cartao>
        ) : null}
      </div>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <div className={estilo.evAcoes}>
        <button type="button" className={estilo.btn} onClick={alternar} disabled={pendente}>
          {pendente ? 'Salvando…' : d.concluido ? 'Reabrir' : 'Marcar como feito'}
        </button>
        {/* A confirmação é em dois toques, e não num `confirm()` do navegador:
            apagar tira o compromisso da agenda de TODO MUNDO, e o diálogo do
            navegador é aquele que a pessoa fecha no automático. */}
        {confirmando ? (
          <>
            <button
              type="button"
              className={estilo.btnPerigo}
              onClick={apagar}
              disabled={pendente}
            >
              Apagar mesmo
            </button>
            <button
              type="button"
              className={estilo.linkAcao}
              onClick={() => setConfirmando(false)}
            >
              Deixa
            </button>
          </>
        ) : (
          <button
            type="button"
            className={estilo.btnSec}
            onClick={() => setConfirmando(true)}
          >
            Apagar
          </button>
        )}
      </div>
      <p className={estilo.dica}>
        Apagar some da agenda de todo mundo. Se ele aconteceu, prefira &ldquo;marcar como
        feito&rdquo;: a agenda de trás é o que responde depois.
      </p>
    </>
  )
}

/** Um cartão do miolo. `alerta` acende a borda do que precisa de decisão. */
function Cartao({
  titulo,
  alerta = false,
  children,
}: {
  titulo: string
  alerta?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={alerta ? `${estilo.evCartao} ${estilo.evCartaoAlerta}` : estilo.evCartao}>
      <p className={estilo.evCartaoTitulo}>{titulo}</p>
      {children}
    </div>
  )
}
