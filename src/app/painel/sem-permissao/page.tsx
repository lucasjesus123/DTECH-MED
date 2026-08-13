import Link from 'next/link'
import type { Metadata } from 'next'
import { exigirSessao } from '@/server/auth/guarda'
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
          <Link href="/painel" className={estilo.btn}>
            Voltar ao painel do dia
          </Link>
        </div>
      </div>
    </div>
  )
}
