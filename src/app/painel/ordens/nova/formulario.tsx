'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { abrirOrdem } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

type Resposta = { ok: true; dados?: { id: string } } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * Formulário de abertura.
 *
 * O campo do defeito pede o relato **em português do cliente**, não um código.
 * É esse texto que o técnico lê antes de encostar no aparelho, e traduzi-lo
 * cedo demais perde a informação que só quem usa o equipamento tem — "faz um
 * barulho quando esquenta" vale mais que "falha intermitente".
 */
type Lead = {
  id: string
  nome: string
  contato: string
  telefone: string
  cidade: string
  equipamento: string
  mensagem: string
}

export default function Formulario({ lead }: { lead: Lead | null }) {
  const [estado, acao, pendente] = useActionState(abrirOrdem, inicial)
  const router = useRouter()

  // A marca costuma vir como "Ibramed Neurodyn": a primeira palavra é a marca,
  // o resto é o modelo. Chute útil, e a pessoa corrige em um clique se errar.
  const [marca = '', ...resto] = (lead?.equipamento ?? '').split(' ')

  useEffect(() => {
    if (estado.ok && estado.dados?.id) router.push(`/painel/ordens/${estado.dados.id}`)
  }, [estado, router])

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`} style={{ maxWidth: 900 }}>
      {!estado.ok && estado.motivo ? <p className={estilo.erro}>{estado.motivo}</p> : null}
      {lead ? <input type="hidden" name="leadId" value={lead.id} /> : null}

      <p className={estilo.blocoTitulo}>Quem é o cliente</p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Nome ou razão social *
          <input
            className={estilo.campo}
            name="clienteNome"
            required
            minLength={3}
            autoComplete="off"
            defaultValue={lead?.nome ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          CPF ou CNPJ *
          <input className={estilo.campo} name="clienteDocumento" required inputMode="numeric" autoComplete="off" />
          <span className={estilo.dica}>
            Se já for cliente, o cadastro é reaproveitado. É também o que ele digita
            para aprovar o orçamento.
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
            defaultValue={lead?.telefone ?? ''}
          />
          <span className={estilo.dica}>Todos os avisos da esteira saem por aqui.</span>
        </label>
        <label className={estilo.rotulo}>
          Quem é o contato
          <input
            className={estilo.campo}
            name="contatoNome"
            placeholder="Nome de quem atende na clínica"
            defaultValue={lead?.contato ?? ''}
          />
        </label>
      </div>

      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
        Onde buscar
      </p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo} style={{ gridColumn: '1 / -1' }}>
          Endereço da retirada *
          <input className={estilo.campo} name="endereco" required minLength={5} placeholder="Rua, número, sala, bairro" />
        </label>
        <label className={estilo.rotulo}>
          Cidade
          <input className={estilo.campo} name="cidade" defaultValue={lead?.cidade ?? ''} />
        </label>
      </div>

      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
        Qual é o aparelho
      </p>
      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Marca *
          <input className={estilo.campo} name="marca" required minLength={2} defaultValue={marca} />
        </label>
        <label className={estilo.rotulo}>
          Modelo *
          <input className={estilo.campo} name="modelo" required defaultValue={resto.join(' ')} />
        </label>
        <label className={estilo.rotulo}>
          Número de série
          <input className={estilo.campo} name="numeroSerie" />
          <span className={estilo.dica}>É o que amarra o histórico do aparelho entre uma visita e outra.</span>
        </label>
        <label className={estilo.rotulo}>
          Acessórios que vêm junto
          <input className={estilo.campo} name="acessorios" placeholder="Cabo, pedal, ponteira…" />
          <span className={estilo.dica}>Anotar aqui evita discussão na devolução.</span>
        </label>
      </div>

      <label className={estilo.rotulo}>
        O que está acontecendo *
        <textarea
          className={estilo.area}
          name="defeito"
          required
          minLength={10}
          rows={4}
          placeholder="Do jeito que o cliente contou. Ex.: liga, mas desliga sozinho depois de uns dez minutos."
          defaultValue={lead?.mensagem ?? ''}
        />
      </label>

      <label className={estilo.rotulo} style={{ maxWidth: 280 }}>
        Prioridade
        <select className={estilo.selecao} name="prioridade" defaultValue="NORMAL" style={{ width: '100%' }}>
          <option value="NORMAL">Normal</option>
          <option value="ALTA">Alta — clínica parada faturando</option>
        </select>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Abrindo…' : 'Abrir ordem e gerar o PDF de retirada'}
        </button>
      </div>
    </form>
  )
}
