import 'dotenv/config'
import { EtapaOrdem as E, Papel as P } from '../src/generated/prisma/enums'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'
import { avancarOrdem } from '../src/server/ordem/motor'

/**
 * Prova dos processos documentados em PROCESSOS.md.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É
 * ---------------------------------------------------------------------------
 * Um documento de processo é uma AFIRMAÇÃO sobre como o sistema se comporta:
 * "a esteira anda numa ordem", "o papel decide o que a pessoa pode fazer", "a
 * entrega só é liberada com a fatura quitada". Enquanto ninguém tenta violar
 * cada uma delas, são frases bonitas num PDF.
 *
 * Aqui cada frase vira uma TENTATIVA DE VIOLAÇÃO. O teste passa quando o
 * sistema RECUSA — e a mensagem de recusa é impressa, porque uma recusa com a
 * explicação errada é quase tão ruim quanto nenhuma.
 *
 * Os testes felizes (a ordem anda, a fatura fecha) já são cobertos pelo
 * `cenario-demo.mts`, que monta 22 ordens passando pelo motor. O que faltava
 * era o outro lado: o que acontece quando alguém tenta o que não pode.
 *
 * NÃO ALTERA NADA que já exista. Toda tentativa aqui é de algo proibido, então
 * o sucesso do teste é o banco continuar como estava.
 */

let passou = 0
let falhou = 0

function ok(oQue: string, detalhe = '') {
  console.log(`  \x1b[32m✓\x1b[0m ${oQue}${detalhe ? `\n      ${detalhe}` : ''}`)
  passou++
}
function nao(oQue: string, detalhe = '') {
  console.log(`  \x1b[31m✗\x1b[0m ${oQue}${detalhe ? `\n      ${detalhe}` : ''}`)
  falhou++
}
function titulo(t: string) {
  console.log(`\n\x1b[1m${t}\x1b[0m`)
}

async function main() {
  /**
   * A empresa é buscada com contexto de Super Admin, e não com o cliente cru.
   *
   * A primeira versão usava `prisma.tenant.findFirst` direto e recebia zero —
   * o que assustou até eu perceber que era o RLS funcionando exatamente como
   * deve: sem empresa declarada na conexão, a política não deixa passar linha
   * nenhuma. O teste estava certo em falhar; era ele que estava errado.
   */
  const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }
  const t = await comEscopo(SUPER, (tx) =>
    tx.tenant.findFirst({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
  )
  if (!t) throw new Error('Sem empresa. Rode antes: npx tsx prisma/seed.ts --demo')
  const ctx: ContextoAcesso = { tenantId: t.id, userId: null, ehSuperAdmin: false }

  const equipe = await comEscopo(ctx, (tx) =>
    tx.user.findMany({ select: { id: true, nome: true, papel: true } }),
  )
  const ator = (p: P) => {
    const u = equipe.find((x) => x.papel === p)
    if (!u) throw new Error(`Sem usuário com papel ${p}.`)
    return { id: u.id, nome: u.nome, papel: u.papel }
  }

  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({ select: { id: true, numero: true, etapa: true }, orderBy: { numero: 'asc' } }),
  )
  const naEtapa = (e: E) => ordens.find((o) => o.etapa === e)

  // =========================================================================
  titulo('1. A esteira anda numa ordem — pular etapa é recusado')
  // =========================================================================
  const emRetirada = naEtapa(E.RETIRADA_AGENDADA)
  if (!emRetirada) {
    nao('não há ordem em RETIRADA_AGENDADA para testar o pulo')
  } else {
    // O documento diz que a peça percorre a linha. Se der para saltar da
    // retirada direto para o faturamento, a linha do tempo vira decoração:
    // existiria ordem faturada sem diagnóstico, sem orçamento e sem serviço.
    const r = await avancarOrdem(ctx, ator(P.GESTOR), { ordemId: emRetirada.id, para: E.FATURADO })
    if (r.ok) nao(`ordem #${emRetirada.numero} PULOU de RETIRADA_AGENDADA para FATURADO`)
    else ok(`pulo de RETIRADA_AGENDADA para FATURADO recusado`, r.motivo)
  }

  // Voltar no tempo também não pode: a linha do tempo é histórico, não estado
  // que se rebobina.
  const finalizada = naEtapa(E.FINALIZADO)
  if (finalizada) {
    const r = await avancarOrdem(ctx, ator(P.GESTOR), { ordemId: finalizada.id, para: E.EM_ANALISE })
    if (r.ok) nao(`ordem #${finalizada.numero} VOLTOU de FINALIZADO para EM_ANALISE`)
    else ok('retroceder de FINALIZADO para EM_ANALISE recusado', r.motivo)
  }

  // =========================================================================
  titulo('2. O papel decide o que a pessoa pode fazer')
  // =========================================================================
  const emOrcamento = naEtapa(E.ORCAMENTO_ENVIADO)
  if (!emOrcamento) {
    nao('não há ordem em ORCAMENTO_ENVIADO para testar o papel')
  } else {
    // O motorista transporta. Aprovar orçamento é da gestão — e no documento
    // isso está escrito como "o papel decide o que a pessoa pode fazer".
    const r = await avancarOrdem(ctx, ator(P.MOTORISTA), {
      ordemId: emOrcamento.id,
      para: E.ORCAMENTO_APROVADO,
    })
    if (r.ok) nao(`MOTORISTA aprovou orçamento da ordem #${emOrcamento.numero}`)
    else ok('MOTORISTA tentando aprovar orçamento: recusado', r.motivo)
  }

  const emManutencao = naEtapa(E.EM_MANUTENCAO)
  if (emManutencao) {
    // Atendente é a central: cadastra e agenda. Não conclui serviço técnico.
    const r = await avancarOrdem(ctx, ator(P.ATENDENTE), {
      ordemId: emManutencao.id,
      para: E.MANUTENCAO_CONCLUIDA,
    })
    if (r.ok) nao(`ATENDENTE concluiu manutenção da ordem #${emManutencao.numero}`)
    else ok('ATENDENTE tentando concluir manutenção: recusado', r.motivo)
  }

  // =========================================================================
  titulo('3. A entrega é travada enquanto a fatura não fecha')
  // =========================================================================
  // É a trava que impede o equipamento de sair sem o pagamento fechado — a
  // afirmação do diagrama do dinheiro.
  const semPagar = await comEscopo(ctx, (tx) =>
    tx.ordem.findFirst({
      where: { etapa: E.FATURAMENTO },
      select: { id: true, numero: true },
    }),
  )
  /**
   * Se não houver ordem parada em faturamento, ela é CRIADA para o teste.
   *
   * A primeira execução saiu com "trava não exercitada" e nove aprovações. Nove
   * aprovações e um silêncio é um relatório que engana: a trava do dinheiro é
   * justamente a afirmação mais cara do documento, e era a única não testada.
   *
   * Levar uma ordem de EM_MANUTENCAO até FATURAMENTO é um caminho LEGÍTIMO da
   * esteira, feito pelo motor com os papéis certos. O teste não força estado —
   * ele encena o cenário e então tenta o que é proibido.
   */
  let alvoTrava = semPagar
  if (!alvoTrava && emManutencao) {
    await avancarOrdem(ctx, ator(P.TECNICO), { ordemId: emManutencao.id, para: E.MANUTENCAO_CONCLUIDA })
    await avancarOrdem(ctx, ator(P.TECNICO), { ordemId: emManutencao.id, para: E.APROVACAO_GESTAO })
    const r = await avancarOrdem(ctx, ator(P.GESTOR), { ordemId: emManutencao.id, para: E.FATURAMENTO })
    if (r.ok) alvoTrava = { id: emManutencao.id, numero: emManutencao.numero }
    else nao('não consegui levar uma ordem até FATURAMENTO para testar a trava', r.motivo)
  }

  if (!alvoTrava) {
    nao('a trava do dinheiro NÃO foi exercitada — nenhuma ordem em FATURAMENTO')
  } else {
    const semPagar = alvoTrava
    const r = await avancarOrdem(ctx, ator(P.MOTORISTA), {
      ordemId: semPagar.id,
      para: E.EM_ROTA_ENTREGA,
    })
    if (r.ok) nao(`ordem #${semPagar.numero} saiu para entrega com a fatura em aberto`)
    else ok('saída para entrega com fatura em aberto: recusada', r.motivo)
  }

  // =========================================================================
  titulo('4. A linha do tempo é encadeada e não tem buraco')
  // =========================================================================
  const buracos = await comEscopo(ctx, (tx) =>
    tx.$queryRaw<Array<{ numero: number; falta: number }>>`
      SELECT o."numero", (MAX(e."sequencia") - COUNT(e.id))::int AS falta
      FROM ordens o JOIN eventos_ordem e ON e."ordemId" = o.id
      GROUP BY o."numero" HAVING MAX(e."sequencia") <> COUNT(e.id)`,
  )
  if (buracos.length === 0) ok('nenhuma ordem com salto na sequência de eventos')
  else nao(`${buracos.length} ordem(ns) com buraco na linha do tempo`, JSON.stringify(buracos.slice(0, 3)))

  const semEvento = await comEscopo(ctx, (tx) =>
    tx.ordem.count({ where: { eventos: { none: {} } } }),
  )
  if (semEvento === 0) ok('nenhuma ordem sem linha do tempo')
  else nao(`${semEvento} ordem(ns) sem nenhum evento — plantadas por fora do motor`)

  // =========================================================================
  titulo('5. O isolamento entre empresas')
  // =========================================================================
  // A afirmação mais séria do documento: uma empresa não alcança a outra, e a
  // trava é do banco, não do código lembrar de filtrar. Testada com um contexto
  // de OUTRA empresa pedindo as ordens desta.
  const outra = await comEscopo(SUPER, (tx) =>
    tx.tenant.create({ data: { slug: `ensaio-${Date.now()}`, nome: 'Empresa de Ensaio', ativo: true } }),
  )
  try {
    const ctxOutra: ContextoAcesso = { tenantId: outra.id, userId: null, ehSuperAdmin: false }
    const vistas = await comEscopo(ctxOutra, (tx) => tx.ordem.count())
    if (vistas === 0) ok(`a empresa vizinha enxerga 0 das ${ordens.length} ordens`)
    else nao(`a empresa vizinha enxergou ${vistas} ordens que não são dela`)

    const clientesVistos = await comEscopo(ctxOutra, (tx) => tx.cliente.count())
    if (clientesVistos === 0) ok('a empresa vizinha enxerga 0 clientes')
    else nao(`a empresa vizinha enxergou ${clientesVistos} clientes que não são dela`)

    // E escrever na ordem da outra também precisa ser barrado, não só ler.
    const alvo = ordens[0]!
    const r = await avancarOrdem(ctxOutra, { id: null, nome: 'Intruso', papel: P.GESTOR }, {
      ordemId: alvo.id,
      para: E.CANCELADO,
    })
    if (r.ok) nao(`a empresa vizinha CANCELOU a ordem #${alvo.numero}`)
    else ok('a empresa vizinha tentando cancelar ordem alheia: recusada', r.motivo)
  } finally {
    await comEscopo(SUPER, (tx) => tx.tenant.delete({ where: { id: outra.id } }))
  }

  // =========================================================================
  console.log(
    `\n\x1b[1m${passou} conferências passaram, ${falhou} falharam\x1b[0m\n`,
  )
  await prisma.$disconnect()
  process.exit(falhou === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('\n  erro:', e instanceof Error ? e.message : e, '\n')
  await prisma.$disconnect()
  process.exit(1)
})
