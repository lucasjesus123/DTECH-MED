'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ClienteAchado } from '@/server/acoes/achar-cliente'
import { salvarCliente } from '@/server/acoes/cadastros'
import estilo from '../../painel.module.css'

/**
 * CADASTRAR O CLIENTE SEM SAIR DA ABERTURA DA O.S.
 *
 * =============================================================================
 * O QUE ELE VEIO CONSERTAR
 * =============================================================================
 * O passo do cliente dizia, na letra miúda: *"use o + da lista para seguir com
 * um cadastro novo"*. Só que esse "+" mora DENTRO da lista de sugestões, e a
 * lista só existe depois que alguém digita. Quem abria a tela via a instrução
 * apontando para um botão que não estava em lugar nenhum — e o dono do sistema
 * pediu o óbvio:
 *
 *   "eu preciso aqui já ter um botãozinho, já fazer um cadastro rápido do meu
 *    cliente ali na hora que eu estou emitindo a minha O.S. — não quero sair
 *    dessa tela"
 *
 * Agora o "+" está à vista desde o primeiro segundo, ao lado do título, e o que
 * ele abre é este painel.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É UM <form>
 * =============================================================================
 * Porque ele vive DENTRO do formulário da O.S., e formulário dentro de
 * formulário é HTML inválido: o navegador desmonta o de dentro e o resultado é
 * imprevisível — no melhor caso o botão não faz nada, no pior ele envia a
 * ordem pela metade.
 *
 * Por isso os campos aqui não têm `name`: se tivessem, viajariam junto no envio
 * da O.S., e um `required` vazio aqui dentro travaria a emissão da ordem sem
 * dizer por quê. O que sai daqui vai por um `FormData` montado à mão, na hora
 * de salvar, e só com o que este painel conhece.
 *
 * =============================================================================
 * O CLIENTE NASCE AGORA, E É ISSO QUE O DIFERENCIA DO OUTRO CAMINHO
 * =============================================================================
 * Continua valendo digitar o nome e seguir: o cadastro nasce junto com a ordem,
 * com os seis campos que a O.S. pergunta. Esse caminho é mais rápido e não
 * mudou.
 *
 * Este aqui serve para quando se quer o cadastro DE VERDADE — com e-mail, CEP,
 * bairro e UF, que são justamente os campos que o contrato e a nota precisam e
 * que a O.S. não pergunta. Cliente nascido pela ordem fica para sempre sem
 * eles, e ninguém volta depois para completar.
 *
 * Gravado, ele é escolhido na O.S. na mesma hora — pelo id, como qualquer
 * cliente da carteira. Não existe "salvei mas ainda tenho que procurar".
 */
export default function CadastroRapido({
  nomeInicial,
  whatsappInicial,
  contatoInicial,
  cidadeInicial,
  aoCadastrar,
  aoCancelar,
}: {
  /** O que já estava digitado no campo do nome quando o "+" foi clicado. */
  nomeInicial: string
  whatsappInicial: string
  contatoInicial: string
  cidadeInicial: string
  /** Gravou: devolve o cliente pronto para ser escolhido na ordem. */
  aoCadastrar: (c: ClienteAchado) => void
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState(nomeInicial)
  const [documento, setDocumento] = useState('')
  const [whatsapp, setWhatsapp] = useState(whatsappInicial)
  const [contato, setContato] = useState(contatoInicial)
  const [email, setEmail] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState(cidadeInicial)
  const [uf, setUf] = useState('')

  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()
  const primeiro = useRef<HTMLInputElement>(null)

  /**
   * O foco entra no painel.
   *
   * Sem isto ele continua no campo do nome da O.S., que está escondido atrás
   * — quem navega por teclado abriria o cadastro e continuaria digitando na
   * tela de trás, sem ver nada acontecer.
   */
  useEffect(() => {
    primeiro.current?.focus()
  }, [])

  /**
   * O QUE SE CONFERE AQUI, E O QUE SE DEIXA PARA O SERVIDOR.
   *
   * Aqui: só o suficiente para não gastar uma ida ao servidor com um campo
   * obviamente vazio. Lá: tudo de novo, porque é lá que a regra vale — o
   * `schemaCliente` confere o tamanho do CPF/CNPJ, o formato do e-mail e, o
   * que importa mais, se aquele documento já é de outro cliente da casa.
   *
   * Duplicar a mensagem de erro seria duas fontes para a mesma frase. A do
   * servidor é a que aparece.
   */
  function gravar() {
    setErro(null)
    if (nome.trim().length < 3) return setErro('Informe o nome do cliente.')
    const digitos = documento.replace(/\D/g, '')
    if (digitos.length !== 11 && digitos.length !== 14) {
      return setErro('CPF tem 11 dígitos e CNPJ tem 14. Confira o que foi digitado.')
    }
    if (whatsapp.trim().length < 8) return setErro('Informe o WhatsApp — é por ele que os avisos saem.')

    const f = new FormData()
    f.set('nome', nome.trim())
    f.set('documento', digitos)
    f.set('whatsapp', whatsapp.trim())
    f.set('email', email.trim())
    f.set('contatoNome', contato.trim())
    f.set('cep', cep.trim())
    f.set('logradouro', logradouro.trim())
    f.set('numero', numero.trim())
    f.set('complemento', complemento.trim())
    f.set('bairro', bairro.trim())
    f.set('cidade', cidade.trim())
    f.set('uf', uf.trim())
    /* O endereço da coleta é o mesmo da sede: quem quiser separar a doca dos
       fundos do endereço fiscal faz isso na tela de Clientes, que é onde o
       cadastro inteiro mora. Este painel é o atalho, não o substituto. */
    f.set('coletaMesmoEndereco', 'on')

    iniciar(async () => {
      const r = await salvarCliente({ ok: false, motivo: '' }, f)
      if (!r.ok) return setErro(r.motivo)
      if (!r.id) return setErro('O cliente foi gravado, mas o sistema não soube dizer qual. Procure-o pelo nome.')

      aoCadastrar({
        id: r.id,
        nome: nome.trim(),
        documento: digitos,
        whatsapp: whatsapp.trim(),
        contatoNome: contato.trim() || null,
        // O mesmo endereço que a O.S. mostraria se o cliente viesse da busca:
        // montado das partes, na mesma ordem, para a retirada sair idêntica.
        endereco: [logradouro.trim(), numero.trim(), complemento.trim(), bairro.trim()]
          .filter(Boolean)
          .join(', '),
        cidade: cidade.trim(),
        ordens: 0,
      })
    })
  }

  return (
    <div className={estilo.subtela}>
      <div className={estilo.subtelaTopo}>
        <div>
          <p className={estilo.grav}>Passo 2 · cliente novo</p>
          <strong className={estilo.subtelaNome}>Cadastro rápido</strong>
        </div>
        <button type="button" className={estilo.btnSec} onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <p className={estilo.dica} style={{ marginTop: 0 }}>
        O cliente é gravado na carteira agora e já entra nesta O.S. O endereço aqui é o da sede e
        serve de retirada — se a coleta for em outro lugar, dá para corrigir no passo seguinte.
      </p>

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Nome ou razão social *
          <input
            ref={primeiro}
            className={estilo.campo}
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          CPF ou CNPJ *
          <input
            className={estilo.campo}
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
          <span className={estilo.dica}>É o que ele digita para aprovar o orçamento.</span>
        </label>
        <label className={estilo.rotulo}>
          WhatsApp *
          <input
            className={estilo.campo}
            inputMode="tel"
            placeholder="51 99999-9999"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Quem é o contato
          <input
            className={estilo.campo}
            placeholder="Nome de quem atende na clínica"
            value={contato}
            onChange={(e) => setContato(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          E-mail
          <input
            className={estilo.campo}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className={estilo.dica}>Vai no contrato e na nota.</span>
        </label>
      </div>

      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
        Onde ele fica
      </p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          CEP
          <input
            className={estilo.campo}
            inputMode="numeric"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input className={estilo.campo} value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </label>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Logradouro
          <input
            className={estilo.campo}
            placeholder="Rua, avenida"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Número
          <input className={estilo.campo} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label>
        <label className={estilo.rotulo}>
          Complemento
          <input
            className={estilo.campo}
            placeholder="Sala, bloco"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
          />
        </label>
        <label className={estilo.rotulo}>
          Bairro
          <input className={estilo.campo} value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </label>
        <label className={estilo.rotulo}>
          UF
          <input
            className={estilo.campo}
            maxLength={2}
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase())}
          />
        </label>
      </div>

      <div className={estilo.acoesForm} style={{ marginTop: 'var(--s5)' }}>
        {/* `type="button"`, e isto é obrigatório aqui dentro: o padrão de um
            botão é `submit`, e o formulário mais próximo é o da O.S. Sem o
            atributo, cadastrar o cliente EMITIRIA a ordem. */}
        <button type="button" className={estilo.btn} onClick={gravar} disabled={salvando}>
          {salvando ? 'Cadastrando…' : 'Cadastrar e usar nesta O.S.'}
        </button>
        <button type="button" className={estilo.btnSec} onClick={aoCancelar} disabled={salvando}>
          Voltar sem cadastrar
        </button>
      </div>
    </div>
  )
}
