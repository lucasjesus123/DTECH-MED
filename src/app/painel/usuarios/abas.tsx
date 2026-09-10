'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Papel } from '@/generated/prisma/enums'
import { LUGAR, TELAS, padraoDoPapel, telasDoPapel } from '@/server/auth/telas'
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
export default function Abas({
  papel,
  marcadas,
}: {
  /** Pode chegar VAZIO: o formulário de criar começa sem escolha feita. */
  papel: string
  marcadas: string[]
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(marcadas))
  /**
   * O `<details>` que guarda a grade quando ela não é a pergunta do momento.
   * Fechado por padrão — abrir é uma escolha, e é justamente a escolha rara.
   */
  const [abrirMesmoAssim, setAbrirMesmoAssim] = useState(marcadas.length > 0)

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

  /**
   * ---------------------------------------------------------------------------
   * O PERFIL JÁ RESPONDEU METADE DA PERGUNTA — a tela parava de ouvir
   * ---------------------------------------------------------------------------
   * Escolher "Motorista — só o aplicativo de rota" e receber em seguida uma
   * grade de quatorze abas do painel é o sistema perguntando de novo o que
   * acabou de ser respondido. O próprio rótulo do perfil diz "só o aplicativo".
   *
   * Agora quem trabalha no aplicativo ganha uma frase em vez da grade, dizendo
   * onde essa pessoa vai trabalhar. A grade continua alcançável, fechada atrás
   * de um "Mesmo assim, quero dar uma aba do painel" — porque o caso raro
   * existe (o motorista que confere a agenda no computador da oficina), e sumir
   * com ele transformaria uma tela mais limpa numa tela que mente.
   */
  const lugar = ehPapel(papel) ? LUGAR[papel] : null
  const noAplicativo = lugar === 'app'
  const padrao = ehPapel(papel) ? padraoDoPapel(papel).map((t) => t.rotulo) : []

  /**
   * SEM PERFIL ESCOLHIDO, A GRADE NÃO FAZ SENTIDO — e ela desenhava tudo
   * desligado, o que parecia defeito.
   *
   * O formulário de criar começa com `papel` vazio (o `<select>` mostra o
   * primeiro da lista, mas o estado só muda quando alguém troca). `telasDoPapel('')`
   * não alcança nada, e o resultado eram quatorze caixinhas cinzentas com
   * "o perfil escolhido não alcança esta aba" — sobre um perfil que a tela
   * estava exibindo como escolhido.
   */
  if (!ehPapel(papel)) {
    return (
      <div className={estilo.bloco} style={{ marginTop: 'var(--s4)' }}>
        <p className={estilo.blocoTitulo}>
          <span>O que esta pessoa vê no menu</span>
        </p>
        <p className={estilo.dica} style={{ marginTop: '-6px' }}>
          Escolha o perfil acima. É ele que decide o que pode ser dado a esta pessoa.
        </p>
      </div>
    )
  }

  return (
    <div className={estilo.bloco} style={{ marginTop: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>
        <span>{noAplicativo ? 'Onde esta pessoa trabalha' : 'O que esta pessoa vê no menu'}</span>
        {!noAplicativo || abrirMesmoAssim ? (
          <button
            type="button"
            className={estilo.btnLinha}
            onClick={() =>
              setSel(todasMarcadas ? new Set() : new Set(disponiveis.map((t) => t.chave)))
            }
          >
            {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
        ) : null}
      </p>

      {/* Cada marcada vira um campo do formulário. Um `input` escondido por
          caixinha, e não um JSON num campo só: assim o servidor recebe uma lista
          de verdade e o `zod` a valida item a item. */}
      {[...sel].map((c) => (
        <input key={c} type="hidden" name="telas" value={c} />
      ))}

      {noAplicativo ? (
        <>
          <p className={estilo.texto} style={{ marginTop: '-6px' }}>
            {papel === 'MOTORISTA' ? (
              <>
                <strong>O motorista trabalha no aplicativo.</strong> Ele entra e cai direto na rota
                do dia — as paradas dele, o endereço, o mapa, a foto e a assinatura do cliente no
                celular. Não precisa marcar aba nenhuma do painel.
              </>
            ) : (
              <>
                <strong>O técnico começa o dia na bancada, no aplicativo.</strong> É lá que ele
                recebe o aparelho e fotografa a entrada. O laudo, a manutenção e o lançamento de
                peça continuam no painel — por isso as abas de trabalho dele já vêm ligadas.
              </>
            )}
          </p>
          <p className={estilo.dica}>
            {padrao.length > 0 ? (
              <>
                No menu do painel, sem marcar nada, ela vê: <strong>{padrao.join(' · ')}</strong>.
              </>
            ) : null}{' '}
            O aplicativo fica em <Link href="/painel/aplicativos">Aplicativos</Link>.
          </p>

          {abrirMesmoAssim ? (
            <>
              <p className={estilo.dica}>
                {sel.size === 0
                  ? 'Nada marcado — fica o padrão acima.'
                  : `${sel.size} ${sel.size === 1 ? 'aba marcada' : 'abas marcadas'}. Ela vai entrar e encontrar só isto.`}
              </p>
              <Grade grupos={grupos} sel={sel} alternar={alternar} />
            </>
          ) : (
            <button
              type="button"
              className={estilo.btnLinha}
              style={{ justifySelf: 'start' }}
              onClick={() => setAbrirMesmoAssim(true)}
            >
              Mesmo assim, quero dar uma aba do painel
            </button>
          )}
        </>
      ) : (
        <>
          <p className={estilo.dica} style={{ marginTop: '-6px' }}>
            {sel.size === 0 ? (
              <>
                <strong>Nada marcado = o padrão do perfil.</strong> É assim que quase todo mundo
                fica. Marque só quando quiser apertar — por exemplo, deixar uma pessoa vendo
                apenas o Financeiro.
              </>
            ) : (
              <>
                <strong>
                  {sel.size} {sel.size === 1 ? 'aba marcada' : 'abas marcadas'}.
                </strong>{' '}
                Ela vai entrar no sistema e encontrar só isto — inclusive a tela em que cai depois
                de entrar. O resto some do menu e recusa pelo endereço.
              </>
            )}
          </p>
          <Grade grupos={grupos} sel={sel} alternar={alternar} />
        </>
      )}
    </div>
  )
}

/** `papel` chega como string do `<select>`; isto confirma que é um dos nossos. */
function ehPapel(v: string): v is Papel {
  return v in LUGAR
}

type ItemDeAba = { chave: string; rotulo: string; grupo: string; alcanca: boolean }

/**
 * A grade de caixinhas, agrupada.
 *
 * As abas fora do alcance aparecem DESLIGADAS, com o motivo no `title`. Sumir
 * com elas responderia menos: quem monta um acesso e não encontra "Financeiro"
 * conclui que o sistema não tem financeiro, e vai procurar, e vai perguntar.
 */
function Grade({
  grupos,
  sel,
  alternar,
}: {
  grupos: Array<[string, ItemDeAba[]]>
  sel: Set<string>
  alternar: (chave: string) => void
}) {
  return (
    <>
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
    </>
  )
}
