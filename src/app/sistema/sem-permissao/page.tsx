import Link from 'next/link'
import { exigirSessaoV2 } from '@/server/sistema/guarda'
import { primeiraTelaV2 } from '@/server/sistema/navegacao'
import { EmptyState } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * A RECUSA.
 *
 * =============================================================================
 * ELA NÃO EXPLICA O QUE EXISTE DO OUTRO LADO
 * =============================================================================
 * Nada de "você até poderia, mas não te deram" nem "esta tela é do financeiro".
 * Uma recusa detalhada mapeia o sistema para quem estiver tateando: cada
 * mensagem diferente conta um pedaço da estrutura de permissões.
 *
 * O que ela FAZ é dar um caminho de volta. Uma tela de recusa sem saída deixa a
 * pessoa clicando no "voltar" do navegador — e o "voltar" muitas vezes traz ela
 * de novo para cá, num laço.
 *
 * O destino é calculado a partir do que ela TEM, e não uma home fixa: quem teve
 * o acesso apertado até uma tela só seria mandado exatamente para outro beco.
 */
export default async function SemPermissao() {
  const { sessao } = await exigirSessaoV2()
  const volta = primeiraTelaV2(sessao)

  return (
    <EmptyState
      titulo="Esta tela não é sua"
      bom={false}
      apoio="Seu acesso não alcança esta parte do sistema. Se você precisa dela para trabalhar, quem resolve é o administrador da sua empresa."
      acao={
        <Link href={volta} className={estilo.acao}>
          Voltar ao meu trabalho
        </Link>
      }
    />
  )
}
