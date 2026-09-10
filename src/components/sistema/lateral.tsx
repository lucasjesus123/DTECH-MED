'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icone, type NomeIcone } from './icones'
import estilo from './shell.module.css'

/**
 * A LATERAL — o menu agrupado por intenção.
 *
 * Recebe o menu PRONTO do servidor. Ela nunca vê um item que a pessoa não
 * poderia abrir: quem filtrou foi `menuDaSessao`, no servidor. Esconder no
 * navegador é enfeite, não permissão — e este componente não teria como
 * esconder nada, porque o que não pode ser visto não chega até aqui.
 *
 * Cliente por causa do `usePathname`, e o custo é esse: saber onde se está. Só
 * a lista de rótulos, caminhos e contadores atravessa.
 */

export type ItemLateral = {
  chave: string
  rotulo: string
  href: string
  icone: NomeIcone
  /**
   * Quantos itens esperam ação nesta tela.
   *
   * É o Radar chegando ao menu: a pessoa vê que tem coisa na Conferência sem
   * precisar abrir a Conferência. Zero não vira selo — um contador que mostra
   * "0" ensina a ignorá-lo.
   */
  pendentes?: number
}

export type GrupoLateral = { titulo: string; itens: ItemLateral[] }

export default function Lateral({ grupos }: { grupos: GrupoLateral[] }) {
  const caminho = usePathname()

  return (
    <nav className={estilo.nav} aria-label="Seções do sistema">
      {grupos.map((g) => (
        <div key={g.titulo} className={estilo.grupo}>
          <p className={estilo.grupoTitulo}>{g.titulo}</p>
          {g.itens.map((i) => {
            /**
             * `/sistema` casa com a rota exata; o resto casa com o ramo.
             *
             * Sem a exceção, o "Painel" ficaria marcado em TODA tela, porque
             * todo caminho começa com `/sistema`. Marcar tudo é o mesmo que
             * não marcar nada.
             */
            const ativo =
              i.href === '/sistema'
                ? caminho === '/sistema'
                : caminho === i.href || caminho.startsWith(`${i.href}/`)

            return (
              <Link
                key={i.chave}
                href={i.href}
                className={ativo ? estilo.itemAtivo : estilo.item}
                aria-current={ativo ? 'page' : undefined}
              >
                <span className={estilo.icone} aria-hidden="true">
                  <Icone nome={i.icone} />
                </span>
                {i.rotulo}
                {i.pendentes && i.pendentes > 0 ? (
                  <span className={estilo.contador} aria-label={`${i.pendentes} esperando`}>
                    {i.pendentes > 99 ? '99+' : i.pendentes}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
