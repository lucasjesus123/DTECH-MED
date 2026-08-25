'use client'

import { useMemo, useState } from 'react'
import type { Papel } from '@/generated/prisma/enums'
import { TELAS, telasDoPapel } from '@/server/auth/telas'
import estilo from '../painel.module.css'

/**
 * As abas do sistema, marcáveis.
 *
 * ---------------------------------------------------------------------------
 * POR QUE AS ABAS FORA DO ALCANCE APARECEM, DESLIGADAS
 * ---------------------------------------------------------------------------
 * Sumir com elas responderia menos. Quem está montando um acesso e não encontra
 * "Financeiro" na lista vai concluir que o sistema não tem financeiro — e vai
 * procurar, e vai perguntar. Desligada e com o motivo escrito, a mesma linha
 * ensina: "para esta pessoa ver o caixa, o perfil dela precisa ser Financeiro
 * ou acima".
 *
 * ---------------------------------------------------------------------------
 * POR QUE "NADA MARCADO" É UM ESTADO VÁLIDO, E O MELHOR DELES
 * ---------------------------------------------------------------------------
 * Nada marcado significa "o padrão do perfil", e é assim que todo mundo nasce.
 * A alternativa — obrigar a marcar — transforma cada contratação num
 * questionário, e é onde alguém esquece uma aba e a pessoa chega no primeiro dia
 * sem conseguir trabalhar.
 *
 * Marcar é para quando se quer APERTAR: "esta aqui só mexe com dinheiro".
 */
export default function Abas({ papel, marcadas }: { papel: string; marcadas: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(marcadas))

  /**
   * O que este papel alcança, calculado AQUI a partir do mesmo catálogo que o
   * servidor usa. Passar a lista pronta de cada página seria repetir a regra em
   * quatro lugares — e é assim que a tela e o servidor começam a discordar.
   */
  const telas = useMemo(() => {
    const alcanca = new Set(telasDoPapel(papel as Papel).map((t) => t.chave))
    return TELAS.map((t) => ({
      chave: t.chave,
      rotulo: t.rotulo,
      grupo: t.grupo as string,
      alcanca: alcanca.has(t.chave),
    }))
  }, [papel])

  const grupos = useMemo(() => {
    const m = new Map<string, typeof telas>()
    for (const t of telas) {
      const lista = m.get(t.grupo)
      if (lista) lista.push(t)
      else m.set(t.grupo, [t])
    }
    return [...m.entries()]
  }, [telas])

  const disponiveis = telas.filter((t) => t.alcanca)
  const todasMarcadas = disponiveis.length > 0 && disponiveis.every((t) => sel.has(t.chave))

  function alternar(chave: string) {
    setSel((atual) => {
      const novo = new Set(atual)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  return (
    <div className={estilo.bloco} style={{ marginTop: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>
        <span>O que esta pessoa vê no menu</span>
        <button
          type="button"
          className={estilo.btnLinha}
          onClick={() => setSel(todasMarcadas ? new Set() : new Set(disponiveis.map((t) => t.chave)))}
        >
          {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </p>

      <p className={estilo.dica} style={{ marginTop: '-6px' }}>
        {sel.size === 0 ? (
          <>
            <strong>Nada marcado = o padrão do perfil.</strong> É assim que quase
            todo mundo fica. Marque só quando quiser apertar — por exemplo, deixar
            uma pessoa vendo apenas o Financeiro.
          </>
        ) : (
          <>
            <strong>
              {sel.size} {sel.size === 1 ? 'aba marcada' : 'abas marcadas'}.
            </strong>{' '}
            Ela vai entrar no sistema e encontrar só isto. O resto some do menu e
            recusa pelo endereço.
          </>
        )}
      </p>

      {/* Cada marcada vira um campo do formulário. Um `input` escondido por
          caixinha, e não um JSON num campo só: assim o servidor recebe uma lista
          de verdade e o `zod` a valida item a item. */}
      {[...sel].map((c) => (
        <input key={c} type="hidden" name="telas" value={c} />
      ))}

      {grupos.map(([nome, itens]) => (
        <div key={nome} className={estilo.abasGrupo}>
          <p className={estilo.abasGrupoNome}>{nome}</p>
          <div className={estilo.abasLista}>
            {itens.map((t) => (
              <label
                key={t.chave}
                className={t.alcanca ? estilo.abaOpcao : estilo.abaOpcaoBloqueada}
                title={t.alcanca ? undefined : 'O perfil escolhido não alcança esta aba.'}
              >
                <input
                  type="checkbox"
                  checked={sel.has(t.chave)}
                  disabled={!t.alcanca}
                  onChange={() => alternar(t.chave)}
                />
                <span>{t.rotulo}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
