'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buscaGeral, type Achados } from '@/server/acoes/busca-geral'
import estilo from './painel.module.css'

const NADA: Achados = { ordens: [], clientes: [], equipamentos: [], atalho: null }

/**
 * A BUSCA DA BARRA — o caminho curto que faltava.
 *
 * =============================================================================
 * A PERGUNTA DO TELEFONE
 * =============================================================================
 * O telefone toca e quem está do outro lado diz uma de três coisas: o número da
 * O.S., o nome da clínica, ou a marca do aparelho. Nenhuma tinha caminho curto —
 * para o nome eram quatro telas, com o cliente esperando na linha.
 *
 * Digitar o NOME e receber a ÚLTIMA O.S. daquele cliente é o comportamento
 * central desta caixa, e não um extra: quem digita o nome quase nunca quer a
 * ficha cadastral, quer saber em que pé está o aparelho.
 *
 * =============================================================================
 * ELA VIVE NA BARRA, E NÃO NUMA TELA DE BUSCA
 * =============================================================================
 * Uma tela de busca só é usada por quem lembra que ela existe. Na barra, a caixa
 * está presente em toda tela do sistema — inclusive naquela em que a pessoa
 * estava quando o telefone tocou, que é o momento em que ela é necessária.
 *
 * =============================================================================
 * O QUE ACONTECE EM CADA TECLA
 * =============================================================================
 * A espera de 250ms existe para "Hospital Bruno Born" não virar dezenove
 * consultas ao banco, uma por tecla. O contador `pedido` descarta a resposta
 * atrasada: sem ele, a busca de "Hosp" pode chegar depois da de "Hospital" e
 * sobrescrever a lista certa com uma lista velha.
 *
 * O Enter usa o atalho que o SERVIDOR calculou. Deixar a tela decidir para onde
 * ir faria a regra existir em dois lugares, e um dia os dois discordariam
 * justamente no caso raro.
 */
export default function Busca() {
  const router = useRouter()
  const [termo, setTermo] = useState('')
  /**
   * A RESPOSTA VEM CARIMBADA COM O TERMO QUE A PEDIU.
   *
   * Guardar só os achados obrigaria o efeito a limpá-los a cada tecla — e
   * limpar estado dentro de efeito faz a tela renderizar em cascata e piscar a
   * lista entre uma busca e a seguinte. Com o carimbo, quem decide o que
   * aparece é a RENDERIZAÇÃO: resultado de termo antigo simplesmente não é o
   * do termo atual.
   */
  const [resposta, setResposta] = useState<{ termo: string; achados: Achados }>({
    termo: '',
    achados: NADA,
  })
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)

  const limpo = termo.trim()
  const achados = resposta.termo === limpo ? resposta.achados : NADA
  const buscando = limpo.length > 0 && resposta.termo !== limpo

  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const pedido = useRef(0)

  /**
   * A ORDEM DOS GRUPOS SEGUE A INTENÇÃO DE QUEM DIGITOU.
   *
   * Número é pergunta sobre UMA ordem, e a ordem vem primeiro. Nome é pergunta
   * sobre um cliente — e a resposta é "a última O.S. dele", que precisa ser a
   * primeira linha da lista e não algo abaixo de quatro ordens antigas.
   */
  const porNumero = /^\d+$/.test(limpo)

  const deOrdens = achados.ordens.map((o) => ({
    href: `/painel/ordens/${o.id}`,
    chave: `o${o.id}`,
  }))
  const deClientes = achados.clientes.map((c) => ({
    // O cliente leva à ÚLTIMA O.S. dele. Só cai na ficha quem nunca teve uma.
    href: c.ultima ? `/painel/ordens/${c.ultima.id}` : `/painel/clientes/${c.id}`,
    chave: `c${c.id}`,
  }))
  const deEquipamentos = achados.equipamentos.map((e) => ({
    href: `/painel/equipamentos/${e.id}`,
    chave: `e${e.id}`,
  }))

  /** A lista achatada, na ordem em que aparece — é por ela que as setas andam. */
  const linhas: Array<{ href: string; chave: string }> = porNumero
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
          // A busca que falha não pode deixar a lista velha no ar dizendo que
          // achou: ela responderia a pergunta anterior com cara de atual.
          if (meu === pedido.current) setResposta({ termo: t, achados: NADA })
        })
    }, 250)
    return () => clearTimeout(relogio)
  }, [termo])

  /**
   * O ATALHO DE TECLADO — Ctrl+K, e / quando ninguém está digitando.
   *
   * Quem atende o balcão está com as duas mãos no teclado e o telefone no
   * ombro. A barra ficaria a um clique de distância que ninguém dá.
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

  // Clicar fora fecha. Uma lista que fica aberta por cima da tela seguinte é a
  // maneira mais rápida de a pessoa clicar no lugar errado.
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
      const escolhida = linhas[marcado]?.href ?? achados.atalho
      if (escolhida) ir(escolhida)
    }
  }

  const temAlgo =
    achados.ordens.length + achados.clientes.length + achados.equipamentos.length > 0
  const mostrar = aberto && termo.trim().length > 0

  const grupoOrdens =
    achados.ordens.length > 0 ? (
      <>
        <p className={estilo.buscaGrupo}>Ordens de serviço</p>
        {achados.ordens.map((o) => (
          <Linha
            key={o.id}
            marcada={linhas[marcado]?.chave === `o${o.id}`}
            aoIr={() => ir(`/painel/ordens/${o.id}`)}
            titulo={`#${String(o.numero).padStart(4, '0')} · ${o.cliente}`}
            detalhe={`${o.equipamento} · ${o.etapa}`}
          />
        ))}
      </>
    ) : null

  const grupoClientes =
    achados.clientes.length > 0 ? (
      <>
        <p className={estilo.buscaGrupo}>
          Clientes <span className={estilo.fraco}>— vai para a última O.S.</span>
        </p>
        {achados.clientes.map((c) => (
          <Linha
            key={c.id}
            marcada={linhas[marcado]?.chave === `c${c.id}`}
            aoIr={() => ir(c.ultima ? `/painel/ordens/${c.ultima.id}` : `/painel/clientes/${c.id}`)}
            titulo={c.nome}
            detalhe={
              c.ultima
                ? `última: #${String(c.ultima.numero).padStart(4, '0')} · ${c.ultima.equipamento} · ${c.ultima.etapa}`
                : c.ordens === 0
                  ? 'nenhuma O.S. ainda — abre a ficha'
                  : 'sem O.S. recente — abre a ficha'
            }
          />
        ))}
      </>
    ) : null

  return (
    <div className={estilo.busca} ref={caixa}>
      <div className={estilo.buscaCampo}>
        <LupaIcone />
        <input
          ref={campo}
          type="search"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclarNoCampo}
          placeholder="Buscar O.S., cliente, equipamento…"
          aria-label="Buscar O.S. pelo número ou pelo nome do cliente"
          aria-expanded={mostrar}
          aria-controls="resultados-da-busca"
          role="combobox"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className={estilo.buscaTecla} aria-hidden="true">
          Ctrl
        </kbd>
        <kbd className={estilo.buscaTecla} aria-hidden="true">
          K
        </kbd>
      </div>

      {mostrar ? (
        <div className={estilo.buscaLista} id="resultados-da-busca" role="listbox">
          {!temAlgo ? (
            <p className={estilo.buscaNada}>
              {buscando ? 'Procurando…' : `Nada encontrado para "${termo.trim()}".`}
            </p>
          ) : null}

          {/* Nome primeiro traz clientes; número primeiro traz ordens. É a
              mesma ordem em que as setas andam. */}
          {(porNumero ? [grupoOrdens, grupoClientes] : [grupoClientes, grupoOrdens]).map((g, i) => (
            <div key={i}>{g}</div>
          ))}

          {achados.equipamentos.length > 0 ? (
            <>
              <p className={estilo.buscaGrupo}>Equipamentos</p>
              {achados.equipamentos.map((e) => (
                <Linha
                  key={e.id}
                  marcada={linhas[marcado]?.chave === `e${e.id}`}
                  aoIr={() => ir(`/painel/equipamentos/${e.id}`)}
                  titulo={e.nome}
                  detalhe={[e.serie ? `série ${e.serie}` : null, e.dono ?? 'sem dono no catálogo']
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </>
          ) : null}

          {temAlgo ? (
            <p className={estilo.buscaRodape}>
              <kbd>↑</kbd> <kbd>↓</kbd> para escolher · <kbd>Enter</kbd> para abrir ·{' '}
              <kbd>Esc</kbd> para fechar
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Um resultado.
 *
 * É `button`, e não `a`: o clique fecha a lista e limpa o campo antes de
 * navegar. Um link cru deixaria a lista aberta por cima da tela seguinte.
 */
function Linha({
  titulo,
  detalhe,
  marcada,
  aoIr,
}: {
  titulo: string
  detalhe: string
  marcada: boolean
  aoIr: () => void
  indice?: number
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={marcada}
      className={marcada ? `${estilo.buscaItem} ${estilo.buscaItemMarcado}` : estilo.buscaItem}
      onClick={aoIr}
    >
      <span className={estilo.buscaTitulo}>{titulo}</span>
      <span className={estilo.buscaDetalhe}>{detalhe}</span>
    </button>
  )
}

function LupaIcone() {
  return (
    <svg
      className={estilo.buscaLupa}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
