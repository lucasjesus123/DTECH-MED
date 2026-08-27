import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerSessao } from '@/server/auth/sessao'
import { EMPRESA } from '@/lib/empresa'
import { Credito } from '../credito'
import { Marca } from '../marca'
import { Formulario } from './formulario'
import estilo from '../entrar/entrar.module.css'

export const metadata: Metadata = {
  title: 'Esqueci minha senha',
  robots: { index: false, follow: false },
}

/**
 * A porta de trás do login.
 *
 * Usa a MESMA moldura da tela de entrar — mesma aurora, mesmo cartão, mesma
 * marca. Quem chega aqui está com um problema; a última coisa que ajuda é a
 * sensação de ter caído noutro site.
 */
export default async function Esqueci() {
  // Quem já está dentro não precisa de link nenhum — troca a senha pelo painel,
  // que é o caminho mais curto e ainda pede a senha atual.
  if (await lerSessao()) redirect('/painel/trocar-senha')

  return (
    <main className={estilo.palco}>
      <div className={estilo.aurora} aria-hidden="true">
        <span className={estilo.blobA} />
        <span className={estilo.blobB} />
      </div>

      <div className={estilo.cartao}>
        <div className={estilo.marca}>
          <Marca larguraPx={180} />
        </div>

        <h1 className={estilo.titulo}>Esqueci minha senha</h1>
        <p className={estilo.sub}>
          Informe o e-mail do seu acesso. Mandamos um link de troca para o WhatsApp cadastrado na
          conta.
        </p>

        <Formulario />
      </div>

      <p className={estilo.rodape}>
        {EMPRESA.razaoSocial} · {EMPRESA.endereco.cidade}/{EMPRESA.endereco.uf}
        <br />
        <Credito />
      </p>
    </main>
  )
}
