import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerSessao } from '@/server/auth/sessao'
import { Formulario } from './formulario'
import estilo from './entrar.module.css'

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}) {
  // Quem já está dentro não precisa ver a porta de novo.
  if (await lerSessao()) redirect('/painel')
  const { destino } = await searchParams

  return (
    <main className={estilo.palco}>
      <div className={estilo.aurora} aria-hidden="true">
        <span className={estilo.blobA} />
        <span className={estilo.blobB} />
      </div>

      <div className={estilo.cartao}>
        <div className={estilo.marca}>
          <span className={estilo.marcaD}>D</span>
          <span className={estilo.marcaTxt}>
            TECH<b>MED</b>
          </span>
        </div>

        <h1 className={estilo.titulo}>Entrar no sistema</h1>
        <p className={estilo.sub}>Use o acesso que o responsável pela sua empresa criou.</p>

        <Formulario destino={destino} />
      </div>

      <p className={estilo.rodape}>
        DTECHMED Assistência Especializada LTDA · Lajeado/RS
      </p>
    </main>
  )
}
