'use client'

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState } from 'react'
import { formatarBRL } from '@/lib/dinheiro'
import { linkDeWhatsapp } from '@/lib/telefone'
import { avancar, editarOrdem } from '@/server/acoes/ordem'
import {
  declararSemPeca,
  lancarPecaDaOrdem,
  marcarComoEnvioDoCliente,
  painelDaOrdem,
  salvarCombinado,
  type PainelDaOrdem,
} from '@/server/acoes/assistente'
import { emitir, receber } from '@/server/acoes/financeiro'
import { atribuirMotorista, remarcarParada } from '@/server/acoes/agenda'
import { FormularioDaParada } from './[id]/agendar-parada'
import Diagnostico from './[id]/diagnostico'
import Responsavel from './[id]/responsavel'
import Orcamento from './[id]/orcamento'
import Cancelar from './[id]/cancelar'
import Excluir from './[id]/excluir'
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

type ChaveDeAba = 'agora' | 'ordem' | 'cliente' | 'historia'

const ABAS: Array<{ chave: ChaveDeAba; rotulo: string }> = [
  { chave: 'agora', rotulo: 'O passo a passo' },
  { chave: 'ordem', rotulo: 'A ordem' },
  { chave: 'cliente', rotulo: 'O cliente' },
  { chave: 'historia', rotulo: 'O que já aconteceu' },
]

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
  /**
   * A FASE QUE A PESSOA ABRIU COM O DEDO.
   *
   * `null` quer dizer "a que está acontecendo" — e é assim que a janela abre,
   * sempre. Quem chega na janela quer o trabalho de agora, não a fase que
   * estava aberta da última vez. Clicar numa outra fase é uma visita: mostra o
   * que acontece lá e quando aconteceu, e o botão de voltar traz de volta para
   * o que fazer agora.
   */
  const [faseAberta, setFaseAberta] = useState<number | null>(null)

  /**
   * A ABA ABERTA. Começa sempre em 'agora'.
   *
   * Não fica na URL de propósito: a janela é estado da lista, não uma rota, e
   * gravar a aba no endereço faria "voltar" no navegador significar "aba
   * anterior" em vez de "fechar a janela" — que é o que o botão voltar precisa
   * fazer aqui.
   */
  const [aba, setAba] = useState<ChaveDeAba>('agora')

  /* O estado da AÇÃO. Ver a nota nas props de `Agora`: ele mora aqui para o
     botão grande poder morar no rodapé, sempre no mesmo canto. */
  const [observacao, setObservacao] = useState('')
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  /* Depois de despachar, a janela mostra o que aconteceu antes de sair para a
     rota ao vivo — "depois de despachar vem para essa tela". Sair na hora, sem
     dizer nada, faria a janela fechar sozinha e parecer um engano. */
  const [despachou, setDespachou] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  /**
   * O ELEMENTO QUE ROLA É O CORPO, NÃO A JANELA.
   *
   * `caixa` aponta para `.janela`, que tem `max-height` e `display:flex` e não
   * rola nada — quem tem `overflow-y:auto` é `.janelaCorpo`. Mandar
   * `scrollTo` na janela não dá erro, não avisa e não faz nada, que é o pior
   * dos três. A tira de localização mora no fim do corpo e troca o que está
   * desenhado no começo dele, então este ref é o que faz o clique lá embaixo
   * levar o olho até a resposta lá em cima.
   */
  const corpo = useRef<HTMLDivElement>(null)
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

  /**
   * A JANELA SE ATUALIZA SOZINHA ENQUANTO ESTIVER ABERTA.
   *
   * O pedido: *"quando o motorista aceita a retirada, aqui atualiza sozinho"*.
   * Sem isto, a tela mostrava o estado do instante em que foi aberta — a
   * central ficava olhando "esperando ele aceitar" com o motorista já a
   * caminho, e só descobria fechando e abrindo de novo.
   *
   * Vinte segundos, e só com a janela aberta: é uma consulta por ordem sendo
   * olhada, não uma por ordem existente. Fechou a janela, para.
   *
   * `document.hidden` corta a aba esquecida em segundo plano — o navegador que
   * fica a tarde inteira numa aba oculta não tem por que consultar o banco.
   */
  useEffect(() => {
    const relogio = setInterval(() => {
      if (!document.hidden) void recarregar()
    }, 20_000)
    return () => clearInterval(relogio)
  }, [recarregar])

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
    // A ordem andou: a fase visitada perde o sentido, e a janela volta para a
    // fase de agora — que pode inclusive ser outra, se este passo virou a
    // página do processo.
    setFaseAberta(null)
    void recarregar()
    router.refresh()
  }, [recarregar, router])

  const d = p?.dossie ?? null
  /**
   * A fase que está na tela: a que a pessoa abriu, ou a de agora quando ela
   * não abriu nenhuma. Uma conta só, num lugar só — os três botões, a régua de
   * dentro e o painel de baixo precisam concordar sobre qual fase é essa.
   */
  const faseVendo = faseAberta ?? p?.roteiro.faseAtual ?? 1

  const executar = useCallback(
    (para: PainelDaOrdem['passos'][number]['para']) => {
      if (!d) return
      setErroAcao(null)
      iniciar(async () => {
        const r = await avancar({ ordemId: d.id, para, observacao: observacao.trim() || undefined })
        if (!r.ok) {
          setErroAcao(r.motivo)
          return
        }
        setObservacao('')
        await recarregar()
        router.refresh()
      })
    },
    [d, observacao, recarregar, router],
  )

  /* =====================================================================
     A AÇÃO PRINCIPAL DESTE MOMENTO — uma só, e sempre no mesmo canto
     =====================================================================
     O dono mandou o print do outro sistema dele: rodapé igual em todo passo,
     "‹ Voltar" na esquerda e o botão grande na direita.

     Aqui há uma diferença de natureza que o botão precisa respeitar, e é a
     razão de ele não ser só um "Avançar" fixo: naquele fluxo a pessoa preenche
     os três passos numa sentada, então o próximo passo é sempre DELA. Na O.S.
     o passo 5 é do MOTORISTA, no aplicativo dele — e um botão que promete
     avançar o que não é seu só sabe dar erro.

     Então o botão tem três feitios:

       DESPACHAR   quando o passo pede parada de rota. É a palavra do dono:
                   "despachar (que será enviar para o motorista)".
       o VERBO     quando o passo é de quem está olhando. Sai o título do
                   próprio passo, que já é escrito em voz de comando.
       QUEM ESPERA quando não é dele. Desligado, dizendo de quem é a vez —
                   que é informação, e botão cinza sem explicação não é.
     ===================================================================== */
  const escolhendoComoVem =
    d?.etapa === 'ORDEM_RETIRADA_GERADA' && (p?.passos.some((x) => x.pedeParada === 'RETIRADA') ?? false)
  const primeiro = p?.passos[0] ?? null
  const acaoPrincipal: {
    rotulo: string
    aoTocar?: () => void
    desligado?: boolean
    nota?: string
  } | null = !p
    ? null
    : escolhendoComoVem
      ? { rotulo: 'Despachar ›', aoTocar: () => setModo({ tela: 'parada' }) }
      : primeiro
        ? primeiro.pedeParada
          ? { rotulo: 'Despachar ›', aoTocar: () => setModo({ tela: 'parada' }) }
          : { rotulo: primeiro.titulo, aoTocar: () => executar(primeiro.para) }
        : {
            rotulo: 'Esperando',
            desligado: true,
            nota:
              d?.etapa === 'ORCAMENTO_ENVIADO'
                ? 'o cliente responder'
                : (p.roteiro.passos.find((x) => x.n === p.roteiro.atual)?.quem ?? 'outra pessoa da equipe'),
          }

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
          {/* A O.S. EM PDF FICA NO CABEÇALHO, e não no rodapé.
              Ela nasceu no rodapé, junto de "o que o cliente vê" — e lá ela
              não existia: o corpo desta janela é longo, e o rodapé só aparece
              para quem rola até o fim. Quem está com o cliente no telefone não
              rola nada, e disse, com razão, que o botão não tinha aparecido.

              Aqui ele está sempre à vista, na faixa que não sai da tela — que
              é o único lugar onde um botão de "me manda a O.S." serve. */}
          {p ? (
            <a
              href={`/painel/ordens/${d!.id}/os.pdf`}
              target="_blank"
              rel="noreferrer"
              className={estilo.btnPrimario}
            >
              O.S. em PDF
            </a>
          ) : null}
          <button type="button" className={estilo.janelaX} onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div ref={corpo} className={estilo.janelaCorpo}>
          {erro ? (
            <p className={estilo.erro} role="alert">
              {erro}
            </p>
          ) : null}

          {!p ? (
            <p className={estilo.texto}>Carregando…</p>
          ) : (
            <>
              {/* ---------------------------------------------------------------
                  AS ABAS DA JANELA
                  ---------------------------------------------------------------
                  A janela nasceu com uma coisa só: o passo a passo. Isso estava
                  certo — o pedido era "de forma fácil, tipo um passo a passo" —
                  e continua sendo o que ela abre. O que faltava era o resto: a
                  ficha da ordem e a do cliente moravam em telas separadas, e
                  perguntar "esse cliente já teve problema antes?" no meio de uma
                  retirada custava sair da janela e perder o lugar.

                  Quatro abas, e a ordem delas é a ordem da conversa: o que fazer
                  AGORA, a ORDEM inteira, o CLIENTE por trás dela, e o que já
                  ACONTECEU. A primeira é a que abre — trabalhar continua sendo o
                  motivo de a janela existir. */}
              {/* =========================================================
                  O CONTRATO DE `role="tab"` É COMPLETO, OU NÃO SE DECLARA
                  =========================================================
                  Estes botões diziam `role="tab"` dentro de `role="tablist"`
                  e paravam aí: sem `aria-controls`, sem `role="tabpanel"` no
                  conteúdo, sem setas e com os quatro no caminho do Tab.

                  Declarar o papel e não cumprir o contrato é PIOR que usar
                  botão comum: o leitor de tela anuncia "aba, selecionada, 1 de
                  4" e promete à pessoa um modelo de teclado — setas para
                  trocar, Tab para entrar no painel — que a tela não tem. Ela
                  aperta a seta, nada acontece, e conclui que o sistema está
                  quebrado.

                  As outras telas da casa não caem nisso porque não prometem:
                  estoque, financeiro, comercial e calendário usam `<Link>` com
                  `aria-current="page"`, que é navegação de verdade. Esta
                  janela é o único lugar que troca conteúdo no lugar — e agora
                  cumpre o que anuncia: id em cada aba, `aria-controls`
                  apontando o painel, roving tabindex (só a selecionada no Tab)
                  e as setas andando entre elas.

                  É o mesmo desenho do seletor de tema do aplicativo de campo,
                  que já fazia isso certo para um `radiogroup`. */}
              <div className={estilo.osAbas} role="tablist" aria-label="Seções da O.S.">
                {ABAS.map((a) => (
                  <button
                    key={a.chave}
                    id={`osaba-${a.chave}`}
                    type="button"
                    role="tab"
                    aria-selected={aba === a.chave}
                    aria-controls={`ospainel-${a.chave}`}
                    tabIndex={aba === a.chave ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                      e.preventDefault()
                      const i = ABAS.findIndex((x) => x.chave === aba)
                      const passo = e.key === 'ArrowRight' ? 1 : -1
                      const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length]!
                      setAba(proxima.chave)
                      // O foco acompanha a seleção: num tablist, a seta MOVE o
                      // foco. Sem isto, a próxima seta partiria da aba antiga.
                      document.getElementById(`osaba-${proxima.chave}`)?.focus()
                    }}
                    className={aba === a.chave ? `${estilo.osAba} ${estilo.osAbaAtiva}` : estilo.osAba}
                    onClick={() => setAba(a.chave)}
                  >
                    {a.rotulo}
                    {a.chave === 'cliente' && p.cliente && p.cliente.outrasOrdens.length > 0 ? (
                      <span className={estilo.osAbaConta}>{p.cliente.outrasOrdens.length}</span>
                    ) : null}
                    {/* O contador só aparece quando conta alguma coisa. Um "0"
                        ao lado do nome da aba não informa nada e vira sujeira —
                        a própria aba já diz que a seção existe. */}
                    {a.chave === 'historia' && p.roteiro.passos.some((x) => x.quando) ? (
                      <span className={estilo.osAbaConta}>
                        {p.roteiro.passos.filter((x) => x.quando).length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              <div
                role="tabpanel"
                id="ospainel-agora"
                aria-labelledby="osaba-agora"
                hidden={aba !== 'agora'}
              >
              {aba === 'agora' ? (
                <>
                  {/* -------------------------------------------------------
                      O TRABALHO VEM PRIMEIRO, E A LOCALIZAÇÃO VEM DEPOIS
                      -------------------------------------------------------
                      Esta ordem era o contrário, e era o defeito que o dono
                      apontou com todas as letras: *"ainda a O.S. tá cheio de
                      campos, muito confuso"*.

                      Medido na tela de 1440×1100, com a janela aberta na O.S.
                      #0001: a frase que diz o que está acontecendo começava a
                      795px do topo da janela — abaixo da dobra num notebook. E
                      antes dela havia VINTE E TRÊS números para atravessar,
                      porque a mesma posição estava escrita três vezes seguidas,
                      em três contagens diferentes:

                          cartões de fase → "3 de 6 passos"
                          régua           → "Passo 4 de 11 · Dia e motorista" · 30%
                          painel de agora → "Fase 1 · Buscar o aparelho · passo 4 de 11 · Dia e motorista"

                      Nenhuma das três está errada. O erro é ler as três antes
                      de chegar no campo que se veio preencher.

                      A pergunta "o que eu faço agora" é feita TODA vez que a
                      janela abre. A pergunta "em que pé está" é feita de vez em
                      quando. Quem responde a rara primeiro está cobrando um
                      pedágio de 795px na pergunta frequente — então o painel de
                      agora sobe para debaixo das abas, e as fases e a régua
                      descem para logo abaixo dele.

                      Elas não sumiram, e não deviam: visitar a fase 3 para ver
                      o que ainda vem é trabalho real da central com o cliente
                      no telefone. O que mudou é que a localização deixou de ser
                      pedágio e virou o que sempre foi — uma consulta. */}

                  {despachou ? (
                    <div className={estilo.osDespachado} role="status">
                      <p className={estilo.osDespachadoTitulo}>{despachou}</p>
                      <p className={estilo.texto}>
                        Daqui para frente quem anda a ordem é ele: aceita a corrida, sai, tira as
                        fotos e colhe a assinatura no celular. Esta tela acompanha sozinha.
                      </p>
                      <div className={estilo.acoesForm}>
                        <button
                          type="button"
                          className={estilo.btn}
                          onClick={() => router.push('/painel/rota/ao-vivo')}
                        >
                          Ver na rota ao vivo ›
                        </button>
                        <button
                          type="button"
                          className={estilo.btnSec}
                          onClick={() => setDespachou(null)}
                        >
                          Continuar nesta O.S.
                        </button>
                      </div>
                    </div>
                  ) : null}

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
                        /* ===== DEPOIS DE DESPACHAR, A ROTA AO VIVO =========
                           Pedido do dono, com print: "depois de despachar vem
                           para essa tela" — a dele se chama "Entregas e
                           Retiradas"; a nossa é `/painel/rota/ao-vivo`, e já
                           existia.

                           Ela NÃO é aberta na hora. Primeiro a janela diz o
                           que aconteceu e para quem foi; sair no mesmo
                           instante faria a janela fechar sozinha logo depois
                           de um clique, que é indistinguível de um engano.
                           Dito isso, o botão grande passa a ser o caminho. */
                        aoMarcar={async () => {
                          await andou()
                          setDespachou('Despachado. A parada já está no aplicativo do motorista.')
                        }}
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
                  ) : faseVendo !== p.roteiro.faseAtual ? (
                    /* A pessoa foi olhar outra fase. Ela lê o que acontece lá e
                       quando aconteceu; o que ela não encontra é botão que ande
                       a esteira — não porque a tela esconda, mas porque a
                       máquina de estados não aceita passo fora de ordem, e um
                       botão que só sabe dar erro é pior que botão nenhum. */
                    <FaseVisitada
                      painel={p}
                      n={faseVendo}
                      aoVoltar={() => setFaseAberta(null)}
                    />
                  ) : (
                    <Agora
                      painel={p}
                      aoAndar={andou}
                      aoMarcarParada={() => setModo({ tela: 'parada' })}
                      aoEscolherEnvio={() => setModo({ tela: 'envio' })}
                      aoCombinar={() => setModo({ tela: 'combinado' })}
                      observacao={observacao}
                      setObservacao={setObservacao}
                      erro={erroAcao}
                      pendente={pendente}
                      executar={executar}
                    />
                  )}

                  <AParadaDaRota painel={p} aoMudar={recarregar} />

                  {/* ----- A TIRA DE LOCALIZAÇÃO -------------------------
                      Daqui para baixo nada é trabalho: é o mapa. As três
                      fases respondem "o aparelho está vindo, está na bancada
                      ou está voltando", e a régua abre a fase em passos.

                      Clicar numa fase adiante continua abrindo a leitura dela
                      — e ela troca o corpo lá em cima, que é onde o olho está
                      depois do clique. Por isso o corpo rola para o topo
                      quando a fase muda: sem isso, a pessoa clicaria em "Fase
                      3" aqui embaixo e a resposta apareceria fora da tela,
                      atrás dela. */}
                  <Fases
                    painel={p}
                    aberta={faseVendo}
                    viva={p.roteiro.faseAtual}
                    aoAbrir={(n) => {
                      setEspiando(null)
                      setModo({ tela: 'agora' })
                      // Clicar na fase que já está aberta volta para a de
                      // agora: o botão é ida e volta, e não uma armadilha que
                      // deixa a pessoa presa olhando o futuro.
                      setFaseAberta(n === faseVendo && n !== p.roteiro.faseAtual ? null : n)
                      corpo.current?.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  />

                  <Regua
                    painel={p}
                    fase={faseVendo}
                    espiando={espiando}
                    aoEspiar={(n) => {
                      setEspiando((atual) => (atual === n ? null : n))
                      corpo.current?.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  />
                </>
              ) : null}
              </div>

              {/* Os três painéis só MONTAM quando abertos — o `hidden` é para
                  o leitor de tela e para o contrato do `aria-controls`, que
                  exige o elemento existir. Montar os quatro de uma vez faria a
                  janela buscar e desenhar três seções que ninguém pediu. */}
              <div role="tabpanel" id="ospainel-ordem" aria-labelledby="osaba-ordem" hidden={aba !== 'ordem'}>
                {aba === 'ordem' ? <AAbaDaOrdem painel={p} aoSalvar={recarregar} /> : null}
              </div>
              <div role="tabpanel" id="ospainel-cliente" aria-labelledby="osaba-cliente" hidden={aba !== 'cliente'}>
                {aba === 'cliente' ? <AAbaDoCliente painel={p} /> : null}
              </div>
              <div role="tabpanel" id="ospainel-historia" aria-labelledby="osaba-historia" hidden={aba !== 'historia'}>
                {aba === 'historia' ? <AAbaDaHistoria painel={p} /> : null}
              </div>

              {/* ==========================================================
                  O RODAPÉ FIXO — o "Avançar" mora sempre no mesmo canto
                  ==========================================================
                  O pedido veio com print do outro sistema do dono:

                    "PERCEBA QUE TUDO TEM O AVANCAR.... TELA POR TELA E SEM
                     SAIR DESSE POP UP"

                  Lá o rodapé é sempre igual: "‹ Voltar" na esquerda, o botão
                  grande da ação na direita. Não importa em que passo se está,
                  a mão vai ao mesmo lugar.

                  Aqui os botões de ação moravam DENTRO do painel de agora, a
                  uma altura diferente em cada passo — porque o texto acima
                  deles muda de tamanho. A cada passo a pessoa procurava o
                  botão de novo.

                  Agora ele é `position: sticky` no pé do corpo: rola junto até
                  encostar embaixo e fica. O painel de agora continua com o
                  texto, os campos e as escolhas; o que subiu para cá é só o
                  passo à frente.

                  "EDITAR" E "EXCLUIR" TAMBÉM ESTÃO AQUI, e não mais só dentro
                  da aba "A ordem" — *"preciso ter um lugar para editar e
                  excluir"*. Eles ficam na esquerda, pequenos, longe do botão
                  grande da direita: o polegar que vai ao "Avançar" não passa
                  por cima de "Excluir" no caminho. */}
              <div className={estilo.osRodape}>
                <div className={estilo.osRodapeEsq}>
                  {modo.tela !== 'agora' || espiando !== null || faseVendo !== p.roteiro.faseAtual ? (
                    <button
                      type="button"
                      className={estilo.osVoltarGrande}
                      onClick={() => {
                        setModo({ tela: 'agora' })
                        setEspiando(null)
                        setFaseAberta(null)
                        corpo.current?.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      ‹ Voltar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={estilo.osRodapeLink}
                        onClick={() => {
                          setAba('ordem')
                          corpo.current?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        Editar
                      </button>
                      {p.podeCancelar ? <Cancelar ordemId={d!.id} /> : null}
                      {p.podeExcluir ? <Excluir ordemId={d!.id} /> : null}
                    </>
                  )}
                </div>

                <div className={estilo.osRodapeDir}>
                  <a href={p.linkPortal} target="_blank" rel="noreferrer" className={estilo.osRodapeLink}>
                    O que o cliente vê
                  </a>
                  <Link href={`/painel/ordens/${d!.id}`} className={estilo.osRodapeLink}>
                    Ficha completa
                  </Link>

                  {/* ===== O BOTÃO GRANDE, sempre no mesmo canto =========
                      Ver a nota de `acaoPrincipal` lá em cima. Ele só não
                      aparece quando a pessoa está DENTRO de outra tela da
                      janela (marcando a parada, corrigindo, espiando um
                      passo) — ali quem manda é o formulário aberto, e dois
                      botões grandes disputando a mesma quina é pior que
                      nenhum. */}
                  {modo.tela === 'agora' &&
                  espiando === null &&
                  faseVendo === p.roteiro.faseAtual &&
                  aba === 'agora' &&
                  acaoPrincipal ? (
                    acaoPrincipal.desligado ? (
                      <span className={estilo.osEsperandoVez}>
                        Esperando <strong>{acaoPrincipal.nota}</strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={estilo.osAvancar}
                        disabled={pendente}
                        onClick={acaoPrincipal.aoTocar}
                      >
                        {pendente ? 'Um instante…' : acaoPrincipal.rotulo}
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   AS TRÊS FASES COMO PÍLULAS
   ==========================================================================
   O dono mandou o print do outro sistema dele e disse o que queria:

     "PERCEBA QUE TUDO TEM O AVANCAR.... TELA POR TELA E SEM SAIR DESSE POP UP"

   Lá são três pílulas ligadas por um fio — a cumprida clara com um ✓, a de
   agora sólida, a de adiante só contornada. É o mesmo mapa que estes botões já
   desenhavam; o que muda é o peso.

   Eles eram CARTÕES com oito informações cada: selo, "FASE 1", "você está
   aqui", nome, nome formal, situação por extenso, barrinha de progresso e
   "3 de 6 passos". Vinte e quatro pedaços de texto para responder uma pergunta
   de três respostas — o aparelho está vindo, está na bancada, ou está voltando.

   A COR CONTINUA SEM ANDAR SOZINHA. O ✓ ● ○ ! continua desenhado dentro da
   pílula e o `aria-label` continua dizendo o estado por extenso: cerca de um
   homem em cada doze não separa verde de vermelho, e a cor nunca foi a
   informação — é o atalho.

   O botão da fase adiante ABRE. Travar aqui não protegeria nada: quem impede a
   fase 2 de começar antes da 1 é a máquina de estados, e ela continua lá. O
   que a fase adiante não tem é botão que ande a esteira.
   ========================================================================== */
function Fases({
  painel,
  aberta,
  viva,
  aoAbrir,
}: {
  painel: PainelDaOrdem
  aberta: number
  viva: number
  aoAbrir: (n: number) => void
}) {
  const fases = painel.roteiro.fases
  return (
    <div className={estilo.osFases} role="tablist" aria-label="As três fases da O.S.">
      {fases.map((f, i) => (
        <Fragment key={f.n}>
          {/* O fio entre uma pílula e a próxima. Ele acende quando a fase
              ANTERIOR terminou — é o que dá a leitura de trilho andado. */}
          {i > 0 ? (
            <span
              aria-hidden="true"
              className={
                fases[i - 1]!.estado === 'concluida'
                  ? `${estilo.osFaseFio} ${estilo.osFaseFioFeito}`
                  : estilo.osFaseFio
              }
            />
          ) : null}
          <button
            id={`osfase-${f.n}`}
            type="button"
            role="tab"
            aria-selected={aberta === f.n}
            aria-controls="osfase-painel"
            /* O estado por extenso no rótulo do leitor de tela. A pílula mostra
               o ✓ e a cor; quem não vê nenhum dos dois ouve a frase inteira. */
            aria-label={`Fase ${f.n}, ${f.nome}: ${f.situacao}${f.n === viva ? ', é onde a ordem está' : ''}`}
            tabIndex={aberta === f.n ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const k = fases.findIndex((x) => x.n === aberta)
              const passo = e.key === 'ArrowRight' ? 1 : -1
              const proxima = fases[(k + passo + fases.length) % fases.length]!
              aoAbrir(proxima.n)
              document.getElementById(`osfase-${proxima.n}`)?.focus()
            }}
            className={[
              estilo.osFase,
              f.estado === 'concluida'
                ? estilo.osFaseFeita
                : f.estado === 'agora'
                  ? estilo.osFaseAgora
                  : f.estado === 'parada'
                    ? estilo.osFaseParada
                    : estilo.osFaseAdiante,
              aberta === f.n && f.n !== viva ? estilo.osFaseAberta : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => aoAbrir(f.n)}
          >
            <span className={estilo.osFaseSelo} aria-hidden="true">
              {f.estado === 'concluida' ? '✓' : f.estado === 'parada' ? '!' : f.estado === 'agora' ? '●' : ''}
            </span>
            {f.nome}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

/* ==========================================================================
   A LINHA DO TEMPO DA FASE — etapa por etapa, de cima para baixo
   ==========================================================================
   O dono mandou o print da janela do outro sistema dele e escreveu:

     "QUANDO CLICA NA TELA ABRE ASSIM ISSO QUE EU QUERO INDO ETAPA POR ETAPA"

   O que está no print é uma lista VERTICAL: um ponto cheio para o que já
   aconteceu, com a data embaixo; um ponto vazio para o que ainda vem. Lê-se de
   cima para baixo, como se lê qualquer coisa.

   Aqui era uma fileira HORIZONTAL de círculos numerados com o nome embaixo, e
   ela tinha três defeitos que o print resolve de graça:

     · o nome do passo cabia em duas palavras e quebrava em três linhas;
     · a data de quando aconteceu não cabia em canto nenhum — ficava só no
       `title`, que é o balão cinza do navegador, que não existe no celular;
     · e esse `title` era justamente o que competia com o clique: o dono
       clicava para ir ao passo e o que aparecia era o balão.

   O balão saiu. A data agora está escrita embaixo do nome, onde se lê.

   CLICAR CONTINUA LEVANDO AO PASSO, que foi o primeiro pedido dele:
   *"ao clicar em alguma dessas abas possa me jogar para a etapa"*. O clique
   troca o que está desenhado no corpo e rola para o topo — ver a nota no lugar
   onde a tira é montada.
   ========================================================================== */
function Regua({
  painel,
  fase,
  espiando,
  aoEspiar,
}: {
  painel: PainelDaOrdem
  fase: number
  espiando: number | null
  aoEspiar: (n: number) => void
}) {
  const r = painel.roteiro
  const daFase = r.fases.find((f) => f.n === fase)
  const passos = r.passos.filter((p) => daFase?.passos.includes(p.n))
  if (passos.length === 0) return null

  return (
    <div
      className={estilo.osLinha2}
      role="tabpanel"
      id="osfase-painel"
      aria-labelledby={`osfase-${fase}`}
    >
      <p className={estilo.osLinha2Titulo}>
        {fase === r.faseAtual ? 'Etapa por etapa' : `O que acontece na fase ${fase}`}
      </p>

      <ol className={estilo.osLinha2Lista}>
        {passos.map((n) => (
          <li key={n.n}>
            <button
              type="button"
              onClick={() => aoEspiar(n.n)}
              aria-pressed={espiando === n.n}
              aria-label={`Passo ${n.n}, ${n.nome}: ${
                n.estado === 'cumprido' ? 'já cumprido' : n.estado === 'agora' ? 'é onde a ordem está' : 'ainda não'
              }`}
              className={`${estilo.osLinha2No} ${
                n.estado === 'cumprido'
                  ? estilo.osLinha2Feito
                  : n.estado === 'agora'
                    ? estilo.osLinha2Agora
                    : estilo.osLinha2Adiante
              } ${espiando === n.n ? estilo.osLinha2Espiado : ''}`}
            >
              <span className={estilo.osLinha2Ponto} aria-hidden="true" />
              <span className={estilo.osLinha2Texto}>
                <span className={estilo.osLinha2Nome}>{n.nome}</span>
                {/* A DATA, ESCRITA. Antes ela só existia no balão do navegador,
                    que o celular não tem — e é a informação que se procura ao
                    olhar uma linha do tempo. */}
                {/* "AINDA NÃO" SÓ NO QUE AINDA NÃO ACONTECEU.
                    O primeiro desenho escrevia "ainda não" sempre que faltava
                    data, e passo cumprido nem sempre tem uma: o passo 1
                    (Orçamento) não tem etapa de máquina nenhuma, então nunca
                    ganha evento. A linha saía com o ponto VERDE e a palavra
                    "ainda não" embaixo — a peça se contradizendo em dois
                    centímetros. O estado manda; a data, quando existe,
                    acrescenta. */}
                <span className={estilo.osLinha2Quando}>
                  {n.quando
                    ? quando(n.quando)
                    : n.estado === 'cumprido'
                      ? 'cumprido'
                      : n.estado === 'agora'
                        ? 'acontecendo agora'
                        : 'ainda não'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ==========================================================================
   A FASE VISITADA — o que acontece numa fase que não é a de agora
   ==========================================================================
   Serve às duas visitas que a operação faz de verdade, e que são opostas:

   Para TRÁS, a pergunta é de conferência — "quando foi que o motorista trouxe?
   quem assinou?". Para FRENTE, é de expectativa — "depois disso, o que o
   cliente ainda vai ter que fazer?". As duas se respondem lendo, e nenhuma
   delas precisa de botão que ande a esteira.
   ========================================================================== */
function FaseVisitada({
  painel,
  n,
  aoVoltar,
}: {
  painel: PainelDaOrdem
  n: number
  aoVoltar: () => void
}) {
  const f = painel.roteiro.fases.find((x) => x.n === n)
  if (!f) return null
  const passos = painel.roteiro.passos.filter((p) => f.passos.includes(p.n))
  const daVez = painel.roteiro.fases.find((x) => x.n === painel.roteiro.faseAtual)

  return (
    <div className={estilo.osPainelLido}>
      <p className={estilo.osPainelTitulo}>
        Fase {f.n} · {f.nome}
        <span className={estilo.osPainelQuem}>{f.quem}</span>
      </p>
      <p className={estilo.texto}>{f.oQue}</p>

      <ul className={estilo.osFaseLista}>
        {passos.map((p) => (
          <li key={p.n} className={estilo.osFaseItem}>
            <span
              className={
                p.estado === 'cumprido'
                  ? estilo.osFaseItemFeito
                  : p.estado === 'agora'
                    ? estilo.osFaseItemAgora
                    : estilo.osFaseItemAdiante
              }
              aria-hidden="true"
            >
              {p.estado === 'cumprido' ? '✓' : p.estado === 'agora' ? '●' : '○'}
            </span>
            <span>
              <strong>{p.nome}</strong>
              <span className={estilo.osFaseItemQuando}>
                {p.quando
                  ? `${quando(p.quando)}${p.autor ? ` · ${p.autor}` : ''}`
                  : p.estado === 'cumprido'
                    ? 'já cumprido'
                    : 'ainda não'}
              </span>
              <span className={estilo.osFaseItemOque}>{p.oQue}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className={estilo.acoesForm}>
        <button type="button" className={estilo.btn} onClick={aoVoltar}>
          Voltar para o que fazer agora
          {daVez ? ` · fase ${daVez.n}, ${daVez.nome.toLowerCase()}` : ''}
        </button>
      </div>
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
  observacao,
  setObservacao,
  erro,
  pendente,
  executar,
}: {
  painel: PainelDaOrdem
  aoAndar: () => void
  aoMarcarParada: () => void
  aoEscolherEnvio: () => void
  aoCombinar: () => void
  /* ---------------------------------------------------------------------
     O ESTADO DA AÇÃO SUBIU PARA A JANELA, e não é arrumação: é o que permite
     o botão grande morar no rodapé.

     Antes, `observacao`, `pendente`, `erro` e `executar` viviam aqui dentro,
     e por isso o botão que os usa tinha de viver aqui também — a uma altura
     diferente em cada passo, porque o texto acima dele muda de tamanho. O
     pedido do dono, com print do outro sistema: "PERCEBA QUE TUDO TEM O
     AVANCAR... TELA POR TELA E SEM SAIR DESSE POP UP".

     Para o botão ficar sempre no mesmo canto, quem o desenha é a janela. Este
     painel continua dono do TEXTO e dos CAMPOS do passo; a ação é de fora.
     --------------------------------------------------------------------- */
  observacao: string
  setObservacao: (v: string) => void
  erro: string | null
  pendente: boolean
  executar: (para: PainelDaOrdem['passos'][number]['para']) => void
}) {
  const passoAtual = painel.roteiro.passos.find((x) => x.n === painel.roteiro.atual)
  const d = painel.dossie

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

  /**
   * A RETIRADA JÁ ESTÁ NA MÃO DE UM MOTORISTA.
   *
   * Duas coisas precisam ser verdade: a ordem está no passo de espera
   * (`RETIRADA_AGENDADA`) e existe uma parada de retirada com motorista
   * designado. Sem a segunda, a parada foi marcada e ninguém foi escolhido —
   * e aí a central TEM trabalho, que é escolher.
   */
  const comOMotorista =
    d.etapa === 'RETIRADA_AGENDADA'
      ? (painel.paradasMarcadas.find(
          (p) => p.tipo === 'RETIRADA' && p.motoristaId !== null && !p.fechada,
        ) ?? null)
      : null

  return (
    <div className={estilo.osPainel}>
      {/* O TÍTULO É O NOME DO PASSO, E SÓ.
          Ele dizia "Fase 1 · Buscar o aparelho · passo 4 de 11 · Dia e
          motorista" — que é, palavra por palavra, a soma do que os cartões de
          fase e a régua já diziam nas duas faixas acima. Três vezes a mesma
          posição, e a terceira era a que ficava colada no trabalho.

          Agora a contagem mora num lugar só, na tira lá embaixo, e este painel
          diz a única coisa que a outra não diz: o que fazer. Com uma exceção —
          quando a ordem sai do caminho, o desvio VEM no título, porque aí a
          posição deixa de ser localização e vira o assunto. */}
      <p className={estilo.osPainelTitulo}>
        {painel.roteiro.desvio ? (
          <>Fora do caminho · {painel.roteiro.desvio.rotulo}</>
        ) : (
          (passoAtual?.nome ?? 'Agora')
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
      ) : comOMotorista ? (
        /* ---------------------------------------------------------------
           O PASSO DO MOTORISTA NÃO PEDE CLIQUE DA CENTRAL.
           ---------------------------------------------------------------
           A frase do dono, olhando esta tela: *"o importante não é ser nada
           manual — quando o motorista aceita a retirada, aqui atualiza
           sozinho"*.

           Ele está certo, e o sistema já fazia a parte difícil: designar o
           motorista põe a parada em ATRIBUIDO, e é exatamente isso que o
           aplicativo dele lista. A corrida JÁ ESTÁ no celular do motorista
           antes de qualquer botão ser apertado aqui.

           O que a tela fazia era oferecer à central um botão que é DELE —
           "motorista saiu para a retirada" — como se ainda faltasse trabalho
           aqui. Daí a confusão: o passo parecia parado, e estava resolvido.

           Agora ele conta o que está acontecendo e espera. O botão continua
           existindo, porque o celular do motorista descarrega e ele liga
           avisando que saiu — mas como link discreto, que é o peso certo de
           uma exceção. */
        <div className={estilo.osEsperando}>
          <p className={estilo.texto}>
            <strong>Está no aplicativo de {comOMotorista.motorista}.</strong>{' '}
            {comOMotorista.aceitoEm
              ? `Ele aceitou a corrida em ${comOMotorista.aceitoEm}. Quando sair, esta tela anda sozinha.`
              : 'Assim que ele aceitar e sair, esta tela anda sozinha — e o cliente é avisado no link que recebeu.'}
          </p>
          {/* A OBSERVAÇÃO CONTINUA AQUI, e continua opcional.
              Ela some de qualquer tela onde não haja ação, e não devia: é onde
              se anota "o cliente pediu para ir depois das 14h" no minuto em que
              a informação chega, sem ter de abrir outra coisa. */}
          <label className={estilo.rotulo}>
            Observação (opcional)
            <input
              className={estilo.campo}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Fica registrada na linha do tempo, junto do seu nome"
              disabled={pendente}
            />
            <span className={estilo.dica}>
              Ela entra na linha do tempo quando o passo andar — pelo motorista, no aplicativo
              dele, ou pelo link abaixo.
            </span>
          </label>

          {painel.passos
            .filter((x) => x.para === 'EM_ROTA_RETIRADA')
            .map((x) => (
              <button
                key={x.para}
                type="button"
                className={estilo.osLinkBaixo}
                disabled={pendente}
                onClick={() => executar(x.para)}
              >
                O motorista saiu e não apertou no aplicativo? Marcar aqui
              </button>
            ))}
        </div>
      ) : (
        <>
          {/* A FILA DE BOTÕES SAIU DAQUI. O primeiro passo virou o botão
              grande do rodapé; os outros, quando existem, ficam como escolha
              secundária logo abaixo — nunca com o mesmo peso do principal. */}
          {painel.passos.length > 1 ? (
            <div className={estilo.acoesForm}>
              {painel.passos.slice(1).map((x) => (
                <button
                  key={x.para}
                  type="button"
                  className={estilo.btnSec}
                  disabled={pendente}
                  onClick={() => (x.pedeParada ? aoMarcarParada() : executar(x.para))}
                >
                  {x.titulo}
                  {x.avisaCliente && !x.pedeParada ? ' · avisa o cliente' : ''}
                </button>
              ))}
            </div>
          ) : null}

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

      {/* -------------------------------------------------------------------
          O PASSO 7 — laudo, responsável e orçamento, aqui dentro
          -------------------------------------------------------------------
          A janela conduzia os onze passos e sabia executar dois: a peça (8) e o
          pagamento (9). O 7 — que é onde a O.S. passa mais tempo — mandava a
          pessoa fechar a janela, abrir a ficha longa e rolar até o bloco. Ela
          lia "o técnico escreve o laudo e a gestão manda o orçamento" e não
          tinha onde escrever nem um nem outro.

          São os MESMOS componentes da ficha, com os mesmos servidores por trás.
          Não há segunda versão do laudo para divergir da primeira. */}
      {painel.laudo && painel.responsavel ? (
        <div className={estilo.osPasso7}>
          <details className={estilo.osDobra} open={!painel.laudo.diagnostico}>
            <summary className={estilo.osDobraTitulo}>
              O laudo do técnico
              {painel.laudo.diagnostico ? (
                <span className={estilo.osDobraOk}>escrito</span>
              ) : (
                <span className={estilo.osDobraFalta}>falta</span>
              )}
            </summary>
            <Diagnostico
              ordemId={d.id}
              diagnostico={painel.laudo.diagnostico}
              parecerTecnico={painel.laudo.parecerTecnico}
              servicoExecutado={painel.laudo.servicoExecutado}
              testesFinais={painel.laudo.testesFinais}
              jaExecutou={painel.laudo.jaExecutou}
              proximoPasso={painel.passos[0]?.titulo ?? null}
              aoSalvar={aoAndar}
            />
          </details>

          <details className={estilo.osDobra}>
            <summary className={estilo.osDobraTitulo}>
              Técnico e prazo
              <span className={estilo.osDobraOk}>
                {painel.dossie.tecnico ?? 'ninguém ainda'}
              </span>
            </summary>
            <Responsavel
              ordemId={d.id}
              tecnicoAtualId={painel.responsavel.tecnicoAtualId}
              prazoPrometido={painel.responsavel.prazoPrometido}
              prioridade={painel.prioridade}
              tecnicos={painel.responsavel.tecnicos}
              aoSalvar={aoAndar}
            />
          </details>
        </div>
      ) : null}

      {painel.orcamento ? (
        <div className={estilo.osPasso7}>
          <Orcamento
            ordemId={d.id}
            etapa={d.etapa}
            papel={painel.meuPapel}
            orcamentos={painel.orcamento.versoes}
            pecas={painel.orcamento.pecas}
            aoMudar={aoAndar}
          />
        </div>
      ) : null}

      {/* O PASSO 8 e o PASSO 9 aparecem DENTRO do painel do agora, e não como
          uma tela à parte, porque eles não são um desvio do passo: eles SÃO o
          passo. Lançar a peça é o que falta para concluir a manutenção, e
          emitir a fatura é o que falta para o aparelho poder sair. */}
      {d.etapa === 'EM_MANUTENCAO' ? <OQueSaiuDoEstoque painel={painel} aoMudar={aoAndar} /> : null}
      {d.etapa === 'FATURAMENTO' || d.etapa === 'APROVACAO_GESTAO' ? (
        <OPagamento painel={painel} aoMudar={aoAndar} />
      ) : null}

      {/* O PASSO 1, QUANDO ELE FOI UM ORÇAMENTO DE VERDADE.
          Antes desta peça, o passo 1 era uma anotação de valor dentro da
          própria ordem, e a esteira parecia começar do nada. Agora, quando a
          ordem nasceu de um orçamento aprovado, a janela diz de onde ela veio —
          com o nome de quem aprovou e o dia. É a resposta a "quem autorizou
          isso?", que aparece três semanas depois, no telefone. */}
      {painel.propostaOrigem ? (
        <Link
          href="/painel/contatos?aba=orcamentos"
          className={estilo.osLinkBaixo}
        >
          Veio do orçamento #{String(painel.propostaOrigem.numero).padStart(4, '0')} ·{' '}
          {formatarBRL(painel.propostaOrigem.totalCentavos)}
          {painel.propostaOrigem.aprovadaPorNome
            ? ` · aprovado por ${painel.propostaOrigem.aprovadaPorNome}`
            : ''}
          {painel.propostaOrigem.aprovadaEm ? ` em ${painel.propostaOrigem.aprovadaEm}` : ''}
        </Link>
      ) : null}

      {/* O passo 1 é o único que não anda a esteira: ele guarda o que foi
          combinado antes de a ordem existir. Fica aqui embaixo, discreto, e
          disponível o tempo todo — a pergunta "quanto ficou combinado?" volta
          semanas depois, no meio de qualquer etapa. */}
      {painel.podeCombinar && !painel.propostaOrigem ? (
        <button type="button" className={estilo.osLinkBaixo} onClick={aoCombinar}>
          {painel.valorPrevioCentavos === null
            ? 'Registrar o que foi combinado com o cliente'
            : `Combinado: ${formatarBRL(painel.valorPrevioCentavos)} — alterar`}
        </button>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   O PASSO 8 — o que saiu da prateleira neste serviço
   ==========================================================================
   A peça do orçamento já é reservada na aprovação e baixada quando a manutenção
   começa. O que derruba a contagem do estoque é a OUTRA: o técnico abre o
   aparelho, descobre que o fusível também foi, pega um da gaveta e fecha. Não
   havia item de orçamento, então não houve reserva, então não houve baixa — e o
   sistema segue dizendo que o fusível está na prateleira.

   Por isso a pergunta é feita aqui, com duas saídas e nenhuma terceira: lançar
   a peça, ou dizer que não usou. O motor recusa a conclusão enquanto nenhuma
   das duas tiver acontecido.
   ========================================================================== */
function OQueSaiuDoEstoque({
  painel,
  aoMudar,
}: {
  painel: PainelDaOrdem
  aoMudar: () => void
}) {
  const [estado, acao, pendente] = useActionState(lancarPecaDaOrdem, inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [declarando, iniciar] = useTransition()
  /**
   * O FORMULÁRIO FECHA SOZINHO QUANDO A PEÇA ENTRA — sem efeito nenhum.
   *
   * Guardamos QUANTAS peças havia no instante em que ele foi aberto. Assim que
   * o painel recarrega com uma peça a mais, a conta deixa de bater e o
   * formulário se fecha, com os campos limpos por ter sido desmontado.
   *
   * Fechar dentro de um `useEffect` seria mexer em estado durante o efeito —
   * uma segunda pintura em cascata — e o lint da casa recusa, com razão.
   */
  const [abertoEm, setAbertoEm] = useState<number | null>(null)
  const abrindo = abertoEm !== null && abertoEm === painel.pecasLancadas.length

  useEffect(() => {
    if (estado.ok) aoMudar()
  }, [estado, aoMudar])

  if (!painel.podeLancarPeca) return null

  const jaLancou = painel.pecasLancadas.length > 0
  const respondido = jaLancou || painel.semPecaDeclaradoEm !== null

  return (
    <div className={estilo.osEtapaBloco}>
      <p className={estilo.osEtapaTitulo}>
        O que saiu do estoque
        {respondido ? (
          <span className={`${estilo.tag} ${estilo.tagOk}`}>respondido</span>
        ) : (
          <span className={`${estilo.tag} ${estilo.tagEspera}`}>falta responder</span>
        )}
      </p>

      {jaLancou ? (
        <ul className={estilo.osPecas}>
          {painel.pecasLancadas.map((x) => (
            <li key={x.id}>
              {/* A FOTO DA PEÇA, do catálogo do estoque.
                  "Fonte chaveada 24V" não diz se é a peça que está na mão do
                  técnico — e a hora de descobrir que saiu a errada não pode ser
                  com o aparelho montado. A imagem já existia no cadastro do
                  estoque e nunca tinha chegado até aqui.

                  Só aparece quando existe: `<img>` apontando para foto que não
                  está lá vira ícone quebrado, que é pior que espaço vazio. */}
              {/* A rota do catálogo já devolve a imagem no tamanho certo e
                  confere a empresa; otimizar de novo pelo next/image só
                  acrescentaria um salto de servidor. */}
              {x.temFoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={estilo.pecaFoto}
                  src={`/api/catalogo/peca/${x.pecaId}`}
                  alt={`Foto de ${x.nome}`}
                  loading="lazy"
                />
              ) : (
                <span className={estilo.pecaSemFoto} aria-hidden />
              )}
              <span className={estilo.pecaTexto}>
                <strong>
                  {x.quantidade}× {x.nome}
                </strong>
                <span className={estilo.fraco}>
                  {x.sku} · {x.quem ?? 'sem autor'} · {quando(x.quando)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : painel.semPecaDeclaradoEm ? (
        <p className={estilo.texto}>
          Nenhuma peça usada — declarado por{' '}
          <strong>{painel.semPecaDeclaradoPorNome ?? 'alguém'}</strong> em{' '}
          {quando(painel.semPecaDeclaradoEm)}.
        </p>
      ) : (
        <p className={estilo.texto}>
          Este serviço usou peça? A manutenção não fecha sem a resposta — depois
          daqui a ordem vai para a gestão e para a rua, e a peça que não for
          lançada não vai ser lançada nunca.
        </p>
      )}

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}
      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      {abrindo ? (
        <form action={acao} className={estilo.janelaForm}>
          <input type="hidden" name="ordemId" value={painel.dossie.id} />
          <div className={estilo.janelaGrade}>
            <label className={estilo.rotulo}>
              Peça
              <select className={estilo.selecao} name="pecaId" required defaultValue="">
                <option value="" disabled>
                  Escolha…
                </option>
                {painel.catalogoDePecas.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.sku} · {x.nome} ({x.livre} livre)
                  </option>
                ))}
              </select>
              {painel.catalogoDePecas.length === 0 ? (
                <span className={estilo.dica}>
                  Nenhuma peça ativa no catálogo. Cadastre em Estoque para poder lançar.
                </span>
              ) : null}
            </label>
            <label className={estilo.rotulo}>
              Quantidade
              <input
                className={estilo.campo}
                name="quantidade"
                type="number"
                min="0.001"
                step="0.001"
                defaultValue="1"
                required
              />
            </label>
          </div>
          <label className={estilo.rotulo}>
            Observação (opcional)
            <input
              className={estilo.campo}
              name="observacao"
              maxLength={200}
              placeholder="Fusível queimado junto com a fonte"
            />
          </label>
          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Lançando…' : 'Baixar do estoque'}
            </button>
            <button
              type="button"
              className={estilo.btnSec}
              onClick={() => setAbertoEm(null)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className={estilo.acoesForm}>
          <button type="button" className={estilo.btn} onClick={() => setAbertoEm(painel.pecasLancadas.length)}>
            {jaLancou ? 'Lançar outra peça' : 'Lançar peça do estoque'}
          </button>
          {/* A declaração só é oferecida enquanto nada saiu: com peça baixada,
              dizer "não usei" deixaria a ordem com duas respostas opostas — e o
              servidor recusa de qualquer jeito. */}
          {!jaLancou && !painel.semPecaDeclaradoEm ? (
            <button
              type="button"
              className={estilo.btnSec}
              disabled={declarando}
              onClick={() => {
                setErro(null)
                iniciar(async () => {
                  const r = await declararSemPeca(painel.dossie.id)
                  if (!r.ok) setErro(r.motivo)
                  else aoMudar()
                })
              }}
            >
              {declarando ? 'Registrando…' : 'Não usei peça nenhuma'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   O PASSO 9 — o pagamento
   ==========================================================================
   Era o passo que obrigava a sair da ordem: emitir a fatura e dar baixa moram
   no Financeiro, e quem estava com o cliente ao telefone tinha de decorar o
   número da O.S., abrir outra tela e achar a fatura na lista.

   Aqui estão as duas coisas que esse passo é: marcar QUANDO vence e registrar
   QUANDO entrou. O Financeiro continua sendo a casa do dinheiro — parcelamento,
   estorno, multa e juros vivem lá, e o botão leva até eles.
   ========================================================================== */
const FORMAS: Array<[string, string]> = [
  ['PIX', 'Pix'],
  ['DINHEIRO', 'Dinheiro'],
  ['CARTAO_CREDITO', 'Cartão de crédito'],
  ['CARTAO_DEBITO', 'Cartão de débito'],
  ['BOLETO', 'Boleto'],
  ['TRANSFERENCIA', 'Transferência'],
  ['CHEQUE', 'Cheque'],
]

function OPagamento({ painel, aoMudar }: { painel: PainelDaOrdem; aoMudar: () => void }) {
  const [estado, acao, pendente] = useActionState(receber, inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [emitindo, iniciar] = useTransition()
  const [vencimento, setVencimento] = useState('')
  const [forma, setForma] = useState('PIX')
  const [valor, setValor] = useState('')
  const f = painel.dossie.fatura

  useEffect(() => {
    if (estado.ok) aoMudar()
  }, [estado, aoMudar])

  if (!painel.podeFaturar) return null

  return (
    <div className={estilo.osEtapaBloco}>
      <p className={estilo.osEtapaTitulo}>
        O pagamento
        {f ? (
          <span
            className={`${estilo.tag} ${f.emAbertoCentavos > 0 ? estilo.tagEspera : estilo.tagOk}`}
          >
            {f.emAbertoCentavos > 0 ? 'em aberto' : 'quitada'}
          </span>
        ) : (
          <span className={`${estilo.tag} ${estilo.tagEspera}`}>sem fatura</span>
        )}
      </p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}
      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      {!f ? (
        <>
          <p className={estilo.texto}>
            A fatura sai do orçamento aprovado. Marque para quando ficou combinado o pagamento — é
            essa data que faz a cobrança aparecer no Financeiro antes de vencer, e não depois.
          </p>
          <div className={estilo.janelaGrade}>
            <label className={estilo.rotulo}>
              Vence em
              <input
                className={estilo.campo}
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
              <span className={estilo.dica}>Em branco = sem data marcada.</span>
            </label>
          </div>
          <div className={estilo.acoesForm}>
            <button
              type="button"
              className={estilo.btn}
              disabled={emitindo}
              onClick={() => {
                setErro(null)
                iniciar(async () => {
                  const r = await emitir(painel.dossie.id, vencimento || undefined)
                  if (!r.ok) setErro(r.motivo)
                  else aoMudar()
                })
              }}
            >
              {emitindo ? 'Emitindo…' : 'Emitir a fatura'}
            </button>
          </div>
        </>
      ) : f.emAbertoCentavos > 0 ? (
        <form action={acao} className={estilo.janelaForm}>
          <input type="hidden" name="faturaId" value={painel.faturaId ?? ''} />
          <input type="hidden" name="ordemId" value={painel.dossie.id} />
          <input
            type="hidden"
            name="pagamentosJson"
            value={JSON.stringify([{ forma, valor: Number(valor.replace(',', '.')) || 0, parcelas: 1 }])}
          />
          <p className={estilo.texto}>
            Faltam <strong>{formatarBRL(f.emAbertoCentavos)}</strong> de{' '}
            {formatarBRL(f.valorTotalCentavos)}
            {painel.faturaVence ? ` · combinado para ${diaBR(painel.faturaVence)}` : ''}. A entrega
            só é liberada com a fatura fechada.
          </p>
          <div className={estilo.janelaGrade}>
            <label className={estilo.rotulo}>
              Quanto entrou
              <input
                className={estilo.campo}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={(f.emAbertoCentavos / 100).toFixed(2).replace('.', ',')}
                required
              />
            </label>
            <label className={estilo.rotulo}>
              Como
              <select
                className={estilo.selecao}
                value={forma}
                onChange={(e) => setForma(e.target.value)}
              >
                {FORMAS.map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Registrando…' : 'Registrar recebimento'}
            </button>
            <Link href="/painel/financeiro" className={estilo.btnSec}>
              Parcelar, multa e juros
            </Link>
          </div>
        </form>
      ) : (
        <p className={estilo.texto}>
          Fatura #{f.numero} quitada — {formatarBRL(f.valorTotalCentavos)}. A entrega está liberada.
        </p>
      )}
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
  /**
   * O saldo da fatura só entra aqui para quem NÃO pode recebê-lo.
   *
   * Para quem pode, o bloco do passo 9 logo abaixo diz a mesma coisa e ainda
   * oferece o campo para registrar a entrada — e o mesmo aviso duas vezes na
   * mesma tela é o tipo de repetição que faz a pessoa parar de ler os avisos.
   */
  if (
    !painel.podeFaturar &&
    d.etapa === 'FATURAMENTO' &&
    d.fatura &&
    d.fatura.emAbertoCentavos > 0
  ) {
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

/** 'AAAA-MM-DD' → '14/09/2026', sem deixar o navegador escolher o fuso. */
function diaBR(dia: string): string {
  const [a, m, d] = dia.split('-')
  return d && m && a ? `${d}/${m}/${a}` : dia
}

/** Data e hora no fuso da casa — o navegador de quem abre pode estar em outro. */
function quando(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * A PARADA DE ROTA DESTA O.S. — para ver, e para corrigir.
 *
 * =============================================================================
 * O BURACO QUE ELA TAPA
 * =============================================================================
 * A janela sabia marcar uma parada e não sabia mostrar a que já existia. Assim
 * que a retirada era agendada, dia, hora, endereço e MOTORISTA sumiam da tela —
 * e a única forma de mexer neles era sair da O.S., abrir a Rota e achar a
 * parada certa numa lista de todas as paradas da empresa.
 *
 * O relato foi este, com estas palavras: *"preciso colocar o motorista e não
 * estou conseguindo"*. A parada estava lá, sem motorista, e a janela dizia
 * "nada para fazer agora com o seu perfil" para um administrador.
 *
 * =============================================================================
 * POR QUE O MOTORISTA VEM PRIMEIRO, E SOZINHO
 * =============================================================================
 * Trocar o motorista é o ajuste que se faz com o telefone no ombro — alguém
 * ligou avisando que não vai dar. É um `<select>` que salva no `onChange`, sem
 * botão: um formulário de sete campos para mudar um nome faria a pessoa
 * preencher endereço e recado de novo só para escolher quem vai.
 *
 * O resto — dia, hora, endereço, recado — fica atrás de "Mudar dia e endereço",
 * fechado. É o ajuste raro, e ele tem consequência maior: mexe no que o cliente
 * já ouviu.
 *
 * =============================================================================
 * O QUE ELA NÃO OFERECE
 * =============================================================================
 * Parada concluída ou que falhou aparece como LEITURA. Já tem foto, assinatura
 * e hora gravadas; remarcar depois faria o comprovante que o cliente assinou
 * discordar do sistema. A ação recusa também — aqui a tela só não oferece o que
 * ia falhar.
 */
function AParadaDaRota({
  painel,
  aoMudar,
}: {
  painel: PainelDaOrdem
  aoMudar: () => Promise<void>
}) {
  if (painel.paradasMarcadas.length === 0) return null

  return (
    <div className={estilo.osRota}>
      <p className={estilo.osRotaTitulo}>
        {painel.paradasMarcadas.length === 1 ? 'A parada de rota' : 'As paradas de rota'}
      </p>
      {painel.paradasMarcadas.map((pa) => (
        <CartaoDaParada
          key={pa.id}
          parada={pa}
          motoristas={painel.motoristasDaCasa}
          podeMexer={painel.podeMexerNaRota}
          aoMudar={aoMudar}
        />
      ))}
    </div>
  )
}

function CartaoDaParada({
  parada,
  motoristas,
  podeMexer,
  aoMudar,
}: {
  parada: PainelDaOrdem['paradasMarcadas'][number]
  motoristas: PainelDaOrdem['motoristasDaCasa']
  podeMexer: boolean
  aoMudar: () => Promise<void>
}) {
  const [salvando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [abrirRemarcar, setAbrirRemarcar] = useState(false)

  function trocarMotorista(id: string) {
    setErro(null)
    iniciar(async () => {
      const r = await atribuirMotorista(parada.id, id)
      if (!r.ok) setErro(r.motivo)
      else await aoMudar()
    })
  }

  const semMotorista = !parada.motoristaId

  return (
    <div className={semMotorista && !parada.fechada ? `${estilo.osRotaCartao} ${estilo.osRotaFalta}` : estilo.osRotaCartao}>
      <div className={estilo.osRotaTopo}>
        <span className={estilo.osRotaTipo}>
          {parada.tipo === 'RETIRADA' ? 'Buscar' : 'Entregar'}
        </span>
        <span className={estilo.osRotaQuando}>
          {parada.data} · {parada.horario}
        </span>
        <span className={estilo.osRotaSituacao}>{parada.situacao}</span>
      </div>

      <p className={estilo.osRotaEndereco}>
        {parada.endereco}
        {parada.pontoReferencia ? ` · ${parada.pontoReferencia}` : ''}
      </p>
      {parada.observacoes ? (
        <p className={estilo.osRotaRecado}>Recado ao motorista: {parada.observacoes}</p>
      ) : null}

      {parada.fechada ? (
        <p className={estilo.dica}>
          {parada.motorista ? `Foi com ${parada.motorista}. ` : ''}
          Parada encerrada — para mexer na data, cancele e marque outra.
        </p>
      ) : podeMexer ? (
        <>
          <label className={estilo.osRotaEscolha}>
            <span>Quem vai</span>
            <select
              className={estilo.selecao}
              value={parada.motoristaId ?? ''}
              disabled={salvando}
              onChange={(e) => trocarMotorista(e.target.value)}
            >
              {/* A opção vazia existe porque tirar o motorista é uma decisão
                  legítima: a parada sem dono volta para a lista de quem pegar,
                  em vez de ficar no nome de alguém que não vai. */}
              <option value="">— sem motorista definido —</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          {motoristas.length === 0 ? (
            <p className={estilo.dica}>
              Nenhum motorista cadastrado ainda. Crie o acesso dele em{' '}
              <Link href="/painel/usuarios">Pessoas e acessos</Link>.
            </p>
          ) : null}
          {parada.aceitoEm ? (
            <p className={estilo.dica}>Aceitou a corrida em {parada.aceitoEm}.</p>
          ) : parada.motoristaId ? (
            <p className={estilo.dica}>
              Designado, ainda não aceitou. O celular dele recebe o aviso da parada.
            </p>
          ) : null}
          {erro ? (
            <p className={estilo.erro} role="alert">
              {erro}
            </p>
          ) : null}

          {abrirRemarcar ? (
            <FormularioRemarcar
              parada={parada}
              aoFechar={() => setAbrirRemarcar(false)}
              aoSalvar={async () => {
                setAbrirRemarcar(false)
                await aoMudar()
              }}
            />
          ) : (
            <button
              type="button"
              className={estilo.btnLinha}
              onClick={() => setAbrirRemarcar(true)}
            >
              Mudar dia e endereço
            </button>
          )}
        </>
      ) : (
        <p className={estilo.dica}>
          {parada.motorista ? `Vai com ${parada.motorista}.` : 'Ainda sem motorista.'} Seu perfil não
          altera a rota.
        </p>
      )}
    </div>
  )
}

/** Dia, hora, janela, endereço e recado de uma parada que já existe. */
function FormularioRemarcar({
  parada,
  aoFechar,
  aoSalvar,
}: {
  parada: PainelDaOrdem['paradasMarcadas'][number]
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  /**
   * O ENVIO É À MÃO, e não por `useActionState`.
   *
   * O `useActionState` devolve `{ok:true}` tanto ANTES do primeiro envio quanto
   * DEPOIS de um salvamento bem-sucedido — os dois estados são o mesmo objeto, e
   * não há como distinguir "ainda não enviei" de "acabei de salvar" sem guardar
   * um sinal por fora. A versão com `useRef` funcionava e era um enigma para
   * quem lesse depois.
   *
   * Chamando a ação direto, o sucesso é uma linha: fechou o formulário e
   * recarregou o painel.
   */
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    setErro(null)
    iniciar(async () => {
      const r = await remarcarParada({ ok: true }, dados)
      if (!r.ok) setErro(r.motivo)
      else await aoSalvar()
    })
  }

  return (
    <form className={estilo.osRotaForm} onSubmit={enviar}>
      <input type="hidden" name="agendamentoId" value={parada.id} />
      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Dia *
          <input className={estilo.campo} type="date" name="data" defaultValue={parada.dataCampo} required />
        </label>
        <label className={estilo.rotulo}>
          Hora
          <input className={estilo.campo} type="time" name="hora" defaultValue={parada.horaCampo} />
        </label>
        <label className={estilo.rotulo}>
          Até (opcional)
          <input
            className={estilo.campo}
            type="time"
            name="janelaFim"
            defaultValue={parada.janelaFimCampo}
          />
          <span className={estilo.dica}>A janela combinada com o cliente.</span>
        </label>
      </div>

      <label className={estilo.rotulo}>
        Endereço da parada *
        <input className={estilo.campo} name="endereco" defaultValue={parada.endereco} required minLength={5} />
      </label>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Procurar por
          <input className={estilo.campo} name="contatoNome" defaultValue={parada.contatoNome} />
        </label>
        <label className={estilo.rotulo}>
          Telefone no local
          <input className={estilo.campo} name="contatoTelefone" defaultValue={parada.contatoTelefone} inputMode="tel" />
        </label>
        <label className={estilo.rotulo}>
          Ponto de referência
          <input className={estilo.campo} name="pontoReferencia" defaultValue={parada.pontoReferencia} />
        </label>
      </div>

      <label className={estilo.rotulo}>
        Recado ao motorista
        <input className={estilo.campo} name="observacoes" defaultValue={parada.observacoes} maxLength={500} />
        <span className={estilo.dica}>
          Aparece em destaque no aplicativo dele — &ldquo;levar carrinho&rdquo;, &ldquo;estacionar nos fundos&rdquo;.
        </span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar a parada'}
        </button>
        <button type="button" className={estilo.linkAcao} onClick={aoFechar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ===========================================================================
// ABA "A ORDEM" — a ficha do serviço, e a correção dela sem sair da janela
// ===========================================================================

/**
 * TUDO O QUE ESTÁ ESCRITO NESTA ORDEM, E O BOTÃO DE CORRIGIR.
 *
 * =============================================================================
 * POR QUE A CORREÇÃO VEIO PARA CÁ
 * =============================================================================
 * "Corrigir a O.S." era um link no rodapé que trocava de página. Quem clicasse
 * saía da janela, ia para `/painel/ordens/<id>/editar`, salvava, e voltava para
 * a lista pelo botão do navegador — perdendo a ordem que estava trabalhando.
 *
 * A página continua existindo e não muda: é o destino de qualquer link antigo.
 * O que mudou é que ninguém precisa mais ir até lá para arrumar um defeito
 * digitado errado.
 */
function AAbaDaOrdem({
  painel,
  aoSalvar,
}: {
  painel: PainelDaOrdem
  aoSalvar: () => Promise<void>
}) {
  const d = painel.dossie
  const [editando, setEditando] = useState(false)
  const fotosDeEntrada = d.fotos.filter((f) => f.categoria === 'RECEBIMENTO').length

  if (editando) {
    return (
      <Voltando titulo="Corrigir o que foi digitado" aoVoltar={() => setEditando(false)}>
        <FormularioDaCorrecao
          painel={painel}
          aoSalvar={async () => {
            setEditando(false)
            await aoSalvar()
          }}
        />
      </Voltando>
    )
  }

  return (
    <>
      <div className={estilo.osCartoes}>
        <CartaoOS titulo="O aparelho">
          {/* A FOTO DO APARELHO.
              Marca e modelo não bastam para reconhecer: o mesmo modelo muda de
              cara entre gerações, e quem abre a O.S. com o cliente no telefone
              está tentando responder "é este?". A foto já existia no cadastro
              do equipamento e não chegava na ordem. */}
          {/* A rota do catálogo já entrega no tamanho certo e confere a
              empresa. */}
          {d.equipamento.temFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={estilo.equipFoto}
              src={`/api/catalogo/equipamento/${d.equipamento.id}`}
              alt={`Foto de ${d.equipamento.marca} ${d.equipamento.modelo}`}
              loading="lazy"
            />
          ) : null}
          <p className={estilo.osCartaoForte}>
            {d.equipamento.marca} {d.equipamento.modelo}
          </p>
          {d.equipamento.numeroSerie ? (
            <p className={estilo.osCartaoNota}>Série {d.equipamento.numeroSerie}</p>
          ) : null}
          <p className={estilo.osCartaoNota}>
            {d.emGarantia ? 'Está em garantia.' : 'Fora de garantia.'}
          </p>
        </CartaoOS>

        <CartaoOS titulo="Prazo e prioridade" alerta={d.atrasada}>
          <p className={estilo.osCartaoForte}>
            {d.prazoPrometido ? dataCurta(d.prazoPrometido) : 'Sem prazo prometido'}
          </p>
          <p className={estilo.osCartaoNota}>
            {d.atrasada
              ? 'Passou do prazo prometido ao cliente.'
              : d.prazoPrometido
                ? 'Dentro do prazo.'
                : 'Sem data prometida, esta ordem não conta como atrasada.'}
          </p>
          <p className={estilo.osCartaoNota}>
            Prioridade {painel.prioridade === 'ALTA' ? 'alta' : 'normal'} · aberta em{' '}
            {dataCurta(d.abertaEm)}
          </p>
        </CartaoOS>

        <CartaoOS titulo="Quem está com ela">
          <p className={estilo.osCartaoForte}>{d.tecnico ?? 'Nenhum técnico ainda'}</p>
          <p className={estilo.osCartaoNota}>Etapa: {painel.etapaRotulo}</p>
          {painel.viaCorreio ? (
            <p className={estilo.osCartaoNota}>
              Veio pelo correio{painel.codigoRastreio ? ` · ${painel.codigoRastreio}` : ''}
            </p>
          ) : null}
        </CartaoOS>

        <CartaoOS titulo="O combinado na abertura">
          <p className={estilo.osCartaoForte}>
            {painel.valorPrevioCentavos === null
              ? 'Nada combinado'
              : formatarBRL(painel.valorPrevioCentavos)}
          </p>
          {painel.condicaoCombinada ? (
            <p className={estilo.osCartaoNota}>{painel.condicaoCombinada}</p>
          ) : null}
        </CartaoOS>
      </div>

      <div className={estilo.osTexto}>
        <p className={estilo.osTextoRot}>O que o cliente relatou</p>
        <p>{painel.defeitoRelatado}</p>
      </div>
      {painel.diagnostico ? (
        <div className={estilo.osTexto}>
          <p className={estilo.osTextoRot}>Laudo do técnico</p>
          <p>{painel.diagnostico}</p>
        </div>
      ) : null}

      <div className={estilo.osCartoes}>
        {d.orcamento ? (
          <CartaoOS titulo={`Orçamento #${d.orcamento.numero}`}>
            <p className={estilo.osCartaoForte}>{formatarBRL(d.orcamento.totalCentavos)}</p>
            <p className={estilo.osCartaoNota}>
              {d.orcamento.status.toLowerCase()} · garantia de {d.orcamento.garantiaDias} dias
            </p>
            {d.orcamento.aprovadoPorNome ? (
              <p className={estilo.osCartaoNota}>Aprovado por {d.orcamento.aprovadoPorNome}.</p>
            ) : null}
          </CartaoOS>
        ) : null}
        {d.fatura ? (
          <CartaoOS titulo={`Fatura #${d.fatura.numero}`} alerta={d.fatura.emAbertoCentavos > 0}>
            <p className={estilo.osCartaoForte}>{formatarBRL(d.fatura.valorTotalCentavos)}</p>
            <p className={estilo.osCartaoNota}>
              {d.fatura.emAbertoCentavos > 0
                ? `${formatarBRL(d.fatura.emAbertoCentavos)} em aberto`
                : 'Quitada.'}
            </p>
          </CartaoOS>
        ) : null}
        <CartaoOS titulo="As provas desta ordem">
          <p className={estilo.osCartaoForte}>
            {fotosDeEntrada} {fotosDeEntrada === 1 ? 'foto' : 'fotos'} de entrada
          </p>
          <p className={estilo.osCartaoNota}>
            {d.assinaturas.length}{' '}
            {d.assinaturas.length === 1 ? 'assinatura' : 'assinaturas'} · {d.documentos.length}{' '}
            {d.documentos.length === 1 ? 'documento' : 'documentos'}
          </p>
          <Link href={`/painel/equipamentos/${d.equipamento.id}/rastreabilidade`} className={estilo.btnSec}>
            Folha de rastreabilidade
          </Link>
        </CartaoOS>
        <CartaoOS titulo="Peças lançadas">
          <p className={estilo.osCartaoForte}>
            {painel.pecasLancadas.length === 0
              ? painel.semPecaDeclaradoEm
                ? 'Nenhuma — declarado'
                : 'Nada lançado ainda'
              : `${painel.pecasLancadas.length} ${painel.pecasLancadas.length === 1 ? 'peça' : 'peças'}`}
          </p>
          {painel.pecasLancadas.map((x) => (
            <p key={x.id} className={estilo.osCartaoNota}>
              {x.quantidade}× {x.nome} ({x.sku})
            </p>
          ))}
          {painel.semPecaDeclaradoPorNome ? (
            <p className={estilo.osCartaoNota}>
              Declarado por {painel.semPecaDeclaradoPorNome}.
            </p>
          ) : null}
        </CartaoOS>
      </div>

      <div className={estilo.evAcoes}>
        <button type="button" className={estilo.btn} onClick={() => setEditando(true)}>
          Editar a O.S.
        </button>
        <Link href={`/painel/ordens/${d.id}?ver=documentos`} className={estilo.btnSec}>
          Contrato e documentos
        </Link>
      </div>
    </>
  )
}

/**
 * O formulário de correção, dentro da janela.
 *
 * O mesmo `editarOrdem` da página, com o mesmo cuidado que ela ganhou: espera a
 * ação terminar, diz o que aconteceu, e só então recarrega. A ordem importa —
 * recarregar antes de confirmar é o que fazia a correção sumir da tela depois
 * de gravada.
 */
function FormularioDaCorrecao({
  painel,
  aoSalvar,
}: {
  painel: PainelDaOrdem
  aoSalvar: () => Promise<void>
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    setErro(null)
    iniciar(async () => {
      const r = await editarOrdem({ ok: true }, dados)
      if (!r.ok) setErro(r.motivo)
      else await aoSalvar()
    })
  }

  return (
    <form className={estilo.form} onSubmit={enviar}>
      <input type="hidden" name="ordemId" value={painel.dossie.id} />
      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <label className={estilo.rotulo}>
        O que o cliente relatou *
        <textarea
          className={estilo.area}
          name="defeito"
          required
          minLength={10}
          maxLength={2000}
          defaultValue={painel.defeitoRelatado}
        />
        <span className={estilo.dica}>
          É o relato em português do cliente. O laudo do técnico tem lugar próprio.
        </span>
      </label>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Prioridade
          <select className={estilo.campo} name="prioridade" defaultValue={painel.prioridade}>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta — aparelho parado em clínica faturando</option>
          </select>
        </label>
        <label className={estilo.rotulo}>
          Prazo prometido
          <input
            className={estilo.campo}
            name="prazo"
            type="date"
            defaultValue={painel.dossie.prazoPrometido?.slice(0, 10) ?? ''}
          />
          <span className={estilo.dica}>Em branco, a ordem não conta como atrasada.</span>
        </label>
      </div>

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Veio pelo correio?
          <select
            className={estilo.campo}
            name="viaCorreio"
            defaultValue={painel.viaCorreio ? '1' : '0'}
          >
            <option value="0">Não — retirada nossa</option>
            <option value="1">Sim, o cliente despachou</option>
          </select>
        </label>
        <label className={estilo.rotulo}>
          Código de rastreio
          <input
            className={estilo.campo}
            name="codigoRastreio"
            maxLength={60}
            defaultValue={painel.codigoRastreio ?? ''}
          />
        </label>
      </div>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar correção'}
        </button>
      </div>
      <p className={estilo.dica}>
        A correção fica registrada na trilha, com o que estava antes e o que ficou. Uma mudança
        silenciosa num campo que o cliente já leu no orçamento não se distingue de alguém
        reescrevendo a história do serviço.
      </p>
    </form>
  )
}

// ===========================================================================
// ABA "O CLIENTE"
// ===========================================================================

function AAbaDoCliente({ painel }: { painel: PainelDaOrdem }) {
  const c = painel.cliente
  if (!c) return <p className={estilo.texto}>Não foi possível carregar a ficha do cliente.</p>

  return (
    <>
      <div className={estilo.osCartoes}>
        <CartaoOS titulo="Quem é">
          <p className={estilo.osCartaoForte}>{c.nome}</p>
          {c.razaoSocial && c.razaoSocial !== c.nome ? (
            <p className={estilo.osCartaoNota}>{c.razaoSocial}</p>
          ) : null}
          <p className={estilo.osCartaoNota}>
            {c.tipo === 'PJ' ? 'Empresa' : 'Pessoa física'} · {c.documento}
          </p>
          <p className={estilo.osCartaoNota}>Cliente desde {c.clienteDesde}.</p>
        </CartaoOS>

        <CartaoOS titulo="Como falar">
          {c.contatoNome ? <p className={estilo.osCartaoForte}>{c.contatoNome}</p> : null}
          {/* Esta tela fazia o OPOSTO das outras três: não punha DDI nenhum.
              A mesma clínica abria uma conversa diferente conforme o botão
              clicado, e uma das duas estava sempre errada. As quatro agora
              passam por `linkDeWhatsapp`. */}
          {linkDeWhatsapp(c.whatsapp) ? (
            <a
              className={estilo.btnSec}
              href={linkDeWhatsapp(c.whatsapp)!}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          ) : null}
          {c.telefone ? (
            <a className={estilo.btnSec} href={`tel:${c.telefone}`}>
              Ligar
            </a>
          ) : null}
          {c.contatoTelefone && c.contatoTelefone !== c.telefone ? (
            <a className={estilo.btnSec} href={`tel:${c.contatoTelefone}`}>
              Ligar para o contato
            </a>
          ) : null}
          {c.email ? <p className={estilo.osCartaoNota}>{c.email}</p> : null}
          {c.representante ? (
            <p className={estilo.osCartaoNota}>Representante: {c.representante}</p>
          ) : null}
        </CartaoOS>

        <CartaoOS titulo="Onde fica">
          <p className={estilo.osCartaoNota}>{c.endereco ?? 'Endereço não cadastrado.'}</p>
          {c.enderecoDeColeta ? (
            <p className={estilo.osCartaoNota}>
              <strong>Coleta em outro lugar:</strong> {c.enderecoDeColeta}
            </p>
          ) : null}
          {c.pontoReferencia ? (
            <p className={estilo.osCartaoNota}>Referência: {c.pontoReferencia}</p>
          ) : null}
          {c.endereco ? (
            <a
              className={estilo.btnSec}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                c.enderecoDeColeta ?? c.endereco,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver no mapa
            </a>
          ) : null}
        </CartaoOS>

        {/* O CARTÃO DE DINHEIRO SÓ EXISTE PARA QUEM PODE VER DINHEIRO — e a
            consulta nem lê as faturas quando não pode. Um cartão zerado seria
            pior que a ausência: pareceria "não deve nada". */}
        {c.financeiro ? (
          <CartaoOS
            titulo="Situação financeira"
            alerta={c.financeiro.diasDeAtrasoMaior > 0}
          >
            <p className={estilo.osCartaoForte}>
              {c.financeiro.emAbertoCentavos > 0
                ? formatarBRL(c.financeiro.emAbertoCentavos)
                : 'Nada em aberto'}
            </p>
            <p className={estilo.osCartaoNota}>
              {c.financeiro.faturasEmAberto === 0
                ? 'Nenhuma fatura em aberto.'
                : `${c.financeiro.faturasEmAberto} ${
                    c.financeiro.faturasEmAberto === 1 ? 'fatura' : 'faturas'
                  } em aberto.`}
            </p>
            {c.financeiro.diasDeAtrasoMaior > 0 ? (
              <p className={estilo.osCartaoNota}>
                A mais antiga venceu há {c.financeiro.diasDeAtrasoMaior}{' '}
                {c.financeiro.diasDeAtrasoMaior === 1 ? 'dia' : 'dias'}.
              </p>
            ) : null}
          </CartaoOS>
        ) : null}
      </div>

      {c.observacoes ? (
        <div className={estilo.osTexto}>
          <p className={estilo.osTextoRot}>Observações do cadastro</p>
          <p>{c.observacoes}</p>
        </div>
      ) : null}

      <ListaDoCliente
        titulo="Aparelhos deste cliente"
        vazio="Nenhum outro aparelho cadastrado."
        itens={c.aparelhos.map((a) => ({
          chave: a.id,
          principal: `${a.marca} ${a.modelo}`,
          detalhe: [
            a.numeroSerie ? `série ${a.numeroSerie}` : null,
            `${a.ordens} ${a.ordens === 1 ? 'ordem' : 'ordens'}`,
          ]
            .filter(Boolean)
            .join(' · '),
          href: `/painel/equipamentos/${a.id}`,
        }))}
      />

      <ListaDoCliente
        titulo="Outras ordens dele"
        vazio="Esta é a primeira ordem deste cliente."
        itens={c.outrasOrdens.map((o) => ({
          chave: o.id,
          principal: `#${String(o.numero).padStart(4, '0')} · ${o.equipamento}`,
          detalhe: `${ROTULO_CURTO[o.etapa] ?? o.etapa.toLowerCase().replace(/_/g, ' ')} · aberta em ${o.abertaEm}`,
          href: `/painel/ordens?abrir=${o.id}`,
          fraco: o.encerrada,
        }))}
      />

      <ListaDoCliente
        titulo="Contratos de manutenção"
        vazio="Nenhum contrato de manutenção."
        itens={c.contratos.map((k) => ({
          chave: String(k.numero),
          principal: `#${String(k.numero).padStart(4, '0')} · ${k.equipamento}`,
          detalhe: `${k.periodicidade.toLowerCase()}${k.fim ? ` · até ${k.fim}` : ''}${
            k.ativo ? '' : ' · encerrado'
          }`,
          fraco: !k.ativo,
        }))}
      />

      <div className={estilo.evAcoes}>
        <Link href={`/painel/clientes/${c.id}`} className={estilo.btn}>
          Abrir o cadastro completo
        </Link>
      </div>
    </>
  )
}

/** Uma lista curta dentro da aba do cliente. Some quando não tem nada útil. */
function ListaDoCliente({
  titulo,
  vazio,
  itens,
}: {
  titulo: string
  vazio: string
  itens: Array<{
    chave: string
    principal: string
    detalhe: string
    href?: string
    fraco?: boolean
  }>
}) {
  return (
    <div className={estilo.osLista}>
      <p className={estilo.osListaTitulo}>
        {titulo}
        {itens.length > 0 ? <span className={estilo.osAbaConta}>{itens.length}</span> : null}
      </p>
      {itens.length === 0 ? (
        <p className={estilo.dica}>{vazio}</p>
      ) : (
        <ul className={estilo.osListaLista}>
          {itens.map((i) => (
            <li key={i.chave} className={i.fraco ? estilo.osListaFraco : undefined}>
              {i.href ? (
                <Link href={i.href} className={estilo.osListaItem}>
                  <span className={estilo.osListaNome}>{i.principal}</span>
                  <span className={estilo.osListaDet}>{i.detalhe}</span>
                </Link>
              ) : (
                <span className={estilo.osListaItem}>
                  <span className={estilo.osListaNome}>{i.principal}</span>
                  <span className={estilo.osListaDet}>{i.detalhe}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ===========================================================================
// ABA "O QUE JÁ ACONTECEU"
// ===========================================================================

/**
 * A HISTÓRIA DA ORDEM, nos onze passos que o dono conta em voz alta.
 *
 * Não são as dezoito etapas da máquina: essas ficam na ficha completa, para
 * quem está investigando. Aqui é a linha do tempo que a pessoa reconhece — o
 * que aconteceu, quando, e por quem.
 */
function AAbaDaHistoria({ painel }: { painel: PainelDaOrdem }) {
  const passos = painel.roteiro.passos
  return (
    <>
      {painel.roteiro.desvio ? (
        <p className={estilo.evAtraso}>
          Esta ordem saiu do caminho normal: {painel.roteiro.desvio.rotulo}.
        </p>
      ) : null}
      <ol className={estilo.osHist}>
        {passos.map((x) => (
          <li
            key={x.n}
            className={
              x.estado === 'agora'
                ? `${estilo.osHistNo} ${estilo.osHistAgora}`
                : x.estado === 'cumprido'
                  ? `${estilo.osHistNo} ${estilo.osHistFeito}`
                  : `${estilo.osHistNo} ${estilo.osHistAdiante}`
            }
          >
            <span className={estilo.osHistNum}>{x.n}</span>
            <div>
              <p className={estilo.osHistNome}>{x.nome}</p>
              <p className={estilo.osHistQuando}>
                {x.quando
                  ? `${quando(x.quando)}${x.autor ? ` · ${x.autor}` : ''}`
                  : x.estado === 'agora'
                    ? 'é o que está acontecendo agora'
                    : 'ainda não aconteceu'}
                {x.detalhe ? ` · ${x.detalhe}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className={estilo.evAcoes}>
        <Link href={`/painel/ordens/${painel.dossie.id}`} className={estilo.btnSec}>
          Ver as 18 etapas da máquina
        </Link>
      </div>
    </>
  )
}

/** Um cartão da aba. `alerta` acende o que precisa de olho. */
function CartaoOS({
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

const ROTULO_CURTO: Record<string, string> = {
  FINALIZADO: 'finalizada',
  CANCELADO: 'cancelada',
}

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
