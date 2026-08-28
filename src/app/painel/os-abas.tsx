import Link from 'next/link'
import type { Papel } from '@/generated/prisma/enums'
import { telasEfetivas } from '@/server/auth/telas'
import estilo from './painel.module.css'

export type AbaOS = 'ordens' | 'acompanhar' | 'rota'

/**
 * AS TRÊS ABAS DA O.S.
 *
 * =============================================================================
 * POR QUE ABA, E NÃO TRÊS ITENS DE MENU
 * =============================================================================
 * Ordens, Acompanhar e Rota nunca foram assuntos diferentes. São três modos de
 * olhar A MESMA O.S.:
 *
 *     a LISTA delas   →   o ESTÁGIO de cada uma   →   a RUA de hoje
 *      (Ordens)              (Acompanhar)             (Rota)
 *
 * Três linhas no menu obrigavam a pessoa a escolher o MODO antes de escolher o
 * ASSUNTO, que é a ordem trocada: ninguém abre o sistema querendo "ver a aba
 * Acompanhar" — abre querendo saber de uma O.S., e só então decide se quer a
 * lista, o estágio ou a rua.
 *
 * É a mesma regra que já tinha juntado quatro entradas de rota numa só, e as
 * duas do Comercial: o que responde à mesma pergunta vira aba.
 *
 * =============================================================================
 * A BARRA RESPEITA A PERMISSÃO, E NÃO SÓ O DESENHO
 * =============================================================================
 * As três continuam com CHAVE própria no catálogo — `ordens`, `acompanhar` e
 * `rota` — porque é a chave que guarda o que cada pessoa pode ver. Quem marcou
 * só a Rota continua alcançando só a Rota, e a barra abaixo mostra uma aba só.
 *
 * Fundir as três numa chave teria sido mais curto de escrever e teria tirado o
 * acesso de quem já tinha marcado, apontando a marcação para uma chave que
 * deixou de existir.
 */
export default function AbasOS({
  atual,
  papel,
  telas,
}: {
  atual: AbaOS
  papel: Papel
  telas: string[] | null | undefined
}) {
  const alcanca = new Set(telasEfetivas(papel, telas).map((t) => t.chave))

  const abas: Array<[AbaOS, string, string]> = [
    ['ordens', 'Ordens', '/painel/ordens'],
    ['acompanhar', 'Acompanhar', '/painel/acompanhar'],
    ['rota', 'Rota', '/painel/rota'],
  ]
  const visiveis = abas.filter(([chave]) => alcanca.has(chave))

  // Uma aba sozinha não é escolha — é rótulo repetindo o título da tela. Some.
  if (visiveis.length < 2) return null

  return (
    <div className={estilo.rotaBarra}>
      <nav className={estilo.abas} aria-label="Visões da O.S.">
        {visiveis.map(([chave, rotulo, href]) => (
          <Link
            key={chave}
            href={href}
            className={atual === chave ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={atual === chave ? 'page' : undefined}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
    </div>
  )
}
