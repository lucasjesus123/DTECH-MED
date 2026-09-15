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
 *
 * ---------------------------------------------------------------------------
 * POR QUE DOIS ESCOPOS, COM PADRÕES DIFERENTES
 * ---------------------------------------------------------------------------
 * O painel e os aplicativos de campo são lugares diferentes, e a resposta certa
 * para cada um é diferente:
 *
 *   PAINEL   mesa, sala com luz acesa, planilha e número o dia inteiro. Claro.
 *   CAMPO    rua, celular na mão, e às vezes sol batendo na tela. Hoje é
 *            escuro, e é assim que quem usa está acostumado.
 *
 * Um cookie só faria a escolha de um vazar para o outro — e, pior, mudaria o
 * aplicativo de todo motorista da noite para o dia, porque o padrão do painel é
 * claro. Ninguém pediu isso. Cada lugar guarda a sua, e o padrão de cada um é o
 * que já valia antes desta linha existir.
 *
 * O que NÃO foi feito: um segundo módulo. Duplicar cookie, validação e
 * revalidação criaria dois lugares que precisam lembrar da mesma coisa — e dois
 * lugares assim é ter um que vai esquecer.
 */

export type Tema = 'claro' | 'escuro'

/** Onde a preferência vale. O padrão é o painel, para quem já chamava sem dizer. */
export type Onde = 'painel' | 'campo'

const NOME: Record<Onde, string> = {
  painel: 'dtechmed_tema',
  campo: 'dtechmed_tema_campo',
}

/** O padrão de cada lugar é o que ele já fazia antes de haver escolha. */
const PADRAO: Record<Onde, Tema> = { painel: 'claro', campo: 'escuro' }

/** O que precisa ser remontado quando a escolha muda. */
const CAMINHO: Record<Onde, string> = { painel: '/painel', campo: '/app' }

const VALIDOS: readonly Tema[] = ['claro', 'escuro']

/** O tema gravado, ou o padrão. Lido no servidor, antes de pintar. */
export async function lerTema(onde: Onde = 'painel'): Promise<Tema> {
  const c = await cookies()
  const v = c.get(NOME[onde])?.value
  // Comparado com a lista, não convertido. O valor vem de um cookie, ou seja,
  // de algo que qualquer pessoa edita no próprio navegador — e ele vai parar
  // num atributo do HTML.
  return VALIDOS.includes(v as Tema) ? (v as Tema) : PADRAO[onde]
}

export async function definirTema(tema: Tema, onde: Onde = 'painel'): Promise<void> {
  if (!VALIDOS.includes(tema)) return

  const c = await cookies()
  c.set(NOME[onde], tema, {
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

  // O tema é um atributo do HTML daquele lugar inteiro, então a página precisa
  // ser remontada — não é uma classe que o navegador troca sozinho.
  revalidatePath(CAMINHO[onde], 'layout')
}
