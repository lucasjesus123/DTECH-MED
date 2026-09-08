import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { lerSessao } from '@/server/auth/sessao'
import { Formulario } from './formulario'
import estilo from './entrar.module.css'
import { EMPRESA } from '@/lib/empresa'
import { Credito } from '../credito'
import { Marca } from '../marca'
import { RegistrarSW } from '../app/registrar-sw'

/**
 * Só destino INTERNO. É a mesma regra da ação de entrar: sem ela,
 * `?destino=https://site-falso` faria esta página redirecionar para fora com a
 * aparência do sistema.
 */
function destinoSeguro(d: string | undefined): string | null {
  return d && d.startsWith('/') && !d.startsWith('//') ? d : null
}

/** Quem está a caminho do aplicativo de campo. */
const paraOApp = (d: string | null) => d === '/app' || (d?.startsWith('/app/') ?? false)

/**
 * O MANIFESTO PRECISA ESTAR AQUI, e a falta dele era o motivo de o aplicativo
 * não se instalar.
 *
 * O caminho de quem instala é sempre este: a pessoa recebe o endereço, abre
 * `dtechmed.com.br/app` no celular — e cai aqui, porque ainda não tem sessão. E
 * era aqui que o navegador perdia o rastro: sem `manifest` e sem
 * `apple-mobile-web-app-capable` nesta página, o Chrome não oferece instalar, e
 * o "Adicionar à Tela de Início" do iPhone cria um atalho comum do Safari, com
 * barra de endereço e tudo — que é justamente o contrário do que a pessoa quis.
 *
 * Só quando o destino é o aplicativo. A porta do PAINEL continua sendo uma
 * página comum: instalar o painel num celular não é o que ninguém veio fazer, e
 * um convite de instalação na tela de login de quem trabalha no computador é
 * ruído todo dia.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}): Promise<Metadata> {
  const { destino } = await searchParams
  const base: Metadata = { title: 'Entrar', robots: { index: false, follow: false } }
  if (!paraOApp(destinoSeguro(destino))) return base
  return {
    ...base,
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DTECH MED' },
  }
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}) {
  const { destino } = await searchParams
  const alvo = destinoSeguro(destino)

  /**
   * Quem já está dentro não precisa ver a porta de novo — e vai para ONDE
   * QUERIA IR.
   *
   * Antes caía sempre em `/painel`, ignorando o destino. Para o motorista com a
   * sessão viva isso era um beco: ele tocava no ícone do aplicativo e chegava
   * no painel do escritório, onde o perfil dele quase não vê tela nenhuma.
   */
  if (await lerSessao()) redirect(alvo ?? '/painel')

  return (
    <main className={estilo.palco}>
      {/* O service worker é a outra metade da instalação: o Chrome só oferece
          instalar quando existe um registrado para o escopo da página. Quem
          nunca passou daqui nunca chegava a registrá-lo. Fora do caminho do
          aplicativo ele não é ligado — o painel não precisa de socorro
          offline. */}
      {paraOApp(alvo) ? <RegistrarSW /> : null}

      <div className={estilo.aurora} aria-hidden="true">
        <span className={estilo.blobA} />
        <span className={estilo.blobB} />
      </div>

      <div className={estilo.cartao}>
        <div className={estilo.marca}>
          <Marca larguraPx={180} />
        </div>

        <h1 className={estilo.titulo}>Entrar no sistema</h1>
        <p className={estilo.sub}>Use o acesso que o responsável pela sua empresa criou.</p>

        <Formulario destino={destino} />
      </div>

      <p className={estilo.rodape}>
        {EMPRESA.razaoSocial} · {EMPRESA.endereco.cidade}/{EMPRESA.endereco.uf}
        <br />
        <Credito />
      </p>
    </main>
  )
}
