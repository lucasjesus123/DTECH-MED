'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { acharEquipamento, type EquipamentoAchado } from '@/server/acoes/achar-equipamento'
import estilo from '../../painel.module.css'

/**
 * QUAL É O APARELHO — puxado do catálogo, ou cadastrado rápido aqui mesmo.
 *
 * =============================================================================
 * O DEFEITO QUE ISTO CONSERTA
 * =============================================================================
 * O catálogo de equipamentos e a abertura de O.S. viviam de costas um para o
 * outro. O cadastro guardava foto, série, patrimônio, voltagem e acessórios; a
 * abertura pedia marca e modelo em texto livre e criava um equipamento NOVO
 * toda vez que a série não batesse — ou não fosse digitada, que é o comum.
 *
 * Duas consequências, as duas ruins: o mesmo laser vira quatro linhas no
 * catálogo, cada uma com um pedaço do histórico e nenhuma com a foto; e o
 * prontuário do equipamento, que existe para responder "essa máquina já voltou
 * três vezes este ano", perde o sentido.
 *
 * =============================================================================
 * DOIS CAMINHOS NA MESMA TELA, E NENHUM ESTORVA O OUTRO
 * =============================================================================
 * · PUXAR: o aparelho já está cadastrado. Procura por marca, modelo, série ou
 *   patrimônio, escolhe, e os campos se preenchem. É o caminho do cliente que
 *   volta — e é ele que mantém o histórico numa linha só.
 *
 * · CADASTRAR RÁPIDO: o aparelho é novo. Digita marca e modelo e segue, como
 *   sempre foi. Nada de mandar a pessoa para outra tela no meio do atendimento:
 *   o cadastro completo, com foto e voltagem, fica a um link de distância para
 *   quem tiver tempo depois.
 *
 * A busca NÃO é obrigatória e não bloqueia ninguém. Aparelho novo é caso comum,
 * não exceção.
 *
 * =============================================================================
 * O DONO É MOSTRADO ANTES DA ESCOLHA, NÃO DEPOIS
 * =============================================================================
 * Um aparelho pode estar sem dono (catálogo) ou já no nome de um cliente. Puxar
 * o aparelho de OUTRA clínica é recusado pelo servidor — e teria que ser, senão
 * o histórico da máquina migraria de nome em silêncio. Descobrir isso só ao
 * salvar seria preencher a ficha inteira para levar um não, então a lista já
 * escreve de quem é cada um e o aviso aparece na hora da escolha.
 *
 * =============================================================================
 * A ESPERA DE 300ms E O CONTADOR `pedido`
 * =============================================================================
 * Mesma razão do campo de cliente: sem eles, cada tecla vira uma consulta e as
 * respostas voltam fora de ordem — a busca de "Neuro" chega depois da de
 * "Neurodyn" e sobrescreve a lista certa com uma lista velha.
 */
export default function QualEOAparelho({
  marcaInicial,
  modeloInicial,
  clienteId,
  clienteNome,
}: {
  marcaInicial: string
  modeloInicial: string
  /** Cliente escolhido na carteira, quando houve um. Nulo para cliente novo. */
  clienteId: string | null
  clienteNome: string | null
}) {
  const [marca, setMarca] = useState(marcaInicial)
  const [modelo, setModelo] = useState(modeloInicial)
  const [serie, setSerie] = useState('')
  const [acessorios, setAcessorios] = useState('')

  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<EquipamentoAchado[]>([])
  const [escolhido, setEscolhido] = useState<EquipamentoAchado | null>(null)
  const [buscando, setBuscando] = useState(false)

  const pedido = useRef(0)

  // O efeito não limpa a lista — quem decide mostrar é a renderização, com
  // `mostrarSugestoes`. `setState` síncrono dentro do efeito provoca
  // renderização em cascata a cada tecla apagada. Mesma decisão do campo de
  // cliente, e pelo mesmo motivo.
  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) return
    const meu = ++pedido.current
    const relogio = setTimeout(async () => {
      setBuscando(true)
      const r = await acharEquipamento(t)
      if (meu !== pedido.current) return
      setAchados(r)
      setBuscando(false)
    }, 300)
    return () => clearTimeout(relogio)
  }, [termo])

  function escolher(e: EquipamentoAchado) {
    setEscolhido(e)
    setMarca(e.marca)
    setModelo(e.modelo)
    setSerie(e.numeroSerie ?? '')
    setAcessorios(e.acessorios ?? '')
    setAchados([])
    setTermo('')
  }

  function trocar() {
    setEscolhido(null)
    setAchados([])
    setTermo('')
  }

  const mostrarSugestoes = termo.trim().length >= 2

  /**
   * O aparelho é de outro cliente?
   *
   * Só dá para saber quando o cliente veio da carteira: para um cliente novo
   * não existe id com que comparar, e aí a conferência é a do servidor, na
   * hora de salvar. Comparar contra nada e avisar "de outro cliente" seria
   * assustar quem está certo.
   */
  const deOutroCliente = Boolean(
    escolhido?.donoId && clienteId && escolhido.donoId !== clienteId,
  )

  return (
    <>
      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
        Qual é o aparelho
      </p>

      {escolhido ? (
        <p
          className={deOutroCliente ? estilo.avisoCaixaForte : estilo.avisoCaixa}
          role={deOutroCliente ? 'alert' : 'status'}
        >
          {deOutroCliente ? (
            <>
              <strong>
                Este aparelho está no nome de {escolhido.donoNome}, não de {clienteNome}.
              </strong>{' '}
              A abertura vai ser recusada assim — trocar o dono arrastaria junto todo o histórico
              da máquina para o nome errado. Confira o cliente da O.S., ou cadastre este aparelho
              como novo.{' '}
            </>
          ) : (
            <>
              <strong>
                Do catálogo: {escolhido.marca} {escolhido.modelo}
                {escolhido.numeroSerie ? ` · série ${escolhido.numeroSerie}` : ''}.
              </strong>{' '}
              {escolhido.ordens > 0
                ? `${escolhido.ordens} ${escolhido.ordens === 1 ? 'ordem já passou' : 'ordens já passaram'} com ele. `
                : 'Primeira ordem deste aparelho. '}
              {escolhido.donoId
                ? 'O histórico continua nesta mesma máquina. '
                : 'Ele ainda não tinha dono — vai ficar no nome deste cliente. '}
            </>
          )}
          <button type="button" className={estilo.linkAcao} onClick={trocar}>
            Trocar de aparelho
          </button>
        </p>
      ) : null}

      {/* A busca some depois da escolha: com um aparelho escolhido ela só
          confundiria, e "Trocar de aparelho" já é o caminho de volta. */}
      {!escolhido ? (
        <label className={estilo.rotulo} style={{ position: 'relative' }}>
          Puxar aparelho já cadastrado
          <input
            className={estilo.campo}
            type="search"
            autoComplete="off"
            placeholder="Marca, modelo, número de série ou patrimônio"
            value={termo}
            onChange={(ev) => setTermo(ev.target.value)}
          />
          {mostrarSugestoes && (achados.length > 0 || buscando) ? (
            <Sugestoes achados={achados} buscando={buscando} aoEscolher={escolher} />
          ) : null}
          <span className={estilo.dica}>
            Se a máquina já passou por aqui, escolha-a: o prontuário dela continua numa linha só, com
            a foto e o histórico. Não achou? É só preencher abaixo — o aparelho entra no catálogo
            junto com a O.S.
          </span>
        </label>
      ) : (
        <input type="hidden" name="equipamentoId" value={escolhido.id} />
      )}

      {/* Escolhido, os campos ficam de leitura: eles mostram o que foi puxado.
          Deixá-los editáveis prometeria uma alteração que não acontece — o
          servidor usa o aparelho do catálogo, não o texto da tela. Quem quiser
          corrigir marca ou modelo corrige no cadastro do equipamento, que é
          onde a correção vale para todas as ordens da máquina. */}
      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Marca *
          <input
            className={estilo.campo}
            name="marca"
            required
            minLength={2}
            readOnly={Boolean(escolhido)}
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Modelo *
          <input
            className={estilo.campo}
            name="modelo"
            required
            readOnly={Boolean(escolhido)}
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Número de série
          <input
            className={estilo.campo}
            name="numeroSerie"
            readOnly={Boolean(escolhido)}
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
          />
          <span className={estilo.dica}>
            É o que amarra o histórico do aparelho entre uma visita e outra.
          </span>
        </label>
        <label className={estilo.rotulo}>
          Acessórios que vêm junto
          <input
            className={estilo.campo}
            name="acessorios"
            placeholder="Cabo, pedal, ponteira…"
            value={acessorios}
            onChange={(e) => setAcessorios(e.target.value)}
          />
          <span className={estilo.dica}>Anotar aqui evita discussão na devolução.</span>
        </label>
      </div>

      {!escolhido ? (
        <p className={estilo.dica}>
          O aparelho digitado aqui já entra no catálogo. Para pôr foto, voltagem, ano e patrimônio,
          o cadastro completo fica em{' '}
          <Link href="/painel/equipamentos?novo=1" target="_blank">
            Equipamentos
          </Link>
          .
        </p>
      ) : null}
    </>
  )
}

/**
 * A lista que cai sob o campo.
 *
 * `onMouseDown` em vez de `onClick`: o clique termina depois do `blur` do
 * campo, e uma lista que sumisse no blur faria o clique cair no vazio.
 */
function Sugestoes({
  achados,
  buscando,
  aoEscolher,
}: {
  achados: EquipamentoAchado[]
  buscando: boolean
  aoEscolher: (e: EquipamentoAchado) => void
}) {
  return (
    <ul className={estilo.sugestoes} role="listbox" aria-label="Equipamentos encontrados">
      {buscando && achados.length === 0 ? (
        <li className={estilo.sugestaoVazia}>Procurando…</li>
      ) : null}
      {!buscando && achados.length === 0 ? (
        <li className={estilo.sugestaoVazia}>
          Nenhum aparelho com isso. Preencha abaixo e ele entra no catálogo.
        </li>
      ) : null}
      {achados.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            className={estilo.sugestao}
            onMouseDown={(ev) => {
              ev.preventDefault()
              aoEscolher(e)
            }}
          >
            <strong>
              {e.marca} {e.modelo}
            </strong>
            <span className={estilo.fraco}>
              {e.numeroSerie ? `nº ${e.numeroSerie}` : 'sem série'}
              {e.categoria ? ` · ${e.categoria}` : ''}
              {` · ${e.donoNome ?? 'sem dono — catálogo'}`}
              {e.ordens > 0 ? ` · ${e.ordens} ${e.ordens === 1 ? 'ordem' : 'ordens'}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
