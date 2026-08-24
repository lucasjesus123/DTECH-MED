'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

/**
 * Claro ou escuro. Só isso.
 *
 * ---------------------------------------------------------------------------
 * POR QUE COOKIE, E NÃO `localStorage`
 * ---------------------------------------------------------------------------
 * A escolha precisa estar disponível no SERVIDOR, no instante em que a página é
 * montada. Guardada no navegador, ela só é conhecida depois que o JavaScript
 * roda — e aí o painel já pintou. O resultado é o clarão branco de um quarto de
 * segundo antes de escurecer, em toda navegação, para todo mundo que escolheu
 * escuro. É o defeito mais comum de tema em aplicação web, e o mais irritante,
 * porque acontece justamente para quem escolheu escuro por causa dos olhos.
 *
 * Com cookie, o HTML já sai com o tema certo. Não há transição para assistir
 * porque não há troca: a primeira pintura já é a definitiva.
 *
 * ---------------------------------------------------------------------------
 * POR QUE DUAS OPÇÕES, E NÃO TRÊS
 * ---------------------------------------------------------------------------
 * Havia um terceiro modo, "Auto", que entregava a decisão ao aparelho. Saiu por
 * decisão do dono: o painel é ferramenta de trabalho, e quem senta nele quer a
 * tela que escolheu, não a tela que o celular resolveu às seis da tarde.
 *
 * A retirada não deixa ninguém preso. Quem já tinha "Auto" gravado no cookie
 * cai no padrão pela conferência de `VALIDOS` logo abaixo — não há migração a
 * rodar, nem sessão a derrubar, e a próxima página já vem clara.
 */

export type Tema = 'claro' | 'escuro'

const NOME = 'dtechmed_tema'
const VALIDOS: readonly Tema[] = ['claro', 'escuro']

/** O tema gravado, ou o padrão. Lido no servidor, antes de pintar. */
export async function lerTema(): Promise<Tema> {
  const c = await cookies()
  const v = c.get(NOME)?.value
  // Comparado com a lista, não convertido. O valor vem de um cookie, ou seja,
  // de algo que qualquer pessoa edita no próprio navegador — e ele vai parar
  // num atributo do HTML.
  // Claro por padrão. A área de trabalho de um sistema de gestão é usada em
  // sala com luz acesa, olhando planilha e número o dia inteiro — e a lateral
  // continua escura de qualquer jeito, então a tela nunca fica lavada.
  return VALIDOS.includes(v as Tema) ? (v as Tema) : 'claro'
}

export async function definirTema(tema: Tema): Promise<void> {
  if (!VALIDOS.includes(tema)) return

  const c = await cookies()
  c.set(NOME, tema, {
    // Um ano: preferência de aparência não é sessão. Quem escolheu claro em
    // março quer claro em novembro.
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    // `httpOnly` de propósito: nada no navegador precisa ler isto, porque quem
    // decide o tema é o servidor ao montar a página. Cookie que o script não
    // precisa ler é cookie que o script não deve poder ler.
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  // O tema é um atributo do HTML do painel inteiro, então a página precisa ser
  // remontada — não é uma classe que o navegador troca sozinho.
  revalidatePath('/painel', 'layout')
}
