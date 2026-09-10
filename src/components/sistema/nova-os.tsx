'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acharCliente, type ClienteAchado } from '@/server/acoes/achar-cliente'
import { acharEquipamento, type EquipamentoAchado } from '@/server/acoes/achar-equipamento'
import { abrirOrdem } from '@/server/acoes/ordem'
import estilo from './pecas.module.css'

/**
 * ABRIR O.S. — o `<SplitForm>` com painel-vivo.
 *
 * =============================================================================
 * TRÊS BLOCOS, NA ORDEM DO TELEFONEMA
 * =============================================================================
 * Cliente → aparelho → defeito. Não é uma escolha de layout: é a ordem em que a
 * conversa acontece. Quem atende pergunta "de onde fala?", depois "qual
 * aparelho?", depois "o que está acontecendo?". Um formulário que pede as
 * mesmas coisas em outra ordem obriga a pessoa a traduzir enquanto o cliente
 * espera na linha.
 *
 * =============================================================================
 * O PAINEL DA DIREITA MOSTRA A O.S. SE FORMANDO
 * =============================================================================
 * Enquanto se digita, ele diz quem é o cliente, qual o aparelho, o que foi
 * combinado e — quando o cliente já é conhecido — quantas ordens ele já teve.
 * O resultado aparece antes de salvar, e é isso que tira o medo do botão.
 *
 * =============================================================================
 * OS TRÊS BLOCOS FICAM TODOS À VISTA, E NÃO EM PASSOS QUE ESCONDEM
 * =============================================================================
 * "Wizard de 3 passos" costuma virar três telas com um "avançar" entre elas — e
 * aí a pessoa que descobre no passo 3 que digitou o cliente errado precisa
 * voltar duas telas. Aqui os três blocos são numerados e visíveis: o wizard
 * organiza a leitura, sem esconder nada.
 */

const BLOCOS = ['Quem é o cliente', 'Qual é o aparelho', 'O que está acontecendo'] as const

export default function NovaOS({
  clienteInicial,
  equipamentoInicial,
}: {
  clienteInicial: ClienteAchado | null
  equipamentoInicial: EquipamentoAchado | null
}) {
  const router = useRouter()
  const [indo, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // --- bloco 1: cliente -----------------------------------------------------
  const [cliente, setCliente] = useState<ClienteAchado | null>(clienteInicial)
  const [termoCliente, setTermoCliente] = useState('')
  /**
   * A resposta vem CARIMBADA com o termo que a pediu — mesmo padrão da busca da
   * barra, e pelo mesmo motivo.
   *
   * A alternativa seria limpar a lista dentro do efeito quando o termo encurta,
   * e limpar estado dentro de efeito faz a tela renderizar em cascata: o React
   * desenha uma vez com a lista velha, roda o efeito, e desenha de novo. Com o
   * carimbo, quem decide o que aparece é a RENDERIZAÇÃO — resultado de termo
   * antigo simplesmente não é o do termo atual.
   */
  const [respostaCliente, setRespostaCliente] = useState<{
    termo: string
    achados: ClienteAchado[]
  }>({ termo: '', achados: [] })
  const [nome, setNome] = useState(clienteInicial?.nome ?? '')
  const [documento, setDocumento] = useState(clienteInicial?.documento ?? '')
  const [whatsapp, setWhatsapp] = useState(clienteInicial?.whatsapp ?? '')
  const [contato, setContato] = useState(clienteInicial?.contatoNome ?? '')
  const [endereco, setEndereco] = useState(clienteInicial?.endereco ?? '')
  const [cidade, setCidade] = useState(clienteInicial?.cidade ?? '')

  // --- bloco 2: aparelho ----------------------------------------------------
  const [equipamentoId, setEquipamentoId] = useState(equipamentoInicial?.id ?? '')
  const [termoEquip, setTermoEquip] = useState('')
  const [respostaEquip, setRespostaEquip] = useState<{
    termo: string
    achados: EquipamentoAchado[]
  }>({ termo: '', achados: [] })
  const [marca, setMarca] = useState(equipamentoInicial?.marca ?? '')
  const [modelo, setModelo] = useState(equipamentoInicial?.modelo ?? '')
  const [serie, setSerie] = useState(equipamentoInicial?.numeroSerie ?? '')
  const [acessorios, setAcessorios] = useState(equipamentoInicial?.acessorios ?? '')
  const [passagens] = useState(equipamentoInicial?.ordens ?? 0)

  // --- bloco 3: o problema --------------------------------------------------
  const [defeito, setDefeito] = useState('')
  const [prioridade, setPrioridade] = useState<'NORMAL' | 'ALTA'>('NORMAL')
  const [valor, setValor] = useState('')
  const [condicao, setCondicao] = useState('')

  const pedidoCliente = useRef(0)
  const pedidoEquip = useRef(0)

  // A lista exibida é DERIVADA: ela só existe enquanto a resposta corresponder
  // ao que está escrito na caixa agora.
  const achadosCliente =
    respostaCliente.termo === termoCliente.trim() ? respostaCliente.achados : []
  const achadosEquip =
    respostaEquip.termo === termoEquip.trim() ? respostaEquip.achados : []

  // A busca espera 250ms e descarta a resposta atrasada — o mesmo cuidado da
  // busca da barra. Sem o contador, "Hosp" pode chegar depois de "Hospital" e
  // sobrescrever a lista certa com uma lista velha.
  useEffect(() => {
    const t = termoCliente.trim()
    if (t.length < 2) return
    const meu = ++pedidoCliente.current
    const relogio = setTimeout(() => {
      acharCliente(t)
        .then((r) => {
          if (meu === pedidoCliente.current) setRespostaCliente({ termo: t, achados: r })
        })
        .catch(() => {
          // Busca que falha não pode deixar a lista velha no ar dizendo que
          // achou: ela responderia a pergunta anterior com cara de atual.
          if (meu === pedidoCliente.current) setRespostaCliente({ termo: t, achados: [] })
        })
    }, 250)
    return () => clearTimeout(relogio)
  }, [termoCliente])

  useEffect(() => {
    const t = termoEquip.trim()
    if (t.length < 2) return
    const meu = ++pedidoEquip.current
    const relogio = setTimeout(() => {
      acharEquipamento(t)
        .then((r) => {
          if (meu === pedidoEquip.current) setRespostaEquip({ termo: t, achados: r })
        })
        .catch(() => {
          if (meu === pedidoEquip.current) setRespostaEquip({ termo: t, achados: [] })
        })
    }, 250)
    return () => clearTimeout(relogio)
  }, [termoEquip])

  function escolherCliente(c: ClienteAchado) {
    setCliente(c)
    setNome(c.nome)
    setDocumento(c.documento)
    setWhatsapp(c.whatsapp)
    setContato(c.contatoNome ?? '')
    setEndereco(c.endereco)
    setCidade(c.cidade)
    setTermoCliente('')
  }

  function escolherEquipamento(e: EquipamentoAchado) {
    setEquipamentoId(e.id)
    setMarca(e.marca)
    setModelo(e.modelo)
    setSerie(e.numeroSerie ?? '')
    setAcessorios(e.acessorios ?? '')
    setTermoEquip('')
  }

  // --- o que ainda falta ----------------------------------------------------

  const faltando: string[] = []
  if (nome.trim().length < 3) faltando.push('o nome do cliente')
  if (documento.replace(/\D/g, '').length !== 11 && documento.replace(/\D/g, '').length !== 14)
    faltando.push('o CPF ou CNPJ')
  if (whatsapp.trim().length < 8) faltando.push('o WhatsApp para os avisos')
  if (endereco.trim().length < 5) faltando.push('o endereço da coleta')
  if (marca.trim().length < 2) faltando.push('a marca do aparelho')
  if (modelo.trim().length < 1) faltando.push('o modelo')
  if (defeito.trim().length < 10) faltando.push('o relato do defeito')

  const pronto = faltando.length === 0

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('clienteNome', nome)
      form.set('clienteDocumento', documento)
      form.set('clienteWhatsapp', whatsapp)
      form.set('contatoNome', contato)
      form.set('endereco', endereco)
      form.set('cidade', cidade)
      if (equipamentoId) form.set('equipamentoId', equipamentoId)
      form.set('marca', marca)
      form.set('modelo', modelo)
      form.set('numeroSerie', serie)
      form.set('acessorios', acessorios)
      form.set('defeito', defeito)
      form.set('prioridade', prioridade)
      form.set('valorCombinado', valor)
      form.set('condicaoCombinada', condicao)

      const r = await abrirOrdem({ ok: true }, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      // Cai direto na O.S. recém-aberta, e não numa lista: quem acabou de abrir
      // quase sempre agenda a coleta em seguida — e o botão-da-vez já está lá.
      router.push(`/sistema/ordens/${r.dados!.id}`)
      router.refresh()
    })
  }

  return (
    <div className={estilo.split}>
      <div className={estilo.blocos}>
        {/* ---------------------------------------------------------------- */}
        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              1
            </span>
            <h2 className={estilo.blocoNomeForm}>{BLOCOS[0]}</h2>
          </div>

          <label className={estilo.campo}>
            <span>Procurar cliente já cadastrado</span>
            <input
              value={termoCliente}
              onChange={(e) => setTermoCliente(e.target.value)}
              placeholder="Nome, CNPJ ou cidade"
              autoComplete="off"
            />
            <span className={estilo.campoDica}>
              Achou? Clique e os campos abaixo se preenchem. Não achou? Digite —
              o cadastro nasce junto com a O.S.
            </span>
          </label>

          {achadosCliente.length > 0 ? (
            <div className={estilo.radar}>
              {achadosCliente.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={estilo.buscaItemLista}
                  onClick={() => escolherCliente(c)}
                >
                  <strong>{c.nome}</strong>
                  <span>
                    {c.cidade || 'sem cidade'} · {c.ordens}{' '}
                    {c.ordens === 1 ? 'O.S. anterior' : 'O.S. anteriores'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className={estilo.campos}>
            <label className={`${estilo.campo} ${estilo.largo}`}>
              <span>Nome ou razão social</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label className={estilo.campo}>
              <span>CPF ou CNPJ</span>
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={estilo.campo}>
              <span>WhatsApp</span>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                inputMode="tel"
              />
              <span className={estilo.campoDica}>
                É por aqui que todos os avisos da O.S. vão sair.
              </span>
            </label>
            <label className={estilo.campo}>
              <span>Com quem falar (opcional)</span>
              <input value={contato} onChange={(e) => setContato(e.target.value)} />
            </label>
            <label className={estilo.campo}>
              <span>Cidade</span>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </label>
            <label className={`${estilo.campo} ${estilo.largo}`}>
              <span>Endereço da coleta</span>
              <input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
              <span className={estilo.campoDica}>
                É para cá que o motorista vai — e nem sempre é o endereço da nota.
              </span>
            </label>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              2
            </span>
            <h2 className={estilo.blocoNomeForm}>{BLOCOS[1]}</h2>
          </div>

          <label className={estilo.campo}>
            <span>Procurar aparelho já conhecido</span>
            <input
              value={termoEquip}
              onChange={(e) => setTermoEquip(e.target.value)}
              placeholder="Marca, modelo ou número de série"
              autoComplete="off"
            />
          </label>

          {achadosEquip.length > 0 ? (
            <div className={estilo.radar}>
              {achadosEquip.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={estilo.buscaItemLista}
                  onClick={() => escolherEquipamento(e)}
                >
                  <strong>{`${e.marca} ${e.modelo}`.trim()}</strong>
                  <span>
                    {e.numeroSerie ?? 'sem série'}
                    {e.donoNome ? ` · ${e.donoNome}` : ''} · {e.ordens}{' '}
                    {e.ordens === 1 ? 'passagem' : 'passagens'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className={estilo.campos}>
            <label className={estilo.campo}>
              <span>Marca</span>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </label>
            <label className={estilo.campo}>
              <span>Modelo</span>
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </label>
            <label className={estilo.campo}>
              <span>Número de série</span>
              <input value={serie} onChange={(e) => setSerie(e.target.value)} />
              <span className={estilo.campoDica}>
                Sem ele, este aparelho é difícil de rastrear entre dois iguais.
              </span>
            </label>
            <label className={estilo.campo}>
              <span>Acessórios que vêm junto</span>
              <input
                value={acessorios}
                onChange={(e) => setAcessorios(e.target.value)}
                placeholder="Cabo, pedal, aplicador, maleta…"
              />
              <span className={estilo.campoDica}>
                O que sai da clínica precisa voltar. Esta linha é o que se
                confere na entrega.
              </span>
            </label>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              3
            </span>
            <h2 className={estilo.blocoNomeForm}>{BLOCOS[2]}</h2>
          </div>

          <div className={estilo.campos}>
            <label className={`${estilo.campo} ${estilo.largo}`}>
              <span>O que o cliente está relatando</span>
              <textarea
                value={defeito}
                onChange={(e) => setDefeito(e.target.value)}
                placeholder="Nas palavras dele. 'Liga e desliga sozinho depois de dez minutos' vale mais que 'defeito elétrico'."
              />
            </label>
            <label className={estilo.campo}>
              <span>Prioridade</span>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as 'NORMAL' | 'ALTA')}
              >
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta — equipamento parado faturando</option>
              </select>
            </label>
            <label className={estilo.campo}>
              <span>Valor combinado agora (opcional)</span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="Ex.: 180,00"
              />
              <span className={estilo.campoDica}>
                Não é o orçamento do conserto — esse nasce depois do laudo. É a
                taxa de retirada ou avaliação que você acertou no telefone.
              </span>
            </label>
            <label className={`${estilo.campo} ${estilo.largo}`}>
              <span>O que está incluso nesse valor (opcional)</span>
              <input
                value={condicao}
                onChange={(e) => setCondicao(e.target.value)}
                placeholder="Retirada e avaliação; abatido do serviço se aprovar"
              />
            </label>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      <aside className={estilo.vivo}>
        <p className={estilo.vivoTitulo}>A O.S. que vai nascer</p>

        <p className={estilo.vivoLinha}>
          <span>Cliente</span>
          <strong className={nome ? undefined : estilo.vivoVago}>{nome || 'a definir'}</strong>
        </p>
        {cliente ? (
          <p className={estilo.campoDica}>
            Já conhecido — {cliente.ordens} {cliente.ordens === 1 ? 'O.S.' : 'O.S.'} no histórico.
          </p>
        ) : null}

        <p className={estilo.vivoLinha}>
          <span>Aparelho</span>
          <strong className={marca ? undefined : estilo.vivoVago}>
            {`${marca} ${modelo}`.trim() || 'a definir'}
          </strong>
        </p>
        {equipamentoId && passagens > 0 ? (
          <p className={estilo.campoDica}>
            Este aparelho já passou aqui {passagens} {passagens === 1 ? 'vez' : 'vezes'}.
          </p>
        ) : null}

        <p className={estilo.vivoLinha}>
          <span>Coleta em</span>
          <strong className={endereco ? undefined : estilo.vivoVago}>
            {endereco || 'a definir'}
          </strong>
        </p>

        <p className={estilo.vivoLinha}>
          <span>Prioridade</span>
          <strong>{prioridade === 'ALTA' ? 'Alta' : 'Normal'}</strong>
        </p>

        {valor ? (
          <p className={`${estilo.vivoLinha} ${estilo.vivoTotal}`}>
            <span>Combinado</span>
            <strong>R$ {valor}</strong>
          </p>
        ) : null}

        <p className={estilo.campoDica}>
          Ao abrir, o cliente recebe a confirmação no WhatsApp e a O.S. entra na
          fila de agendamento da coleta.
        </p>

        {faltando.length > 0 ? (
          <div className={estilo.faltando}>
            <strong>Falta preencher:</strong>
            {faltando.map((f) => (
              <span key={f}>· {f}</span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className={estilo.acaoLarga}
          onClick={enviar}
          disabled={!pronto || indo}
        >
          {indo ? 'Abrindo…' : 'Abrir O.S.'}
        </button>

        {erro ? (
          <p className={estilo.acaoErro} role="alert">
            {erro}
          </p>
        ) : null}
      </aside>
    </div>
  )
}
