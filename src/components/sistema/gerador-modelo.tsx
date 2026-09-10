'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  marcadoresDe,
  renderizarModelo,
  valoresDeExemplo,
  variaveisPorGrupo,
} from '@/lib/variaveis-documento'
import { ROTULO_TIPO_UM, TIPOS_MODELAVEIS, type TipoModelavel } from '@/lib/tipos-de-documento'
import { salvarModelo } from '@/server/acoes/modelos'
import { Chip } from './pecas'
import estilo from './pecas.module.css'

/**
 * `<TemplateBuilder>` — o gerador de documentos.
 *
 * =============================================================================
 * O PROBLEMA QUE ELE RESOLVE
 * =============================================================================
 * O texto do contrato, do laudo e da nota promissória era código. Trocar uma
 * cláusula exigia um programador e uma implantação — e por isso o texto nunca
 * era trocado, mesmo quando estava errado.
 *
 * Aqui ele é cadastro. Quem responde pelo negócio escreve o que a empresa
 * promete, e vê na hora como fica preenchido.
 *
 * =============================================================================
 * TRÊS PEÇAS, E CADA UMA TIRA UM MEDO
 * =============================================================================
 *   1. OS CHIPS. Sessenta variáveis num paredão não se lê; agrupadas por
 *      assunto e clicáveis, elas viram uma paleta. Clicar insere no cursor —
 *      ninguém precisa decorar `{{cliente_documento}}` nem acertar as chaves.
 *
 *   2. O TOGGLE BRUTO ↔ PREENCHIDO. É a diferença entre ver o molde e ver o
 *      documento. Sem ele, a pessoa só descobre como ficou depois de emitir um
 *      PDF de verdade para um cliente de verdade.
 *
 *   3. O QUE FICOU SEM VALOR APARECE MARCADO. Um marcador vazio é um buraco no
 *      contrato, e buraco invisível é pior que buraco visível: o âmbar diz "não
 *      há valor para isto nesta O.S." e o vermelho diz "este marcador não
 *      existe no catálogo — você digitou errado".
 *
 * =============================================================================
 * A PRÉ-VISUALIZAÇÃO É FEITA COM A MESMA FUNÇÃO QUE GERA O PDF
 * =============================================================================
 * `renderizarModelo` é a única. Uma segunda versão só para a tela viveria uns
 * meses em paz e depois divergiria — e o jeito de descobrir seria um contrato
 * saindo diferente do que a pessoa aprovou na tela.
 */

export type ModeloEmEdicao = {
  id: string | null
  nome: string
  tipo: string
  descricao: string
  corpo: string
  padrao: boolean
}

export default function GeradorDeModelo({
  modelo,
  /**
   * Os valores de uma O.S. REAL, para o botão "simular com O.S. real".
   *
   * Nulo quando ninguém escolheu uma ordem — aí a simulação usa os exemplos do
   * catálogo, que são bons para conferir o desenho e não provam nada sobre os
   * dados da empresa.
   */
  valoresReais,
  rotuloDaOrdemReal,
}: {
  modelo: ModeloEmEdicao
  valoresReais: Record<string, string> | null
  rotuloDaOrdemReal: string | null
}) {
  const router = useRouter()
  const [indo, salvando] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [nome, setNome] = useState(modelo.nome)
  const [tipo, setTipo] = useState(modelo.tipo)
  const [descricao, setDescricao] = useState(modelo.descricao)
  const [corpo, setCorpo] = useState(modelo.corpo)
  const [padrao, setPadrao] = useState(modelo.padrao)

  const [preenchido, setPreenchido] = useState(true)
  const [comReal, setComReal] = useState(false)

  const area = useRef<HTMLTextAreaElement>(null)
  const grupos = useMemo(() => variaveisPorGrupo(), [])

  // O objeto de valores precisa ser ESTÁVEL entre renderizações: sem o memo,
  // `valoresDeExemplo()` devolveria um objeto novo a cada tecla e o memo do
  // render abaixo nunca acertaria — ele recalcularia sempre, que é o oposto do
  // que ele existe para fazer.
  const exemplos = useMemo(() => valoresDeExemplo(), [])
  const valores = comReal && valoresReais ? valoresReais : exemplos
  const render = useMemo(() => renderizarModelo(corpo, valores), [corpo, valores])
  const marcadores = useMemo(() => marcadoresDe(corpo), [corpo])

  /**
   * Insere no CURSOR, e não no fim.
   *
   * Inserir no fim obrigaria a pessoa a recortar e colar o marcador até o lugar
   * certo — o que é justamente o trabalho que o chip existe para evitar.
   */
  function inserir(chave: string) {
    const t = area.current
    const marcador = `{{${chave}}}`
    if (!t) {
      setCorpo((c) => c + marcador)
      return
    }
    const inicio = t.selectionStart
    const fim = t.selectionEnd
    const novo = corpo.slice(0, inicio) + marcador + corpo.slice(fim)
    setCorpo(novo)
    // O cursor volta para depois do que foi inserido, no próximo quadro — antes
    // disso o React ainda não reescreveu o valor da área.
    requestAnimationFrame(() => {
      t.focus()
      t.setSelectionRange(inicio + marcador.length, inicio + marcador.length)
    })
  }

  function salvar() {
    setErro(null)
    setAviso(null)
    salvando(async () => {
      const form = new FormData()
      if (modelo.id) form.set('id', modelo.id)
      form.set('nome', nome)
      form.set('tipo', tipo)
      form.set('descricao', descricao)
      form.set('corpo', corpo)
      if (padrao) form.set('padrao', 'on')

      const r = await salvarModelo({ ok: true, mensagem: '' }, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setAviso(r.mensagem)
      router.refresh()
    })
  }

  return (
    <div className={estilo.split}>
      <div className={estilo.blocos}>
        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              1
            </span>
            <h2 className={estilo.blocoNomeForm}>O texto do documento</h2>
          </div>

          <div className={estilo.campos}>
            <label className={estilo.campo}>
              <span>Nome do modelo</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Contrato padrão 2026"
              />
            </label>
            <label className={estilo.campo}>
              <span>Tipo de documento</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_MODELAVEIS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_UM[t as TipoModelavel]}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${estilo.campo} ${estilo.largo}`}>
              <span>Para que serve (opcional)</span>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Quando usar este, e não o outro"
              />
            </label>
          </div>

          <label className={estilo.campo}>
            <span>Corpo</span>
            <textarea
              ref={area}
              className={estilo.editor}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              spellCheck={false}
              placeholder="Escreva o documento. Clique nos chips ao lado para inserir os dados que o sistema preenche."
            />
          </label>

          <label className={estilo.assinaturaPe}>
            <input
              type="checkbox"
              checked={padrao}
              onChange={(e) => setPadrao(e.target.checked)}
            />
            <span>Este é o modelo padrão deste tipo</span>
          </label>
        </section>

        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              2
            </span>
            <h2 className={estilo.blocoNomeForm}>Como fica preenchido</h2>
          </div>

          <div className={estilo.barraLista}>
            <div className={estilo.toggle} role="group" aria-label="Modo da pré-visualização">
              <button
                type="button"
                className={!preenchido ? estilo.toggleOpcaoAtiva : estilo.toggleOpcao}
                onClick={() => setPreenchido(false)}
              >
                Bruto
              </button>
              <button
                type="button"
                className={preenchido ? estilo.toggleOpcaoAtiva : estilo.toggleOpcao}
                onClick={() => setPreenchido(true)}
              >
                Preenchido
              </button>
            </div>

            {valoresReais ? (
              <button
                type="button"
                className={comReal ? estilo.acao : estilo.acaoLinha}
                onClick={() => setComReal((v) => !v)}
              >
                {comReal ? `Usando ${rotuloDaOrdemReal}` : 'Simular com O.S. real'}
              </button>
            ) : (
              <span className={estilo.campoDica}>
                Nenhuma O.S. disponível para simular — a pré-visualização usa
                exemplos do catálogo.
              </span>
            )}
          </div>

          <div className={estilo.papel}>
            {preenchido ? (
              <PreVisualizacao
                corpo={corpo}
                valores={valores}
                desconhecidos={render.desconhecidos}
                vazios={render.vazios}
              />
            ) : (
              corpo || 'O modelo está vazio.'
            )}
          </div>
        </section>
      </div>

      <aside className={estilo.vivo}>
        <p className={estilo.vivoTitulo}>Dados que o sistema preenche</p>

        <div className={estilo.chips}>
          {grupos.map(([grupo, vars]) => (
            <div key={grupo} className={estilo.chipsGrupo}>
              <p className={estilo.chipsTitulo}>{grupo}</p>
              <div className={estilo.chipsLinha}>
                {vars.map((v) => (
                  <button
                    key={v.chave}
                    type="button"
                    className={estilo.chipVar}
                    title={`${v.rotulo} — ex.: ${v.exemplo}`}
                    onClick={() => inserir(v.chave)}
                  >
                    {v.chave}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={estilo.dinheiro}>
          <p className={estilo.dinheiroLinha}>
            <span>Marcadores usados</span>
            <strong>{marcadores.length}</strong>
          </p>
          {render.desconhecidos.length > 0 ? (
            <p className={estilo.dinheiroLinha}>
              <span>
                <Chip tom="danger">Não existem</Chip>
              </span>
              <strong>{render.desconhecidos.join(', ')}</strong>
            </p>
          ) : null}
          {render.vazios.length > 0 ? (
            <p className={estilo.dinheiroLinha}>
              <span>
                <Chip tom="warn">Sem valor agora</Chip>
              </span>
              <strong>{render.vazios.length}</strong>
            </p>
          ) : null}
        </div>

        {render.desconhecidos.length > 0 ? (
          <p className={estilo.campoDica}>
            Marcador que o catálogo não conhece sai no documento como texto
            cru — o cliente lê <code>{'{{ciiente_nome}}'}</code> no contrato.
          </p>
        ) : null}

        <button
          type="button"
          className={estilo.acaoLarga}
          onClick={salvar}
          disabled={indo || nome.trim().length === 0 || corpo.trim().length === 0}
        >
          {indo ? 'Salvando…' : modelo.id ? 'Salvar alterações' : 'Criar modelo'}
        </button>

        {aviso ? <p className={estilo.campoDica}>{aviso}</p> : null}
        {erro ? (
          <p className={estilo.acaoErro} role="alert">
            {erro}
          </p>
        ) : null}
      </aside>
    </div>
  )
}

/**
 * A pré-visualização, com os buracos marcados.
 *
 * O texto é partido nos marcadores e remontado em pedaços: o que tem valor sai
 * como texto normal, o que está vazio sai realçado em âmbar, e o que não existe
 * no catálogo sai em vermelho. Nada é escondido — este bloco existe para
 * mostrar o que vai sair de verdade.
 */
function PreVisualizacao({
  corpo,
  valores,
  desconhecidos,
  vazios,
}: {
  corpo: string
  valores: Record<string, string>
  /**
   * Quem decide o que é buraco é `renderizarModelo` — a MESMA função que gera o
   * PDF. Repetir a conta aqui criaria uma segunda opinião sobre o que está
   * faltando, e um dia a tela diria "está tudo certo" sobre um documento que
   * sai com um traço no meio.
   */
  desconhecidos: string[]
  vazios: string[]
}) {
  const partes: React.ReactNode[] = []
  const marcador = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi
  let ultimo = 0
  let m: RegExpExecArray | null

  while ((m = marcador.exec(corpo)) !== null) {
    if (m.index > ultimo) partes.push(corpo.slice(ultimo, m.index))
    const chave = (m[1] ?? '').toLowerCase()
    const valor = valores[chave]

    if (desconhecidos.includes(chave)) {
      partes.push(
        <mark key={`${m.index}-x`} className={estilo.desconhecido}>
          {m[0]}
        </mark>,
      )
    } else if (vazios.includes(chave)) {
      partes.push(
        <mark key={`${m.index}-v`} className={estilo.vazio2}>
          {chave}
        </mark>,
      )
    } else {
      partes.push(valor ?? '—')
    }
    ultimo = m.index + m[0].length
  }
  if (ultimo < corpo.length) partes.push(corpo.slice(ultimo))

  return <>{partes.length > 0 ? partes : 'O modelo está vazio.'}</>
}
