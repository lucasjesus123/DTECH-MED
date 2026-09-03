'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirOrdem } from '@/server/acoes/ordem'
import QuemEOCliente from './quem-e-o-cliente'
import QualEOAparelho from './qual-e-o-aparelho'
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

  /**
   * QUEM É O CLIENTE ESCOLHIDO — o único estado que os dois blocos dividem.
   *
   * O bloco do aparelho precisa dele para avisar, na hora da escolha, que a
   * máquina puxada está no nome de outra clínica. É a única coisa que sobe até
   * aqui; o resto de cada bloco continua sendo assunto dele.
   */
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null)

  // A marca costuma vir como "Ibramed Neurodyn": a primeira palavra é a marca,
  // o resto é o modelo. Chute útil, e a pessoa corrige em um clique se errar.
  const [marca = '', ...resto] = (lead?.equipamento ?? '').split(' ')

  useEffect(() => {
    if (estado.ok && estado.dados?.id) router.push(`/painel/ordens/${estado.dados.id}`)
  }, [estado, router])

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`} style={{ maxWidth: 900 }}>
      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
      {lead ? <input type="hidden" name="leadId" value={lead.id} /> : null}

      {/* Quem é o cliente, onde buscar, e a busca que reconhece a carteira.
          Saiu daqui para um componente próprio porque virou estado: seis campos
          que se preenchem juntos quando alguém escolhe um cliente já cadastrado.
          Ver `quem-e-o-cliente.tsx`. */}
      <QuemEOCliente
        nomeInicial={lead?.nome ?? ''}
        telefoneInicial={lead?.telefone ?? ''}
        contatoInicial={lead?.contato ?? ''}
        cidadeInicial={lead?.cidade ?? ''}
        aoMudarEscolha={setCliente}
      />

      {/* O aparelho saiu daqui para um bloco próprio quando ganhou a busca no
          catálogo. Ver `qual-e-o-aparelho.tsx`: puxar a máquina já cadastrada é
          o que impede o mesmo laser de virar quatro linhas, cada uma com um
          pedaço do histórico. */}
      <QualEOAparelho
        marcaInicial={marca}
        modeloInicial={resto.join(' ')}
        clienteId={cliente?.id ?? null}
        clienteNome={cliente?.nome ?? null}
      />

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
          {pendente ? 'Abrindo…' : 'Abrir O.S. e gerar o PDF de retirada'}
        </button>
      </div>
    </form>
  )
}
