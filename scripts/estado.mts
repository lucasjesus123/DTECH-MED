import 'dotenv/config'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
async function main() {
  const g = await comEscopo(SUPER, (tx) => tx.ordem.groupBy({ by: ['etapa'], _count: { _all: true } }))
  console.log(g.map((x) => `${x.etapa}: ${x._count._all}`).join('\n'))
  const a = await comEscopo(SUPER, (tx) => tx.assinatura.count({ where: { tipo: 'APROVACAO_ORCAMENTO' } }))
  console.log('assinaturas de aprovação:', a)
}
void main().finally(() => prisma.$disconnect())
