'use client'

import { useState } from 'react'
import FormularioItem, { type ItemParaEditar } from '../formulario-item'
import estilo from '../../painel.module.css'

/**
 * O BOTÃO QUE ABRE A CORREÇÃO — e por que ela mora na FICHA.
 *
 * =============================================================================
 * ONDE ESTÁ O CONTEXTO É ONDE SE CORRIGE
 * =============================================================================
 * Corrigir o cadastro de um item quase nunca é uma tarefa em si: é uma coisa
 * que a pessoa decide fazer olhando para ele — vê que a prateleira mudou, que o
 * fornecedor não é mais aquele, que o mínimo está errado porque a peça acabou
 * duas vezes no mês. A ficha é onde ela já está quando percebe.
 *
 * Um formulário de edição em tela própria obrigaria a sair da ficha, escolher o
 * item de novo numa lista, corrigir e voltar — e o "voltar" é o passo que
 * ninguém dá, então a conferência do que foi corrigido não acontece.
 *
 * =============================================================================
 * COMEÇA FECHADO
 * =============================================================================
 * A ficha é lida muitas vezes e corrigida poucas. Um formulário sempre aberto
 * empurraria o livro-razão — a informação que a pessoa veio ver — para baixo da
 * dobra, e ainda convidaria a mexer no cadastro por engano.
 */
export default function EditarItem({
  item,
  comecarAberto,
}: {
  item: ItemParaEditar
  /** Vem de `?editar=1`: o atalho da linha da tabela já abre o formulário. */
  comecarAberto: boolean
}) {
  const [aberto, setAberto] = useState(comecarAberto)

  if (!aberto) {
    return (
      <div className={estilo.modeloCartaoAcoes} style={{ marginTop: 'var(--s4)' }}>
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(true)}>
          Editar cadastro
        </button>
      </div>
    )
  }

  return <FormularioItem item={item} aoFechar={() => setAberto(false)} />
}
