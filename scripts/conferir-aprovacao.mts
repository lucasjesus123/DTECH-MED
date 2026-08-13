import 'dotenv/config'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { verificarIntegridade } from '../src/server/ordem/motor'

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }

async function main() {
  const o = await comEscopo(SUPER, (tx) =>
    tx.ordem.findFirst({
      where: { etapa: 'ORCAMENTO_APROVADO' },
      include: {
        assinaturas: true,
        orcamentos: true,
        eventos: { orderBy: { sequencia: 'desc' }, take: 3 },
        movimentos: { include: { peca: { select: { sku: true } } } },
      },
    }),
  )
  if (!o) return console.log('nenhuma ordem aprovada')

  const ctx: ContextoAcesso = { tenantId: o.tenantId, userId: null, ehSuperAdmin: false }

  console.log(`\nOrdem #${o.numero} — o que a aprovação do cliente disparou:\n`)

  const a = o.assinaturas.find((x) => x.tipo === 'APROVACAO_ORCAMENTO')
  console.log(`  1. Assinatura gravada      ${a ? `sim, por ${a.assinanteNome}` : 'NAO'}`)
  console.log(`     documento conferido     ${a?.assinanteDocumento ? '•••' + a.assinanteDocumento.slice(-4) : '-'}`)
  console.log(`     arquivo do traço        ${a?.hashImagem ? a.hashImagem.slice(0, 12) + '…' : '-'}`)
  console.log(`     conteúdo congelado      ${a?.hashDocumento ? 'sim' : 'nao'}`)

  const orc = o.orcamentos[0]
  console.log(`  2. Orçamento               ${orc?.status}`)

  const ev = o.eventos.find((e) => e.tipo === 'orcamento.aprovado')
  console.log(`  3. Evento na linha do tempo ${ev ? `#${ev.sequencia} por ${ev.autorNome}` : 'NAO'}`)
  console.log(`     autor interno?          ${ev?.autorId === null ? 'não — foi o cliente' : 'SIM (PROBLEMA)'}`)

  const jobs = await comEscopo(ctx, (tx) =>
    tx.outboxJob.findMany({ where: { tenantId: o.tenantId }, select: { tipo: true, payload: true } }),
  )
  const zap = jobs.filter((j) => j.tipo === 'whatsapp.enviar')
  const pdf = jobs.filter((j) => j.tipo === 'pdf.gerar')
  console.log(`  4. Aviso na fila            ${zap.length} mensagens`)
  console.log(`  5. PDF na fila              ${pdf.map((p) => (p.payload as { documento: string }).documento).join(', ')}`)

  const res = o.movimentos.filter((m) => m.tipo === 'RESERVA')
  console.log(`  6. Peças reservadas         ${res.length ? res.map((m) => `${m.peca.sku} x${Number(m.quantidade)}`).join(', ') : 'nenhuma'}`)

  const integridade = await verificarIntegridade(ctx, o.id)
  console.log(`  7. Cadeia de hash           ${integridade.integra ? `íntegra (${integridade.total} eventos)` : 'QUEBRADA'}`)
  console.log()
}
void main().finally(() => prisma.$disconnect())
