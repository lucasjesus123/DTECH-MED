'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Conteudo } from '@/lib/conteudo'
import { salvarConteudo } from '@/server/acoes/conteudo'
import { ABAS, escrever, ler, type Aba, type Campo } from './campos'
import estilo from './editor.module.css'

/**
 * O EDITOR DO SITE.
 *
 * ---------------------------------------------------------------------------
 * COMO ELE É
 * ---------------------------------------------------------------------------
 * Abas do site à esquerda, com os campos. O site de verdade à direita, dentro
 * de uma moldura de monitor. Digitou de um lado, mudou do outro na hora. No
 * fim, "Salvar".
 *
 * A prévia é a PÁGINA REAL, não um desenho parecido com ela. Prévia desenhada
 * à parte mente: não tem a fonte certa, não quebra a linha no mesmo lugar, não
 * mostra que o título ficou grande demais. Aqui o que se vê é o que o cliente
 * vai ver.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDA NA HORA E O QUE PRECISA RECARREGAR
 * ---------------------------------------------------------------------------
 * Texto muda na hora, pela ponte. O que muda a ESTRUTURA — acrescentar um
 * serviço, apagar uma etapa, trocar a foto de uma especialidade — precisa que a
 * página seja montada de novo, porque não é trocar uma palavra: é mudar o que
 * existe na tela.
 *
 * Em vez de esconder isso, a tela avisa: aparece "recarregar prévia" quando há
 * mudança de estrutura pendente. Prometer tempo real e entregar prévia velha
 * sem avisar é pior que ser honesto sobre o limite.
 */

type Props = { inicial: Conteudo; versao: number; atualizadoEm: string | null }

export default function EditorDoSite({ inicial, versao, atualizadoEm }: Props) {
  const [conteudo, setConteudo] = useState<Conteudo>(inicial)
  const [abaId, setAbaId] = useState(ABAS[0]!.id)
  const [versaoAtual, setVersaoAtual] = useState(versao)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [precisaRecarregar, setPrecisaRecarregar] = useState(false)
  const [salvando, iniciarSalvar] = useTransition()
  const [larguraPrevia, setLarguraPrevia] = useState<'desktop' | 'celular'>('desktop')

  const moldura = useRef<HTMLIFrameElement>(null)
  const pontePronta = useRef(false)

  const aba = useMemo(() => ABAS.find((a) => a.id === abaId) ?? ABAS[0]!, [abaId])

  /** Houve mudança desde que a tela abriu? Serve para o aviso de sair sem salvar. */
  const sujo = useMemo(() => JSON.stringify(conteudo) !== JSON.stringify(inicial), [conteudo, inicial])

  // --- a ponte com a prévia -------------------------------------------------

  const mandarParaPrevia = useCallback((c: Conteudo) => {
    moldura.current?.contentWindow?.postMessage(
      { tipo: 'dtechmed:previa', conteudo: c },
      window.location.origin,
    )
  }, [])

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      const t = (e.data as { tipo?: string } | null)?.tipo
      if (t === 'dtechmed:previa:pronta') {
        pontePronta.current = true
        mandarParaPrevia(conteudo)
      }
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [conteudo, mandarParaPrevia])

  // Cada mudança de texto vai para a prévia. Sem espera artificial: escrever no
  // DOM de um iframe é barato, e meio segundo de atraso é o que faz a prévia
  // parecer travada.
  useEffect(() => {
    if (pontePronta.current) mandarParaPrevia(conteudo)
  }, [conteudo, mandarParaPrevia])

  // Avisa antes de fechar a aba com mudança não salva. É a única proteção
  // possível contra o fechamento acidental — o navegador não deixa fazer mais.
  useEffect(() => {
    if (!sujo) return
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aoSair)
    return () => window.removeEventListener('beforeunload', aoSair)
  }, [sujo])

  // --- edição ---------------------------------------------------------------

  const mudar = useCallback((caminho: string, valor: unknown) => {
    setConteudo((c) => escrever(c, caminho, valor))
  }, [])

  /** Mudança que altera o que existe na tela, e não só o texto de algo. */
  const mudarEstrutura = useCallback((caminho: string, valor: unknown) => {
    setConteudo((c) => escrever(c, caminho, valor))
    setPrecisaRecarregar(true)
  }, [])

  function recarregarPrevia() {
    pontePronta.current = false
    setPrecisaRecarregar(false)
    if (moldura.current) moldura.current.src = enderecoPrevia(aba.ancora)
  }

  function enderecoPrevia(ancora: string) {
    return `/?previa=1${ancora}`
  }

  // Trocar de aba leva a prévia para a seção correspondente. É o que faz a tela
  // parecer um editor e não dois painéis independentes lado a lado.
  useEffect(() => {
    const janela = moldura.current?.contentWindow
    if (!janela || !pontePronta.current) return
    if (aba.ancora) {
      const alvo = janela.document.querySelector(aba.ancora)
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      janela.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [aba])

  // --- gravar ---------------------------------------------------------------

  function salvar() {
    setAviso(null)
    iniciarSalvar(async () => {
      const r = await salvarConteudo({ conteudo, versaoBase: versaoAtual })
      if (r.ok) {
        setVersaoAtual(r.versao)
        setAviso({ tipo: 'ok', texto: r.mensagem })
        // A prévia é recarregada depois de salvar para mostrar o resultado de
        // verdade, montado pelo servidor — e não o remendo que a ponte fez.
        recarregarPrevia()
      } else {
        setAviso({ tipo: 'erro', texto: r.motivo })
      }
    })
  }

  return (
    <div className={estilo.tela}>
      <header className={estilo.topo}>
        <div>
          <p className={estilo.grav}>Plataforma</p>
          <h1 className={estilo.titulo}>Site</h1>
        </div>
        <div className={estilo.topoAcoes}>
          <span className={estilo.versao}>
            {versaoAtual === 0 ? 'nunca editado' : `versão ${versaoAtual}`}
            {atualizadoEm ? ` · ${new Date(atualizadoEm).toLocaleString('pt-BR')}` : ''}
          </span>
          <button
            type="button"
            className={estilo.salvar}
            onClick={salvar}
            disabled={salvando || !sujo}
          >
            {salvando ? 'Salvando…' : sujo ? 'Salvar' : 'Tudo salvo'}
          </button>
        </div>
      </header>

      {aviso ? (
        <p className={aviso.tipo === 'ok' ? estilo.avisoOk : estilo.avisoErro} role="status">
          {aviso.texto}
        </p>
      ) : null}

      <div className={estilo.corpo}>
        {/* ---------------- ESQUERDA: as abas e os campos ---------------- */}
        <div className={estilo.lado}>
          <nav className={estilo.abas} aria-label="Seções do site">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={a.id === abaId ? estilo.abaAtiva : estilo.aba}
                onClick={() => setAbaId(a.id)}
                aria-current={a.id === abaId ? 'true' : undefined}
              >
                {a.nome}
              </button>
            ))}
          </nav>

          <div className={estilo.campos}>
            <p className={estilo.descricao}>{aba.descricao}</p>

            {aba.campos.map((campo) => (
              <CampoEntrada
                key={campo.caminho}
                campo={campo}
                valor={ler(conteudo, campo.caminho)}
                aoMudar={(v) => mudar(campo.caminho, v)}
              />
            ))}

            {aba.listasSimples?.map((ls) => {
              const itens = (ler(conteudo, ls.caminho) as string[] | undefined) ?? []
              return (
                <fieldset key={ls.caminho} className={estilo.grupo}>
                  <legend>{ls.rotulo}</legend>
                  {itens.map((v, i) => (
                    <div key={i} className={estilo.linhaItem}>
                      <textarea
                        rows={2}
                        value={v}
                        onChange={(e) => {
                          const novo = [...itens]
                          novo[i] = e.target.value
                          mudarEstrutura(ls.caminho, novo)
                        }}
                      />
                      <button
                        type="button"
                        className={estilo.remover}
                        onClick={() => mudarEstrutura(ls.caminho, itens.filter((_, j) => j !== i))}
                        disabled={itens.length <= 1}
                        aria-label={`Remover ${ls.item} ${i + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={estilo.acrescentar}
                    onClick={() => mudarEstrutura(ls.caminho, [...itens, `Nova ${ls.item}`])}
                    disabled={itens.length >= ls.max}
                  >
                    + acrescentar {ls.item}
                  </button>
                </fieldset>
              )
            })}

            {aba.listas?.map((lista) => {
              const itens = (ler(conteudo, lista.caminho) as Record<string, unknown>[]) ?? []
              return (
                <fieldset key={lista.caminho} className={estilo.grupo}>
                  <legend>{lista.rotulo}</legend>
                  {itens.map((item, i) => (
                    <div key={i} className={estilo.cartaoItem}>
                      <div className={estilo.cartaoTopo}>
                        <strong>
                          {lista.item} {i + 1}
                        </strong>
                        <button
                          type="button"
                          className={estilo.remover}
                          onClick={() =>
                            mudarEstrutura(lista.caminho, itens.filter((_, j) => j !== i))
                          }
                          disabled={itens.length <= 1}
                          aria-label={`Remover ${lista.item} ${i + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                      {lista.campos.map((campo) => (
                        <CampoEntrada
                          key={campo.caminho}
                          campo={campo}
                          valor={item[campo.caminho]}
                          aoMudar={(v) => {
                            const novo = itens.map((x, j) =>
                              j === i ? { ...x, [campo.caminho]: v } : x,
                            )
                            // Texto de item de lista também muda na hora quando
                            // o site marca aquele item; nos outros casos entra
                            // no recarregar.
                            mudarEstrutura(lista.caminho, novo)
                          }}
                        />
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    className={estilo.acrescentar}
                    onClick={() => mudarEstrutura(lista.caminho, [...itens, lista.novo()])}
                    disabled={itens.length >= lista.max}
                  >
                    + acrescentar {lista.item}
                  </button>
                </fieldset>
              )
            })}
          </div>
        </div>

        {/* ---------------- DIREITA: o site de verdade ---------------- */}
        <div className={estilo.previaLado}>
          <div className={estilo.previaBarra}>
            <span className={estilo.previaUrl}>o site, ao vivo</span>
            <div className={estilo.previaBotoes}>
              <button
                type="button"
                className={larguraPrevia === 'desktop' ? estilo.medidaAtiva : estilo.medida}
                onClick={() => setLarguraPrevia('desktop')}
              >
                Computador
              </button>
              <button
                type="button"
                className={larguraPrevia === 'celular' ? estilo.medidaAtiva : estilo.medida}
                onClick={() => setLarguraPrevia('celular')}
              >
                Celular
              </button>
              <button type="button" className={estilo.medida} onClick={recarregarPrevia}>
                Recarregar
              </button>
            </div>
          </div>

          {precisaRecarregar ? (
            <p className={estilo.previaAviso}>
              Você mudou a estrutura (acrescentou, removeu ou trocou uma foto). A prévia mostra
              isso depois de{' '}
              <button type="button" className={estilo.linkAviso} onClick={recarregarPrevia}>
                recarregar
              </button>
              . Salvar também recarrega.
            </p>
          ) : null}

          <div className={larguraPrevia === 'celular' ? estilo.molduraCelular : estilo.moldura}>
            <iframe
              ref={moldura}
              src="/?previa=1"
              title="Prévia do site"
              className={estilo.iframe}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function CampoEntrada({
  campo,
  valor,
  aoMudar,
}: {
  campo: Campo
  valor: unknown
  aoMudar: (v: unknown) => void
}) {
  const id = `campo-${campo.caminho.replace(/\./g, '-')}`
  const texto = valor === undefined || valor === null ? '' : String(valor)

  return (
    <div className={estilo.campo}>
      <label htmlFor={id}>{campo.rotulo}</label>
      {campo.tipo === 'area' ? (
        <textarea id={id} rows={3} value={texto} onChange={(e) => aoMudar(e.target.value)} />
      ) : campo.tipo === 'numero' ? (
        <input
          id={id}
          type="number"
          step="0.1"
          value={texto}
          onChange={(e) => aoMudar(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      ) : (
        <input id={id} type="text" value={texto} onChange={(e) => aoMudar(e.target.value)} />
      )}
      {campo.ajuda ? <small>{campo.ajuda}</small> : null}
    </div>
  )
}

export type { Aba }
