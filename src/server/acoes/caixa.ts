'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Papel, type FormaPagamento, type TipoLancamento } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { aCentavos, dividirParcelas, lerValorBR } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { mesAtual, mesValido } from '@/server/consultas/caixa'

/**
 * CONTAS A PAGAR, A RECEBER E RECORRÊNCIAS — pela tela.
 *
 * =============================================================================
 * QUEM PODE O QUÊ, E POR QUÊ
 * =============================================================================
 * LANÇAR e DAR BAIXA é do Financeiro para cima: é o trabalho do dia, e travar
 * isso no gestor faria o financeiro pedir autorização para registrar a conta de
 * luz.
 *
 * APAGAR é da gestão. Uma conta apagada não deixa buraco visível — some do
 * total e some da lista, e ninguém descobre que sumiu. É a única operação aqui
 * que destrói informação, então é a única que sobe de nível.
 *
 * =============================================================================
 * A REGRA QUE ATRAVESSA O ARQUIVO
 * =============================================================================
 * Toda escrita passa por `comEscopo`, que instala o tenant na transação e deixa
 * o RLS aplicar. Um `prisma` cru aqui não daria erro: ele afetaria ZERO linhas
 * e devolveria sucesso, porque `FORCE ROW LEVEL SECURITY` prende o dono da
 * tabela junto. Silêncio é o pior modo de falhar.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

const PODE_LANCAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.FINANCEIRO]
const PODE_APAGAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao) }
}

/**
 * O id da empresa para gravar, ou uma recusa legível.
 *
 * `exigirEmpresa` lança quando o contexto não tem empresa — o caso do Super
 * Admin que abriu o Financeiro sem estar visitando ninguém. Deixar a exceção
 * subir daria tela de erro do Next para o dono da plataforma; aqui vira uma
 * frase que explica o que fazer.
 */
function empresaOuRecusa(ctx: Parameters<typeof exigirEmpresa>[0]) {
  try {
    return { ok: true as const, tenantId: exigirEmpresa(ctx) }
  } catch {
    return {
      ok: false as const,
      motivo: 'Você está fora de uma empresa. Entre numa empresa para mexer no caixa dela.',
    }
  }
}

/** Revalida tudo que mostra dinheiro. O painel do dia também soma caixa. */
function repintar() {
  revalidatePath('/painel/financeiro')
  revalidatePath('/painel')
}

/**
 * O campo de dinheiro, como se digita.
 *
 * `z.coerce.number()` sobre "842,37" dá `NaN`, e o formulário recusava com "o
 * valor precisa ser maior que zero" um número que a pessoa tinha acabado de
 * escrever na tela. Aqui a vírgula é lida antes de qualquer validação.
 */
const valorBR = z
  .string()
  .transform((s) => lerValorBR(s))
  .refine((n): n is number => n !== null && n > 0, {
    message: 'Informe um valor válido, como 1.250,00.',
  })

const FORMAS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'BOLETO',
  'TRANSFERENCIA',
  'CHEQUE',
] as const

/**
 * O dia do vencimento vira instante ao MEIO-DIA de Lajeado.
 *
 * Meia-noite encosta na fronteira da janela do mês e 23:59 encosta na outra.
 * Meio-dia fica no meio do dia em qualquer fuso vizinho, então a conta do dia 1
 * nunca cai no mês anterior por causa de três horas de diferença.
 */
function instanteDoDia(dia: string): Date {
  return new Date(`${dia}T12:00:00-03:00`)
}

/**
 * A mesma data, N meses adiante, sem escorregar de mês.
 *
 * `setMonth(mes + 1)` sobre 31 de janeiro devolve 3 de março, porque fevereiro
 * não tem 31 — e a segunda parcela pularia um mês inteiro. Aqui o dia é preso
 * ao último dia do mês de destino: 31/01 em 3x vence 31/01, 28/02 e 31/03.
 */
function mesesAdiante(base: Date, meses: number): Date {
  const ano = base.getUTCFullYear()
  const mes = base.getUTCMonth() + meses
  const dia = base.getUTCDate()
  const ultimoDoDestino = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  const d = new Date(base)
  d.setUTCFullYear(ano, mes, Math.min(dia, ultimoDoDestino))
  return d
}

// ---------------------------------------------------------------------------
// Lançar
// ---------------------------------------------------------------------------

const schemaConta = z.object({
  tipo: z.enum(['PAGAR', 'RECEBER']),
  descricao: z.string().trim().min(2, 'Escreva do que se trata.').max(140),
  categoria: z.string().trim().max(60).optional().or(z.literal('')),
  clienteId: z.string().trim().optional().or(z.literal('')),
  contraparte: z.string().trim().max(140).optional().or(z.literal('')),
  valor: valorBR,
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de vencimento.'),
  parcelas: z.coerce.number().int().min(1).max(60).default(1),
  observacoes: z.string().trim().max(500).optional().or(z.literal('')),
  /** Para onde voltar depois de salvar — a aba e o mês que estavam abertos. */
  mes: z.string().optional(),
})

/**
 * Lança uma conta. Em N parcelas, lança N linhas.
 *
 * Cada parcela é uma LINHA de verdade, com o vencimento dela. Uma linha só com
 * "parcelas = 3" não consegue estar em três meses ao mesmo tempo, e o caixa de
 * setembro precisa enxergar a segunda parcela sem que toda consulta do sistema
 * aprenda a expandir isso sozinha.
 *
 * `dividirParcelas` garante que a soma bate com o total: 1000,00 em 3x sai
 * 333,33 + 333,33 + 333,34, e não três vezes 333,33 — que perderia um centavo
 * e faria o cliente ficar devendo para sempre.
 */
export async function lancarConta(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não lança contas.' }
  }

  const emp = empresaOuRecusa(a.ctx)
  if (!emp.ok) return emp

  const d = schemaConta.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const base = instanteDoDia(v.vencimento)
  if (Number.isNaN(base.getTime())) return { ok: false, motivo: 'Data de vencimento inválida.' }

  const total = aCentavos(v.valor)
  const fatias = dividirParcelas(total, v.parcelas)
  // O grupo só existe quando há irmãs. Marcar uma parcela única com um grupo
  // faria a tela oferecer "apagar as 1 parcelas", que é uma frase sem sentido.
  const grupo = v.parcelas > 1 ? `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` : null

  await comEscopo(a.ctx, (tx) =>
    tx.lancamento.createMany({
      data: fatias.map((centavos, i) => ({
        tenantId: emp.tenantId,
        tipo: v.tipo as TipoLancamento,
        descricao: v.parcelas > 1 ? `${v.descricao} (${i + 1}/${v.parcelas})` : v.descricao,
        categoria: v.categoria || null,
        clienteId: v.clienteId || null,
        contraparte: v.contraparte || null,
        valorCentavos: centavos,
        vencimento: mesesAdiante(base, i),
        grupo,
        parcela: i + 1,
        parcelas: v.parcelas,
        observacoes: v.observacoes || null,
        autorId: a.sessao.userId,
        autorNome: a.sessao.nome,
      })),
    }),
  )

  await auditar(a.ctx, a.sessao, {
    acao: v.tipo === 'PAGAR' ? 'caixa.conta_a_pagar' : 'caixa.conta_a_receber',
    entidade: 'lancamento',
    entidadeId: grupo ?? v.descricao,
    detalhes: { descricao: v.descricao, totalCentavos: total, parcelas: v.parcelas },
  })

  repintar()
  return {
    ok: true,
    mensagem:
      v.parcelas > 1
        ? `Lançado em ${v.parcelas} parcelas, uma em cada mês.`
        : v.tipo === 'PAGAR'
          ? 'Conta a pagar lançada.'
          : 'Conta a receber lançada.',
  }
}

// ---------------------------------------------------------------------------
// Dar baixa
// ---------------------------------------------------------------------------

const schemaBaixa = z.object({
  id: z.string().min(1),
  /** Vazio = o valor previsto. O caso comum é pagar o que estava previsto. */
  valor: z.string().optional(),
  forma: z.enum(FORMAS).optional().or(z.literal('')),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
})

/**
 * Marca a conta como paga.
 *
 * A DATA é editável e não é `now()` fixo: quem lança o extrato da semana precisa
 * dizer que a conta saiu na terça, senão o relatório de março recebe pagamentos
 * de fevereiro e o mês nunca fecha.
 *
 * O VALOR também: desconto por antecipação, juros por atraso e pagamento a
 * menor são a regra, não a exceção. O previsto fica intacto na linha ao lado —
 * é a diferença entre eles que conta a história.
 */
export async function baixarConta(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não dá baixa em conta.' }
  }

  const d = schemaBaixa.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const conta = await tx.lancamento.findFirst({
      where: { id: v.id },
      select: { id: true, tipo: true, descricao: true, valorCentavos: true, pagoEm: true },
    })
    if (!conta) return { ok: false as const, motivo: 'Conta não encontrada.' }
    if (conta.pagoEm) return { ok: false as const, motivo: 'Esta conta já estava baixada.' }

    // Vazio = pagou o previsto, que é o caso comum. Preenchido, passa pelo
    // mesmo leitor de vírgula do lançamento.
    const bruto = v.valor?.trim() ? lerValorBR(v.valor) : null
    if (v.valor?.trim() && (bruto === null || bruto <= 0)) {
      return { ok: false as const, motivo: 'Informe um valor válido, como 1.250,00.' }
    }
    const pago = bruto === null ? conta.valorCentavos : aCentavos(bruto)

    const quando = v.data ? instanteDoDia(v.data) : new Date()
    if (Number.isNaN(quando.getTime())) {
      return { ok: false as const, motivo: 'Data do pagamento inválida.' }
    }

    await tx.lancamento.update({
      where: { id: conta.id },
      data: {
        pagoEm: quando,
        valorPagoCentavos: pago,
        forma: (v.forma || null) as FormaPagamento | null,
      },
    })
    return { ok: true as const, tipo: conta.tipo, descricao: conta.descricao, pago }
  })

  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'caixa.baixa',
    entidade: 'lancamento',
    entidadeId: v.id,
    detalhes: { descricao: r.descricao, tipo: r.tipo, valorPagoCentavos: r.pago },
  })

  repintar()
  return { ok: true, mensagem: r.tipo === 'PAGAR' ? 'Conta paga.' : 'Recebimento registrado.' }
}

/**
 * Desfaz a baixa.
 *
 * Existe porque errar a linha é o engano mais fácil desta tela: duas contas do
 * mesmo fornecedor, mesmo valor, uma acima da outra. Sem desfazer, o conserto
 * seria apagar e relançar — que perde o histórico e o autor.
 */
export async function desfazerBaixa(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera baixa.' }
  }

  const n = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.lancamento.updateMany({
      where: { id, pagoEm: { not: null } },
      data: { pagoEm: null, valorPagoCentavos: 0, forma: null },
    })
    return r.count
  })
  if (n === 0) return { ok: false, motivo: 'Conta não encontrada ou já estava em aberto.' }

  await auditar(a.ctx, a.sessao, { acao: 'caixa.baixa_desfeita', entidade: 'lancamento', entidadeId: id })
  repintar()
  return { ok: true, mensagem: 'Baixa desfeita. A conta voltou para em aberto.' }
}

/** Apaga a conta. Só a gestão — é a única operação daqui que destrói dado. */
export async function excluirConta(id: string, tudoDoGrupo = false): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_APAGAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só a gestão apaga conta lançada.' }
  }

  const n = await comEscopo(a.ctx, async (tx) => {
    const conta = await tx.lancamento.findFirst({ where: { id }, select: { grupo: true } })
    if (!conta) return 0
    // Apagar "as parcelas seguintes" é o caso real: o contrato foi cancelado no
    // meio. Só as ABERTAS — uma parcela já paga é caixa, e caixa não some.
    if (tudoDoGrupo && conta.grupo) {
      const r = await tx.lancamento.deleteMany({ where: { grupo: conta.grupo, pagoEm: null } })
      return r.count
    }
    const r = await tx.lancamento.deleteMany({ where: { id } })
    return r.count
  })
  if (n === 0) return { ok: false, motivo: 'Conta não encontrada.' }

  await auditar(a.ctx, a.sessao, {
    acao: 'caixa.conta_apagada',
    entidade: 'lancamento',
    entidadeId: id,
    detalhes: { linhas: n, grupo: tudoDoGrupo },
  })
  repintar()
  return { ok: true, mensagem: n === 1 ? 'Conta apagada.' : `${n} parcelas em aberto apagadas.` }
}

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------

const schemaRecorrencia = z.object({
  id: z.string().optional().or(z.literal('')),
  tipo: z.enum(['PAGAR', 'RECEBER']),
  descricao: z.string().trim().min(2, 'Escreva do que se trata.').max(140),
  categoria: z.string().trim().max(60).optional().or(z.literal('')),
  clienteId: z.string().trim().optional().or(z.literal('')),
  contraparte: z.string().trim().max(140).optional().or(z.literal('')),
  valor: valorBR,
  diaVencimento: z.coerce.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
  fim: z.string().optional().or(z.literal('')),
  observacoes: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function salvarRecorrencia(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não cria recorrência.' }
  }

  const emp = empresaOuRecusa(a.ctx)
  if (!emp.ok) return emp

  const d = schemaRecorrencia.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const fim = v.fim ? instanteDoDia(v.fim) : null
  if (fim && Number.isNaN(fim.getTime())) return { ok: false, motivo: 'Data final inválida.' }

  const dados = {
    tipo: v.tipo as TipoLancamento,
    descricao: v.descricao,
    categoria: v.categoria || null,
    clienteId: v.clienteId || null,
    contraparte: v.contraparte || null,
    valorCentavos: aCentavos(v.valor),
    diaVencimento: v.diaVencimento,
    fim,
    observacoes: v.observacoes || null,
  }

  const criada = await comEscopo(a.ctx, async (tx) => {
    if (v.id) {
      const r = await tx.recorrencia.updateMany({ where: { id: v.id }, data: dados })
      return r.count > 0 ? 'editada' : null
    }
    await tx.recorrencia.create({ data: { ...dados, tenantId: emp.tenantId } })
    return 'criada'
  })
  if (!criada) return { ok: false, motivo: 'Recorrência não encontrada.' }

  await auditar(a.ctx, a.sessao, {
    acao: criada === 'criada' ? 'caixa.recorrencia_criada' : 'caixa.recorrencia_editada',
    entidade: 'recorrencia',
    entidadeId: v.id || v.descricao,
    detalhes: { descricao: v.descricao, tipo: v.tipo, valorCentavos: dados.valorCentavos },
  })

  repintar()
  return {
    ok: true,
    mensagem:
      criada === 'criada'
        ? `Recorrência criada. Todo dia ${v.diaVencimento} ela gera a conta do mês.`
        : 'Recorrência atualizada. As contas já geradas continuam como estavam.',
  }
}

/**
 * Liga e desliga a recorrência.
 *
 * Desligar é o certo, apagar quase nunca é: o contrato terminou, mas as contas
 * que ele gerou continuam no caixa e a linha do modelo é o que explica de onde
 * elas vieram.
 */
export async function alternarRecorrencia(id: string, ativo: boolean): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera recorrência.' }
  }

  const n = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.recorrencia.updateMany({ where: { id }, data: { ativo } })
    return r.count
  })
  if (n === 0) return { ok: false, motivo: 'Recorrência não encontrada.' }

  await auditar(a.ctx, a.sessao, {
    acao: ativo ? 'caixa.recorrencia_ligada' : 'caixa.recorrencia_desligada',
    entidade: 'recorrencia',
    entidadeId: id,
  })
  repintar()
  return {
    ok: true,
    mensagem: ativo ? 'Recorrência ligada.' : 'Recorrência desligada. Não gera mais contas.',
  }
}

export async function excluirRecorrencia(id: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_APAGAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Só a gestão apaga recorrência.' }
  }

  const n = await comEscopo(a.ctx, async (tx) => {
    const r = await tx.recorrencia.deleteMany({ where: { id } })
    return r.count
  })
  if (n === 0) return { ok: false, motivo: 'Recorrência não encontrada.' }

  await auditar(a.ctx, a.sessao, { acao: 'caixa.recorrencia_apagada', entidade: 'recorrencia', entidadeId: id })
  repintar()
  return { ok: true, mensagem: 'Recorrência apagada. As contas que ela já gerou continuam no caixa.' }
}

/**
 * Gera as contas do mês a partir das recorrências ativas.
 *
 * =============================================================================
 * POR QUE ISTO É UM BOTÃO E NÃO UMA TAREFA ESCONDIDA
 * =============================================================================
 * Uma rotina noturna que cria contas sozinha é ótima até o dia em que cria a
 * conta errada — e aí ninguém sabe quando, por quê, nem quem olhava. Um botão
 * com o número do que vai acontecer ("4 contas") deixa a decisão com quem
 * responde por ela, e a trilha registra o nome de quem apertou.
 *
 * =============================================================================
 * IDEMPOTÊNCIA
 * =============================================================================
 * `ultimoMesGerado` é gravado na MESMA transação da criação. Apertar duas vezes
 * — que é exatamente o que se faz quando a tela demora — não duplica a conta de
 * luz. Sem isso, o mês teria dois aluguéis e o previsto do caixa dobraria.
 *
 * O dia 31 numa recorrência mensal cai no último dia do mês de destino, nunca no
 * primeiro do seguinte: uma conta que vence dia 31 vence NAQUELE mês.
 */
export async function gerarContasDoMes(mesBruto?: string): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_LANCAR.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não gera as contas do mês.' }
  }

  const emp = empresaOuRecusa(a.ctx)
  if (!emp.ok) return emp

  const mes = mesValido(mesBruto)
  // Gerar mês futuro encheria o caixa de previsão que ninguém pediu; gerar mês
  // passado ressuscitaria conta de um período já fechado com o contador.
  if (mes > mesAtual()) {
    return { ok: false, motivo: 'Só dá para gerar as contas do mês corrente ou de um mês já passado.' }
  }

  const [ano, m] = mes.split('-').map(Number) as [number, number]
  const primeiroDoMes = new Date(`${mes}-01T12:00:00-03:00`)
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()

  const feitas = await comEscopo(a.ctx, async (tx) => {
    const modelos = await tx.recorrencia.findMany({
      where: {
        ativo: true,
        OR: [{ ultimoMesGerado: null }, { ultimoMesGerado: { lt: mes } }],
        inicio: { lt: new Date(Date.UTC(ano, m, 1)) },
        AND: [{ OR: [{ fim: null }, { fim: { gte: primeiroDoMes } }] }],
      },
      take: 300,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        categoria: true,
        clienteId: true,
        contraparte: true,
        valorCentavos: true,
        diaVencimento: true,
        observacoes: true,
      },
    })
    if (modelos.length === 0) return 0

    await tx.lancamento.createMany({
      data: modelos.map((r) => ({
        tenantId: emp.tenantId,
        tipo: r.tipo,
        descricao: r.descricao,
        categoria: r.categoria,
        clienteId: r.clienteId,
        contraparte: r.contraparte,
        valorCentavos: r.valorCentavos,
        vencimento: new Date(
          `${mes}-${String(Math.min(r.diaVencimento, ultimoDia)).padStart(2, '0')}T12:00:00-03:00`,
        ),
        recorrenciaId: r.id,
        observacoes: r.observacoes,
        autorId: a.sessao.userId,
        autorNome: a.sessao.nome,
      })),
    })

    await tx.recorrencia.updateMany({
      where: { id: { in: modelos.map((r) => r.id) } },
      data: { ultimoMesGerado: mes },
    })
    return modelos.length
  })

  if (feitas === 0) {
    return { ok: true, mensagem: 'Nada a gerar: as recorrências deste mês já estão lançadas.' }
  }

  await auditar(a.ctx, a.sessao, {
    acao: 'caixa.recorrencias_geradas',
    entidade: 'recorrencia',
    entidadeId: mes,
    detalhes: { mes, contas: feitas },
  })
  repintar()
  return {
    ok: true,
    mensagem: feitas === 1 ? '1 conta gerada.' : `${feitas} contas geradas para este mês.`,
  }
}
