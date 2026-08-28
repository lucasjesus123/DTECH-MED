import { redirect } from 'next/navigation'

/**
 * O endereço antigo da agenda.
 *
 * A tela virou uma ABA de "Rota", junto do mapa ao vivo — eram duas entradas de
 * menu para a mesma pergunta. Mas endereço que já existiu não pode morrer: está
 * no favorito de alguém, no histórico do navegador, e possivelmente colado numa
 * conversa. Um 404 aqui seria a pessoa concluindo que a agenda sumiu do sistema.
 *
 * `redirect` permanente: o navegador aprende o caminho novo e para de passar
 * por aqui.
 */
export default function AgendaMudouDeLugar() {
  redirect('/painel/rota')
}
