'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { avancar } from '@/server/acoes/ordem'
import estilo from '../../painel.module.css'

export type PassoPossivel = { para: string; titulo: string; colunaDestino: string | null }

export type Cartao = {
  id: string
  numero: number
  etapaRotulo: string
  cliente: string
  equipamento: string
  tecnico: string | null
  prioridade: string
  atrasada: boolean
  diasNaEtapa: number
  /** O que ESTA pessoa pode fazer com ESTA ordem, agora. */
  passos: PassoPossivel[]
}

export type Coluna = {
  id: string
  nome: string
  cor: string | null
  cartoes: Cartao[]
  orfa: boolean
}

/**
 * O QUADRO DA O.S.
 *
 * =============================================================================
 * POR QUE MOVER É BOTÃO, E NÃO ARRASTAR
 * =============================================================================
 * Arrastar é o gesto que todo mundo espera de um quadro, e aqui ele mentiria.
 *
 * Uma coluna agrupa VÁRIAS etapas, e as transições entre etapas não são livres:
 * a máquina de estados sabe quais são legais, quem pode fazer cada uma, e o que
 * cada uma exige — a coleta pede assinatura do cliente, o faturamento pede
 * fatura emitida, a entrega pede a fatura quitada. Arrastar um cartão de
 * "Diagnóstico" para "Fechamento" não tem resposta certa: não existe uma
 * transição só, existem quatro, e três delas seriam recusadas.
 *
 * Um quadro que aceita o arrasto e depois devolve "não pode" é pior que um que
 * não aceita: a pessoa já soltou o cartão, já viu ele mudar de lugar, e agora
 * ele volta sozinho. Então o cartão mostra os passos que REALMENTE cabem — os
 * mesmos da ficha, vindos de `proximosPassos(etapa, papel)` — e clicar num deles
 * anda a esteira de verdade, pela mesma `avancar`, com trilha e tudo.
 *
 * O cartão diz para qual COLUNA cada passo o leva. É o que devolve a leitura de
 * quadro sem prometer o gesto que não dá para cumprir.
 *
 * =============================================================================
 * O NÚMERO DE DIAS É O QUE FAZ O QUADRO VALER
 * =============================================================================
 * Uma coluna com onze cartões não diz nada; onze cartões em que um está parado
 * há 23 dias dizem tudo. É o esquecido que o quadro existe para achar, e ele
 * nunca está no topo — está no meio, com cara de normal.
 */
export default function Quadro({
  colunas,
  podeDesenhar,
}: {
  colunas: Coluna[]
  podeDesenhar: boolean
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function mover(ordemId: string, para: string, titulo: string) {
    setMsg(null)
    iniciar(async () => {
      const r = await avancar({ ordemId, para: para as never })
      setMsg({ ok: r.ok, texto: r.ok ? `${titulo} — feito.` : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <>
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.quadro}>
        {colunas.map((c) => (
          <section
            key={c.id}
            className={estilo.quadroColuna}
            aria-label={`${c.nome}, ${c.cartoes.length} ${c.cartoes.length === 1 ? 'ordem' : 'ordens'}`}
          >
            <div className={`${estilo.quadroTopo} ${tom(c.cor)}`}>
              <p className={estilo.quadroNome}>
                {c.nome}
                <span className={estilo.quadroConta}>{c.cartoes.length}</span>
              </p>
            </div>

            {/* A coluna de resgate explica o que ela é e o que fazer. Sem isso
                ela pareceria uma coluna comum com nome estranho, e ninguém
                arrumaria a configuração que a fez existir. */}
            {c.orfa ? (
              <p className={estilo.quadroAviso} role="status">
                Estas etapas não estão em nenhuma coluna do seu quadro. As ordens continuam aqui,
                visíveis, até você encaixá-las.{' '}
                {podeDesenhar ? (
                  <Link href="/painel/ordens/quadro/colunas">Arrumar as colunas</Link>
                ) : (
                  'Peça à gestão para arrumar as colunas.'
                )}
              </p>
            ) : null}

            {c.cartoes.length === 0 && !c.orfa ? (
              <p className={estilo.quadroVazio}>Nada aqui.</p>
            ) : null}

            <ul className={estilo.quadroCartoes}>
              {c.cartoes.map((k) => (
                <li
                  key={k.id}
                  className={
                    k.atrasada ? `${estilo.quadroCartao} ${estilo.quadroAtrasado}` : estilo.quadroCartao
                  }
                >
                  <Link href={`/painel/ordens/${k.id}`} className={estilo.quadroCartaoTopo}>
                    <strong>#{String(k.numero).padStart(4, '0')}</strong>
                    <span className={estilo.quadroCliente}>{k.cliente}</span>
                  </Link>
                  <p className={estilo.quadroAparelho}>{k.equipamento}</p>

                  <p className={estilo.quadroChips}>
                    <span className={estilo.quadroEtapa}>{k.etapaRotulo}</span>
                    {k.prioridade === 'ALTA' ? (
                      <span className={`${estilo.tag} ${estilo.tagAlerta}`}>alta</span>
                    ) : null}
                    {/* O número que denuncia o esquecido. Só a partir de três
                        dias: "há 0 dias" em todo cartão novo é ruído. */}
                    {k.diasNaEtapa >= 3 ? (
                      <span
                        className={
                          k.diasNaEtapa >= 10
                            ? `${estilo.quadroDias} ${estilo.indAlerta}`
                            : estilo.quadroDias
                        }
                      >
                        {k.diasNaEtapa} dias aqui
                      </span>
                    ) : null}
                    {k.tecnico ? <span className={estilo.quadroDias}>{k.tecnico}</span> : null}
                  </p>

                  {/* Os passos que REALMENTE cabem, com a coluna de destino
                      escrita. Ver o cabeçalho do arquivo: é o que devolve a
                      leitura de quadro sem prometer o arrasto que a máquina de
                      estados não pode cumprir. */}
                  {k.passos.length > 0 ? (
                    <div className={estilo.quadroPassos}>
                      {k.passos.map((p) => (
                        <button
                          key={p.para}
                          type="button"
                          className={estilo.quadroPasso}
                          disabled={pendente}
                          onClick={() => mover(k.id, p.para, p.titulo)}
                          title={
                            p.colunaDestino
                              ? `Move para a coluna ${p.colunaDestino}`
                              : 'Esta etapa não está em nenhuma coluna do quadro'
                          }
                        >
                          {p.titulo}
                          {p.colunaDestino ? (
                            <span className={estilo.fraco}> → {p.colunaDestino}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

/**
 * A cor vem como NOME e vira classe aqui.
 *
 * O banco guarda 'sinal', não '#2DD4A0'. Cor literal gravada não acompanha a
 * troca de tema, e uma coluna verde-claro escolhida no tema claro viraria uma
 * faixa ilegível no escuro.
 */
function tom(cor: string | null): string {
  // `?? ''` em cada um porque o CSS é um módulo tipado como índice opcional: a
  // classe existe, mas o compilador não sabe disso, e um `undefined` colado na
  // string de classe viraria "undefined" literal no atributo.
  switch (cor) {
    case 'violeta':
      return estilo.tomVioleta ?? ''
    case 'sinal':
      return estilo.tomSinal ?? ''
    case 'alerta':
      return estilo.tomAlerta ?? ''
    case 'espera':
      return estilo.tomEspera ?? ''
    case 'acao':
      return estilo.tomAcao ?? ''
    default:
      return ''
  }
}
