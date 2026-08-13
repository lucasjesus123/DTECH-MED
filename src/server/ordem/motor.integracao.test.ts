import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EtapaOrdem as E, Papel as P } from '@/generated/prisma/enums'
import { hashDocumento } from '@/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '@/lib/db'
import { avancarOrdem, verificarIntegridade } from './motor'

/**
 * Prova de ponta a ponta, contra o banco de verdade.
 *
 * O teste unitário da máquina de estados prova que a TABELA está certa. Este
 * aqui prova que o SISTEMA está certo: que o RLS realmente prende, que as
 * pré-condições realmente barram, que a corrente de hash realmente detecta
 * adulteração e que a automação realmente entra na fila junto com a etapa.
 *
 * É o teste que responde à pergunta que importa: "depois de pronto, trava?"
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }

let A: Ambiente
let B: Ambiente

type Ambiente = {
  tenantId: string
  ctx: ContextoAcesso
  clienteId: string
  equipamentoId: string
  ordemId: string
  usuarios: Record<string, { id: string; nome: string; papel: P }>
}

async function montarEmpresa(slug: string, nome: string): Promise<Ambiente> {
  return comEscopo(SUPER, async (tx) => {
    const t = await tx.tenant.create({ data: { slug, nome, cnpj: null } })

    const criar = async (papel: P, nomeU: string) =>
      tx.user.create({
        data: {
          tenantId: t.id,
          nome: nomeU,
          email: `${papel.toLowerCase()}@${slug}.test`,
          senhaHash: 'x',
          papel,
        },
        select: { id: true, nome: true, papel: true },
      })

    const usuarios = {
      atendente: await criar(P.ATENDENTE, 'Ana Atendente'),
      motorista: await criar(P.MOTORISTA, 'Adriano Motorista'),
      tecnico: await criar(P.TECNICO, 'Rafael Técnico'),
      gestor: await criar(P.GESTOR, 'Camila Gestora'),
      financeiro: await criar(P.FINANCEIRO, 'Fábio Financeiro'),
    }

    const cliente = await tx.cliente.create({
      data: {
        tenantId: t.id,
        nome: `Clínica de ${nome}`,
        documento: slug === 'emp-a' ? '11111111000191' : '22222222000191',
        documentoHash: hashDocumento(slug === 'emp-a' ? '11111111000191' : '22222222000191'),
        whatsapp: '5551980449274',
        contatoNome: 'Mariana',
      },
    })

    const eq = await tx.equipamento.create({
      data: {
        tenantId: t.id,
        clienteId: cliente.id,
        marca: 'Lavieen',
        modelo: 'Duo',
        numeroSerie: `NS-${slug}`,
      },
    })

    await tx.contador.create({ data: { tenantId: t.id, chave: 'ordem', valor: 1 } })

    const ordem = await tx.ordem.create({
      data: {
        tenantId: t.id,
        numero: 1,
        clienteId: cliente.id,
        equipamentoId: eq.id,
        defeitoRelatado: 'Liga mas não dispara.',
        tecnicoId: usuarios.tecnico.id,
      },
    })

    return {
      tenantId: t.id,
      ctx: { tenantId: t.id, userId: null, ehSuperAdmin: false },
      clienteId: cliente.id,
      equipamentoId: eq.id,
      ordemId: ordem.id,
      usuarios,
    }
  })
}

const ator = (a: Ambiente, chave: keyof Ambiente['usuarios']) => {
  const u = a.usuarios[chave]!
  return { id: u.id, nome: u.nome, papel: u.papel }
}

beforeAll(async () => {
  await limpar()
  A = await montarEmpresa('emp-a', 'Empresa A')
  B = await montarEmpresa('emp-b', 'Empresa B')
})

afterAll(async () => {
  await limpar()
  await prisma.$disconnect()
})

/**
 * Limpeza entre execuções.
 *
 * Usa uma conexão do usuário DONO, não a da aplicação — e isso não é atalho de
 * teste, é a confirmação de que a blindagem funciona: o papel `dtechmed_app`
 * teve DELETE revogado em eventos, assinaturas e movimentos de estoque, e
 * TRUNCATE exige ser dono da tabela. Se este helper conseguisse limpar com a
 * conexão do runtime, a trilha de auditoria não estaria protegida de verdade.
 */
async function limpar() {
  const url = process.env.DIRECT_DATABASE_URL
  if (!url) throw new Error('DIRECT_DATABASE_URL é necessária para limpar o banco de teste.')
  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(
      `TRUNCATE tenants, usuarios, sessoes, clientes, equipamentos, ordens,
       eventos_ordem, fotos, assinaturas, orcamentos, orcamento_itens, pecas,
       movimentos_estoque, faturas, pagamentos, agendamentos, documentos,
       outbox_jobs, mensagens_whatsapp, templates_mensagem, whatsapp_instances,
       leads, audit_logs, contadores RESTART IDENTITY CASCADE`,
    )
  } finally {
    await c.end()
  }
}

// ===========================================================================

describe('isolamento entre franquias, pelo motor', () => {
  it('a empresa A não enxerga a ordem da empresa B', async () => {
    const visto = await comEscopo(A.ctx, (tx) =>
      tx.ordem.findUnique({ where: { id: B.ordemId } }),
    )
    expect(visto).toBeNull()
  })

  it('a empresa A não consegue avançar a ordem da empresa B', async () => {
    // O ataque realista: o operador da A descobre o id da ordem da B e o
    // manda no corpo do request. O RLS filtra antes de qualquer regra de
    // negócio, então para o motor a ordem simplesmente não existe.
    const r = await avancarOrdem(A.ctx, ator(A, 'atendente'), {
      ordemId: B.ordemId,
      para: E.ORDEM_RETIRADA_GERADA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/não encontrada/i)
  })

  it('a empresa B segue intacta depois da tentativa', async () => {
    const o = await comEscopo(B.ctx, (tx) =>
      tx.ordem.findUnique({ where: { id: B.ordemId }, select: { etapa: true } }),
    )
    expect(o?.etapa).toBe(E.SOLICITACAO_RECEBIDA)
  })
})

describe('pré-condições barram no servidor, não no formulário', () => {
  it('não coleta sem assinatura', async () => {
    await avancarOrdem(A.ctx, ator(A, 'atendente'), {
      ordemId: A.ordemId,
      para: E.ORDEM_RETIRADA_GERADA,
    })
    await avancarOrdem(A.ctx, ator(A, 'atendente'), {
      ordemId: A.ordemId,
      para: E.RETIRADA_AGENDADA,
    })
    await avancarOrdem(A.ctx, ator(A, 'motorista'), {
      ordemId: A.ordemId,
      para: E.EM_ROTA_RETIRADA,
    })

    const r = await avancarOrdem(A.ctx, ator(A, 'motorista'), {
      ordemId: A.ordemId,
      para: E.COLETADO,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/assinatura/i)
  })

  it('com a assinatura, a coleta passa', async () => {
    await comEscopo(A.ctx, async (tx) => {
      await tx.assinatura.create({
        data: {
          tenantId: A.tenantId,
          ordemId: A.ordemId,
          tipo: 'RETIRADA',
          assinanteNome: 'Mariana Farias',
          caminhoImagem: 'x.png',
          hashImagem: 'h',
        },
      })
    })
    const r = await avancarOrdem(A.ctx, ator(A, 'motorista'), {
      ordemId: A.ordemId,
      para: E.COLETADO,
    })
    expect(r.ok).toBe(true)
  })

  it('não dá entrada com menos de seis fotos, e diz quantas faltam', async () => {
    await comEscopo(A.ctx, async (tx) => {
      for (let i = 0; i < 4; i++) {
        await tx.foto.create({
          data: {
            tenantId: A.tenantId,
            ordemId: A.ordemId,
            categoria: 'RECEBIMENTO',
            caminho: `f${i}.jpg`,
            hashArquivo: `h${i}`,
            autorNome: 'Rafael',
          },
        })
      }
    })
    const r = await avancarOrdem(A.ctx, ator(A, 'tecnico'), {
      ordemId: A.ordemId,
      para: E.RECEBIDO_NA_EMPRESA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('Faltam 2 fotos para dar entrada no equipamento.')
  })

  it('a sexta foto libera a entrada', async () => {
    await comEscopo(A.ctx, async (tx) => {
      for (let i = 4; i < 6; i++) {
        await tx.foto.create({
          data: {
            tenantId: A.tenantId,
            ordemId: A.ordemId,
            categoria: 'RECEBIMENTO',
            caminho: `f${i}.jpg`,
            hashArquivo: `h${i}`,
            autorNome: 'Rafael',
          },
        })
      }
    })
    const r = await avancarOrdem(A.ctx, ator(A, 'tecnico'), {
      ordemId: A.ordemId,
      para: E.RECEBIDO_NA_EMPRESA,
    })
    expect(r.ok).toBe(true)
  })

  it('não manda para revisão sem diagnóstico escrito', async () => {
    await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.EM_ANALISE })
    const r = await avancarOrdem(A.ctx, ator(A, 'tecnico'), {
      ordemId: A.ordemId,
      para: E.ORCAMENTO_INTERNO,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/diagn[óo]stico/i)
  })
})

describe('a jornada completa chega ao fim', () => {
  it('percorre de ponta a ponta sem travar', async () => {
    await comEscopo(A.ctx, async (tx) => {
      await tx.ordem.update({
        where: { id: A.ordemId },
        data: { diagnostico: 'Fonte sem saída nos 24V. Capacitor C14 estufado.' },
      })
    })

    expect((await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.ORCAMENTO_INTERNO })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'gestor'), { ordemId: A.ordemId, para: E.ORCAMENTO_ENVIADO })).ok).toBe(true)

    // A aprovação vem do portal do cliente, não de um funcionário.
    const aprov = await avancarOrdem(
      A.ctx,
      { id: null, nome: 'Mariana Farias', papel: P.ATENDENTE },
      { ordemId: A.ordemId, para: E.ORCAMENTO_APROVADO, viaPortalCliente: true, autorExterno: 'Mariana Farias' },
    )
    expect(aprov.ok).toBe(true)

    // Sem orçamento marcado como APROVADO no banco, a manutenção não começa.
    const semOrc = await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.EM_MANUTENCAO })
    expect(semOrc.ok).toBe(false)

    await comEscopo(A.ctx, async (tx) => {
      await tx.orcamento.create({
        data: {
          tenantId: A.tenantId,
          ordemId: A.ordemId,
          numero: 1,
          status: 'APROVADO',
          totalCentavos: 184000,
          subtotalPecas: 77000,
          subtotalServicos: 107000,
        },
      })
    })

    expect((await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.EM_MANUTENCAO })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.MANUTENCAO_CONCLUIDA })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'tecnico'), { ordemId: A.ordemId, para: E.APROVACAO_GESTAO })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'gestor'), { ordemId: A.ordemId, para: E.FATURAMENTO })).ok).toBe(true)

    // Faturar sem a fatura quitada é o erro que faz equipamento sair sem pagar.
    const semPagar = await avancarOrdem(A.ctx, ator(A, 'financeiro'), { ordemId: A.ordemId, para: E.FATURADO })
    expect(semPagar.ok).toBe(false)
    if (!semPagar.ok) expect(semPagar.motivo).toMatch(/fatura/i)

    await comEscopo(A.ctx, async (tx) => {
      await tx.fatura.create({
        data: {
          tenantId: A.tenantId,
          ordemId: A.ordemId,
          clienteId: A.clienteId,
          numero: 1,
          valorTotalCentavos: 184000,
          valorPagoCentavos: 184000,
          status: 'QUITADA',
        },
      })
    })

    expect((await avancarOrdem(A.ctx, ator(A, 'financeiro'), { ordemId: A.ordemId, para: E.FATURADO })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'motorista'), { ordemId: A.ordemId, para: E.EM_ROTA_ENTREGA })).ok).toBe(true)

    // Entrega sem assinatura de quem recebeu também não passa.
    const semAssin = await avancarOrdem(A.ctx, ator(A, 'motorista'), { ordemId: A.ordemId, para: E.ENTREGUE })
    expect(semAssin.ok).toBe(false)

    await comEscopo(A.ctx, async (tx) => {
      await tx.assinatura.create({
        data: {
          tenantId: A.tenantId,
          ordemId: A.ordemId,
          tipo: 'ENTREGA',
          assinanteNome: 'Mariana Farias',
          caminhoImagem: 'e.png',
          hashImagem: 'h',
          latitude: -29.46,
          longitude: -51.96,
          precisaoM: 12,
        },
      })
    })

    expect((await avancarOrdem(A.ctx, ator(A, 'motorista'), { ordemId: A.ordemId, para: E.ENTREGUE })).ok).toBe(true)
    expect((await avancarOrdem(A.ctx, ator(A, 'gestor'), { ordemId: A.ordemId, para: E.FINALIZADO })).ok).toBe(true)

    const fim = await comEscopo(A.ctx, (tx) =>
      tx.ordem.findUnique({
        where: { id: A.ordemId },
        select: { etapa: true, entregueEm: true, finalizadaEm: true, coletadaEm: true },
      }),
    )
    expect(fim?.etapa).toBe(E.FINALIZADO)
    // Os marcos de tempo foram gravados no caminho, sem ninguém preencher à mão.
    expect(fim?.coletadaEm).toBeTruthy()
    expect(fim?.entregueEm).toBeTruthy()
    expect(fim?.finalizadaEm).toBeTruthy()
  })

  it('ordem finalizada não volta a andar', async () => {
    const r = await avancarOrdem(A.ctx, ator(A, 'gestor'), {
      ordemId: A.ordemId,
      para: E.EM_MANUTENCAO,
    })
    expect(r.ok).toBe(false)
  })
})

describe('a linha do tempo prova quem mexeu no quê', () => {
  it('todo evento carrega autor, papel e horário', async () => {
    const eventos = await comEscopo(A.ctx, (tx) =>
      tx.eventoOrdem.findMany({ where: { ordemId: A.ordemId }, orderBy: { sequencia: 'asc' } }),
    )
    expect(eventos.length).toBeGreaterThanOrEqual(14)
    for (const e of eventos) {
      expect(e.autorNome).toBeTruthy()
      expect(e.autorPapel).toBeTruthy()
      expect(e.hash).toHaveLength(64)
    }
    // A aprovação ficou no nome do cliente, não de um funcionário.
    const ap = eventos.find((e) => e.tipo === 'orcamento.aprovado')
    expect(ap?.autorNome).toBe('Mariana Farias')
    expect(ap?.autorId).toBeNull()
  })

  it('a numeração é contínua, sem buraco', async () => {
    const eventos = await comEscopo(A.ctx, (tx) =>
      tx.eventoOrdem.findMany({
        where: { ordemId: A.ordemId },
        orderBy: { sequencia: 'asc' },
        select: { sequencia: true },
      }),
    )
    eventos.forEach((e, i) => expect(e.sequencia).toBe(i + 1))
  })

  it('a cadeia de hash está íntegra', async () => {
    const r = await verificarIntegridade(A.ctx, A.ordemId)
    expect(r.integra).toBe(true)
    expect(r.total).toBeGreaterThan(10)
  })

  it('adulterar um evento antigo é detectado', async () => {
    // Simula alguém com acesso ao banco reescrevendo o histórico para sumir
    // com uma responsabilidade. A conta do hash deixa de fechar naquele ponto.
    // Precisa do usuário dono: o papel da aplicação nem UPDATE tem aqui. Ou
    // seja, para chegar a este ponto o atacante já teria credencial de dono
    // do banco — e mesmo assim a corrente de hash o denuncia.
    const c = new Client({ connectionString: process.env.DIRECT_DATABASE_URL })
    await c.connect()
    await c.query(
      `UPDATE eventos_ordem SET payload = jsonb_set(coalesce(payload,'{}'::jsonb), '{observacao}', '"mexido depois"')
        WHERE "ordemId" = $1 AND sequencia = 5`,
      [A.ordemId],
    )
    await c.end()
    const r = await verificarIntegridade(A.ctx, A.ordemId)
    // O payload entra no hash, então a alteração não passa despercebida.
    expect(r.integra).toBe(false)
    expect(r.quebrouNaSequencia).toBe(5)
  })
})

describe('a automação nasce junto com a etapa', () => {
  it('cada etapa que avisa o cliente deixou um job na fila', async () => {
    const jobs = await comEscopo(A.ctx, (tx) =>
      tx.outboxJob.findMany({ where: { tipo: 'whatsapp.enviar' } }),
    )
    // Coleta, entrada, análise, orçamento, aprovação, manutenção, conclusão,
    // faturamento, saída para entrega e entrega — dez avisos no caminho.
    expect(jobs.length).toBeGreaterThanOrEqual(9)
    for (const j of jobs) {
      expect(j.tenantId).toBe(A.tenantId)
      expect(j.dedupeKey).toBeTruthy()
    }
  })

  it('a chave de deduplicação impede aviso repetido', async () => {
    const chaves = await comEscopo(A.ctx, (tx) =>
      tx.outboxJob.findMany({ select: { dedupeKey: true } }),
    )
    const unicas = new Set(chaves.map((c) => c.dedupeKey))
    expect(unicas.size).toBe(chaves.length)
  })

  it('as etapas com documento pediram o PDF', async () => {
    const pdfs = await comEscopo(A.ctx, (tx) =>
      tx.outboxJob.findMany({ where: { tipo: 'pdf.gerar' } }),
    )
    const tipos = pdfs.map((p) => (p.payload as { documento: string }).documento)
    expect(tipos).toContain('ORDEM_RETIRADA')
    expect(tipos).toContain('CONTRATO_MANUTENCAO')
    expect(tipos).toContain('COMPROVANTE_ENTREGA')
  })

  it('nenhum job vazou para a outra empresa', async () => {
    const daB = await comEscopo(B.ctx, (tx) => tx.outboxJob.findMany())
    expect(daB).toHaveLength(0)
  })
})

describe('a trilha não pode ser apagada', () => {
  it('o papel da aplicação não tem permissão de apagar evento', async () => {
    await expect(
      comEscopo(A.ctx, (tx) => tx.eventoOrdem.deleteMany({ where: { ordemId: A.ordemId } })),
    ).rejects.toThrow()
  })

  it('nem de apagar assinatura', async () => {
    await expect(
      comEscopo(A.ctx, (tx) => tx.assinatura.deleteMany({ where: { ordemId: A.ordemId } })),
    ).rejects.toThrow()
  })
})
