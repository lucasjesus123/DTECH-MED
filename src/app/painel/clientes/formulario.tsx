'use client'

import { useActionState, useRef, useState } from 'react'
import { salvarCliente } from '@/server/acoes/cadastros'
import { buscarCep } from '@/server/acoes/cep'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export default function FormularioCliente() {
  const [estado, acao, pendente] = useActionState(salvarCliente, inicial)
  const [buscando, setBuscando] = useState<'cadastro' | 'coleta' | null>(null)
  const [avisoCep, setAvisoCep] = useState<string | null>(null)
  const [mesmoEndereco, setMesmoEndereco] = useState(true)
  const forma = useRef<HTMLFormElement>(null)

  /**
   * O CEP PREENCHE, MAS NUNCA IMPEDE.
   *
   * Se a consulta falhar — serviço fora do ar, 4G ruim, CEP inexistente — a
   * pessoa recebe uma frase que diz o que fazer e o formulário continua
   * inteiro, com os campos abertos para digitar à mão. Endereço não é o tipo de
   * dado que pode depender de um serviço de terceiro para ser cadastrado.
   *
   * O `prefixo` faz a mesma função servir aos DOIS endereços: o do cadastro e
   * o da coleta. Duplicar isso seria duas cópias da mesma regra para manter em
   * dia, e a segunda envelheceria.
   */
  async function puxarEndereco(prefixo: '' | 'coleta') {
    const f = forma.current
    if (!f) return
    const campo = (nome: string) =>
      f.elements.namedItem(prefixo ? `${prefixo}${nome[0]!.toUpperCase()}${nome.slice(1)}` : nome) as
        | HTMLInputElement
        | null

    const cep = campo('cep')?.value ?? ''
    if (cep.replace(/\D/g, '').length !== 8) {
      setAvisoCep('Digite os 8 dígitos do CEP.')
      return
    }
    setAvisoCep(null)
    setBuscando(prefixo === '' ? 'cadastro' : 'coleta')
    const r = await buscarCep(cep)
    setBuscando(null)
    if (!r.ok) {
      setAvisoCep(r.motivo)
      return
    }
    // Só preenche o que veio: um CEP de rua sem logradouro (os de cidade
    // inteira) não pode limpar o que a pessoa já tinha digitado.
    if (r.logradouro) { const c = campo('logradouro'); if (c) c.value = r.logradouro }
    if (r.bairro) { const c = campo('bairro'); if (c) c.value = r.bairro }
    if (r.cidade) { const c = campo('cidade'); if (c) c.value = r.cidade }
    if (r.uf) { const c = campo('uf'); if (c) c.value = r.uf }
    campo('numero')?.focus()
  }

  return (
    <form ref={forma} action={acao} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>Novo cliente</p>

      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
      {estado.ok && estado.mensagem ? <p className={estilo.sucesso} role="status">{estado.mensagem}</p> : null}

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Nome ou razão social *
          <input className={estilo.campo} name="nome" required minLength={3} />
        </label>
        <label className={estilo.rotulo}>
          CPF ou CNPJ *
          <input className={estilo.campo} name="documento" required inputMode="numeric" />
        </label>
        <label className={estilo.rotulo}>
          WhatsApp *
          <input className={estilo.campo} name="whatsapp" required inputMode="tel" placeholder="51 99999-9999" />
        </label>
        <label className={estilo.rotulo}>
          Telefone fixo
          <input className={estilo.campo} name="telefone" inputMode="tel" />
        </label>
        <label className={estilo.rotulo}>
          E-mail
          <input className={estilo.campo} name="email" type="email" />
        </label>
        <label className={estilo.rotulo}>
          Quem é o contato
          <input className={estilo.campo} name="contatoNome" />
        </label>
      </div>

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          CEP
          <span className={estilo.campoComBotao}>
            <input className={estilo.campo} name="cep" inputMode="numeric" maxLength={9} />
            <button
              type="button"
              className={estilo.btnSec}
              onClick={() => puxarEndereco('')}
              disabled={buscando !== null}
            >
              {buscando === 'cadastro' ? 'Buscando…' : 'Buscar'}
            </button>
          </span>
        </label>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Logradouro
          <input className={estilo.campo} name="logradouro" />
        </label>
        <label className={estilo.rotulo}>
          Número
          <input className={estilo.campo} name="numero" />
        </label>
        <label className={estilo.rotulo}>
          Complemento
          <input className={estilo.campo} name="complemento" placeholder="Sala, andar" />
        </label>
        <label className={estilo.rotulo}>
          Bairro
          <input className={estilo.campo} name="bairro" />
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input className={estilo.campo} name="cidade" />
        </label>
        <label className={estilo.rotulo}>
          UF
          <input className={estilo.campo} name="uf" maxLength={2} />
        </label>
      </div>

      {avisoCep ? (
        <p className={estilo.dica} role="status">
          {avisoCep}
        </p>
      ) : null}

      {/* =====================================================================
          ONDE O MOTORISTA VAI BUSCAR
          =====================================================================
          Endereço errado aqui não é dado errado no banco: é o motorista
          atravessando a cidade e voltando de mãos vazias, com o cliente
          esperando. A clínica tem sede num lugar e sala noutro; o hospital
          recebe pela doca dos fundos.

          A pergunta é feita SEMPRE, e a resposta padrão é "sim, é o mesmo" —
          que é o caso comum. Deixar os campos vazios sem perguntar produziria a
          ambiguidade que cai em cima do motorista: ninguém saberia se vazio
          quer dizer "é o mesmo" ou "ninguém perguntou". */}
      <label className={estilo.checkLinha}>
        <input
          type="checkbox"
          name="coletaMesmoEndereco"
          checked={mesmoEndereco}
          onChange={(e) => setMesmoEndereco(e.target.checked)}
        />
        <span>
          A retirada e a entrega são NESTE endereço
          <span className={estilo.dica}>
            Desmarque se o aparelho é buscado noutro lugar — outra unidade, a doca dos fundos, o
            galpão do sócio.
          </span>
        </span>
      </label>

      {!mesmoEndereco ? (
        <>
          <p className={estilo.blocoTitulo}>Onde buscar e entregar</p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              CEP da coleta
              <span className={estilo.campoComBotao}>
                <input className={estilo.campo} name="coletaCep" inputMode="numeric" maxLength={9} />
                <button
                  type="button"
                  className={estilo.btnSec}
                  onClick={() => puxarEndereco('coleta')}
                  disabled={buscando !== null}
                >
                  {buscando === 'coleta' ? 'Buscando…' : 'Buscar'}
                </button>
              </span>
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Logradouro
              <input className={estilo.campo} name="coletaLogradouro" />
            </label>
            <label className={estilo.rotulo}>
              Número
              <input className={estilo.campo} name="coletaNumero" />
            </label>
            <label className={estilo.rotulo}>
              Complemento
              <input className={estilo.campo} name="coletaComplemento" placeholder="Sala, doca, bloco" />
            </label>
            <label className={estilo.rotulo}>
              Bairro
              <input className={estilo.campo} name="coletaBairro" />
            </label>
            <label className={estilo.rotulo}>
              Cidade
              <input className={estilo.campo} name="coletaCidade" />
            </label>
            <label className={estilo.rotulo}>
              UF
              <input className={estilo.campo} name="coletaUf" maxLength={2} />
            </label>
          </div>
          <label className={estilo.rotulo}>
            O que o motorista precisa saber
            <input
              className={estilo.campo}
              name="coletaObservacao"
              placeholder="Só das 8h às 11h · tocar no interfone 3 · entrar pela doca"
            />
            <span className={estilo.dica}>Aparece no aplicativo dele, na parada.</span>
          </label>
        </>
      ) : null}

      {/* =====================================================================
          QUEM RESPONDE PELO CLIENTE
          =====================================================================
          Diferente de "quem é o contato", que é quem atende o telefone.
          Representante é quem assina o contrato e autoriza o orçamento — o
          sócio na clínica, o comprador no hospital.

          Confundir os dois faz mandar o orçamento de oito mil para quem atende
          o telefone, e esperar aprovação de quem não pode dar. */}
      <p className={estilo.blocoTitulo}>Representante</p>
      <p className={estilo.dica} style={{ marginTop: 'calc(var(--s2) * -1)' }}>
        Quem assina contrato e aprova orçamento. Deixe em branco se for a mesma pessoa do contato.
      </p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Nome
          <input className={estilo.campo} name="representanteNome" />
        </label>
        <label className={estilo.rotulo}>
          Telefone
          <input className={estilo.campo} name="representanteTelefone" inputMode="tel" />
        </label>
        <label className={estilo.rotulo}>
          E-mail
          <input className={estilo.campo} name="representanteEmail" type="email" />
        </label>
        <label className={estilo.rotulo}>
          Vínculo
          <input
            className={estilo.campo}
            name="representanteVinculo"
            placeholder="Sócio, gerente de compras, responsável técnica"
          />
        </label>
      </div>

      <label className={estilo.rotulo}>
        Observações internas
        <textarea className={estilo.area} name="observacoes" rows={2} />
        <span className={estilo.dica}>O cliente não vê este campo.</span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Cadastrar cliente'}
        </button>
      </div>
    </form>
  )
}
