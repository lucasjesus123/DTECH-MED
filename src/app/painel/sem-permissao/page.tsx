import Link from 'next/link'
import type { Metadata } from 'next'
import { exigirSessao } from '@/server/auth/guarda'
import { primeiraTela } from '@/server/auth/telas'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Sem permissão', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A tela de recusa.
 *
 * Ela diz o que aconteceu e para quem pedir, sem dramatizar. Bater numa parede
 * é frustrante; bater numa parede que não explica nada faz a pessoa achar que o
 * sistema quebrou — e o próximo passo dela é ligar para o suporte reclamando de
 * um defeito que não existe.
 */
export default async function SemPermissao() {
  const { sessao } = await exigirSessao()

  /**
   * O BOTÃO DE VOLTA APONTA PARA A CASA DE QUEM CHEGOU AQUI.
   *
   * Era fixo em `/painel`, "Voltar ao painel do dia". Para um motorista isso é
   * um segundo beco: ele bate na recusa, clica no único botão da tela, e volta
   * para uma porta que também não é dele. Para quem tem o acesso apertado em
   * uma aba só, o mesmo — o painel do dia não é dele tampouco.
   */
  const casa = primeiraTela(sessao.papel, sessao.telas)
  const noApp = casa.startsWith('/app')

  return (
    <div style={{ maxWidth: 560 }}>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Acesso</p>
          <h1 className={estilo.titulo}>Esta parte não é do seu perfil</h1>
        </div>
      </div>

      <div className={estilo.bloco}>
        <p className={estilo.texto}>
          Você está no sistema como <strong>{sessao.nome}</strong>, com perfil de{' '}
          <strong>{sessao.papel.toLowerCase().replace('_', ' ')}</strong>. Essa
          tela é reservada a outro perfil.
        </p>
        <p className={estilo.texto} style={{ marginTop: 'var(--s3)' }}>
          Se você precisa desse acesso para trabalhar, fale com o administrador da
          sua empresa — a mudança leva menos de um minuto.
        </p>
        <div className={estilo.passos}>
          <Link href={casa} className={estilo.btn}>
            {noApp ? 'Ir para o meu aplicativo' : 'Voltar para onde eu trabalho'}
          </Link>
        </div>
      </div>
    </div>
  )
}
