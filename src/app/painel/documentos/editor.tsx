'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { salvarModelo } from '@/server/acoes/modelos'
import { renderizarModelo, type Variavel } from '@/lib/variaveis-documento'
import estilo from '../painel.module.css'

/**
 * O EDITOR DE MODELO.
 *
 * =============================================================================
 * A PALETA CLICA E COLA NO CURSOR — não copia para a área de transferência
 * =============================================================================
 * A referência que inspirou esta tela diz "clique numa variável para copiar e
 * cole no editor". Copiar é um passo a mais e um risco: a pessoa clica, muda de
 * janela, perde o que tinha copiado, volta e cola outra coisa.
 *
 * Aqui o clique INSERE no ponto onde o cursor estava. Se houver texto
 * selecionado, ele é substituído — que é o que se espera ao selecionar um nome
 * e clicar na variável que deve tomar o lugar dele.
 *
 * =============================================================================
 * BRUTO E PREENCHIDO
 * =============================================================================
 * Bruto é o que está escrito. Preenchido é o que sai no papel, com os valores
 * de exemplo no lugar dos marcadores.
 *
 * As duas visões existem porque elas respondem perguntas diferentes: no bruto
 * se confere se a variável certa está no lugar certo; no preenchido se lê o
 * documento como o cliente vai ler, e é aí que a frase mal montada aparece.
 *
 * =============================================================================
 * O AVISO QUE EVITA O CONTRATO CONSTRANGEDOR
 * =============================================================================
 * Marcador que o sistema não conhece é denunciado AQUI, com o texto na frente
 * de quem escreveu. Ele também é barrado ao salvar — mas o aviso enquanto se
 * digita é o que faz a pessoa consertar antes de tentar.
 *
 * Na hora de gerar o PDF ele sairia impresso como está, de propósito: um
 * documento com `{{cliente_nomee}}` na folha é notado; um com um buraco no lugar
 * do nome é assinado.
 */

type ModeloExistente = {
  id: string
  nome: string
  tipo: string
  descricao: string | null
  corpo: string
  padrao: boolean
}

export default function EditorDeModelo({
  tipo,
  rotuloTipo,
  grupos,
  exemplos,
  modelo,
  aoFechar,
}: {
  tipo: string
  rotuloTipo: string
  grupos: Array<[string, Variavel[]]>
  exemplos: Record<string, string>
  modelo?: ModeloExistente
  aoFechar: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarModelo, {
    ok: true as const,
    mensagem: '',
  })
  const [corpo, setCorpo] = useState(modelo?.corpo ?? '')
  const [preenchido, setPreenchido] = useState(true)
  const [filtro, setFiltro] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  const previa = useMemo(() => renderizarModelo(corpo, exemplos), [corpo, exemplos])

  /**
   * SALVOU, FECHA.
   *
   * A primeira versão deixava o editor aberto depois de salvar, mostrando
   * "Modelo criado" com os campos já limpos — e o que a pessoa vê é um
   * formulário vazio com um aviso de sucesso. Ela não sabe se o modelo está na
   * lista, e o instinto é preencher de novo, criando um segundo igual.
   *
   * Fechar devolve para a lista, onde o cartão novo está visível. A confirmação
   * é o cartão, não a frase.
   */
  useEffect(() => {
    if (estado.ok && estado.mensagem) aoFechar()
  }, [estado, aoFechar])

  const gruposFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return grupos
    return grupos
      .map(([g, lista]) => {
        const achados = lista.filter(
          (v) => v.chave.includes(q) || v.rotulo.toLowerCase().includes(q) || g.toLowerCase().includes(q),
        )
        return [g, achados] as [string, Variavel[]]
      })
      .filter(([, lista]) => lista.length > 0)
  }, [grupos, filtro])

  /** Insere no cursor, substituindo o que estiver selecionado. */
  function inserir(chave: string) {
    const el = area.current
    const marcador = `{{${chave}}}`
    if (!el) {
      setCorpo((c) => c + marcador)
      return
    }
    const ini = el.selectionStart ?? corpo.length
    const fim = el.selectionEnd ?? corpo.length
    const novo = corpo.slice(0, ini) + marcador + corpo.slice(fim)
    setCorpo(novo)
    // O foco volta para o texto com o cursor DEPOIS do marcador: quem clicou
    // numa variável quer continuar escrevendo a frase, não voltar ao começo.
    requestAnimationFrame(() => {
      el.focus()
      const p = ini + marcador.length
      el.setSelectionRange(p, p)
    })
  }

  return (
    <form action={acao} className={estilo.bloco}>
      <input type="hidden" name="tipo" value={tipo} />
      {modelo ? <input type="hidden" name="id" value={modelo.id} /> : null}

      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{modelo ? 'Editar modelo' : 'Novo modelo'}</p>
          <h2 className={estilo.titulo} style={{ fontSize: 'var(--t-lg)' }}>
            {rotuloTipo}
          </h2>
        </div>
        <div className={estilo.acoesForm}>
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            Fechar
          </button>
          <button type="submit" className={estilo.btn} disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar modelo'}
          </button>
        </div>
      </div>

      {estado.ok && estado.mensagem ? (
        <p className={estilo.sucesso} role="status">
          {estado.mensagem}
        </p>
      ) : null}
      {!estado.ok ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <div className={estilo.modeloGrade}>
        {/* ---- a paleta ---- */}
        <aside className={estilo.modeloPaleta}>
          <p className={estilo.grav}>Variáveis do sistema</p>
          <p className={estilo.dica}>Clique para inserir no ponto onde o cursor está.</p>
          <input
            className={estilo.campo}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar variáveis…"
            aria-label="Filtrar variáveis"
          />
          <div className={estilo.modeloPaletaLista}>
            {gruposFiltrados.map(([grupo, lista]) => (
              <div key={grupo}>
                <p className={estilo.modeloPaletaGrupo}>{grupo}</p>
                {lista.map((v) => (
                  <button
                    key={v.chave}
                    type="button"
                    className={estilo.modeloVariavel}
                    onClick={() => inserir(v.chave)}
                    title={`${v.rotulo} — sai como: ${v.exemplo}`}
                  >
                    {`{{${v.chave}}}`}
                  </button>
                ))}
              </div>
            ))}
            {gruposFiltrados.length === 0 ? (
              <p className={estilo.dica}>Nenhuma variável com esse nome.</p>
            ) : null}
          </div>
        </aside>

        {/* ---- o texto e a prévia ---- */}
        <div className={estilo.modeloCentro}>
          <div className={estilo.formLinha}>
            <label className={estilo.rotulo}>
              Nome do modelo *
              <input
                className={estilo.campo}
                name="nome"
                required
                maxLength={120}
                defaultValue={modelo?.nome}
                placeholder="Ex.: Contrato hospital"
              />
            </label>
            <label className={estilo.rotulo}>
              Para que serve
              <input
                className={estilo.campo}
                name="descricao"
                maxLength={200}
                defaultValue={modelo?.descricao ?? ''}
                placeholder="Uma linha que diferencie dos outros"
              />
            </label>
          </div>

          <label className={estilo.checkLinha}>
            <input type="checkbox" name="padrao" defaultChecked={modelo?.padrao} />
            <span>
              Usar este como padrão
              <span className={estilo.dica}>
                É o que a emissão usa quando ninguém escolhe. Um por tipo — marcar aqui desmarca o
                anterior.
              </span>
            </span>
          </label>

          <label className={estilo.rotulo}>
            O texto do documento
            <textarea
              ref={area}
              className={estilo.area}
              name="corpo"
              required
              rows={16}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Escreva o documento e vá inserindo as variáveis da lista ao lado."
              spellCheck
            />
          </label>

          {previa.desconhecidos.length > 0 ? (
            <p className={estilo.erro} role="alert">
              O sistema não conhece {previa.desconhecidos.map((m) => `{{${m}}}`).join(', ')}.{' '}
              {previa.desconhecidos.length === 1 ? 'Ela sairia' : 'Elas sairiam'}{' '}
              <strong>{previa.desconhecidos.length === 1 ? 'escrita assim' : 'escritas assim'}</strong> no
              documento — confira a lista ao lado.
            </p>
          ) : null}

          <div className={estilo.modeloPreviaCab}>
            <p className={estilo.grav}>Pré-visualização</p>
            <div className={estilo.abas} role="group" aria-label="Como ver o modelo">
              <button
                type="button"
                className={!preenchido ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
                onClick={() => setPreenchido(false)}
                aria-pressed={!preenchido}
              >
                Bruto
              </button>
              <button
                type="button"
                className={preenchido ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
                onClick={() => setPreenchido(true)}
                aria-pressed={preenchido}
              >
                Preenchido
              </button>
            </div>
          </div>

          <div className={estilo.modeloPapel}>
            {corpo.trim() === '' ? (
              <p className={estilo.dica}>
                O documento aparece aqui conforme você escreve, com dados de exemplo no lugar das
                variáveis.
              </p>
            ) : (
              <pre className={estilo.modeloPapelTexto}>{preenchido ? previa.texto : corpo}</pre>
            )}
          </div>

          <p className={estilo.dica}>
            {previa.desconhecidos.length === 0 && corpo.trim() !== ''
              ? `${new Set(corpo.match(/\{\{\s*[a-z0-9_]+\s*\}\}/gi) ?? []).size} variável(is) neste modelo.`
              : null}
          </p>
        </div>
      </div>
    </form>
  )
}
