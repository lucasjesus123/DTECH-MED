import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, lerSessao, type Sessao } from '@/server/auth/sessao'
import type { ContextoAcesso } from '@/lib/db'
import { casaDoPapelV2, podeVer, telaPorChave } from './navegacao'

/**
 * A GUARDA DE CADA TELA DO SISTEMA NOVO.
 *
 * =============================================================================
 * ELA FICA NA PÁGINA, E NÃO SÓ NO MENU
 * =============================================================================
 * O menu decide o que é OFERECIDO. Esta função decide o que é ABERTO — e são
 * coisas diferentes, porque o endereço pode ser digitado, colado de um
 * WhatsApp ou guardado nos favoritos de alguém que trocou de papel ontem.
 *
 * Sem ela, esconder o item do menu seria enfeite. Com ela, o menu vira o que
 * ele deve ser: conforto visual, não segurança.
 *
 * As duas leem o MESMO `podeVer`. É por isso que não existe o defeito clássico
 * de sistema com permissão — o menu que oferece uma tela que a tela recusa.
 *
 * =============================================================================
 * PARA ONDE VAI QUEM É BARRADO
 * =============================================================================
 * Quem trabalha no aplicativo de campo volta para o aplicativo, e não para um
 * muro: o motorista que caiu numa tela de mesa não estava tateando o sistema,
 * estava perdido. Para os demais, a tela de recusa — que não explica o que
 * existe do outro lado, porque explicar mapearia o sistema para quem estivesse
 * tentando a sorte.
 */

export type AutenticadoV2 = { sessao: Sessao; ctx: ContextoAcesso }

/** Só a sessão, já com o contexto de empresa montado. */
export async function exigirSessaoV2(): Promise<AutenticadoV2> {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  return { sessao, ctx: contextoDe(sessao) }
}

/** A sessão E o direito a esta tela. É esta que as páginas chamam. */
export async function exigirTela(chave: string): Promise<AutenticadoV2> {
  const a = await exigirSessaoV2()
  const tela = telaPorChave(chave)

  // Chave que não existe é erro de programação, não de permissão — e recusar em
  // silêncio esconderia o erro atrás de uma tela plausível.
  if (!tela) throw new Error(`Tela desconhecida no sistema novo: ${chave}`)

  if (podeVer(a.sessao, tela)) return a

  if (a.sessao.papel === Papel.MOTORISTA) redirect(casaDoPapelV2(a.sessao.papel))
  redirect('/sistema/sem-permissao')
}
