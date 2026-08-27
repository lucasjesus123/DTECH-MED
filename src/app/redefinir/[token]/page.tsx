import type { Metadata } from 'next'
import Link from 'next/link'
import { EMPRESA } from '@/lib/empresa'
import { Credito } from '../../credito'
import { Marca } from '../../marca'
import { Formulario } from './formulario'
import estilo from '../../entrar/entrar.module.css'

export const metadata: Metadata = {
  title: 'Nova senha',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * A tela do link.
 *
 * =============================================================================
 * POR QUE ELA NÃO CONFERE O TOKEN ANTES DE DESENHAR
 * =============================================================================
 * Seria natural checar o link ao abrir e mostrar "link vencido" de cara. Não
 * fazemos, e o motivo é que a checagem GASTA informação: um link válido e um
 * link inventado responderiam telas diferentes, e quem estivesse tateando
 * descobriria a diferença sem nunca digitar uma senha.
 *
 * Aqui o formulário abre sempre. O token só é conferido no momento em que a
 * senha nova chega — e aí a recusa é uma só, igual para link inexistente,
 * vencido e já usado.
 *
 * O custo disso é honesto e pequeno: quem chega com um link velho digita uma
 * senha antes de descobrir. O ganho é que a página deixa de ser um oráculo que
 * responde "este link existe" para qualquer um que a abra.
 */
export default async function Redefinir({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Formato só: 32 bytes em base64url. Não diz se o link vale — diz que o que
  // veio no endereço tem a forma de um link, e não uma frase colada por engano.
  const pareceLink = /^[A-Za-z0-9_-]{20,64}$/.test(token)

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

        <h1 className={estilo.titulo}>Escolha a nova senha</h1>

        {pareceLink ? (
          <>
            <p className={estilo.sub}>
              Use uma senha que você não use em nenhum outro lugar. Ao menos 10 caracteres.
            </p>
            <Formulario token={token} />
          </>
        ) : (
          <>
            <p className={estilo.sub}>
              Este endereço não tem a forma de um link de recuperação. Ele pode ter sido cortado ao
              copiar — links longos quebram em duas linhas nos aplicativos de mensagem.
            </p>
            <div className={estilo.form}>
              <Link href="/esqueci" className={estilo.botao}>
                Pedir um link novo
              </Link>
            </div>
          </>
        )}
      </div>

      <p className={estilo.rodape}>
        {EMPRESA.razaoSocial} · {EMPRESA.endereco.cidade}/{EMPRESA.endereco.uf}
        <br />
        <Credito />
      </p>
    </main>
  )
}
