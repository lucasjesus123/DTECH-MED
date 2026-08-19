import 'dotenv/config'

/**
 * Prova da garantia do serviço.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO AFIRMA
 * ---------------------------------------------------------------------------
 * Três coisas, e cada uma é dinheiro:
 *
 *   1. A garantia começa a correr na ENTREGA e fica gravada na ordem.
 *   2. O equipamento é reconhecido como coberto por QUALQUER serviço anterior
 *      ainda no prazo — a busca é pelo aparelho, não pelo cliente.
 *   3. O sistema RECUSA faturar uma ordem aberta como retorno de garantia, e
 *      volta a aceitar quando alguém tira a marca de propósito.
 *
 * A terceira é a que importa. Na primeira execução ela saiu como "sem ordem em
 * FATURAMENTO para exercitar" — e três aprovações com um silêncio é um
 * relatório que engana. Agora o cenário é ENCENADO pelo motor, com os papéis
 * certos, antes de tentar o que é proibido.
 *
 * Rode depois de: npx tsx prisma/seed.ts --demo && npx tsx scripts/cenario-demo.mts
 */
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { coberturaDoEquipamento, frasedaCobertura } from '../src/server/ordem/garantia'
import { emitirFatura } from '../src/server/financeiro/servico'
import { avancarOrdem } from '../src/server/ordem/motor'

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
const t = await comEscopo(SUPER, (tx) => tx.tenant.findFirstOrThrow({ where: { ativo: true } }))
const ctx: ContextoAcesso = { tenantId: t.id, userId: null, ehSuperAdmin: false }

let ok = 0, nao = 0
const sim = (s: string, d = '') => { console.log(`  \x1b[32m✓\x1b[0m ${s}${d ? `\n      ${d}` : ''}`); ok++ }
const nap = (s: string, d = '') => { console.log(`  \x1b[31m✗\x1b[0m ${s}${d ? `\n      ${d}` : ''}`); nao++ }

// 1. Uma ordem entregue precisa ter ganhado data de garantia.
const entregue = await comEscopo(ctx, (tx) =>
  tx.ordem.findFirst({ where: { garantiaAte: { not: null } }, orderBy: { numero: 'desc' },
    select: { id: true, numero: true, garantiaAte: true, equipamentoId: true } }))
if (!entregue) nap('nenhuma ordem ganhou data de garantia na entrega')
else {
  const dias = Math.round((entregue.garantiaAte!.getTime() - Date.now()) / 86_400_000)
  sim(`a O.S. #${entregue.numero} tem garantia gravada`, `vence em ${dias} dias`)

  // 2. A cobertura é encontrada pelo equipamento.
  const cob = await comEscopo(ctx, (tx) => coberturaDoEquipamento(tx, entregue.equipamentoId))
  if (cob.cobre) sim('o equipamento é reconhecido como coberto', frasedaCobertura(cob) ?? '')
  else nap('o equipamento entregue NÃO foi reconhecido como coberto')

  // 3. Uma ordem marcada em garantia não pode virar fatura sozinha.
  /* Se não houver ordem parada em faturamento, ela é LEVADA até lá pelo motor,
     com os papéis certos. Aceitar o silêncio seria repetir o relatório que
     engana: a trava do dinheiro é justamente a afirmação mais cara aqui. */
  let alvo = await comEscopo(ctx, (tx) =>
    tx.ordem.findFirst({ where: { etapa: 'FATURAMENTO' }, select: { id: true, numero: true } }))
  if (!alvo) {
    const emManut = await comEscopo(ctx, (tx) =>
      tx.ordem.findFirst({ where: { etapa: 'EM_MANUTENCAO' }, select: { id: true, numero: true } }))
    const equipe = await comEscopo(ctx, (tx) => tx.user.findMany({ select: { id: true, nome: true, papel: true } }))
    const de = (p: string) => { const u = equipe.find((x) => x.papel === p)!; return { id: u.id, nome: u.nome, papel: u.papel } }
    if (emManut) {
      await avancarOrdem(ctx, de('TECNICO'), { ordemId: emManut.id, para: 'MANUTENCAO_CONCLUIDA' as never })
      await avancarOrdem(ctx, de('TECNICO'), { ordemId: emManut.id, para: 'APROVACAO_GESTAO' as never })
      const r = await avancarOrdem(ctx, de('GESTOR'), { ordemId: emManut.id, para: 'FATURAMENTO' as never })
      if (r.ok) alvo = emManut
      else nap('não consegui levar uma ordem até FATURAMENTO', r.motivo)
    }
  }
  if (!alvo) nap('a trava da garantia no faturamento NÃO foi exercitada')
  else {
    await comEscopo(ctx, (tx) => tx.ordem.update({ where: { id: alvo.id }, data: { emGarantia: true } }))
    const r = await emitirFatura(ctx, alvo.id)
    if (r.ok) nap('o sistema FATUROU um retorno em garantia')
    else sim('faturar retorno em garantia: recusado', r.motivo.slice(0, 120) + '…')
    // devolve como estava
    await comEscopo(ctx, (tx) => tx.ordem.update({ where: { id: alvo.id }, data: { emGarantia: false } }))
    const r2 = await emitirFatura(ctx, alvo.id)
    if (r2.ok) sim('sem a marca de garantia, a fatura sai normalmente')
    else nap('sem a marca de garantia a fatura ainda foi recusada', r2.motivo)
  }
}

console.log(`\n\x1b[1m${ok} passaram, ${nao} falharam\x1b[0m\n`)
await prisma.$disconnect()
process.exit(nao === 0 ? 0 : 1)
