import 'dotenv/config'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }

async function main() {
  const ts = await comEscopo(SUPER, (tx) => tx.tenant.findMany({ select: { slug: true, nome: true } }))
  console.log('empresas:', ts)
  const us = await comEscopo(SUPER, (tx) => tx.user.count())
  console.log('usuarios:', us)
}
void main().finally(() => prisma.$disconnect())
