import { cifrar, decifrar } from '@/lib/cripto'
import { comEscopo, type ContextoAcesso, type Transacao, exigirEmpresa } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * Cliente da uazapi.
 *
 * Dois tokens, e confundi-los é o erro que custa caro:
 *
 *   admintoken → chave-mestra. Controla TODAS as instâncias de TODAS as
 *                franquias. Cria e apaga instância. Vive só em variável de
 *                ambiente, nunca no banco, nunca perto do navegador.
 *   token      → da instância. Conecta, envia, consulta status daquele número.
 *                Fica no banco, cifrado em repouso.
 *
 * O navegador jamais fala com a uazapi. Ele chama a nossa API, autenticado
 * pela sessão, e o servidor resolve qual token usar. Sem isso, o cliente A
 * dispara pelo WhatsApp do cliente B trocando um id na URL.
 */

const BASE = env.UAZAPI_BASE_URL.replace(/\/+$/, '')

class ErroUazapi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
  ) {
    super(`uazapi respondeu ${status}`)
    this.name = 'ErroUazapi'
  }
}

async function chamar<T>(
  caminho: string,
  opcoes: {
    metodo?: 'GET' | 'POST' | 'DELETE'
    corpo?: unknown
    /** Um dos dois, nunca ambos. */
    token?: string
    admin?: boolean
    timeoutMs?: number
  },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (opcoes.admin) {
    if (!env.UAZAPI_ADMIN_TOKEN) {
      throw new Error('UAZAPI_ADMIN_TOKEN não configurado — operação administrativa indisponível.')
    }
    headers.admintoken = env.UAZAPI_ADMIN_TOKEN
  } else {
    if (!opcoes.token) throw new Error('Token da instância ausente.')
    headers.token = opcoes.token
  }

  // Sem timeout, um travamento do provedor prende o worker indefinidamente e
  // a fila inteira para junto.
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), opcoes.timeoutMs ?? 20_000)

  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: opcoes.metodo ?? 'POST',
      headers,
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: ac.signal,
    })
    const texto = await r.text()
    if (!r.ok) throw new ErroUazapi(r.status, texto.slice(0, 500))
    return texto ? (JSON.parse(texto) as T) : ({} as T)
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------
// Instância (uma por franquia)
// ---------------------------------------------------------------------------

type RespostaInstancia = {
  instance?: { id?: string; token?: string; status?: string; qrcode?: string; paircode?: string }
  status?: { connected?: boolean; loggedIn?: boolean }
}

/** Cria a instância da empresa. Único ponto que usa a chave-mestra. */
export async function criarInstancia(tenantId: string, nomeEmpresa: string) {
  const r = await chamar<RespostaInstancia>('/instance/create', {
    admin: true,
    corpo: { name: `dtechmed_${tenantId}`, systemName: 'dtechmed', adminField01: tenantId },
  })
  const id = r.instance?.id
  const token = r.instance?.token
  if (!id || !token) throw new Error('uazapi não devolveu id e token da instância.')
  return { uazInstanceId: id, uazToken: token, empresa: nomeEmpresa }
}

/** Gera o QR Code para o cliente ler no celular. */
export async function conectar(token: string) {
  const r = await chamar<RespostaInstancia>('/instance/connect', { token, corpo: {} })
  let qr = r.instance?.qrcode ?? null
  // O QR vem ora como data URL, ora como base64 cru. Tratar só um dos casos
  // resulta em imagem quebrada no modal, sem erro nenhum no console.
  if (qr && !qr.startsWith('data:')) qr = `data:image/png;base64,${qr}`
  return { qrcode: qr, paircode: r.instance?.paircode ?? null }
}

export async function status(token: string) {
  const r = await chamar<RespostaInstancia & { instance?: { profileName?: string } }>(
    '/instance/status',
    { token, metodo: 'GET' },
  )
  // A verdade de "logado" é o par connected + loggedIn. O campo textual de
  // status fica desatualizado em alguns estados de transição.
  return {
    conectado: Boolean(r.status?.connected && r.status?.loggedIn),
    profileName: r.instance?.profileName ?? null,
    bruto: r.instance?.status ?? null,
  }
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

type RespostaEnvio = { id?: string; messageid?: string }

export async function enviarTexto(entrada: {
  token: string
  numero: string
  texto: string
  /** Milissegundos de "digitando…". Melhora a entrega e parece humano. */
  delayMs?: number
}): Promise<{ providerId: string | null }> {
  const r = await chamar<RespostaEnvio>('/send/text', {
    token: entrada.token,
    corpo: {
      number: entrada.numero,
      text: entrada.texto,
      linkPreview: false,
      delay: entrada.delayMs ?? 1200,
    },
  })
  return { providerId: r.id ?? null }
}

export async function enviarDocumento(entrada: {
  token: string
  numero: string
  /** URL pública assinada ou base64. */
  arquivo: string
  nomeArquivo: string
  legenda?: string
}): Promise<{ providerId: string | null }> {
  const r = await chamar<RespostaEnvio>('/send/media', {
    token: entrada.token,
    corpo: {
      number: entrada.numero,
      type: 'document',
      file: entrada.arquivo,
      docName: entrada.nomeArquivo,
      text: entrada.legenda,
      delay: 900,
    },
  })
  return { providerId: r.id ?? null }
}

/** Antes de disparo grande: o próprio WhatsApp pode estar limitando o número. */
export async function limites(token: string) {
  const r = await chamar<{ can_send_new_messages?: boolean }>('/instance/wa_messages_limits', {
    token,
    metodo: 'GET',
  })
  return { podeEnviar: r.can_send_new_messages !== false }
}

// ---------------------------------------------------------------------------
// Resolução do token da empresa
// ---------------------------------------------------------------------------

/**
 * Devolve o token da instância da empresa do contexto.
 *
 * O tenant vem da sessão no servidor, nunca de parâmetro do navegador. É esta
 * função que impede uma franquia de disparar pelo WhatsApp de outra trocando
 * um id — o RLS filtra a linha, e aqui não há como pedir a de outro tenant.
 */
export async function tokenDaEmpresa(ctx: ContextoAcesso): Promise<string | null> {
  return comEscopo(ctx, async (tx) => {
    const i = await tx.whatsappInstance.findUnique({
      where: { tenantId: exigirEmpresa(ctx) },
      select: { uazTokenCifrado: true, status: true },
    })
    if (!i?.uazTokenCifrado) return null
    return decifrar(i.uazTokenCifrado)
  })
}

/** Mesma resolução, mas para o worker, que já está numa transação com escopo. */
export async function tokenDaEmpresaNaTx(tx: Transacao, tenantId: string): Promise<string | null> {
  const i = await tx.whatsappInstance.findUnique({
    where: { tenantId },
    select: { uazTokenCifrado: true },
  })
  if (!i?.uazTokenCifrado) return null
  return decifrar(i.uazTokenCifrado)
}

export async function guardarToken(ctx: ContextoAcesso, dados: {
  uazInstanceId: string
  uazToken: string
}) {
  return comEscopo(ctx, async (tx) => {
    await tx.whatsappInstance.upsert({
      where: { tenantId: exigirEmpresa(ctx) },
      create: {
        tenantId: exigirEmpresa(ctx),
        uazInstanceId: dados.uazInstanceId,
        // Cifrado em repouso: quem lê o banco não sai enviando mensagem pelo
        // número do cliente.
        uazTokenCifrado: cifrar(dados.uazToken),
        status: 'CONECTANDO',
      },
      update: {
        uazInstanceId: dados.uazInstanceId,
        uazTokenCifrado: cifrar(dados.uazToken),
        status: 'CONECTANDO',
      },
    })
  })
}

export { ErroUazapi }
