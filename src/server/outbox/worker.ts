import { StatusJob } from '@/generated/prisma/enums'
import { comContextoWorker, comEscopo, prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { montarMensagem, normalizarNumero, type DadosMensagem } from '@/server/whatsapp/mensagens'
import { enviarDocumento, enviarTexto, tokenDaEmpresaNaTx } from '@/server/whatsapp/uazapi'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { enfileirar } from '@/server/ordem/motor'
import { formatarBRL } from '@/lib/dinheiro'
import { aparelhosDe, enviarAviso, ligado } from '@/server/push/avisos'

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
  'push.enviar': enviarAvisoNoCelular,
  'pdf.gerar': gerarDocumento,
}

/**
 * Monta e envia o aviso da etapa.
 *
 * Note que a montagem do texto acontece na função pura de `mensagens.ts`, que
 * é coberta por teste. Aqui só se busca o dado e se entrega ao provedor.
 */
/**
 * O endereço da casa numa linha, para o cliente que vai postar o aparelho.
 *
 * Junta só o que está preenchido: uma empresa que ainda não completou o cadastro
 * manda o que tem em vez de mandar "null, null — /".
 */
function enderecoDaCasa(t: {
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}): string | null {
  const rua = [t.logradouro, t.numero].filter(Boolean).join(', ')
  const praca = [t.cidade, t.uf].filter(Boolean).join('/')
  const linha = [rua, t.bairro, praca, t.cep && `CEP ${t.cep}`].filter(Boolean).join(' — ')
  return linha || null
}

/**
 * O AVISO NO CELULAR DE QUEM VAI DIRIGIR.
 *
 * =============================================================================
 * POR QUE ELE PASSA PELA FILA, E NÃO SAI DIRETO DO `agendar`
 * =============================================================================
 * Enviar é rede: três servidores push diferentes (Google, Apple, Mozilla), cada
 * um com o seu tempo e as suas quedas. Fazer isso dentro do clique de quem
 * marca a parada significa a central esperando a Apple responder para a tela
 * dela voltar — e, quando a Apple estiver fora do ar, a parada não ser marcada.
 *
 * Na fila, a parada é gravada na hora e o aviso sai logo atrás. Se falhar, o
 * worker tenta de novo sozinho.
 *
 * =============================================================================
 * SEM CHAVE VAPID ISTO É UM NÃO-FAZER-NADA, DE PROPÓSITO
 * =============================================================================
 * A empresa que não configurou o par de chaves não tem aviso no celular, e o
 * job precisa CONCLUIR em vez de falhar: um job que falha volta seis vezes e
 * depois fica marcado como erro para sempre, enchendo a tela de quem cuida da
 * fila de vermelho por um recurso que ninguém pediu.
 */
async function enviarAvisoNoCelular(job: Job) {
  const { agendamentoId } = (job.payload ?? {}) as { agendamentoId?: string }
  if (!agendamentoId) throw new Error('Aviso de celular sem agendamento.')
  if (!job.tenantId) throw new Error('Aviso de celular sem empresa definida.')
  if (!ligado()) return

  const ctx = { tenantId: job.tenantId, userId: null, ehSuperAdmin: false }

  const dados = await comEscopo(ctx, async (tx) => {
    const a = await tx.agendamento.findUnique({
      where: { id: agendamentoId },
      select: {
        tipo: true,
        status: true,
        previstoPara: true,
        enderecoSnapshot: true,
        motoristaId: true,
        ordem: { select: { numero: true, cliente: { select: { nome: true } } } },
      },
    })
    if (!a || !a.motoristaId) return null
    // A parada cancelada entre o agendamento e o envio não avisa ninguém: o
    // motorista sairia para um endereço que já não é dele.
    if (a.status === 'CANCELADO') return null
    return { a, aparelhos: await aparelhosDe(tx, a.motoristaId) }
  })
  if (!dados || dados.aparelhos.length === 0) return

  const { a, aparelhos } = dados
  const quando = a.previstoPara.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const r = await enviarAviso(aparelhos, {
    titulo: a.tipo === 'RETIRADA' ? 'Retirada marcada para você' : 'Entrega marcada para você',
    // Cliente, hora e endereço: é o que decide se ele aceita agora ou liga para
    // a central. O número da O.S. entra porque é o que ele cita ao telefone.
    corpo: `${a.ordem.cliente.nome} · ${quando}\n${a.enderecoSnapshot} · O.S. #${String(a.ordem.numero).padStart(4, '0')}`,
    destino: '/app/motorista',
    // Uma etiqueta por parada: remarcar a mesma corrida substitui o aviso
    // anterior no aparelho em vez de empilhar mais um.
    etiqueta: `parada-${agendamentoId}`,
  })

  /**
   * O QUE O FABRICANTE RECUSOU DE VEZ É APAGADO AQUI.
   *
   * 404 e 410 querem dizer "este aparelho não existe mais" — aplicativo
   * desinstalado, inscrição revogada. Guardar a linha faria toda corrida futura
   * gastar uma tentativa num endereço que nunca mais vai responder.
   */
  if (r.mortos.length > 0) {
    await comEscopo(ctx, (tx) =>
      tx.pushInscricao.deleteMany({ where: { endpoint: { in: r.mortos } } }),
    )
  }
  if (r.enviados > 0) {
    await comEscopo(ctx, (tx) =>
      tx.pushInscricao.updateMany({
        where: { endpoint: { notIn: [...r.mortos, ...r.falharam] }, usuarioId: a.motoristaId! },
        data: { ultimoEnvioEm: new Date(), falhas: 0 },
      }),
    )
  }
  if (r.falharam.length > 0) {
    await comEscopo(ctx, (tx) =>
      tx.pushInscricao.updateMany({
        where: { endpoint: { in: r.falharam } },
        data: { falhas: { increment: 1 } },
      }),
    )
  }

  console.log(
    `[fila] push da parada ${agendamentoId}: ${r.enviados} enviado(s), ` +
      `${r.mortos.length} aparelho(s) apagado(s), ${r.falharam.length} falha(s).`,
  )
}

async function enviarAvisoDaEtapa(job: Job) {
  const { ordemId, template, linkDocumento, documentoId, anexarDocumento } = job.payload as {
    ordemId: string
    template: string
    /** Só o modelo que sai sozinho traz estes dois — ver `documento.modelo`. */
    linkDocumento?: string
    documentoId?: string
    /**
     * O TIPO DE DOCUMENTO A ANEXAR — e este campo era ESCRITO E NUNCA LIDO.
     *
     * O motor gravava `anexarDocumento` no trabalho desde sempre, com um
     * comentário dizendo "o PDF é anexado pelo worker depois de gerado". O
     * worker nunca leu o campo. O cliente recebia "sua retirada está agendada
     * ✅" e nenhum documento — e nada em lugar nenhum acusava o buraco, porque
     * do ponto de vista do sistema tudo tinha dado certo: o texto saiu.
     *
     * Campo escrito e não lido é pior que campo ausente: quem lê o código
     * conclui que o recurso existe.
     */
    anexarDocumento?: string
  }
  if (!job.tenantId) throw new Error('Job de WhatsApp sem empresa definida.')

  const ctx = { tenantId: job.tenantId, userId: null, ehSuperAdmin: false }

  const dados = await comEscopo(ctx, async (tx) => {
    const o = await tx.ordem.findUnique({
      where: { id: ordemId },
      include: {
        cliente: true,
        equipamento: true,
        tecnico: { select: { nome: true } },
        // O endereço da CASA entra porque o aviso de envio precisa dizer para
        // onde mandar o aparelho. Nas outras mensagens ele não é usado.
        tenant: {
          select: {
            nome: true,
            logradouro: true,
            numero: true,
            bairro: true,
            cidade: true,
            uf: true,
            cep: true,
          },
        },
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
      /**
       * DE QUAL ENDEREÇO A MENSAGEM FALA — e são dois lugares diferentes.
       *
       * Na retirada nossa, é o endereço PARA ONDE o motorista vai: o do
       * cliente, congelado na parada. Quando é o cliente que despacha, é o
       * endereço PARA ONDE ele manda: o nosso. Mandar o endereço do próprio
       * cliente para ele postar o aparelho seria mandá-lo enviar para si mesmo.
       */
      endereco: o.viaCorreio ? enderecoDaCasa(o.tenant) : (ag?.enderecoSnapshot ?? null),
      valor: orc ? formatarBRL(orc.totalCentavos) : null,
      prazo: orc ? `${orc.prazoExecucaoDias} dias úteis` : null,
      garantiaDias: orc?.garantiaDias ?? null,
      linkPortal: `${env.APP_URL}/os/${o.tokenPublico}`,
      linkDocumento: linkDocumento ?? null,
      tecnico: o.tecnico?.nome ?? null,
      qtdFotos: fotos || null,
      motivo: null,
      // Quem despacha o aparelho recebe outro texto na etapa do agendamento:
      // sem motorista e sem hora, com o endereço para onde mandar.
      viaCorreio: o.viaCorreio,
      rastreio: o.codigoRastreio,
    }

    /**
     * O DOCUMENTO A ANEXAR — o MAIS RECENTE daquele tipo, e não o da transição.
     *
     * Buscar "o documento que esta transição gerou" não funcionaria para o caso
     * que importa: quem GERA a ordem de retirada é a etapa anterior
     * (`ORDEM_RETIRADA_GERADA`, que não avisa ninguém), e quem AVISA é
     * `RETIRADA_AGENDADA`, que não gera nada. As duas metades nunca se
     * encontravam.
     *
     * Pegando o mais recente do tipo, o aviso leva o PDF que existe naquele
     * momento — e como o gerador é rodado de novo a cada etapa, o arquivo que
     * vai junto é sempre o mais atualizado, com as fotos que já foram tiradas.
     */
    let anexo: { url: string; nome: string; id: string } | null = null
    if (anexarDocumento) {
      const doc = await tx.documento.findFirst({
        where: { ordemId, tipo: anexarDocumento as never },
        orderBy: { geradoEm: 'desc' },
        select: { id: true, tokenAcesso: true, tipo: true },
      })
      if (doc) {
        anexo = {
          url: `${env.APP_URL}/api/documento/${doc.tokenAcesso}`,
          nome: `${doc.tipo.toLowerCase().replace(/_/g, '-')}-${o.numero}.pdf`,
          id: doc.id,
        }
      }
    }

    return { d, numeroBruto: o.cliente.whatsapp ?? o.cliente.telefone, ordemId: o.id, anexo }
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
      documentoId,
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

  /**
   * COM ANEXO, O TEXTO VIRA LEGENDA — e não uma segunda mensagem.
   *
   * Mandar o texto e depois o PDF são duas notificações no celular do cliente,
   * e a segunda chega sem contexto: um arquivo solto de quem ele mal conhece.
   * Como legenda, o WhatsApp mostra o documento com a frase embaixo, numa
   * mensagem só.
   *
   * Se o anexo falhar, o TEXTO AINDA SAI. Um provedor que recusa mídia — ou um
   * arquivo que sumiu — não pode fazer o cliente deixar de ser avisado de que
   * o motorista vai passar amanhã.
   */
  let r: { providerId: string | null }
  if (dados.anexo) {
    try {
      r = await enviarDocumento({
        token,
        numero,
        arquivo: dados.anexo.url,
        nomeArquivo: dados.anexo.nome,
        legenda: corpo,
      })
    } catch (e) {
      console.warn(`[fila] anexo falhou (${dados.anexo.nome}), mandando só o texto:`, e)
      r = await enviarTexto({ token, numero, texto: corpo })
    }
  } else {
    r = await enviarTexto({ token, numero, texto: corpo })
  }

  await registrarMensagem(job.tenantId, dados.ordemId, {
    numero,
    corpo,
    status: 'ENVIADA',
    providerId: r.providerId,
    template,
    // O documento que foi junto fica registrado: meses depois, "o cliente
    // recebeu o PDF?" se responde olhando a mensagem, e não deduzindo.
    documentoId: documentoId ?? dados.anexo?.id,
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
    /** O papel que esta mensagem entregou, quando ela entrega um. */
    documentoId?: string | null
  },
) {
  await comEscopo({ tenantId, userId: null, ehSuperAdmin: false }, async (tx) => {
    await tx.mensagemWhatsapp.create({
      data: {
        tenantId,
        ordemId,
        numero: dados.numero,
        template: dados.template,
        documentoId: dados.documentoId ?? null,
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
  const feito = await gerarPdfDaOrdem(job.payload as never, job.tenantId)

  /**
   * O DOCUMENTO QUE SAI SOZINHO É AVISADO AQUI, e não lá no motor.
   *
   * O aviso carrega o LINK do documento, e o link só existe depois do arquivo
   * escrito. Enfileirar o aviso junto com a geração mandaria ao cliente um
   * endereço para um papel que ainda não foi impresso — e o cliente que clica e
   * não acha nada liga para perguntar, que é o oposto do que o aviso serve.
   *
   * O aviso é um trabalho NOVO, e não uma chamada direta: assim ele tem as
   * mesmas seis tentativas e o mesmo backoff dos outros. Se o WhatsApp da
   * empresa estiver fora do ar neste minuto, a mensagem sai quando ele voltar,
   * em vez de sumir junto com este trabalho.
   */
  const p = job.payload as { ordemId?: string; enviarAoCliente?: boolean }
  if (p.enviarAoCliente && p.ordemId) {
    const empresa = job.tenantId
    await comEscopo({ tenantId: empresa, userId: null, ehSuperAdmin: false }, (tx) =>
      enfileirar(tx, empresa, {
        tipo: 'whatsapp.enviar',
        prioridade: 2,
        dedupeKey: `zap:doc:${feito.documentoId}`,
        payload: {
          ordemId: p.ordemId,
          template: 'documento.modelo',
          documentoId: feito.documentoId,
          linkDocumento: `${env.APP_URL}/api/documento/${feito.tokenAcesso}`,
        },
      }),
    )
  }
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
