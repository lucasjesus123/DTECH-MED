import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { colunasDaEmpresa, TODAS_AS_ETAPAS } from '@/server/consultas/quadro'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import Editor from './editor'
import estilo from '../../../painel.module.css'

export const metadata: Metadata = { title: 'Colunas do quadro', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O EDITOR DAS COLUNAS — onde a empresa escreve o próprio processo.
 *
 * =============================================================================
 * POR QUE ELE É DA GESTÃO, E NÃO DE QUEM MOVE O CARTÃO
 * =============================================================================
 * Mover uma O.S. é trabalho do dia, e o piso é o da própria transição — o
 * técnico anda o que é dele. Redesenhar as colunas muda o que a EQUIPE INTEIRA
 * vê: uma coluna apagada por engano faz vinte ordens mudarem de lugar na tela
 * de todo mundo ao mesmo tempo.
 *
 * `exigirPapel` recusa pela requisição, não só escondendo a tela. E a ação do
 * servidor confere de novo — esconder o botão impede o clique, não o pedido.
 *
 * =============================================================================
 * A TELA MOSTRA AS ETAPAS ÓRFÃS, E ISSO É O PRINCIPAL
 * =============================================================================
 * Etapa fora de qualquer coluna deixa ordens só na coluna de resgate. Nada some
 * — mas ninguém arruma o que não vê. Por isso a lista de órfãs vem no topo, com
 * o nome de cada uma, antes das colunas.
 */
export default async function ColunasDoQuadro() {
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR)
  await exigirAba('ordens')
  if (!sessao) notFound()

  const colunas = await colunasDaEmpresa(ctx)

  const usadas = new Set(colunas.flatMap((c) => c.etapas))
  const orfas = TODAS_AS_ETAPAS.filter((e) => !usadas.has(e))

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>O.S. · quadro</p>
          <h1 className={estilo.titulo}>Colunas do quadro</h1>
        </div>
        <Link className={estilo.btnSec} href="/painel/ordens/quadro">
          Voltar ao quadro
        </Link>
      </div>

      <p className={estilo.texto} style={{ maxWidth: '64ch', marginBottom: 'var(--s4)' }}>
        Cada coluna é um pedaço do seu processo. Dê o nome que a casa usa e marque quais etapas da
        esteira ela agrupa. <strong>Mexer aqui não altera nenhuma ordem</strong> — nenhuma etapa
        muda, nenhum evento é gravado. O que muda é como elas se agrupam na tela.
      </p>

      <Editor
        colunas={colunas.map((c) => ({
          id: c.id,
          nome: c.nome,
          cor: c.cor,
          etapas: c.etapas,
        }))}
        etapas={TODAS_AS_ETAPAS.map((e) => ({ chave: e, rotulo: ROTULO_ETAPA[e] ?? e }))}
        orfas={orfas.map((e) => ({ chave: e, rotulo: ROTULO_ETAPA[e] ?? e }))}
      />
    </>
  )
}
