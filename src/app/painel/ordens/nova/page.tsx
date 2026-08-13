import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import Formulario from './formulario'
import estilo from '../../painel.module.css'

export const metadata: Metadata = { title: 'Abrir ordem de retirada', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A porta de entrada da esteira.
 *
 * Uma tela só: cliente, equipamento e defeito. No sistema antigo, abrir uma
 * O.S. exigia passar por Pessoas, depois Produtos, depois O.S. — três telas
 * para um telefonema de dois minutos, e por isso muita coisa entrava só no
 * caderno. Aqui o cliente é criado ou reaproveitado pelo CPF/CNPJ na mesma
 * transação da ordem, e o PDF de retirada sai no ato.
 */
export default async function NovaOrdem() {
  await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Central</p>
          <h1 className={estilo.titulo}>Abrir ordem de retirada</h1>
        </div>
      </div>
      <Formulario />
    </>
  )
}
