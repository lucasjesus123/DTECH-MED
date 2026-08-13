import 'dotenv/config'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
async function main() {
  const o = await comEscopo(SUPER, (tx) =>
    tx.ordem.findFirst({ where: { etapa: 'ORCAMENTO_ENVIADO' }, select: { tokenPublico: true } }),
  )
  process.stdout.write(o?.tokenPublico ?? '')
}
void main().finally(() => prisma.$disconnect())
