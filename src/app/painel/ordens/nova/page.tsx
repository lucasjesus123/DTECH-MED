import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { leadPorId } from '@/server/consultas/listas'
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
 *
 * Quando vem de um contato do site, os campos chegam preenchidos com o que a
 * pessoa já escreveu. Redigitar o que o cliente acabou de contar é o tipo de
 * trabalho que faz alguém preferir o caderno.
 */
export default async function NovaOrdem({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>
}) {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE)
  const { lead: leadId } = await searchParams

  // O lead é buscado pelo escopo da empresa: id de outra franquia devolve nulo,
  // e a tela simplesmente abre em branco.
  const lead = leadId ? await leadPorId(ctx, leadId) : null

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{lead ? 'Contato do site' : 'Central'}</p>
          <h1 className={estilo.titulo}>Abrir ordem de retirada</h1>
        </div>
      </div>

      {lead ? (
        <p className={estilo.sucesso} style={{ marginBottom: 'var(--s4)' }}>
          Preenchido com o que {lead.nome} escreveu no site. Confira e complete o
          CPF/CNPJ e o endereço antes de abrir.
        </p>
      ) : null}

      <Formulario
        lead={
          lead
            ? {
                id: lead.id,
                nome: lead.empresa || lead.nome,
                contato: lead.nome,
                telefone: lead.telefone,
                cidade: lead.cidade ?? '',
                equipamento: lead.equipamento ?? '',
                mensagem: lead.mensagem ?? '',
              }
            : null
        }
      />
    </>
  )
}
