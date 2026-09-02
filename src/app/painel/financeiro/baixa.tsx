'use client'

import { formatarBRL } from '@/lib/dinheiro'
import { FormularioBaixa, PALAVRAS, type Conta } from './contas'
import estilo from '../painel.module.css'

/**
 * A ABA DE DAR BAIXA — e ela DÁ BAIXA.
 *
 * =============================================================================
 * A PRIMEIRA VERSÃO SÓ LISTAVA, E ISSO NÃO ERA O PEDIDO
 * =============================================================================
 * Ela mostrava o que estava aprovado e escrevia "a baixa em si é dada na aba A
 * pagar ou A receber, na linha da conta". Ou seja: uma tela que responde
 * "o que eu pago hoje" e manda a pessoa para outro lugar para pagar.
 *
 * Isso é pior do que não ter a aba. Quem abre uma tela chamada "Dar baixa" tem
 * a mão no dinheiro naquele momento; obrigá-la a trocar de aba e reencontrar a
 * mesma conta numa lista maior é desfazer o motivo de a tela existir.
 *
 * =============================================================================
 * O MESMO FORMULÁRIO, E NÃO UM PARECIDO
 * =============================================================================
 * `FormularioBaixa` é importado da aba de contas, não copiado. Duas telas que
 * dão baixa de jeitos ligeiramente diferentes é o começo de um problema chato:
 * a que for corrigida primeiro deixa a outra errada, e o erro é dinheiro.
 *
 * =============================================================================
 * SEM RECORTE DE MÊS
 * =============================================================================
 * Todas as outras abas são do mês, porque a pergunta delas é "como está
 * agosto". Esta pergunta é outra: "o que está liberado e ainda não paguei".
 * Uma conta vencida em julho que ninguém pagou continua sendo trabalho de hoje
 * — e sumiria da tela se a consulta filtrasse por mês.
 */

export type ContaParaBaixa = Conta & {
  /** 'PAGAR' | 'RECEBER' — decide as palavras da linha. */
  tipo: string
  aprovadoPorNome: string | null
}


export default function FilaDeBaixa({ contas }: { contas: ContaParaBaixa[] }) {
  if (contas.length === 0) {
    return (
      <div className={estilo.vazio}>
        Nada aprovado esperando baixa. O que foi lançado e ainda não passou pela aprovação aparece na
        aba Aprovar.
      </div>
    )
  }

  // As datas chegam como texto ISO, do mesmo jeito que a aba de contas as
  // recebe. Comparar texto ISO com texto ISO funciona e evita construir um
  // `Date` por linha só para saber se venceu.
  const hojeISO = new Date().toISOString()
  const total = contas.reduce((s, c) => s + c.valorCentavos, 0)
  const vencidas = contas.filter((c) => c.vencimento < hojeISO).length

  return (
    <>
      <p className={estilo.texto} style={{ marginBottom: 'var(--s3)' }}>
        {contas.length} conta{contas.length > 1 ? 's' : ''} liberada{contas.length > 1 ? 's' : ''} ·{' '}
        {formatarBRL(total)}
        {vencidas > 0 ? ` · ${vencidas} já venceu${vencidas > 1 ? 'ram' : ''}` : ''}. A baixa é dada
        aqui mesmo, na linha.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s3)' }}>
        {contas.map((c) => {
          const atrasada = c.vencimento < hojeISO
          const palavras = c.tipo === 'PAGAR' ? PALAVRAS.pagar : PALAVRAS.receber
          return (
            <li key={c.id} className={estilo.modeloCartao}>
              <div className={estilo.modeloCartaoTopo}>
                <div>
                  <p className={estilo.modeloCartaoNome}>{c.descricao}</p>
                  <p className={estilo.dica}>
                    {c.tipo === 'PAGAR' ? 'a pagar' : 'a receber'}
                    {c.contraparte ? ` · ${c.contraparte}` : ''}
                    {c.clienteNome ? ` · ${c.clienteNome}` : ''}
                    {c.categoria ? ` · ${c.categoria}` : ''}
                  </p>
                </div>
                <strong>{formatarBRL(c.valorCentavos)}</strong>
              </div>

              <p className={atrasada ? estilo.erro : estilo.dica} style={{ margin: 0 }}>
                {atrasada ? 'venceu em ' : 'vence em '}
                {new Date(c.vencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {c.aprovadoPorNome ? ` · liberada por ${c.aprovadoPorNome}` : ''}
              </p>

              {/* O formulário abre no lugar, sem trocar de tela. `details` faz
                  isso sem JavaScript e sem rota nova — e fechado ele ocupa uma
                  linha, o que importa numa fila que pode ter trinta contas. */}
              <details className={estilo.caixaBaixa}>
                <summary className={estilo.btnPrimario}>{palavras.botaoBaixa}</summary>
                <FormularioBaixa conta={c} palavras={palavras} />
              </details>
            </li>
          )
        })}
      </ul>
    </>
  )
}
