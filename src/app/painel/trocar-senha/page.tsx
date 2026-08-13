import type { Metadata } from 'next'
import { exigirSessao } from '@/server/auth/guarda'
import Formulario from './formulario'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Trocar senha', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function TrocarSenha() {
  const { sessao } = await exigirSessao()

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Sua conta</p>
          <h1 className={estilo.titulo}>Trocar senha</h1>
        </div>
      </div>
      <Formulario nome={sessao.nome} />
    </>
  )
}
