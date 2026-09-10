import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { lerSessao } from '@/server/auth/sessao'
import { lerTema } from '@/server/acoes/tema'
import MobileTabBar, { type Aba } from '@/components/sistema/tab-bar'
import { RegistrarSW } from '../app/registrar-sw'
import estilo from '@/components/sistema/pecas.module.css'
import '../sistema/tokens.css'

/**
 * O APP DE CAMPO — a outra superfície.
 *
 * =============================================================================
 * POR QUE ELE NÃO É "O SISTEMA NO CELULAR"
 * =============================================================================
 * O `/sistema` é uma tela de mesa: lateral com catorze itens, listas densas,
 * filtros. Quem trabalha na rua não usa nada disso. Ele tem uma pergunta por
 * vez — "para onde eu vou agora?" — e as mãos ocupadas.
 *
 * Então é outro app: bottom-nav de cinco ícones, um cartão por vez em Modo
 * Foco, botões de 56px, e nenhum menu que precise ser aberto.
 *
 * =============================================================================
 * QUEM ENTRA
 * =============================================================================
 * O motorista, o técnico e — em modo leitura — a gestão. A gestão precisa poder
 * ver o que o motorista vê: sem isso ninguém acima dele consegue conferir se
 * uma parada chegou, nem explicar por telefone o que está na tela dele, nem
 * descobrir que o endereço saiu errado antes de o cliente reclamar.
 *
 * Abrir a tela não abre a ação: quem age na parada continua sendo o motorista
 * dela, porque a máquina de estados confere o dono na hora da assinatura.
 */

export const metadata: Metadata = {
  title: 'Campo · DTECH MED',
  robots: { index: false, follow: false, nocache: true },
  /**
   * UM SEGUNDO MANIFESTO, e não uma edição no primeiro.
   *
   * O manifesto diz ao celular por onde o aplicativo ABRE. O `/manifest.webmanifest`
   * aponta para `/app`, e é dele que dependem os aparelhos onde o app antigo já
   * está instalado — trocar aquele `start_url` mudaria a tela inicial de quem
   * ainda não migrou, sem ninguém ter pedido.
   *
   * Este aponta para `/campo` e traz a cor da casca Azul Máquina. Quem instalar
   * a partir daqui ganha o app novo; quem já tinha o antigo continua com ele até
   * reinstalar.
   */
  manifest: '/manifest-campo.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DTECH MED' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A área do notch é usada de propósito: a bottom-nav encosta na borda de
  // baixo e reserva o `safe-area-inset` no próprio padding.
  viewportFit: 'cover',
  themeColor: '#080D1B',
  // O zoom NÃO é travado: quem tem dificuldade de enxergar precisa poder
  // ampliar, e "evitar o zoom acidental" nunca justificou tirar isso de alguém.
  maximumScale: 5,
}

const ABAS: Aba[] = [
  { href: '/campo', rotulo: 'Tarefas', icone: 'tarefas' },
  { href: '/campo/agenda', rotulo: 'Agenda', icone: 'agenda' },
  { href: '/campo/mapa', rotulo: 'Mapa', icone: 'mapa' },
  { href: '/campo/sos', rotulo: 'SOS', icone: 'sos' },
  { href: '/campo/perfil', rotulo: 'Perfil', icone: 'perfil' },
]

const PODE_ENTRAR: Papel[] = [
  Papel.MOTORISTA,
  Papel.TECNICO,
  // Leitura para quem administra — ver o comentário acima.
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.SUPER_ADMIN,
]

export default async function LayoutCampo({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  if (sessao.trocarSenha) redirect('/painel/trocar-senha')
  // A flag é da empresa, e vale para as duas superfícies: ligar o sistema novo
  // e deixar o app de campo no antigo daria à mesma pessoa dois desenhos
  // diferentes para o mesmo dia de trabalho.
  if (!sessao.uiV2) redirect('/app/motorista')
  if (!PODE_ENTRAR.includes(sessao.papel)) redirect('/sistema')

  const tema = await lerTema()

  return (
    <div data-ui="v2" data-tema={tema}>
      {/* O service worker é o mesmo dos dois aplicativos: ele guarda a casca e a
          página de socorro, com escopo na raiz. Ele NÃO finge que salvou nada —
          assinatura, foto e mudança de etapa só valem confirmadas pelo
          servidor. */}
      <RegistrarSW />
      <main className={estilo.campo}>{children}</main>
      <MobileTabBar abas={ABAS} />
    </div>
  )
}
