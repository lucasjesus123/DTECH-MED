'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState } from 'react'
import { formatarBRL } from '@/lib/dinheiro'
import { avancar } from '@/server/acoes/ordem'
import {
  marcarComoEnvioDoCliente,
  painelDaOrdem,
  salvarCombinado,
  type PainelDaOrdem,
} from '@/server/acoes/assistente'
import { FormularioDaParada } from './[id]/agendar-parada'
import Cancelar from './[id]/cancelar'
import estilo from '../painel.module.css'

/**
 * A JANELA DA O.S. — o passo a passo, numa tela só.
 *
 * =============================================================================
 * O QUE ELA VEIO CONSERTAR
 * =============================================================================
 * A frase do dono, olhando a Central de O.S.:
 *
 *   "estou achando essa aba um pouco bagunçada... precisa ser de forma fácil
 *    tipo um passo a passo... PRECISO QUE SEJA TUDO EM UMA JANELA TIPO POPUP"
 *
 * Ele tem razão, e o defeito não era a lista: era o que vinha DEPOIS dela. Para
 * andar uma ordem, a pessoa saía da lista, abria uma ficha de três dobras,
 * procurava o bloco certo entre nove, e às vezes ainda pulava para a Agenda de
 * rota e voltava. Cada ida perdia o filtro, a rolagem e o lugar onde estava.
 *
 * Aqui a ordem inteira cabe numa janela: onde ela está, o que falta, e o botão
 * que faz o próximo passo — inclusive marcar dia e motorista, que antes era
 * outra tela.
 *
 * =============================================================================
 * A RÉGUA É DE ONZE, E A MÁQUINA CONTINUA DE DEZOITO
 * =============================================================================
 * Ninguém trabalha contando dezoito etapas. O roteiro (`server/ordem/roteiro`)
 * agrupa as dezoito nos onze passos que o dono conta em voz alta. Quem valida
 * continua sendo a máquina de estados: agrupar é desenho de tela, não permissão
 * — nenhuma trava é pulada porque dois quadradinhos viraram um.
 *
 * =============================================================================
 * A JANELA NÃO ABRE OUTRA JANELA
 * =============================================================================
 * Marcar a parada era uma segunda janela por cima da primeira: dois fundos
 * escuros, dois ×, e nenhuma pista de qual deles o Esc fecha. Agora o
 * formulário da parada entra NO LUGAR do painel de agora, com um "voltar" — o
 * mesmo movimento de um passo do assistente, que é o que ele de fato é.
 */

type Modo =
  | { tela: 'agora' }
  | { tela: 'parada' }
  | { tela: 'envio' }
  | { tela: 'combinado' }

export default function JanelaOS({
  ordemId,
  aoFechar,
}: {
  ordemId: string
  aoFechar: () => void
}) {
  const [p, setP] = useState<PainelDaOrdem | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>({ tela: 'agora' })
  /** O passo que a pessoa clicou na régua só para ver o que é. */
  const [espiando, setEspiando] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const router = useRouter()

  /**
   * O painel é buscado NO CLIQUE, e não junto com a lista.
   *
   * Sessenta linhas trazendo agenda de motorista, fotos, orçamento e fatura de
   * cada uma deixariam lenta justamente a tela que existe para ser rápida. Aqui
   * a lista continua leve e a janela busca o que precisa quando abre.
   */
  const recarregar = useCallback(async () => {
    const r = await painelDaOrdem(ordemId)
    if (r.ok) {
      setP(r.painel)
      setErro(null)
    } else {
      setErro(r.motivo)
    }
  }, [ordemId])

  useEffect(() => {
    // `vivo` evita gravar estado numa janela que a pessoa já fechou — o clique
    // rápido em duas ordens seguidas é o caso comum num dia cheio.
    let vivo = true
    painelDaOrdem(ordemId).then((r) => {
      if (!vivo) return
      if (r.ok) setP(r.painel)
      else setErro(r.motivo)
    })
    return () => {
      vivo = false
    }
  }, [ordemId])

  /**
   * Esc fecha; Tab circula dentro da janela.
   *
   * As duas coisas são esperadas de uma janela e nenhuma vem de graça numa div.
   * Sem a prisão do Tab, quem navega por teclado sai por baixo e vai passear
   * pelo menu lateral que nem está vendo.
   */
  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        aoFechar()
        return
      }
      if (e.key !== 'Tab' || !caixa.current) return
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    },
    [aoFechar],
  )

  useEffect(() => {
    document.addEventListener('keydown', aoTeclar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caixa.current?.focus()
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [aoTeclar])

  /** Andou a esteira: a janela recarrega, e a lista atrás também. */
  const andou = useCallback(() => {
    setModo({ tela: 'agora' })
    setEspiando(null)
    void recarregar()
    router.refresh()
  }, [recarregar, router])

  const d = p?.dossie ?? null

  return (
    <div className={estilo.janelaFundo}>
      <button type="button" className={estilo.janelaSaida} onClick={aoFechar} aria-label="Fechar" />

      <div
        ref={caixa}
        tabIndex={-1}
        className={`${estilo.janela} ${estilo.osJan}`}
        role="dialog"
        aria-modal="true"
        aria-label={p ? `O.S. ${String(d!.numero).padStart(4, '0')}` : 'Carregando a O.S.'}
      >
        <div className={estilo.janelaCab}>
          <div className={estilo.osJanCab}>
            <p className={estilo.janelaTitulo}>
              {p ? (
                <>
                  O.S. #{String(d!.numero).padStart(4, '0')}
                  <span className={estilo.osJanEquip}>
                    {' '}
                    {d!.equipamento.marca} {d!.equipamento.modelo}
                  </span>
                </>
              ) : (
                'Abrindo a O.S.…'
              )}
            </p>
            {p ? (
              <p className={estilo.osJanSub}>
                {d!.cliente.nome}
                {d!.cliente.cidade ? ` · ${d!.cliente.cidade}` : ''}
                {' · '}
                <span className={estilo.osJanEtapa}>{p.etapaRotulo}</span>
                {p.prioridade === 'ALTA' ? (
                  <span className={`${estilo.tag} ${estilo.tagAlerta}`}>alta</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button type="button" className={estilo.janelaX} onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={estilo.janelaCorpo}>
          {erro ? (
            <p className={estilo.erro} role="alert">
              {erro}
            </p>
          ) : null}

          {!p ? (
            <p className={estilo.texto}>Carregando…</p>
          ) : (
            <>
              <Regua
                painel={p}
                espiando={espiando}
                aoEspiar={(n) => setEspiando((atual) => (atual === n ? null : n))}
              />

              {/* O corpo troca conforme o que a pessoa está fazendo. Um passo de
                  cada vez é a regra desta janela inteira. */}
              {modo.tela === 'parada' && p.parada ? (
                <Voltando titulo="Marcar o dia e o motorista" aoVoltar={() => setModo({ tela: 'agora' })}>
                  <FormularioDaParada
                    dados={{
                      ordemId: d!.id,
                      numero: d!.numero,
                      tipo: p.parada.tipo,
                      cliente: d!.cliente.nome,
                      dias: p.parada.dias,
                      motoristas: p.parada.motoristas,
                      semMotorista: p.parada.semMotorista,
                      endereco: p.parada.endereco,
                      contatoNome: p.parada.contatoNome,
                      contatoTelefone: p.parada.contatoTelefone,
                      observacoes: p.parada.observacoes,
                    }}
                    titulo={
                      p.passos.find((x) => x.pedeParada !== null)?.titulo ?? 'o próximo passo'
                    }
                    aoFechar={() => setModo({ tela: 'agora' })}
                    aoMarcar={andou}
                  />
                </Voltando>
              ) : modo.tela === 'envio' ? (
                <Voltando titulo="O cliente é que envia" aoVoltar={() => setModo({ tela: 'agora' })}>
                  <FormularioDeEnvio painel={p} aoEnviar={andou} />
                </Voltando>
              ) : modo.tela === 'combinado' ? (
                <Voltando titulo="O que foi combinado" aoVoltar={() => setModo({ tela: 'agora' })}>
                  <FormularioDoCombinado painel={p} aoSalvar={() => {
                      setModo({ tela: 'agora' })
                      void recarregar()
                    }} />
                </Voltando>
              ) : espiando !== null ? (
                <PassoEspiado painel={p} n={espiando} aoFechar={() => setEspiando(null)} />
              ) : (
                <Agora
                  painel={p}
                  aoAndar={andou}
                  aoMarcarParada={() => setModo({ tela: 'parada' })}
                  aoEscolherEnvio={() => setModo({ tela: 'envio' })}
                  aoCombinar={() => setModo({ tela: 'combinado' })}
                />
              )}

              <Resumo painel={p} />

              <div className={estilo.osJanRodape}>
                <Link href={`/painel/ordens/${d!.id}`} className={estilo.btnSec}>
                  Histórico completo
                </Link>
                <a
                  href={p.linkPortal}
                  target="_blank"
                  rel="noreferrer"
                  className={estilo.btnSec}
                >
                  O que o cliente vê
                </a>
                <Link href={`/painel/ordens/${d!.id}/editar`} className={estilo.btnSec}>
                  Corrigir a O.S.
                </Link>
              </div>

              {p.podeCancelar ? <Cancelar ordemId={d!.id} /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   A RÉGUA DOS ONZE PASSOS
   ==========================================================================
   Ela responde de relance a pergunta que se faz cem vezes por dia: em que pé
   está. Cada bolinha é clicável — não para ANDAR, que seria pular trava, mas
   para LER o que aquele passo é e quando ele aconteceu.
   ========================================================================== */
function Regua({
  painel,
  espiando,
  aoEspiar,
}: {
  painel: PainelDaOrdem
  espiando: number | null
  aoEspiar: (n: number) => void
}) {
  const r = painel.roteiro
  return (
    <div className={estilo.osReguaCaixa}>
      <div className={estilo.osReguaTopo}>
        <span className={estilo.osReguaAgora}>
          {r.desvio ? r.desvio.rotulo : `Passo ${r.atual} de ${r.total} · ${r.passos[r.atual - 1]?.nome ?? ''}`}
        </span>
        <span className={estilo.osReguaConta}>{Math.round(r.porcento)}%</span>
      </div>

      <div className={estilo.osReguaPista} aria-hidden="true">
        <span
          className={r.desvio ? estilo.osReguaFioParado : estilo.osReguaFio}
          style={{ width: `${r.porcento}%` }}
        />
      </div>

      <ol className={estilo.osReguaNos}>
        {r.passos.map((n) => (
          <li key={n.n}>
            <button
              type="button"
              onClick={() => aoEspiar(n.n)}
              aria-pressed={espiando === n.n}
              className={`${estilo.osNo} ${
                n.estado === 'cumprido'
                  ? estilo.osNoFeito
                  : n.estado === 'agora'
                    ? estilo.osNoAgora
                    : estilo.osNoAdiante
              } ${espiando === n.n ? estilo.osNoEspiado : ''}`}
              title={n.oQue}
            >
              <span className={estilo.osNoNum}>{n.n}</span>
              <span className={estilo.osNoNome}>{n.nome}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** O cartão de leitura de um passo da régua. Não anda nada — só conta. */
function PassoEspiado({
  painel,
  n,
  aoFechar,
}: {
  painel: PainelDaOrdem
  n: number
  aoFechar: () => void
}) {
  const passo = painel.roteiro.passos.find((x) => x.n === n)
  if (!passo) return null
  return (
    <div className={estilo.osPainel}>
      <p className={estilo.osPainelTitulo}>
        Passo {passo.n} · {passo.nome}
        <span className={estilo.osPainelQuem}>{passo.quem}</span>
      </p>
      <p className={estilo.texto}>{passo.oQue}</p>
      <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
        {passo.quando
          ? `Passou por aqui em ${quando(passo.quando)}${passo.autor ? ` · ${passo.autor}` : ''}`
          : passo.estado === 'agora'
            ? 'É onde a ordem está agora.'
            : passo.estado === 'cumprido'
              ? 'Já cumprido.'
              : 'Ainda não chegou aqui.'}
        {passo.detalhe ? ` · ${passo.detalhe}` : ''}
      </p>
      <div className={estilo.acoesForm}>
        <button type="button" className={estilo.btnSec} onClick={aoFechar}>
          Voltar para o que fazer agora
        </button>
      </div>
    </div>
  )
}

/* ==========================================================================
   O QUE FAZER AGORA — o coração da janela
   ========================================================================== */
function Agora({
  painel,
  aoAndar,
  aoMarcarParada,
  aoEscolherEnvio,
  aoCombinar,
}: {
  painel: PainelDaOrdem
  aoAndar: () => void
  aoMarcarParada: () => void
  aoEscolherEnvio: () => void
  aoCombinar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [pendente, iniciar] = useTransition()
  const passoAtual = painel.roteiro.passos.find((x) => x.n === painel.roteiro.atual)
  const d = painel.dossie

  function executar(para: PainelDaOrdem['passos'][number]['para']) {
    setErro(null)
    iniciar(async () => {
      const r = await avancar({
        ordemId: d.id,
        para,
        observacao: observacao.trim() || undefined,
      })
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setObservacao('')
      aoAndar()
    })
  }

  /**
   * A ESCOLHA DO PASSO 3 tem tela própria, e não é um botão a mais na fila.
   *
   * "Nós buscamos" e "o cliente envia" são a MESMA transição da máquina com
   * consequências opostas: uma marca dia e motorista, a outra grava o rastreio
   * e manda outro texto no WhatsApp. Empilhá-las com os outros botões faria a
   * decisão que muda o resto da ordem parecer igual a "avançar etapa".
   */
  const escolhendoComoVem =
    d.etapa === 'ORDEM_RETIRADA_GERADA' && painel.passos.some((x) => x.pedeParada === 'RETIRADA')

  return (
    <div className={estilo.osPainel}>
      <p className={estilo.osPainelTitulo}>
        {painel.roteiro.desvio ? (
          <>Fora do caminho · {painel.roteiro.desvio.rotulo}</>
        ) : (
          <>
            Agora · passo {painel.roteiro.atual}
            {passoAtual ? ` · ${passoAtual.nome}` : ''}
          </>
        )}
        {passoAtual ? <span className={estilo.osPainelQuem}>{passoAtual.quem}</span> : null}
      </p>

      {passoAtual ? <p className={estilo.texto}>{passoAtual.oQue}</p> : null}

      <Pendencias painel={painel} />

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      {escolhendoComoVem ? (
        <div className={estilo.osEscolha}>
          <button type="button" className={estilo.osEscolhaCartao} onClick={aoMarcarParada}>
            <strong>Nós buscamos</strong>
            <span>
              Escolher o dia e o motorista. O cliente recebe a data e o nome de quem vai, e a
              parada entra no aplicativo do motorista.
            </span>
          </button>
          <button type="button" className={estilo.osEscolhaCartao} onClick={aoEscolherEnvio}>
            <strong>O cliente envia</strong>
            <span>
              Correio ou transportadora. O cliente recebe o endereço para onde mandar, e a ordem
              fica aguardando o aparelho chegar.
            </span>
          </button>
        </div>
      ) : painel.passos.length === 0 ? (
        <p className={estilo.texto}>
          {d.etapa === 'ORCAMENTO_ENVIADO'
            ? 'A bola está com o cliente: ele responde pelo link que recebeu no WhatsApp. Ninguém aqui dentro aprova no lugar dele.'
            : painel.roteiro.desvio
              ? 'Esta ordem saiu do caminho. O histórico completo conta o que aconteceu.'
              : 'Nada para fazer agora com o seu perfil — este passo é de outra pessoa da equipe.'}
        </p>
      ) : (
        <>
          <div className={estilo.acoesForm}>
            {painel.passos.map((x) => (
              <button
                key={x.para}
                type="button"
                className={estilo.btn}
                disabled={pendente}
                onClick={() => (x.pedeParada ? aoMarcarParada() : executar(x.para))}
              >
                {x.titulo}
                {x.pedeParada ? ' · escolher dia e motorista' : ''}
                {x.avisaCliente && !x.pedeParada ? ' · avisa o cliente' : ''}
              </button>
            ))}
          </div>

          <label className={estilo.rotulo}>
            Observação (opcional)
            <input
              className={estilo.campo}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Fica registrada na linha do tempo, junto do seu nome"
              disabled={pendente}
            />
          </label>
        </>
      )}

      {/* O passo 1 é o único que não anda a esteira: ele guarda o que foi
          combinado antes de a ordem existir. Fica aqui embaixo, discreto, e
          disponível o tempo todo — a pergunta "quanto ficou combinado?" volta
          semanas depois, no meio de qualquer etapa. */}
      {painel.podeCombinar ? (
        <button type="button" className={estilo.osLinkBaixo} onClick={aoCombinar}>
          {painel.valorPrevioCentavos === null
            ? 'Registrar o que foi combinado com o cliente'
            : `Combinado: ${formatarBRL(painel.valorPrevioCentavos)} — alterar`}
        </button>
      ) : null}
    </div>
  )
}

/**
 * O QUE ESTÁ FALTANDO, dito antes de o botão recusar.
 *
 * O motor recusa com uma frase boa ("faltam 3 fotos"), e essa frase continua
 * valendo — ela é a última palavra. Só que ela só aparece DEPOIS do clique, e
 * quem abriu a janela para saber o que fazer merece a resposta antes de tentar.
 */
function Pendencias({ painel }: { painel: PainelDaOrdem }) {
  const d = painel.dossie
  const avisos: string[] = []

  const fotosDeEntrada = d.fotos.filter((f) => f.categoria === 'RECEBIMENTO').length
  if (d.etapa === 'COLETADO' && fotosDeEntrada < 6) {
    avisos.push(
      `Faltam ${6 - fotosDeEntrada} das seis fotos de entrada. Quem tira é o técnico, pelo aplicativo.`,
    )
  }
  if (d.etapa === 'EM_ROTA_RETIRADA' && !d.assinaturas.some((s) => s.tipo === 'RETIRADA')) {
    avisos.push('O motorista ainda não colheu a assinatura do cliente no celular.')
  }
  if (d.etapa === 'EM_ROTA_ENTREGA' && !d.assinaturas.some((s) => s.tipo === 'ENTREGA')) {
    avisos.push('Falta a assinatura de quem recebe, colhida no celular do motorista.')
  }
  if (d.etapa === 'ORCAMENTO_INTERNO' && (!d.orcamento || d.orcamento.totalCentavos <= 0)) {
    avisos.push('O orçamento ainda não tem itens lançados — sem eles não dá para enviar ao cliente.')
  }
  if (d.etapa === 'FATURAMENTO' && d.fatura && d.fatura.emAbertoCentavos > 0) {
    avisos.push(
      `Faltam ${formatarBRL(d.fatura.emAbertoCentavos)} para quitar a fatura. O aparelho só sai com ela fechada.`,
    )
  }
  if (d.faltaPeca) avisos.push(d.faltaPeca)
  if (painel.viaCorreio && !painel.codigoRastreio && d.etapa === 'RETIRADA_AGENDADA') {
    avisos.push('O envio ainda está sem código de rastreio.')
  }

  if (avisos.length === 0) return null
  return (
    <ul className={estilo.osFaltas}>
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  )
}

/** A moldura de um sub-passo: um título e a porta de volta, sempre visível. */
function Voltando({
  titulo,
  aoVoltar,
  children,
}: {
  titulo: string
  aoVoltar: () => void
  children: React.ReactNode
}) {
  return (
    <div className={estilo.osPainel}>
      <p className={estilo.osPainelTitulo}>
        {titulo}
        <button type="button" className={estilo.osVoltar} onClick={aoVoltar}>
          ← voltar
        </button>
      </p>
      {children}
    </div>
  )
}

/* ==========================================================================
   O cliente é que envia — a outra metade do passo 3
   ========================================================================== */
type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

function FormularioDeEnvio({
  painel,
  aoEnviar,
}: {
  painel: PainelDaOrdem
  aoEnviar: () => void
}) {
  const [estado, acao, pendente] = useActionState(marcarComoEnvioDoCliente, inicial)

  useEffect(() => {
    if (estado.ok) aoEnviar()
  }, [estado, aoEnviar])

  return (
    <form action={acao} className={estilo.janelaForm}>
      <input type="hidden" name="ordemId" value={painel.dossie.id} />

      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <p className={estilo.texto}>
        O cliente recebe no WhatsApp o endereço para onde mandar
        {painel.enderecoDaCasa ? (
          <>
            {' '}
            — <strong>{painel.enderecoDaCasa}</strong>
          </>
        ) : (
          <>
            . <span className={estilo.fraco}>(o endereço da empresa ainda está em branco no
            cadastro — complete-o para que ele saia na mensagem)</span>
          </>
        )}
        {' '}e o pedido do código de rastreio. Nenhum motorista é acionado.
      </p>

      <label className={estilo.rotulo}>
        Código de rastreio (se já tiver)
        <input
          className={estilo.campo}
          name="rastreio"
          defaultValue={painel.codigoRastreio ?? ''}
          placeholder="BR123456789BR"
          autoComplete="off"
        />
        <span className={estilo.dica}>
          Dá para deixar em branco agora: quando o cliente postar e mandar o código, ele entra na
          correção da O.S.
        </span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Registrando…' : 'Confirmar e avisar o cliente'}
        </button>
      </div>
    </form>
  )
}

/* ==========================================================================
   O passo 1 — o valor combinado antes de existir orçamento
   ========================================================================== */
function FormularioDoCombinado({
  painel,
  aoSalvar,
}: {
  painel: PainelDaOrdem
  aoSalvar: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarCombinado, inicial)

  useEffect(() => {
    if (estado.ok) aoSalvar()
  }, [estado, aoSalvar])

  return (
    <form action={acao} className={estilo.janelaForm}>
      <input type="hidden" name="ordemId" value={painel.dossie.id} />

      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <p className={estilo.texto}>
        O que foi acertado no telefone, antes de o aparelho chegar na bancada — a taxa de retirada,
        a avaliação, o deslocamento. <strong>Não é o orçamento do conserto</strong>, que nasce
        depois do laudo e continua tendo tela própria.
      </p>

      <div className={estilo.janelaGrade}>
        <label className={estilo.rotulo}>
          Valor combinado
          <input
            className={estilo.campo}
            name="valor"
            inputMode="decimal"
            autoComplete="off"
            placeholder="250,00"
            defaultValue={
              painel.valorPrevioCentavos === null
                ? ''
                : (painel.valorPrevioCentavos / 100).toFixed(2).replace('.', ',')
            }
          />
          <span className={estilo.dica}>Em branco = não foi combinado nada.</span>
        </label>
        <label className={estilo.rotulo}>
          O que está incluso
          <input
            className={estilo.campo}
            name="condicao"
            defaultValue={painel.condicaoCombinada ?? ''}
            placeholder="Retirada e avaliação, abatidos no conserto"
            maxLength={200}
          />
        </label>
      </div>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

/* ==========================================================================
   O resumo — o que o telefone pergunta, sempre à vista
   ========================================================================== */
function Resumo({ painel }: { painel: PainelDaOrdem }) {
  const d = painel.dossie
  const fotosDeEntrada = d.fotos.filter((f) => f.categoria === 'RECEBIMENTO').length

  return (
    <div className={estilo.osResumo}>
      <Dado rot="Cliente" val={`${d.cliente.nome}${painel.contatoNome ? ` · ${painel.contatoNome}` : ''}`} />
      <Dado
        rot="Aparelho"
        val={`${d.equipamento.marca} ${d.equipamento.modelo}${
          d.equipamento.numeroSerie ? ` · série ${d.equipamento.numeroSerie}` : ''
        }`}
      />
      <Dado rot="Defeito relatado" val={painel.defeitoRelatado} />
      {painel.diagnostico ? <Dado rot="Laudo do técnico" val={painel.diagnostico} /> : null}
      <Dado rot="Técnico" val={d.tecnico ?? 'sem técnico'} />
      <Dado
        rot="Combinado na abertura"
        val={
          painel.valorPrevioCentavos === null
            ? 'nada combinado'
            : `${formatarBRL(painel.valorPrevioCentavos)}${
                painel.condicaoCombinada ? ` · ${painel.condicaoCombinada}` : ''
              }`
        }
      />
      {d.orcamento ? (
        <Dado
          rot={`Orçamento #${d.orcamento.numero}`}
          val={`${formatarBRL(d.orcamento.totalCentavos)} · ${d.orcamento.status.toLowerCase()}`}
        />
      ) : null}
      {d.fatura ? (
        <Dado
          rot={`Fatura #${d.fatura.numero}`}
          val={`${formatarBRL(d.fatura.valorTotalCentavos)} · ${
            d.fatura.emAbertoCentavos > 0
              ? `${formatarBRL(d.fatura.emAbertoCentavos)} em aberto`
              : 'quitada'
          }`}
        />
      ) : null}
      {painel.viaCorreio ? (
        <Dado rot="Envio do cliente" val={painel.codigoRastreio ?? 'sem código de rastreio'} />
      ) : null}
      <Dado
        rot="Provas"
        val={`${fotosDeEntrada} foto(s) de entrada · ${d.assinaturas.length} assinatura(s) · ${d.documentos.length} documento(s)`}
      />
    </div>
  )
}

function Dado({ rot, val }: { rot: string; val: string }) {
  return (
    <div className={estilo.osDado}>
      <span className={estilo.osDadoRot}>{rot}</span>
      <span className={estilo.osDadoVal}>{val}</span>
    </div>
  )
}

/** Data e hora no fuso da casa — o navegador de quem abre pode estar em outro. */
function quando(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
