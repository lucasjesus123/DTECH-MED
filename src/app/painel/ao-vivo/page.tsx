import { redirect } from 'next/navigation'

/** O endereço antigo do mapa ao vivo. Virou aba de "Rota". Ver a agenda. */
export default function AoVivoMudouDeLugar() {
  redirect('/painel/rota/ao-vivo')
}
