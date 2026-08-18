import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, prisma, type ContextoAcesso, exigirEmpresa } from '@/lib/db'
import { janelaDoDia } from '@/lib/datas'

/**
 * Consultas de listagem do painel.
 *
 * Duas regras valem para todas elas:
 *
 *  • **Busca por texto vem sempre como parâmetro**, nunca concatenada na SQL.
 *    Um cliente chamado "O'Brien" não pode derrubar a consulta, e muito menos
 *    um campo de busca pode virar porta de entrada.
 *  • **Nada de `findMany` sem `take`.** Uma franquia com dez mil ordens não
 *    pode transformar a abertura de uma tela em varredura de tabela.
 *
 * O escopo de empresa não aparece explicitamente na maioria das consultas
 * porque `comEscopo` já o instala na transação e o RLS o aplica. Onde há SQL
 * crua, o `tenantId` também vai no WHERE — cinto e suspensório, de propósito:
 * a regra de negócio não pode depender de uma camada só.
 */

const LIMITE = 60

// ---------------------------------------------------------------------------
// Ordens
// ---------------------------------------------------------------------------

export type FiltroOrdens = {
  busca?: string
  etapa?: string
  tecnicoId?: string
  /** 'abertas' (padrão), 'atrasadas', 'todas', 'encerradas' */
  situacao?: string
}

const ENCERRADAS: EtapaOrdem[] = [
  EtapaOrdem.FINALIZADO,
  EtapaOrdem.CANCELADO,
  EtapaOrdem.DEVOLVIDO_SEM_REPARO,
]

export async function listarOrdens(ctx: ContextoAcesso, f: FiltroOrdens) {
  const busca = f.busca?.trim() ?? ''
  const soDigitos = busca.replace(/\D/g, '')

  const where: Record<string, unknown> = {}

  if (f.etapa && f.etapa in EtapaOrdem) {
    where.etapa = f.etapa as EtapaOrdem
  } else if (f.situacao === 'encerradas') {
    where.etapa = { in: ENCERRADAS }
  } else if (f.situacao !== 'todas') {
    where.etapa = { notIn: ENCERRADAS }
  }

  if (f.situacao === 'atrasadas') where.prazoPrometido = { lt: new Date() }
  if (f.tecnicoId) where.tecnicoId = f.tecnicoId

  if (busca) {
    where.OR = [
      // Número da O.S. é o que o cliente cita no telefone — precisa ser a
      // primeira coisa que a busca encontra.
      ...(soDigitos ? [{ numero: Number(soDigitos) }] : []),
      { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
      // Documento só entra quando a busca tem dígitos. Antes havia aqui um
      // valor de reserva que, por acidente, era um byte NUL — e o Postgres
      // recusa NUL em texto, derrubando toda busca com letras.
      ...(soDigitos ? [{ cliente: { documento: { contains: soDigitos } } }] : []),
      { equipamento: { marca: { contains: busca, mode: 'insensitive' } } },
      { equipamento: { modelo: { contains: busca, mode: 'insensitive' } } },
      { equipamento: { numeroSerie: { contains: busca, mode: 'insensitive' } } },
    ]
  }

  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where,
      orderBy: { atualizadoEm: 'desc' },
      take: LIMITE,
      select: {
        id: true,
        numero: true,
        etapa: true,
        prioridade: true,
        atualizadoEm: true,
        prazoPrometido: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
        tecnico: { select: { nome: true } },
        fatura: { select: { status: true, valorTotalCentavos: true } },
      },
    }),
  )

  const agora = Date.now()
  return ordens.map((o) => ({
    ...o,
    diasParado: Math.floor((agora - o.atualizadoEm.getTime()) / 86_400_000),
    atrasada: o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false,
  }))
}

/** Técnicos ativos da empresa — alimenta o filtro e a atribuição de ordem. */
export async function tecnicosDaEmpresa(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.user.findMany({
      where: { papel: Papel.TECNICO, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  )
}

export async function motoristasDaEmpresa(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.user.findMany({
      where: { papel: Papel.MOTORISTA, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  )
}

// ---------------------------------------------------------------------------
// Clientes e equipamentos
// ---------------------------------------------------------------------------

export async function listarClientes(ctx: ContextoAcesso, busca?: string) {
  const b = busca?.trim() ?? ''
  const digitos = b.replace(/\D/g, '')

  return comEscopo(ctx, (tx) =>
    tx.cliente.findMany({
      where: b
        ? {
            OR: [
              { nome: { contains: b, mode: 'insensitive' } },
              { razaoSocial: { contains: b, mode: 'insensitive' } },
              { cidade: { contains: b, mode: 'insensitive' } },
              ...(digitos ? [{ documento: { contains: digitos } }] : []),
            ],
          }
        : {},
      orderBy: { nome: 'asc' },
      take: LIMITE,
      select: {
        id: true,
        nome: true,
        tipo: true,
        documento: true,
        whatsapp: true,
        cidade: true,
        uf: true,
        contatoNome: true,
        _count: { select: { ordens: true, equipamentos: true } },
      },
    }),
  )
}

export async function listarEquipamentos(ctx: ContextoAcesso, busca?: string) {
  const b = busca?.trim() ?? ''

  return comEscopo(ctx, (tx) =>
    tx.equipamento.findMany({
      where: b
        ? {
            OR: [
              { marca: { contains: b, mode: 'insensitive' } },
              { modelo: { contains: b, mode: 'insensitive' } },
              { numeroSerie: { contains: b, mode: 'insensitive' } },
              { categoria: { contains: b, mode: 'insensitive' } },
              { cliente: { nome: { contains: b, mode: 'insensitive' } } },
            ],
          }
        : {},
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
      take: LIMITE,
      select: {
        id: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        categoria: true,
        acessorios: true,
        cliente: { select: { id: true, nome: true } },
        ordens: {
          orderBy: { abertaEm: 'desc' },
          take: 1,
          select: { id: true, numero: true, etapa: true, abertaEm: true },
        },
        _count: { select: { ordens: true } },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

export async function listarPecas(ctx: ContextoAcesso, busca?: string, soCriticas = false) {
  const b = busca?.trim() ?? ''

  const pecas = await comEscopo(ctx, (tx) =>
    tx.peca.findMany({
      where: {
        ativo: true,
        ...(b
          ? {
              OR: [
                { sku: { contains: b, mode: 'insensitive' } },
                { nome: { contains: b, mode: 'insensitive' } },
                { categoria: { contains: b, mode: 'insensitive' } },
                { aplicacao: { contains: b, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { nome: 'asc' },
      take: 200,
      select: {
        id: true,
        sku: true,
        nome: true,
        categoria: true,
        unidade: true,
        localizacao: true,
        saldo: true,
        saldoReservado: true,
        estoqueMinimo: true,
        custoMedioCentavos: true,
        precoVendaCentavos: true,
      },
    }),
  )

  const linhas = pecas.map((p) => {
    const saldo = Number(p.saldo)
    const reservado = Number(p.saldoReservado)
    const minimo = Number(p.estoqueMinimo)
    return {
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      categoria: p.categoria,
      unidade: p.unidade,
      localizacao: p.localizacao,
      saldo,
      reservado,
      // O que dá para prometer hoje. É este número que decide se a O.S. anda —
      // o saldo cheio inclui peça já vendida para outra ordem.
      livre: saldo - reservado,
      minimo,
      custoMedioCentavos: p.custoMedioCentavos,
      precoVendaCentavos: p.precoVendaCentavos,
      critica: saldo <= minimo,
    }
  })

  return soCriticas ? linhas.filter((l) => l.critica) : linhas
}

export async function ultimosMovimentos(ctx: ContextoAcesso, pecaId?: string) {
  return comEscopo(ctx, (tx) =>
    tx.movimentoEstoque.findMany({
      where: pecaId ? { pecaId } : {},
      orderBy: { criadoEm: 'desc' },
      take: 40,
      select: {
        id: true,
        tipo: true,
        quantidade: true,
        saldoPosterior: true,
        motivo: true,
        autorNome: true,
        criadoEm: true,
        peca: { select: { sku: true, nome: true } },
        ordem: { select: { id: true, numero: true } },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export type FiltroFaturas = { status?: string; busca?: string }

export async function listarFaturas(ctx: ContextoAcesso, f: FiltroFaturas) {
  const b = f.busca?.trim() ?? ''
  const digitos = b.replace(/\D/g, '')

  const where: Record<string, unknown> = {}
  if (f.status === 'aberto') where.status = { in: ['ABERTA', 'PARCIAL'] }
  else if (f.status === 'quitadas') where.status = 'QUITADA'
  else if (f.status === 'aconferir') where.AND = [{ status: 'QUITADA' }, { conferido: false }]
  else if (f.status && f.status !== 'todas') where.status = f.status

  if (b) {
    where.OR = [
      ...(digitos ? [{ numero: Number(digitos) }] : []),
      { cliente: { nome: { contains: b, mode: 'insensitive' } } },
    ]
  }

  const faturas = await comEscopo(ctx, (tx) =>
    tx.fatura.findMany({
      where,
      orderBy: [{ status: 'asc' }, { emitidaEm: 'desc' }],
      take: LIMITE,
      select: {
        id: true,
        numero: true,
        status: true,
        valorTotalCentavos: true,
        valorPagoCentavos: true,
        multaCentavos: true,
        jurosCentavos: true,
        taxaCentavos: true,
        vencimento: true,
        emitidaEm: true,
        quitadaEm: true,
        conferido: true,
        conferidoPorNome: true,
        cliente: { select: { nome: true } },
        ordem: { select: { id: true, numero: true, etapa: true } },
        pagamentos: {
          orderBy: { recebidoEm: 'asc' },
          select: {
            id: true,
            forma: true,
            valorCentavos: true,
            parcelas: true,
            bandeira: true,
            autorizacao: true,
            autorNome: true,
            recebidoEm: true,
            estornadoEm: true,
          },
        },
      },
    }),
  )

  const agora = Date.now()
  return faturas.map((f2) => ({
    ...f2,
    devidoCentavos: f2.valorTotalCentavos + f2.multaCentavos + f2.jurosCentavos,
    abertoCentavos: Math.max(
      0,
      f2.valorTotalCentavos + f2.multaCentavos + f2.jurosCentavos - f2.valorPagoCentavos,
    ),
    vencida:
      f2.status !== 'QUITADA' && f2.vencimento ? f2.vencimento.getTime() < agora : false,
  }))
}

/** Os números do caixa: por forma de pagamento, no mês corrente. */
export async function caixaDoMes(ctx: ContextoAcesso) {
  return comEscopo(ctx, async (tx) => {
    const porForma = await tx.$queryRaw<Array<{ forma: string; total: bigint; n: bigint }>>`
      SELECT forma, coalesce(sum("valorCentavos"), 0) AS total, count(*) AS n
        FROM pagamentos
       WHERE "tenantId" = ${ctx.tenantId}
         AND "estornadoEm" IS NULL
         AND "recebidoEm" >= date_trunc('month', now())
       GROUP BY forma
       ORDER BY total DESC
    `
    const [tot] = await tx.$queryRaw<
      Array<{ aberto: bigint; vencido: bigint; taxas: bigint; aconferir: bigint }>
    >`
      SELECT
        coalesce(sum("valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                     - "valorPagoCentavos")
                 FILTER (WHERE status IN ('ABERTA','PARCIAL')), 0) AS aberto,
        coalesce(sum("valorTotalCentavos" + "multaCentavos" + "jurosCentavos"
                     - "valorPagoCentavos")
                 FILTER (WHERE status IN ('ABERTA','PARCIAL')
                           AND vencimento < now()), 0)             AS vencido,
        coalesce(sum("taxaCentavos")
                 FILTER (WHERE "quitadaEm" >= date_trunc('month', now())), 0) AS taxas,
        count(*) FILTER (WHERE status = 'QUITADA' AND conferido = false)      AS aconferir
      FROM faturas WHERE "tenantId" = ${ctx.tenantId}
    `

    return {
      porForma: porForma.map((l) => ({
        forma: l.forma,
        totalCentavos: Number(l.total),
        quantidade: Number(l.n),
      })),
      recebidoNoMes: porForma.reduce((s, l) => s + Number(l.total), 0),
      abertoCentavos: Number(tot?.aberto ?? 0),
      vencidoCentavos: Number(tot?.vencido ?? 0),
      // Custo da maquininha em coluna própria: sem ele separado, "recebi
      // R$ 10 mil" e "entrou R$ 10 mil na conta" viram a mesma frase — e não são.
      taxasNoMes: Number(tot?.taxas ?? 0),
      aConferir: Number(tot?.aconferir ?? 0),
    }
  })
}

/** Ordens liberadas para faturar que ainda não têm fatura emitida. */
export async function aguardandoFatura(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: { etapa: EtapaOrdem.FATURAMENTO, fatura: null },
      orderBy: { atualizadoEm: 'asc' },
      take: 30,
      select: {
        id: true,
        numero: true,
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true } },
        orcamentos: {
          where: { status: 'APROVADO' },
          orderBy: { versao: 'desc' },
          take: 1,
          select: { totalCentavos: true },
        },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Agenda de rota
// ---------------------------------------------------------------------------

export async function agendaDoPeriodo(ctx: ContextoAcesso, dias = 7) {
  // Começa à meia-noite DE LAJEADO. Ver `@/lib/datas`.
  const { inicio } = janelaDoDia()
  const fim = new Date(inicio.getTime() + dias * 86_400_000)

  return comEscopo(ctx, (tx) =>
    tx.agendamento.findMany({
      where: {
        previstoPara: { gte: inicio, lt: fim },
        status: { notIn: ['CANCELADO'] },
      },
      orderBy: [{ previstoPara: 'asc' }, { posicaoRota: 'asc' }],
      take: 200,
      select: {
        id: true,
        tipo: true,
        status: true,
        previstoPara: true,
        janelaInicio: true,
        janelaFim: true,
        enderecoSnapshot: true,
        contatoNome: true,
        contatoTelefone: true,
        observacoes: true,
        motorista: { select: { id: true, nome: true } },
        ordem: {
          select: {
            id: true,
            numero: true,
            etapa: true,
            cliente: { select: { nome: true } },
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
      },
    }),
  )
}

/** Ordens que precisam de agendamento e ainda não têm um em aberto. */
export async function semAgendamento(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: {
        etapa: { in: [EtapaOrdem.ORDEM_RETIRADA_GERADA, EtapaOrdem.FATURADO] },
        agendamentos: { none: { status: { in: ['PENDENTE', 'ATRIBUIDO', 'EM_ROTA'] } } },
      },
      orderBy: { atualizadoEm: 'asc' },
      take: 30,
      select: {
        id: true,
        numero: true,
        etapa: true,
        cliente: {
          select: { nome: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, contatoNome: true, telefone: true },
        },
        equipamento: { select: { marca: true, modelo: true } },
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Contatos vindos do site
// ---------------------------------------------------------------------------

/**
 * Quem chamou pelo site e ainda não virou ordem.
 *
 * Aparece no painel do dia porque um contato que ninguém lê é pior que
 * formulário nenhum: a pessoa do outro lado acha que pediu e fica esperando.
 */
export async function leadsNovos(ctx: ContextoAcesso) {
  return comEscopo(ctx, (tx) =>
    tx.lead.findMany({
      where: { status: 'novo' },
      orderBy: { criadoEm: 'asc' },
      take: 20,
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        empresa: true,
        cidade: true,
        equipamento: true,
        mensagem: true,
        criadoEm: true,
      },
    }),
  )
}

export async function leadPorId(ctx: ContextoAcesso, id: string) {
  return comEscopo(ctx, (tx) =>
    tx.lead.findFirst({
      where: { id, status: 'novo' },
      select: {
        id: true,
        nome: true,
        telefone: true,
        empresa: true,
        cidade: true,
        equipamento: true,
        mensagem: true,
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export async function painelWhatsapp(ctx: ContextoAcesso) {
  return comEscopo(ctx, async (tx) => {
    /**
     * O Super Admin não tem empresa, e a conexão do WhatsApp é DE uma empresa.
     *
     * Antes isto era `ctx.tenantId!`, e a tela devolvia erro 500 para o dono da
     * plataforma — em uma tela que ele abre pelo menu. Consultar sem empresa
     * não é erro dele: é uma pergunta sem resposta possível, e a resposta certa
     * é "não há conexão para mostrar", não uma quebra.
     */
    const instancia = ctx.tenantId === null ? null : await tx.whatsappInstance.findUnique({
      where: { tenantId: ctx.tenantId },
      // O token cifrado NÃO entra na seleção. Ele não tem por que sair do
      // servidor, e o jeito de garantir isso é não carregá-lo.
      select: {
        status: true,
        numero: true,
        profileName: true,
        ultimoStatusEm: true,
        uazInstanceId: true,
      },
    })

    const mensagens = await tx.mensagemWhatsapp.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 40,
      select: {
        id: true,
        numero: true,
        template: true,
        corpo: true,
        status: true,
        erro: true,
        enviadaEm: true,
        criadoEm: true,
        ordem: { select: { id: true, numero: true } },
      },
    })

    const fila = await tx.$queryRaw<Array<{ status: string; n: bigint }>>`
      SELECT status, count(*) AS n
        FROM outbox_jobs
       WHERE "tenantId" = ${ctx.tenantId}
       GROUP BY status
    `

    return {
      instancia,
      mensagens,
      fila: Object.fromEntries(fila.map((l) => [l.status, Number(l.n)])) as Record<string, number>,
    }
  })
}

// ---------------------------------------------------------------------------
// Plataforma (Super Admin)
// ---------------------------------------------------------------------------

/**
 * Lista as empresas da plataforma.
 *
 * Roda em contexto de Super Admin — o único lugar do sistema em que uma
 * consulta legitimamente atravessa a fronteira entre franquias. Os números são
 * agregados: quantas ordens, quantos usuários. Nenhum dado de cliente final
 * aparece aqui, porque o dono da plataforma não precisa vê-lo para administrar
 * o contrato.
 */
export async function listarEmpresas() {
  // O escopo de Super Admin precisa ser ABERTO, não presumido. A policy de
  // `tenants` exige `app.is_super_admin()`, e esse sinal só é instalado dentro
  // de `comEscopo`. Consultando o cliente direto, a tela de administração da
  // plataforma abria vazia — o RLS fazendo o trabalho dele contra o próprio
  // dono do produto.
  const empresas = await comEscopo({ tenantId: null, userId: null, ehSuperAdmin: true }, (tx) =>
    tx.$queryRaw<
    Array<{
      id: string
      slug: string
      nome: string
      cnpj: string | null
      cidade: string | null
      uf: string | null
      ativo: boolean
      bloqueado: boolean
      motivoBloqueio: string | null
      plano: string
      criadoEm: Date
      usuarios: bigint
      ordens: bigint
      abertas: bigint
      whats: string | null
    }>
  >`
    SELECT t.id, t.slug, t.nome, t.cnpj, t.cidade, t.uf, t.ativo, t.bloqueado,
           t."motivoBloqueio", t.plano, t."criadoEm",
           (SELECT count(*) FROM usuarios u WHERE u."tenantId" = t.id AND u.ativo) AS usuarios,
           (SELECT count(*) FROM ordens o WHERE o."tenantId" = t.id)               AS ordens,
           (SELECT count(*) FROM ordens o WHERE o."tenantId" = t.id
              AND o.etapa NOT IN ('FINALIZADO','CANCELADO','DEVOLVIDO_SEM_REPARO')) AS abertas,
           (SELECT w.status::text FROM whatsapp_instances w WHERE w."tenantId" = t.id) AS whats
      FROM tenants t
     ORDER BY t.nome ASC
  `,
  )

  return empresas.map((e) => ({
    ...e,
    usuarios: Number(e.usuarios),
    ordens: Number(e.ordens),
    abertas: Number(e.abertas),
  }))
}

/** Usuários de uma empresa — usado pelo admin dela e pelo Super Admin. */
export async function listarUsuarios(ctx: ContextoAcesso, tenantId?: string) {
  return comEscopo(ctx, (tx) =>
    tx.user.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      take: 200,
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        ativo: true,
        ultimoLogin: true,
        bloqueadoAte: true,
        trocarSenha: true,
        tenant: { select: { nome: true } },
      },
    }),
  )
}
