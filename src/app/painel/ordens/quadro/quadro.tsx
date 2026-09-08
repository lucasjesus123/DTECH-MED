'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { avancar } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

export type PassoPossivel = {
  para: string
  titulo: string
  colunaDestino: string | null
  colunaDestinoId: string | null
}

export type Cartao = {
  id: string
  numero: number
  etapaRotulo: string
  cliente: string
  equipamento: string
  tecnico: string | null
  prioridade: string
  atrasada: boolean
  diasNaEtapa: number
  /** Em qual coluna do quadro este cartão está agora. */
  colunaId: string
  /** O que ESTA pessoa pode fazer com ESTA ordem, agora. */
  passos: PassoPossivel[]
}

export type Coluna = {
  id: string
  nome: string
  cor: string | null
  cartoes: Cartao[]
  orfa: boolean
}

/** O cartão que está na mão, enquanto está na mão. */
type NaMao = { id: string; colunaId: string; passos: PassoPossivel[] }

/**
 * O QUADRO DA O.S.
 *
 * =============================================================================
 * ARRASTAR SÓ ACENDE ONDE A ORDEM PODE MESMO IR
 * =============================================================================
 * Arrastar é o gesto que todo mundo espera de um quadro, e um quadro que aceita
 * o arrasto e depois devolve "não pode" é pior que um que não aceita: a pessoa
 * já soltou o cartão, já viu ele mudar de lugar, e agora ele volta sozinho.
 *
 * As transições entre etapas não são livres — a máquina de estados sabe quais
 * são legais, quem pode fazer cada uma, e o que cada uma exige. Então o arrasto
 * aqui não pergunta depois: ele já nasce sabendo. Ao pegar o cartão, as únicas
 * colunas que acendem são as que estão no fim de um passo REAL daquela ordem
 * para AQUELE perfil — os mesmos `proximosPassos(etapa, papel)` que a ficha usa,
 * calculados no servidor. As outras apagam e não aceitam a soltura.
 *
 * Uma coluna agrupa VÁRIAS etapas, e isso tem duas consequências que o primeiro
 * desenho errou. A primeira: às vezes dois passos diferentes levam à mesma
 * coluna ("Aprovar orçamento" e "Reprovar" caem as duas em Fechamento). Aí
 * soltar não pode escolher sozinho — a coluna abre as duas opções e quem
 * arrastou diz qual. Adivinhar seria andar a esteira no lugar da pessoa.
 *
 * A segunda só apareceu quando o roteiro rodou contra o quadro de verdade: com
 * as cinco colunas padrão, quase NENHUM passo cruza de coluna. "Motorista saiu
 * para a retirada" continua em Retirada; "Em análise técnica" continua em
 * Diagnóstico. Eu tinha proibido a coluna de origem de acender — e o resultado
 * era um arrasto que não acendia nada em lugar nenhum, para quase todo cartão.
 * Um gesto que nunca dá certo é pior que gesto nenhum.
 *
 * Então a coluna de origem acende também, e toda coluna acesa mostra, ENQUANTO
 * o cartão está no ar, o que soltar ali vai fazer. É isso que tira a estranheza
 * de soltar onde já se está: a faixa não diz "aqui", diz "Em análise técnica".
 *
 * O QUE O ARRASTO NÃO SABE, e por isso não promete: `proximosPassos` conhece as
 * transições e quem pode fazê-las, não as EXIGÊNCIAS de cada uma — a entrega
 * pede parada agendada, a coleta pede assinatura. Essas o motor confere na hora
 * do movimento, e a recusa volta escrita na tela ("Marque a parada de entrega
 * na Agenda de rota antes"). Vale igual para os botões, que oferecem os mesmos
 * passos. Por isso o texto da tela diz "acendem as colunas onde há um passo que
 * o seu perfil pode dar" — e não "para onde a ordem pode ir agora", que era a
 * primeira versão e prometia mais do que este quadro tem como saber.
 *
 * Os botões continuam em cada cartão, e não são enfeite: arrasto HTML5 não
 * existe no toque nem no teclado, e este quadro vai ser usado no tablet da
 * bancada. Os dois caminhos chamam a mesma `avancar`, com trilha e tudo.
 *
 * =============================================================================
 * O NÚMERO DE DIAS É O QUE FAZ O QUADRO VALER
 * =============================================================================
 * Uma coluna com onze cartões não diz nada; onze cartões em que um está parado
 * há 23 dias dizem tudo. É o esquecido que o quadro existe para achar, e ele
 * nunca está no topo — está no meio, com cara de normal.
 */
export default function Quadro({
  colunas,
  podeDesenhar,
}: {
  colunas: Coluna[]
  podeDesenhar: boolean
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const [naMao, setNaMao] = useState<NaMao | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [escolha, setEscolha] = useState<{
    ordemId: string
    colunaId: string
    opcoes: PassoPossivel[]
  } | null>(null)
  const router = useRouter()

  function mover(ordemId: string, para: string, titulo: string) {
    setMsg(null)
    setEscolha(null)
    iniciar(async () => {
      const r = await avancar({ ordemId, para: para as never })
      setMsg({ ok: r.ok, texto: r.ok ? `${titulo} — feito.` : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  /**
   * Os passos daquele cartão que terminam NESTA coluna.
   *
   * Vazio significa "esta coluna não é destino possível" — e é o que apaga a
   * coluna durante o arrasto. A coluna de origem entra na conta como qualquer
   * outra: com as colunas padrão, quase todo passo continua dentro da mesma
   * fase, e excluí-la deixava o gesto sem nenhum alvo. Ver o cabeçalho.
   */
  function saidasPara(coluna: Coluna): PassoPossivel[] {
    if (!naMao) return []
    return naMao.passos.filter((p) => p.colunaDestinoId === coluna.id)
  }

  function soltar(coluna: Coluna) {
    const opcoes = saidasPara(coluna)
    setSobre(null)
    if (!naMao || opcoes.length === 0) return
    const ordemId = naMao.id
    setNaMao(null)
    // Um destino só: solta e anda. Mais de um: quem arrastou decide.
    if (opcoes.length === 1) mover(ordemId, opcoes[0]!.para, opcoes[0]!.titulo)
    else setEscolha({ ordemId, colunaId: coluna.id, opcoes })
  }

  return (
    <>
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.quadro}>
        {colunas.map((c) => {
          const saidas = saidasPara(c)
          const alvo = naMao !== null && saidas.length > 0
          const recusa = naMao !== null && saidas.length === 0
          const classes = [estilo.quadroColuna ?? '']
          if (alvo) classes.push(estilo.quadroAlvo ?? '')
          if (alvo && sobre === c.id) classes.push(estilo.quadroAlvoAceso ?? '')
          if (recusa) classes.push(estilo.quadroRecusa ?? '')

          return (
            <section
              key={c.id}
              className={classes.filter(Boolean).join(' ')}
              aria-label={`${c.nome}, ${c.cartoes.length} ${c.cartoes.length === 1 ? 'ordem' : 'ordens'}`}
              /* `preventDefault` no dragOver é o que AUTORIZA a soltura. Sem ele
                 o navegador recusa por padrão — então não chamá-lo nas colunas
                 sem saída já é a recusa, com o cursor de "não pode" e tudo. */
              onDragOver={(e) => {
                if (!alvo) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (sobre !== c.id) setSobre(c.id)
              }}
              onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault()
                soltar(c)
              }}
            >
              <div className={`${estilo.quadroTopo} ${tom(c.cor)}`}>
                <p className={estilo.quadroNome}>
                  {c.nome}
                  <span className={estilo.quadroConta}>{c.cartoes.length}</span>
                </p>
              </div>

              {/* O QUE SOLTAR AQUI VAI FAZER — dito antes de soltar.
                  Uma coluna agrupa várias etapas, então "solte em Diagnóstico"
                  não diz nada: o que a pessoa precisa saber é que aquele gesto
                  roda "Em análise técnica". É esta faixa que faz a coluna de
                  origem acender sem parecer que não vai acontecer nada. */}
              {alvo ? (
                <p className={estilo.quadroSolte}>
                  {saidas.length === 1
                    ? `Solte: ${saidas[0]!.titulo}`
                    : `Solte e escolha: ${saidas.map((s) => s.titulo).join(' · ')}`}
                </p>
              ) : null}

              {/* A coluna de resgate explica o que ela é e o que fazer. Sem isso
                  ela pareceria uma coluna comum com nome estranho, e ninguém
                  arrumaria a configuração que a fez existir. */}
              {c.orfa ? (
                <p className={estilo.quadroAviso} role="status">
                  Estas etapas não estão em nenhuma coluna do seu quadro. As ordens continuam aqui,
                  visíveis, até você encaixá-las.{' '}
                  {podeDesenhar ? (
                    <Link href="/painel/ordens/quadro/colunas">Arrumar as colunas</Link>
                  ) : (
                    'Peça à gestão para arrumar as colunas.'
                  )}
                </p>
              ) : null}

              {/* Dois passos caem nesta mesma coluna. Quem arrastou escolhe —
                  ver o cabeçalho do arquivo. */}
              {escolha && escolha.colunaId === c.id ? (
                <div className={estilo.quadroEscolha} role="group" aria-label="Escolha o passo">
                  <p className={estilo.quadroEscolhaTitulo}>Dois caminhos levam aqui. Qual deles?</p>
                  {escolha.opcoes.map((p) => (
                    <button
                      key={p.para}
                      type="button"
                      className={estilo.quadroPasso}
                      disabled={pendente}
                      onClick={() => mover(escolha.ordemId, p.para, p.titulo)}
                    >
                      {p.titulo}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={estilo.quadroEscolhaSair}
                    onClick={() => setEscolha(null)}
                  >
                    Deixa pra lá
                  </button>
                </div>
              ) : null}

              {c.cartoes.length === 0 && !c.orfa ? (
                <p className={estilo.quadroVazio}>
                  {alvo ? 'Solte aqui.' : 'Nada aqui.'}
                </p>
              ) : null}

              <ul className={estilo.quadroCartoes}>
                {c.cartoes.map((k) => {
                  /**
                   * Só ergue o cartão que tem alguma coluna para pousar.
                   *
                   * Ordem em ORCAMENTO_ENVIADO não tem passo nenhum para o
                   * admin — quem aprova é o cliente, no portal. Esse cartão não
                   * se mexe, e é assim que tem de ser: erguer o que não tem para
                   * onde ir é a promessa vazia que este quadro não faz.
                   */
                  const podeArrastar = k.passos.some((p) => p.colunaDestinoId !== null)
                  const classesCartao = [estilo.quadroCartao]
                  if (k.atrasada) classesCartao.push(estilo.quadroAtrasado ?? '')
                  if (podeArrastar) classesCartao.push(estilo.quadroPega ?? '')
                  if (naMao?.id === k.id) classesCartao.push(estilo.quadroIndo ?? '')

                  return (
                    <li
                      key={k.id}
                      className={classesCartao.filter(Boolean).join(' ')}
                      /* Cartão sem nenhum passo com coluna de destino não sai do
                         lugar: arrastar o que não tem para onde ir é a promessa
                         que este quadro não faz. */
                      draggable={podeArrastar && !pendente}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        // Alguns navegadores cancelam o arrasto sem carga.
                        e.dataTransfer.setData('text/plain', k.id)
                        setMsg(null)
                        setEscolha(null)
                        setNaMao({ id: k.id, colunaId: k.colunaId, passos: k.passos })
                      }}
                      onDragEnd={() => {
                        setNaMao(null)
                        setSobre(null)
                      }}
                    >
                      <Link
                        href={`/painel/ordens/${k.id}`}
                        className={estilo.quadroCartaoTopo}
                        /* Âncora é arrastável por natureza e levaria a URL como
                           carga, sequestrando o arrasto do cartão. */
                        draggable={false}
                      >
                        <strong>#{String(k.numero).padStart(4, '0')}</strong>
                        <span className={estilo.quadroCliente}>{k.cliente}</span>
                      </Link>
                      <p className={estilo.quadroAparelho}>{k.equipamento}</p>

                      <p className={estilo.quadroChips}>
                        <span className={estilo.quadroEtapa}>{k.etapaRotulo}</span>
                        {k.prioridade === 'ALTA' ? (
                          <span className={`${estilo.tag} ${estilo.tagAlerta}`}>alta</span>
                        ) : null}
                        {/* O número que denuncia o esquecido. Só a partir de três
                            dias: "há 0 dias" em todo cartão novo é ruído. */}
                        {k.diasNaEtapa >= 3 ? (
                          <span
                            className={
                              k.diasNaEtapa >= 10
                                ? `${estilo.quadroDias} ${estilo.indAlerta}`
                                : estilo.quadroDias
                            }
                          >
                            {k.diasNaEtapa} dias aqui
                          </span>
                        ) : null}
                        {k.tecnico ? <span className={estilo.quadroDias}>{k.tecnico}</span> : null}
                      </p>

                      {/* Os mesmos passos do arrasto, em botão — porque arrasto
                          HTML5 não existe no toque nem no teclado. Ver o
                          cabeçalho do arquivo. */}
                      {k.passos.length > 0 ? (
                        <div className={estilo.quadroPassos}>
                          {k.passos.map((p) => (
                            <button
                              key={p.para}
                              type="button"
                              className={estilo.quadroPasso}
                              disabled={pendente}
                              onClick={() => mover(k.id, p.para, p.titulo)}
                              title={
                                p.colunaDestino
                                  ? `Move para a coluna ${p.colunaDestino}`
                                  : 'Esta etapa não está em nenhuma coluna do quadro'
                              }
                            >
                              {p.titulo}
                              {p.colunaDestino ? (
                                <span className={estilo.fraco}> → {p.colunaDestino}</span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

/**
 * A cor vem como NOME e vira classe aqui.
 *
 * O banco guarda 'sinal', não '#2DD4A0'. Cor literal gravada não acompanha a
 * troca de tema, e uma coluna verde-claro escolhida no tema claro viraria uma
 * faixa ilegível no escuro.
 */
function tom(cor: string | null): string {
  // `?? ''` em cada um porque o CSS é um módulo tipado como índice opcional: a
  // classe existe, mas o compilador não sabe disso, e um `undefined` colado na
  // string de classe viraria "undefined" literal no atributo.
  switch (cor) {
    case 'violeta':
      return estilo.tomVioleta ?? ''
    case 'sinal':
      return estilo.tomSinal ?? ''
    case 'alerta':
      return estilo.tomAlerta ?? ''
    case 'espera':
      return estilo.tomEspera ?? ''
    case 'acao':
      return estilo.tomAcao ?? ''
    default:
      return ''
  }
}
