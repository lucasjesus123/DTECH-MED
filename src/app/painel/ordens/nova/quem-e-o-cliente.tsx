'use client'

import { useEffect, useRef, useState } from 'react'
import { acharCliente, type ClienteAchado } from '@/server/acoes/achar-cliente'
import estilo from '../../painel.module.css'

/**
 * QUEM É O CLIENTE — e o sistema já sabe, se ele estiver na carteira.
 *
 * =============================================================================
 * O QUE MUDOU
 * =============================================================================
 * Abrir uma O.S. exigia redigitar nome, CPF/CNPJ, WhatsApp, contato, endereço e
 * cidade de um cliente que já está cadastrado há dois anos. O sistema
 * reaproveitava o cadastro, mas só AO SALVAR e só pelo DOCUMENTO — quem
 * digitasse o CNPJ com um dígito trocado criava um cliente duplicado, e nada
 * avisava.
 *
 * Agora o nome (ou o documento, ou o telefone) procura enquanto se digita, e
 * escolher um resultado preenche o resto. O trabalho de digitar o que o sistema
 * já sabe some, e com ele some a chance de o endereço da retirada sair
 * diferente do que está no cadastro — que é o motorista atravessando a cidade
 * para o lugar errado.
 *
 * =============================================================================
 * A BUSCA NÃO BLOQUEIA QUEM É NOVO
 * =============================================================================
 * Cliente novo é caso comum, não exceção: alguém liga pela primeira vez e a
 * O.S. tem de abrir. Por isso isto é um campo de texto ANOTADO, e não um
 * `select` de clientes existentes. Quem não achar continua digitando e o
 * cadastro nasce junto com a ordem, como sempre foi.
 *
 * =============================================================================
 * A ESPERA DE 300ms NÃO É ENFEITE
 * =============================================================================
 * Sem ela, "Hospital Bruno Born" dispara dezenove buscas no banco — uma por
 * tecla — e as respostas chegam fora de ordem: a de "Hosp" pode voltar depois
 * da de "Hospital" e sobrescrever a lista certa com uma lista velha. O
 * contador `pedido` descarta resposta atrasada mesmo quando ela chega.
 *
 * =============================================================================
 * ESCOLHER É REVERSÍVEL, E A TELA DIZ ISSO
 * =============================================================================
 * Depois de escolher, aparece uma tarja com o nome e um "trocar". Sem ela, a
 * pessoa que clicou no cliente errado não teria como saber — os campos estariam
 * preenchidos e plausíveis, e a O.S. sairia no nome de outra clínica.
 */
export default function QuemEOCliente({
  nomeInicial,
  telefoneInicial,
  contatoInicial,
  cidadeInicial,
}: {
  nomeInicial: string
  telefoneInicial: string
  contatoInicial: string
  cidadeInicial: string
}) {
  const [nome, setNome] = useState(nomeInicial)
  const [documento, setDocumento] = useState('')
  const [whatsapp, setWhatsapp] = useState(telefoneInicial)
  const [contato, setContato] = useState(contatoInicial)
  const [endereco, setEndereco] = useState('')
  const [cidade, setCidade] = useState(cidadeInicial)

  const [achados, setAchados] = useState<ClienteAchado[]>([])
  const [escolhido, setEscolhido] = useState<ClienteAchado | null>(null)
  const [buscando, setBuscando] = useState(false)

  /** O termo que a busca deve perseguir. Muda no nome E no documento. */
  const [termo, setTermo] = useState('')
  // Descarta resposta atrasada: sem isto, a busca de "Hosp" pode chegar depois
  // da de "Hospital" e sobrescrever a lista certa com uma lista velha.
  const pedido = useRef(0)

  /**
   * O EFEITO NÃO LIMPA A LISTA — QUEM DECIDE MOSTRAR É A RENDERIZAÇÃO.
   *
   * A versão anterior fazia `setAchados([])` aqui quando o termo ficava curto.
   * É `setState` síncrono dentro do efeito: uma segunda renderização em cascata
   * a cada tecla apagada, e a regra `set-state-in-effect` reprova com razão.
   *
   * "Tem termo suficiente para mostrar?" é uma pergunta que se responde na hora
   * de desenhar, com `mostrarSugestoes` abaixo. O estado passa a mudar só
   * quando a busca RESPONDE — que é a única coisa que o efeito tem a
   * sincronizar.
   */
  useEffect(() => {
    if (escolhido) return
    const t = termo.trim()
    if (t.length < 3) return
    const meu = ++pedido.current
    const relogio = setTimeout(async () => {
      // "Procurando…" acende quando a busca COMEÇA, e não durante os 300ms de
      // espera. Acendê-lo antes seria mentira por um terço de segundo a cada
      // tecla — e, de quebra, é `setState` síncrono dentro do efeito, que
      // provoca renderização em cascata a cada letra digitada.
      setBuscando(true)
      const r = await acharCliente(t)
      if (meu !== pedido.current) return
      setAchados(r)
      setBuscando(false)
    }, 300)
    return () => clearTimeout(relogio)
  }, [termo, escolhido])

  function escolher(c: ClienteAchado) {
    setEscolhido(c)
    setNome(c.nome)
    setDocumento(c.documento)
    setWhatsapp(c.whatsapp)
    setContato(c.contatoNome ?? '')
    setEndereco(c.endereco)
    setCidade(c.cidade)
    setAchados([])
  }

  // Sem termo suficiente não há o que sugerir, mesmo que a lista ainda guarde o
  // resultado da busca anterior. Ver o comentário do efeito acima.
  const mostrarSugestoes = !escolhido && termo.trim().length >= 3

  function trocar() {
    setEscolhido(null)
    setAchados([])
    setTermo('')
  }

  return (
    <>
      <p className={estilo.blocoTitulo}>Quem é o cliente</p>

      {escolhido ? (
        <p className={estilo.avisoCaixa} role="status">
          <strong>Cliente da carteira: {escolhido.nome}.</strong>{' '}
          {escolhido.ordens > 0
            ? `${escolhido.ordens} ${escolhido.ordens === 1 ? 'ordem já passou' : 'ordens já passaram'} por aqui. `
            : 'Primeira ordem dele. '}
          Os campos abaixo vieram do cadastro — dá para corrigir qualquer um.{' '}
          <button type="button" className={estilo.linkAcao} onClick={trocar}>
            Trocar de cliente
          </button>
        </p>
      ) : null}

      <div className={estilo.grade}>
        <label className={estilo.rotulo} style={{ position: 'relative' }}>
          Nome ou razão social *
          <input
            className={estilo.campo}
            name="clienteNome"
            required
            minLength={3}
            autoComplete="off"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setTermo(e.target.value)
              // Editar o nome desfaz a escolha: quem digita por cima de um
              // cliente escolhido está dizendo que não era aquele.
              if (escolhido) setEscolhido(null)
            }}
          />
          {mostrarSugestoes && (achados.length > 0 || buscando) ? (
            <Sugestoes achados={achados} buscando={buscando} aoEscolher={escolher} />
          ) : null}
          <span className={estilo.dica}>
            Comece a digitar: se ele já for cliente, aparece aqui e o resto se preenche sozinho.
          </span>
        </label>

        <label className={estilo.rotulo} style={{ position: 'relative' }}>
          CPF ou CNPJ *
          <input
            className={estilo.campo}
            name="clienteDocumento"
            required
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(e) => {
              setDocumento(e.target.value)
              setTermo(e.target.value)
              if (escolhido) setEscolhido(null)
            }}
          />
          {mostrarSugestoes && achados.length > 0 && /\d{4}/.test(documento) ? (
            <Sugestoes achados={achados} buscando={false} aoEscolher={escolher} />
          ) : null}
          <span className={estilo.dica}>
            Também acha o cliente. É o que ele digita para aprovar o orçamento.
          </span>
        </label>

        <label className={estilo.rotulo}>
          WhatsApp *
          <input
            className={estilo.campo}
            name="clienteWhatsapp"
            required
            inputMode="tel"
            placeholder="51 99999-9999"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          <span className={estilo.dica}>Todos os avisos da esteira saem por aqui.</span>
        </label>

        <label className={estilo.rotulo}>
          Quem é o contato
          <input
            className={estilo.campo}
            name="contatoNome"
            placeholder="Nome de quem atende na clínica"
            value={contato}
            onChange={(e) => setContato(e.target.value)}
          />
        </label>
      </div>

      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
        Onde buscar
      </p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo} style={{ gridColumn: '1 / -1' }}>
          Endereço da retirada *
          <input
            className={estilo.campo}
            name="endereco"
            required
            minLength={5}
            placeholder="Rua, número, sala, bairro"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
          />
          {escolhido ? (
            <span className={estilo.dica}>
              Veio do cadastro — e é o endereço da COLETA quando o cliente tem um diferente da
              sede. Confira antes de mandar o motorista.
            </span>
          ) : null}
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input
            className={estilo.campo}
            name="cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
        </label>
      </div>
    </>
  )
}

/**
 * A lista que cai sob o campo.
 *
 * `role="listbox"` com `option` dentro: para o leitor de tela isto é uma lista
 * de escolhas, e não um punhado de botões soltos embaixo de um campo de texto.
 *
 * `onMouseDown` em vez de `onClick` — o clique só termina DEPOIS do `blur` do
 * campo, e se a lista sumisse no blur o clique cairia no vazio. É o defeito
 * clássico de campo com sugestão, e o `preventDefault` mantém o foco onde está.
 */
function Sugestoes({
  achados,
  buscando,
  aoEscolher,
}: {
  achados: ClienteAchado[]
  buscando: boolean
  aoEscolher: (c: ClienteAchado) => void
}) {
  return (
    <ul className={estilo.sugestoes} role="listbox" aria-label="Clientes encontrados">
      {buscando && achados.length === 0 ? (
        <li className={estilo.sugestaoVazia}>Procurando…</li>
      ) : null}
      {achados.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            className={estilo.sugestao}
            onMouseDown={(e) => {
              e.preventDefault()
              aoEscolher(c)
            }}
          >
            <strong>{c.nome}</strong>
            <span className={estilo.fraco}>
              {mascarar(c.documento)}
              {c.cidade ? ` · ${c.cidade}` : ''}
              {c.ordens > 0 ? ` · ${c.ordens} ${c.ordens === 1 ? 'ordem' : 'ordens'}` : ' · sem ordem ainda'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * O documento aparece PARCIAL na lista de escolha.
 *
 * Ele serve para desempatar dois clientes de nome parecido, e para isso bastam
 * as pontas. Imprimir o CPF inteiro numa lista que fica aberta na tela de quem
 * atende é espalhar dado pessoal por uma conveniência que os quatro últimos
 * dígitos já resolvem.
 */
function mascarar(d: string): string {
  const s = d.replace(/\D/g, '')
  if (s.length <= 4) return s
  return `${s.slice(0, 3)}…${s.slice(-2)}`
}
