'use client'

import Link from 'next/link'
import { useState } from 'react'
import estilo from '../painel.module.css'

export type OrdemSemPreco = {
  id: string
  numero: number
  /**
   * O rótulo já vem PRONTO do servidor.
   *
   * A tradução mora em `maquina-estados`, que é módulo de servidor: importá-lo
   * aqui arrastaria a tabela de transições e a lista de quem pode o quê para
   * dentro do pacote do navegador — justamente o que não se publica.
   */
  etapaRotulo: string
  cliente: string
  equipamento: string
  defeito: string
  diasParada: number
  versoes: number
}

/**
 * MONTAR ORÇAMENTO — o botão que faltava na aba.
 *
 * =============================================================================
 * A ABA ERA SÓ ESPELHO
 * =============================================================================
 * Ela mostrava os orçamentos que já existem e não deixava começar nenhum. Quem
 * senta para orçar tinha de sair do Comercial, ir à lista geral de ordens e
 * garimpar quais estão esperando preço no meio das que estão na bancada e das
 * que estão na rua.
 *
 * =============================================================================
 * O BOTÃO ABRE UMA LISTA, E NÃO UM FORMULÁRIO EM BRANCO
 * =============================================================================
 * Orçamento não nasce do nada: ele é o preço DE UM APARELHO que está aqui, com
 * um defeito diagnosticado. Um formulário vazio pediria "escolha a ordem" no
 * primeiro campo — empurrando a pessoa para a mesma escolha, dois cliques
 * depois e com a sensação de ter sido enganada.
 *
 * É a mesma decisão da parada e da preventiva no Calendário: o que não pode
 * nascer solto vira um caminho curto até onde ele nasce de verdade.
 *
 * =============================================================================
 * FECHADO POR PADRÃO
 * =============================================================================
 * A aba é aberta muito mais para ACOMPANHAR do que para montar. Uma lista
 * sempre aberta empurraria o funil — a informação que a pessoa veio ver — para
 * baixo da dobra.
 */
export default function MontarOrcamento({ ordens }: { ordens: OrdemSemPreco[] }) {
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
        <button type="button" className={estilo.btn} onClick={() => setAberto(true)}>
          Montar orçamento
        </button>
        <span className={estilo.dica}>
          {ordens.length === 0
            ? 'Nenhuma O.S. esperando preço agora.'
            : `${ordens.length} ${ordens.length === 1 ? 'O.S. está esperando' : 'O.S. estão esperando'} preço.`}
        </span>
      </div>
    )
  }

  return (
    <div className={estilo.bloco} style={{ marginBottom: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>
        <span>Para qual O.S.?</span>
        <button type="button" className={estilo.linkAcao} onClick={() => setAberto(false)}>
          fechar
        </button>
      </p>

      {ordens.length === 0 ? (
        <p className={estilo.texto}>
          Nenhuma O.S. está esperando preço. O orçamento é montado depois que o aparelho chega e o
          técnico diagnostica — quando isso acontecer, a ordem aparece aqui.{' '}
          <Link href="/painel/ordens/nova">Abrir uma O.S.</Link>
        </p>
      ) : (
        <>
          <p className={estilo.texto} style={{ maxWidth: '68ch' }}>
            Estas são as ordens em que fazer preço faz sentido agora: o aparelho chegou, está em
            análise, o orçamento está montado e não saiu, ou o cliente reprovou e cabe refazer.{' '}
            <strong>As mais paradas vêm primeiro.</strong>
          </p>

          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>O.S.</th>
                  <th>Cliente</th>
                  <th>Aparelho</th>
                  <th>Onde está</th>
                  <th className={estilo.dir}>Parada há</th>
                  <th>
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordens.map((o) => (
                  <tr key={o.id}>
                    <td className={estilo.num}>#{String(o.numero).padStart(4, '0')}</td>
                    <td className={estilo.forte}>{o.cliente}</td>
                    <td>
                      {o.equipamento}
                      <div className={estilo.fraco} title={o.defeito}>
                        {o.defeito.length > 60 ? `${o.defeito.slice(0, 60)}…` : o.defeito}
                      </div>
                    </td>
                    <td>
                      <span className={`${estilo.tag} ${estilo.tagNeutra}`}>{o.etapaRotulo}</span>
                      {/* Já houve uma tentativa? Reprovado com versão anterior
                          muda a conversa: não é orçar, é REorçar. */}
                      {o.versoes > 0 ? (
                        <div className={estilo.fraco}>
                          {o.versoes} {o.versoes === 1 ? 'versão anterior' : 'versões anteriores'}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>
                      <span className={o.diasParada >= 7 ? estilo.atrasado : undefined}>
                        {o.diasParada} {o.diasParada === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                    <td>
                      {/* Leva à ÂNCORA do orçamento dentro da O.S., que é onde
                          ele é montado de verdade — com as peças do estoque, o
                          laudo e a garantia. */}
                      <Link href={`/painel/ordens/${o.id}#orcamento`} className={estilo.btnPrimario}>
                        {o.versoes > 0 ? 'Refazer' : 'Montar'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
