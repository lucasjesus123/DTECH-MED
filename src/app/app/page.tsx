import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { lerSessao } from '@/server/auth/sessao'

/**
 * Porta de entrada dos apps de campo.
 *
 * Manda cada um para o seu app pelo papel, em vez de mostrar um menu de
 * escolha. Quem está na rua com a caixa na mão não deve gastar um toque
 * dizendo ao sistema quem ele é — o sistema já sabe.
 */
export default async function EntradaApp() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar?destino=/app')
  if (sessao.papel === Papel.MOTORISTA) redirect('/app/motorista')
  if (sessao.papel === Papel.TECNICO) redirect('/app/tecnico')
  // Quem não é de campo tem lugar melhor para trabalhar.
  redirect('/painel')
}
