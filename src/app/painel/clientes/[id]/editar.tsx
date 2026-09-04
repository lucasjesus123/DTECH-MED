'use client'

import { useState } from 'react'
import FormularioCliente, { type ClienteParaEditar } from '../formulario'
import estilo from '../../painel.module.css'

/**
 * O BOTÃO QUE ABRE A CORREÇÃO — e por que ela mora na FICHA.
 *
 * Corrigir um cadastro quase nunca é a tarefa: é o que a pessoa decide fazer
 * OLHANDO para o cliente — vê que o telefone está errado no cabeçalho, que a
 * cidade mudou, que o representante saiu da empresa. A ficha é onde ela já
 * está quando percebe.
 *
 * Começa fechado porque a ficha é lida muitas vezes e corrigida poucas: um
 * formulário de vinte e sete campos sempre aberto empurraria o histórico de
 * ordens — o que a pessoa veio ver — para três dobras abaixo.
 */
export default function EditarCliente({
  cliente,
  comecarAberto,
}: {
  cliente: ClienteParaEditar
  /** Vem de `?editar=1`: o atalho da linha da lista já abre o formulário. */
  comecarAberto: boolean
}) {
  const [aberto, setAberto] = useState(comecarAberto)

  if (!aberto) {
    return (
      <button type="button" className={estilo.btnSec} onClick={() => setAberto(true)}>
        Editar cadastro
      </button>
    )
  }

  return (
    <div style={{ gridColumn: '1 / -1', width: '100%' }}>
      <FormularioCliente cliente={cliente} aoFechar={() => setAberto(false)} />
    </div>
  )
}
