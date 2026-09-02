'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { lerValorBR } from '@/lib/dinheiro'
import { editarConta } from '@/server/acoes/caixa'
import Janela, { CampoDinheiro } from './janela'
import type { ClienteBreve } from './nova-conta'
import estilo from '../painel.module.css'

export type ContaParaEditar = {
  id: string
  descricao: string
  categoria: string | null
  contraparte: string | null
  clienteId: string | null
  valorCentavos: number
  vencimento: string
  observacoes: string | null
  parcela: number
  parcelas: number
  daRecorrencia: boolean
  aprovadoPorNome: string | null
}

/**
 * EDITAR LANÇAMENTO — com o aviso ANTES, e não a surpresa depois.
 *
 * =============================================================================
 * O QUE ESTA JANELA EXISTE PARA IMPEDIR
 * =============================================================================
 * Até aqui não havia edição: corrigir um valor digitado errado era apagar e
 * relançar. Quem tem uma conta parcelada em doze não faz isso — deixa errado e
 * ajusta na baixa, que é como um erro de digitação vira um número que não bate
 * no fechamento do mês.
 *
 * =============================================================================
 * OS TRÊS AVISOS, E POR QUE ELES SÃO DIFERENTES
 * =============================================================================
 * APROVAÇÃO — o único que muda o estado da conta. Mexer no valor ou no
 * vencimento de uma conta já aprovada DERRUBA a aprovação, e tem de derrubar:
 * sem isso, lançar R$ 10, conseguir aprovação (ninguém confere duas vezes um
 * lançamento de dez reais) e editar para R$ 10.000 contornaria a segregação de
 * função inteira. O aviso fica cinza enquanto os dois campos estão intocados e
 * ACENDE no instante em que um deles muda — porque é aí que ele passa a valer.
 *
 * RECORRÊNCIA — informativo. A conta veio de um modelo mensal; editar aqui
 * muda só o mês, não o modelo. Quem quer mudar todo mês precisa saber que está
 * no lugar errado, antes de salvar e achar que resolveu.
 *
 * PARCELA — informativo. Alterar a parcela 3 de 12 não mexe nas outras onze.
 *
 * A trava de verdade está na ação, no servidor. Estes avisos existem para que
 * ninguém seja pego de surpresa por ela.
 */
export default function EditarConta({
  conta,
  aoFechar,
  clientes,
  categorias,
}: {
  conta: ContaParaEditar | null
  aoFechar: () => void
  clientes: ClienteBreve[]
  categorias: string[]
}) {
  const [estado, acao, pendente] = useActionState(editarConta, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const valorOriginal = conta ? (conta.valorCentavos / 100).toFixed(2).replace('.', ',') : ''
  const vencimentoOriginal = conta ? conta.vencimento.slice(0, 10) : ''

  /**
   * OS DOIS CAMPOS NASCEM COM O VALOR DA CONTA — pelo inicializador, e não por
   * um efeito que sincroniza depois.
   *
   * Eles precisam ser controlados (e não `defaultValue`) porque o aviso lá
   * embaixo compara o que está digitado AGORA com o que a conta tinha, para
   * acender no instante em que a aprovação passa a correr risco.
   *
   * Quem troca de linha troca o `key` em `contas.tsx`, o React remonta, e o
   * inicializador roda de novo com a conta nova. Sincronizar isso num
   * `useEffect` renderizaria duas vezes a cada abertura e mostraria por um
   * quadro o valor da conta anterior — num formulário de dinheiro.
   */
  const [valor, setValor] = useState(valorOriginal)
  const [vencimento, setVencimento] = useState(vencimentoOriginal)
  const router = useRouter()
  const jaFechou = useRef(false)

  useEffect(() => {
    if (estado.ok && estado.mensagem && !jaFechou.current) {
      jaFechou.current = true
      router.refresh()
      aoFechar()
    }
  }, [estado, router, aoFechar])

  if (!conta) return null

  const centavosAgora = Math.round((lerValorBR(valor) ?? 0) * 100)
  const mudouValor = centavosAgora > 0 && centavosAgora !== conta.valorCentavos
  const mudouVencimento = vencimento !== '' && vencimento !== vencimentoOriginal
  const vaiDerrubar = Boolean(conta.aprovadoPorNome) && (mudouValor || mudouVencimento)

  return (
    <Janela titulo="Editar lançamento" aberta aoFechar={aoFechar}>
      <form action={acao} className={estilo.janelaForm}>
        <input type="hidden" name="id" value={conta.id} />

        {conta.aprovadoPorNome ? (
          <p
            className={vaiDerrubar ? estilo.avisoCaixaForte : estilo.avisoCaixa}
            role={vaiDerrubar ? 'alert' : 'status'}
          >
            <strong>{vaiDerrubar ? 'A aprovação vai cair.' : 'Conta já aprovada'}</strong>{' '}
            {vaiDerrubar
              ? `Aprovada por ${conta.aprovadoPorNome}. Como você mudou ${
                  mudouValor && mudouVencimento
                    ? 'o valor e o vencimento'
                    : mudouValor
                      ? 'o valor'
                      : 'o vencimento'
                }, ao salvar ela volta para a fila de aprovação e não recebe baixa até ser liberada de novo.`
              : `Liberada por ${conta.aprovadoPorNome}. Mexer no valor ou no vencimento derruba a aprovação — o resto pode ser corrigido sem isso.`}
          </p>
        ) : null}

        {conta.daRecorrencia ? (
          <p className={estilo.avisoCaixa} role="status">
            <strong>Veio de uma recorrência.</strong> A alteração vale só para esta conta. Para mudar
            todo mês, edite a recorrência na aba Recorrências.
          </p>
        ) : null}

        {conta.parcelas > 1 ? (
          <p className={estilo.avisoCaixa} role="status">
            <strong>
              Parcela {conta.parcela} de {conta.parcelas}.
            </strong>{' '}
            As outras parcelas não mudam.
          </p>
        ) : null}

        <CampoDinheiro nome="valor" valor={valor} aoMudar={setValor} rotulo="Valor" />

        <div className={estilo.janelaGrade}>
          <label className={estilo.rotulo}>
            Vencimento *
            <input
              className={estilo.campo}
              type="date"
              name="vencimento"
              required
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </label>
          <label className={estilo.rotulo}>
            Categoria
            <input
              className={estilo.campo}
              name="categoria"
              list="cat-editar-conta"
              maxLength={60}
              defaultValue={conta.categoria ?? ''}
            />
            <datalist id="cat-editar-conta">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>

        <label className={estilo.rotulo}>
          Descrição *
          <input
            className={estilo.campo}
            name="descricao"
            required
            maxLength={140}
            defaultValue={conta.descricao}
          />
        </label>

        <div className={estilo.janelaGrade}>
          <label className={estilo.rotulo}>
            Cliente
            <select className={estilo.selecao} name="clienteId" defaultValue={conta.clienteId ?? ''}>
              <option value="">— não está na carteira —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={estilo.rotulo}>
            Contraparte
            <input
              className={estilo.campo}
              name="contraparte"
              maxLength={140}
              defaultValue={conta.contraparte ?? ''}
            />
          </label>
        </div>

        <label className={estilo.rotulo}>
          Observações
          <textarea
            className={estilo.area}
            name="observacoes"
            rows={2}
            maxLength={500}
            defaultValue={conta.observacoes ?? ''}
          />
        </label>

        {!estado.ok ? (
          <p className={estilo.erro} role="alert">
            {estado.motivo}
          </p>
        ) : null}

        <div className={estilo.janelaAcoes}>
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Janela>
  )
}
