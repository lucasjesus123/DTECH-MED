'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buscaGeral, type Achados } from '@/server/acoes/busca-geral'
import estilo from './shell.module.css'

const NADA: Achados = { ordens: [], clientes: [], equipamentos: [], atalho: null }

/**
 * A BUSCA DA BARRA — o caminho curto de toda tela.
 *
 * =============================================================================
 * ELA REUSA A CONSULTA DO SISTEMA ANTIGO, DE PROPÓSITO
 * =============================================================================
 * `buscaGeral` já sabe o que este sistema precisa saber: que digitar um NÚMERO
 * é perguntar por uma O.S., que digitar um NOME é perguntar pela ÚLTIMA O.S.
 * daquele cliente (e não pela ficha cadastral dele), e que cada resultado
 * precisa passar pela permissão de quem pesquisou. Escrever uma segunda busca
 * seria manter duas versões dessa regra e descobrir um dia que elas
 * discordavam justamente no caso raro.
 *
 * O que muda aqui é só o ENDEREÇO de destino: o sistema novo mora em
 * `/sistema`. A tradução é uma linha, e é total — as três telas de destino
 * (ordem, cliente, equipamento) existem dos dois lados.
 *
 * =============================================================================
 * O QUE ACONTECE EM CADA TECLA
 * =============================================================================
 * A espera de 250ms existe para "Hospital Bruno Born" não virar dezenove
 * consultas ao banco. O contador `pedido` descarta a resposta atrasada: sem
 * ele, a busca de "Hosp" pode chegar depois da de "Hospital" e sobrescrever a
 * lista certa com uma lista velha.
 */

/** `/painel/...` → `/sistema/...`. Ver o comentário acima. */
function aqui(href: string): string {
  return href.replace(/^\/painel\b/, '/sistema')
}

export default function Busca() {
  const router = useRouter()
  const [termo, setTermo] = useState('')
  /**
   * A resposta vem CARIMBADA com o termo que a pediu.
   *
   * Guardar só os achados obrigaria o efeito a limpá-los a cada tecla — e
   * limpar estado dentro de efeito faz a lista piscar entre uma busca e a
   * seguinte. Com o carimbo, quem decide o que aparece é a renderização.
   */
  const [resposta, setResposta] = useState<{ termo: string; achados: Achados }>({
    termo: '',
    achados: NADA,
  })
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)

  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const pedido = useRef(0)

  const limpo = termo.trim()
  const achados = resposta.termo === limpo ? resposta.achados : NADA
  const buscando = limpo.length > 0 && resposta.termo !== limpo

  // Número é pergunta sobre UMA ordem, e a ordem vem primeiro. Nome é pergunta
  // sobre um cliente, e a resposta — a última O.S. dele — precisa ser a
  // primeira linha, não algo abaixo de quatro ordens antigas.
  const porNumero = /^\d+$/.test(limpo)

  const deOrdens = achados.ordens.map((o) => ({
    href: `/sistema/ordens/${o.id}`,
    chave: `o${o.id}`,
    titulo: `O.S. ${String(o.numero).padStart(5, '0')} · ${o.equipamento}`,
    apoio: `${o.cliente} · ${o.etapa}`,
  }))
  const deClientes = achados.clientes.map((c) => ({
    href: c.ultima ? `/sistema/ordens/${c.ultima.id}` : `/sistema/clientes/${c.id}`,
    chave: `c${c.id}`,
    titulo: c.nome,
    apoio: c.ultima
      ? `Última O.S. ${String(c.ultima.numero).padStart(5, '0')} · ${c.ultima.etapa}`
      : `${c.cidade || 'sem cidade'} · sem ordens`,
  }))
  const deEquipamentos = achados.equipamentos.map((e) => ({
    href: `/sistema/equipamentos/${e.id}`,
    chave: `e${e.id}`,
    titulo: e.nome,
    apoio: `${e.serie || 'sem série'}${e.dono ? ` · ${e.dono}` : ''}`,
  }))

  /** A lista achatada, na ordem em que aparece — é por ela que as setas andam. */
  const linhas = porNumero
    ? [...deOrdens, ...deClientes, ...deEquipamentos]
    : [...deClientes, ...deOrdens, ...deEquipamentos]

  useEffect(() => {
    const t = termo.trim()
    if (t.length === 0) return
    const meu = ++pedido.current
    const relogio = setTimeout(() => {
      buscaGeral(t)
        .then((r) => {
          if (meu !== pedido.current) return
          setResposta({ termo: t, achados: r })
          setMarcado(0)
        })
        .catch(() => {
          // Busca que falha não pode deixar a lista velha no ar dizendo que
          // achou: ela responderia a pergunta anterior com cara de atual.
          if (meu === pedido.current) setResposta({ termo: t, achados: NADA })
        })
    }, 250)
    return () => clearTimeout(relogio)
  }, [termo])

  /**
   * Ctrl+K (ou ⌘K), e `/` quando ninguém está digitando.
   *
   * A guarda do `/` importa: sem ela, digitar uma barra no meio de um endereço
   * dentro de qualquer formulário roubaria o foco para cá.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null
      const digitando =
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo instanceof HTMLSelectElement ||
        alvo?.isContentEditable === true

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        campo.current?.focus()
        campo.current?.select()
        return
      }
      if (e.key === '/' && !digitando) {
        e.preventDefault()
        campo.current?.focus()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // Clicar fora fecha. Lista aberta por cima da tela seguinte é a maneira mais
  // rápida de a pessoa clicar no lugar errado.
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [])

  function ir(href: string) {
    setAberto(false)
    setTermo('')
    setResposta({ termo: '', achados: NADA })
    campo.current?.blur()
    router.push(href)
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setAberto(false)
      campo.current?.blur()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAberto(true)
      setMarcado((m) => Math.min(m + 1, Math.max(linhas.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMarcado((m) => Math.max(m - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // O atalho é calculado no SERVIDOR, por quem fez as consultas. Deixar a
      // tela adivinhar faria a regra existir em dois lugares.
      const escolhida = linhas[marcado]?.href ?? (achados.atalho ? aqui(achados.atalho) : null)
      if (escolhida) ir(escolhida)
    }
  }

  const mostrar = aberto && limpo.length > 0
  const temAlgo = linhas.length > 0

  return (
    <div className={estilo.busca} ref={caixa}>
      <svg
        className={estilo.buscaLupa}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        ref={campo}
        className={estilo.buscaCampo}
        type="search"
        value={termo}
        placeholder="Buscar O.S., cliente ou aparelho"
        aria-label="Buscar no sistema"
        autoComplete="off"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTermo(e.target.value)
          setAberto(true)
        }}
        onKeyDown={aoTeclarNoCampo}
      />
      {termo.length === 0 ? <span className={estilo.buscaTecla}>⌘K</span> : null}

      {mostrar ? (
        <div className={estilo.buscaPainel} role="listbox" aria-label="Resultados">
          {!temAlgo ? (
            <p className={estilo.buscaVazio}>
              {buscando ? 'Procurando…' : 'Nada encontrado com esse termo.'}
            </p>
          ) : (
            linhas.map((l, i) => (
              <LinhaAchada
                key={l.chave}
                titulo={l.titulo}
                apoio={l.apoio}
                href={l.href}
                marcada={i === marcado}
                aoApontar={() => setMarcado(i)}
                aoEscolher={ir}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Um resultado da lista.
 *
 * É `button`, e não `a`: o clique fecha a lista e limpa o campo ANTES de
 * navegar. Um link cru deixaria a lista aberta por cima da tela seguinte.
 *
 * =============================================================================
 * POR QUE ELE É UM COMPONENTE À PARTE
 * =============================================================================
 * `ir` mexe no campo de busca por referência — ele tira o foco antes de sair da
 * tela. Criar `() => ir(href)` dentro do laço, no mesmo componente que segura a
 * referência, é o padrão que o compilador do React acusa: um fechamento
 * montado durante o desenho que pode ler uma referência ali mesmo.
 *
 * Separando, o filho recebe a função pronta e o `href`. A referência continua
 * onde sempre esteve, e ninguém a lê durante o desenho.
 */
function LinhaAchada({
  titulo,
  apoio,
  href,
  marcada,
  aoApontar,
  aoEscolher,
}: {
  titulo: string
  apoio: string
  href: string
  marcada: boolean
  aoApontar: () => void
  aoEscolher: (href: string) => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={marcada}
      className={marcada ? estilo.buscaItemMarcado : estilo.buscaItem}
      onMouseEnter={aoApontar}
      onClick={() => aoEscolher(href)}
    >
      <strong>{titulo}</strong>
      <span>{apoio}</span>
    </button>
  )
}
