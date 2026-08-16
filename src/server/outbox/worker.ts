import { StatusJob } from '@/generated/prisma/enums'
import { comContextoWorker, comEscopo, prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { montarMensagem, normalizarNumero, type DadosMensagem } from '@/server/whatsapp/mensagens'
import { enviarTexto, tokenDaEmpresaNaTx } from '@/server/whatsapp/uazapi'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { formatarBRL } from '@/lib/dinheiro'

/**
 * O worker da fila de automação.
 *
 * Roda em processo separado do web de propósito: gerar PDF e falar com a API
 * do WhatsApp são operações lentas e sujeitas a travar. Dentro do processo web,
 * um provedor fora do ar viraria página que não carrega.
 *
 * Garantias que este arquivo sustenta:
 *
 *  • **Um job, um worker.** A tomada usa `FOR UPDATE SKIP LOCKED`, então duas
 *    instâncias podem rodar lado a lado sem processar o mesmo job — e sem uma
 *    ficar esperando a outra.
 *  • **Retentativa com espera crescente.** Falha de rede é comum; o job volta
 *    para a fila com atraso maior a cada tentativa, até o teto configurado.
 *  • **Nada de mensagem duplicada.** O `dedupeKey` é único no banco, então uma
 *    transação repetida por retry não vira dois avisos ao cliente.
 *  • **Escopo por empresa.** O worker varre a fila de todas as franquias, mas
 *    ao processar reabre o escopo com o tenant do próprio job antes de tocar
 *    em qualquer dado de negócio.
 */

type Job = {
  id: string
  tenantId: string | null
  tipo: string
  payload: Record<string, unknown>
  tentativas: number
  maxTentativas: number
}

const IDENTIDADE = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Toma até `limite` jobs para este worker.
 *
 * `SKIP LOCKED` é o detalhe que faz escalar: sem ele, o segundo worker fica
 * bloqueado esperando a linha que o primeiro pegou, e dois processos rendem o
 * mesmo que um.
 */
async function tomarJobs(limite: number): Promise<Job[]> {
  return comContextoWorker(async (tx) => {
    const linhas = await tx.$queryRaw<Job[]>`
      UPDATE outbox_jobs
         SET status = 'PROCESSANDO',
             "travadoPor" = ${IDENTIDADE},
             "travadoEm" = now(),
             tentativas = tentativas + 1
       WHERE id IN (
         SELECT id FROM outbox_jobs
          WHERE status = 'PENDENTE'
            AND "agendadoPara" <= now()
          ORDER BY prioridade ASC, "agendadoPara" ASC
          LIMIT ${limite}
          FOR UPDATE SKIP LOCKED
       )
       RETURNING id, "tenantId", tipo, payload, tentativas, "maxTentativas"
    `
    return linhas
  })
}

async function concluir(id: string) {
  await comContextoWorker(async (tx) => {
    await tx.outboxJob.update({
      where: { id },
      data: { status: StatusJob.CONCLUIDO, processadoEm: new Date(), ultimoErro: null },
    })
  })
}

/**
 * Devolve o job para a fila com espera crescente, ou descarta se estourou.
 *
 * Descartar em silêncio seria pior que falhar: o cliente não recebeu o aviso e
 * ninguém ficaria sabendo. Por isso o job vira DESCARTADO com o erro gravado,
 * e aparece no painel de saúde da fila.
 */
async function falhar(job: Job, erro: unknown) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  const estourou = job.tentativas >= job.maxTentativas
  // 30s, 1min, 2min, 4min... com teto de 30 minutos.
  const espera = Math.min(30_000 * 2 ** (job.tentativas - 1), 30 * 60_000)

  await comContextoWorker(async (tx) => {
    await tx.outboxJob.update({
      where: { id: job.id },
      data: estourou
        ? { status: StatusJob.DESCARTADO, ultimoErro: msg.slice(0, 900), processadoEm: new Date() }
        : {
            status: StatusJob.PENDENTE,
            ultimoErro: msg.slice(0, 900),
            agendadoPara: new Date(Date.now() + espera),
            travadoPor: null,
            travadoEm: null,
          },
    })
  })

  console.error(
    `[fila] ${job.tipo} ${job.id} falhou (${job.tentativas}/${job.maxTentativas})` +
      `${estourou ? ' — DESCARTADO' : ` — nova tentativa em ${Math.round(espera / 1000)}s`}: ${msg}`,
  )
}

// ---------------------------------------------------------------------------
// Processadores
// ---------------------------------------------------------------------------

const PROCESSADORES: Record<string, (job: Job) => Promise<void>> = {
  'whatsapp.enviar': enviarAvisoDaEtapa,
  'pdf.gerar': gerarDocumento,
}

/**
 * Monta e envia o aviso da etapa.
 *
 * Note que a montagem do texto acontece na função pura de `mensagens.ts`, que
 * é coberta por teste. Aqui só se busca o dado e se entrega ao provedor.
 */
async function enviarAvisoDaEtapa(job: Job) {
  const { ordemId, template } = job.payload as { ordemId: string; template: string }
  if (!job.tenantId) throw new Error('Job de WhatsApp sem empresa definida.')

  const ctx = { tenantId: job.tenantId, userId: null, ehSuperAdmin: false }

  const dados = await comEscopo(ctx, async (tx) => {
    const o = await tx.ordem.findUnique({
      where: { id: ordemId },
      include: {
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        tenant: { select: { nome: true } },
        fatura: { select: { valorTotalCentavos: true } },
        orcamentos: {
          where: { status: { in: ['ENVIADO', 'APROVADO'] } },
          orderBy: { versao: 'desc' },
          take: 1,
        },
        agendamentos: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
          include: { motorista: { select: { nome: true } } },
        },
      },
    })
    if (!o) return null

    const orc = o.orcamentos[0]
    const ag = o.agendamentos[0]
    const fotos = await tx.foto.count({ where: { ordemId, categoria: 'RECEBIMENTO' } })

    const d: DadosMensagem = {
      contato: o.cliente.contatoNome ?? null,
      cliente: o.cliente.nome,
      equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
      numeroOrdem: o.numero,
      empresa: o.tenant.nome,
      // Já formatado aqui, para a função de texto continuar pura.
      quando: ag?.previstoPara
        ? ag.previstoPara.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          })
        : null,
      motorista: ag?.motorista?.nome ?? null,
      endereco: ag?.enderecoSnapshot ?? null,
      valor: orc ? formatarBRL(orc.totalCentavos) : null,
      prazo: orc ? `${orc.prazoExecucaoDias} dias úteis` : null,
      garantiaDias: orc?.garantiaDias ?? null,
      linkPortal: `${env.APP_URL}/os/${o.tokenPublico}`,
      tecnico: o.tecnico?.nome ?? null,
      qtdFotos: fotos || null,
      motivo: null,
    }

    return { d, numeroBruto: o.cliente.whatsapp ?? o.cliente.telefone, ordemId: o.id }
  })

  if (!dados) throw new Error('Ordem não encontrada ao montar o aviso.')

  const numero = normalizarNumero(dados.numeroBruto)
  if (!numero) {
    // Não é falha de sistema: é cadastro incompleto. Repetir não resolve, então
    // registramos e encerramos o job em vez de gastar seis tentativas.
    await registrarMensagem(job.tenantId, dados.ordemId, {
      numero: dados.numeroBruto ?? '',
      corpo: '',
      status: 'FALHOU',
      erro: 'Cliente sem WhatsApp válido no cadastro.',
      template,
    })
    return
  }

  const corpo = montarMensagem(template, dados.d)
  if (!corpo) {
    console.warn(`[fila] sem template para "${template}" — nada foi enviado.`)
    return
  }

  // Todo trabalho de WhatsApp nasce dentro de uma empresa. Se um chegar sem
  // ela, o certo é falhar ESTE trabalho com uma frase que se entende — e não
  // deixar o banco recusar o nulo lá dentro, com um erro que ninguém liga ao
  // trabalho que o causou.
  const empresa = job.tenantId
  if (!empresa) throw new Error('Trabalho de WhatsApp sem empresa; nada foi enviado.')

  const token = await comEscopo({ tenantId: empresa, userId: null, ehSuperAdmin: false }, (tx) =>
    tokenDaEmpresaNaTx(tx, empresa),
  )
  if (!token) {
    throw new Error('WhatsApp da empresa não está conectado.')
  }

  const r = await enviarTexto({ token, numero, texto: corpo })

  await registrarMensagem(job.tenantId, dados.ordemId, {
    numero,
    corpo,
    status: 'ENVIADA',
    providerId: r.providerId,
    template,
  })
}

async function registrarMensagem(
  tenantId: string,
  ordemId: string,
  dados: {
    numero: string
    corpo: string
    status: 'ENVIADA' | 'FALHOU'
    providerId?: string | null
    erro?: string
    template: string
  },
) {
  await comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, async (tx) => {
    await tx.mensagemWhatsapp.create({
      data: {
        tenantId,
        ordemId,
        numero: dados.numero,
        template: dados.template,
        corpo: dados.corpo,
        status: dados.status,
        providerId: dados.providerId ?? null,
        erro: dados.erro ?? null,
        enviadaEm: dados.status === 'ENVIADA' ? new Date() : null,
      },
    })
  })
}

/** Marcador do gerador de PDF, implementado em src/server/documentos. */
async function gerarDocumento(job: Job) {
  if (!job.tenantId) throw new Error('Trabalho de documento sem empresa; nada foi gerado.')
  const { gerarPdfDaOrdem } = await import('@/server/documentos/gerar')
  await gerarPdfDaOrdem(job.payload as never, job.tenantId)
}

// ---------------------------------------------------------------------------
// Laço principal
// ---------------------------------------------------------------------------

let parando = false

export async function rodarUmaVolta(): Promise<number> {
  const jobs = await tomarJobs(env.WORKER_BATCH_SIZE)
  if (!jobs.length) return 0

  for (const job of jobs) {
    const p = PROCESSADORES[job.tipo]
    if (!p) {
      await falhar(job, new Error(`Tipo de job desconhecido: ${job.tipo}`))
      continue
    }
    try {
      await p(job)
      await concluir(job.id)
    } catch (e) {
      await falhar(job, e)
    }
  }
  return jobs.length
}

export async function iniciarWorker(): Promise<void> {
  console.log(`[fila] worker ${IDENTIDADE} no ar, lendo a cada ${env.WORKER_POLL_INTERVAL_MS}ms`)

  const encerrar = async (sinal: string) => {
    console.log(`[fila] ${sinal} recebido, terminando o lote em andamento…`)
    parando = true
  }
  process.on('SIGTERM', () => void encerrar('SIGTERM'))
  process.on('SIGINT', () => void encerrar('SIGINT'))

  while (!parando) {
    try {
      const n = await rodarUmaVolta()
      // Fila vazia: espera o intervalo cheio. Fila com trabalho: volta logo.
      await dormir(n === 0 ? env.WORKER_POLL_INTERVAL_MS : 200)
    } catch (e) {
      console.error('[fila] erro no laço principal:', e)
      await dormir(5000)
    }
  }

  await prisma.$disconnect()
  console.log('[fila] worker encerrado sem deixar job travado.')
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export { ROTULO_ETAPA }
