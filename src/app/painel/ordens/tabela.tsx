'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import JanelaOS from './janela-os'
import estilo from '../painel.module.css'

export type LinhaDeOrdem = {
  id: string
  numero: number
  prioridade: string
  etapaRotulo: string
  /** Em que passo dos onze ela está. Zero quando saiu do caminho. */
  passo: number
  totalPassos: number
  equipamento: string
  serie: string | null
  cliente: string
  tecnico: string | null
  diasParado: number
  atrasada: boolean
  faturaCentavos: number | null
  faturaStatus: string | null
}

/**
 * A LISTA QUE ABRE A JANELA.
 *
 * =============================================================================
 * POR QUE A LINHA DEIXOU DE LEVAR PARA OUTRA PÁGINA
 * =============================================================================
 * O número da O.S. levava à ficha, e o lápis à correção. Duas portas para a
 * mesma ordem, as duas para FORA da lista — e sair da lista custa o filtro que
 * a pessoa acabou de digitar, a posição da rolagem e o lugar onde ela estava.
 * Num dia de vinte ordens isso é a tarde inteira voltando com o botão do
 * navegador.
 *
 * Agora a linha abre a janela: onde a ordem está, o que falta e o botão do
 * próximo passo, sem tirar ninguém do lugar. A ficha e a correção continuam
 * existindo — a janela leva às duas, para quem quer o histórico inteiro.
 *
 * =============================================================================
 * A COLUNA "PASSO" SUBSTITUIU O LÁPIS
 * =============================================================================
 * O lápis era a única coisa que a última coluna oferecia, e era a ação MENOS
 * frequente da tela — corrigir o que foi digitado na abertura. No lugar dele
 * entrou a informação mais pedida: em que passo dos onze a ordem está. Ela
 * responde de relance a pergunta que faz alguém abrir a lista.
 */
export default function TabelaDeOrdens({ ordens }: { ordens: LinhaDeOrdem[] }) {
  const router = useRouter()
  const parametros = useSearchParams()

  /**
   * `?abrir=<id>` ABRE A JANELA DE FORA DA LISTA.
   *
   * A janela nascia só do clique numa linha, e por isso era inalcançável de
   * qualquer outro lugar do sistema: o calendário, o Dashboard e a busca só
   * sabiam mandar para a ficha `/painel/ordens/<id>`, que é a tela longa. Agora
   * qualquer um deles manda para a lista com a janela já aberta na ordem certa.
   *
   * O endereço é a fonte quando ele existe, e o estado local assume depois —
   * assim fechar a janela não recarrega a página inteira só para tirar um
   * parâmetro, e o botão "voltar" do navegador continua fazendo o esperado.
   */
  const pedida = parametros.get('abrir')
  const [aberta, setAberta] = useState<string | null>(pedida)

  function fechar() {
    setAberta(null)
    if (!pedida) return
    // Tira o `abrir` da barra sem perder o filtro que a pessoa digitou.
    const outros = new URLSearchParams(parametros.toString())
    outros.delete('abrir')
    const q = outros.toString()
    router.replace(q ? `/painel/ordens?${q}` : '/painel/ordens', { scroll: false })
  }

  return (
    <>
      <div className={`${estilo.quadro} ${estilo.rolaX}`}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Equipamento</th>
              <th>Cliente</th>
              <th>Passo</th>
              <th>Etapa</th>
              <th>Técnico</th>
              <th>Última mexida</th>
              <th className={estilo.dir}>Fatura</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((o) => (
              <tr
                key={o.id}
                className={estilo.linhaAbre}
                /* O clique na linha é conforto de mouse. Quem navega por teclado
                   usa o botão do número, que é o controle de verdade — por isso
                   ele existe em vez de a linha inteira virar um `tabIndex`. */
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, a')) return
                  setAberta(o.id)
                }}
              >
                <td className={estilo.num}>
                  <button
                    type="button"
                    className={estilo.linhaBotao}
                    onClick={() => setAberta(o.id)}
                    aria-label={`Abrir a O.S. ${String(o.numero).padStart(4, '0')}`}
                  >
                    #{String(o.numero).padStart(4, '0')}
                  </button>
                  {o.prioridade === 'ALTA' ? (
                    <>
                      {' '}
                      <span className={`${estilo.tagAlerta} ${estilo.tag}`}>alta</span>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className={estilo.forte}>{o.equipamento}</span>
                  {o.serie ? <div className={estilo.fraco}>série {o.serie}</div> : null}
                </td>
                <td>{o.cliente}</td>
                <td className={estilo.num}>
                  {o.passo === 0 ? (
                    <span className={estilo.fraco}>fora da linha</span>
                  ) : (
                    <span className={estilo.osPassoConta}>
                      {o.passo}
                      <span className={estilo.fraco}>/{o.totalPassos}</span>
                    </span>
                  )}
                </td>
                <td>
                  <span className={estilo.tag}>{o.etapaRotulo}</span>
                </td>
                <td>{o.tecnico ?? <span className={estilo.fraco}>sem técnico</span>}</td>
                <td className={estilo.num}>
                  <span className={o.atrasada ? estilo.atrasado : undefined}>
                    {o.diasParado === 0 ? 'hoje' : `${o.diasParado}d`}
                  </span>
                  {o.atrasada ? <div className={estilo.fraco}>prazo vencido</div> : null}
                </td>
                <td className={`${estilo.num} ${estilo.dir}`}>
                  {o.faturaCentavos !== null ? (
                    <>
                      {formatarBRL(o.faturaCentavos)}
                      <div className={estilo.fraco}>{o.faturaStatus?.toLowerCase()}</div>
                    </>
                  ) : (
                    <span className={estilo.fraco}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberta ? <JanelaOS ordemId={aberta} aoFechar={fechar} /> : null}
    </>
  )
}
