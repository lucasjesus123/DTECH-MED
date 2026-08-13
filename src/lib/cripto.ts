import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { env } from './env'

/**
 * Primitivas de criptografia do sistema.
 *
 * Regra que vale para tudo aqui: o que é comparado com entrada do usuário é
 * comparado em tempo constante. Comparação com `===` vaza, pelo tempo de
 * resposta, quantos caracteres bateram — e isso transforma adivinhação cega
 * em busca guiada.
 */

// ---------------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------------

/**
 * Argon2id com parâmetros do OWASP: 19 MiB de memória, 2 iterações, 1 thread.
 * O custo de memória é o que importa — é ele que torna caro atacar em GPU.
 */
const ARGON = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashSenha(senha: string): Promise<string> {
  return argonHash(senha, ARGON)
}

export async function conferirSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argonVerify(hash, senha, ARGON)
  } catch {
    // Hash corrompido ou de formato desconhecido não é motivo para vazar erro
    // ao usuário: para ele, é simplesmente credencial inválida.
    return false
  }
}

// ---------------------------------------------------------------------------
// Tokens de sessão e de link público
// ---------------------------------------------------------------------------

/** Token opaco, 256 bits de entropia, seguro para URL. */
export function novoToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Só o hash do token vai para o banco. Um dump vazado entrega hashes, não
 * sessões utilizáveis — e o cookie do usuário continua sendo a única cópia
 * do valor real.
 */
export function hashToken(token: string): string {
  return createHmac('sha256', Buffer.from(env.SESSION_SECRET, 'base64'))
    .update(token)
    .digest('hex')
}

export function comparaSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// ---------------------------------------------------------------------------
// Documentos (CPF/CNPJ)
// ---------------------------------------------------------------------------

/**
 * Hash cego do documento, com sal fixo do sistema.
 *
 * Serve para o portal do cliente conferir o CPF/CNPJ digitado sem varrer a
 * tabela comparando texto claro. O sal fixo é deliberado: sal por linha
 * impediria a busca, que é justamente o objetivo. A proteção aqui é contra
 * leitura casual do banco, não contra um atacante com o sal em mãos — por
 * isso o sal fica em variável de ambiente, fora do repositório.
 */
export function hashDocumento(documento: string): string {
  const limpo = documento.replace(/\D/g, '')
  return createHash('sha256').update(`${env.DOCUMENT_HASH_SALT}:${limpo}`).digest('hex')
}

// ---------------------------------------------------------------------------
// Segredos em repouso (token de instância uazapi)
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm'

/**
 * AES-256-GCM: cifra e autentica. Sem a autenticação, um atacante com acesso
 * de escrita ao banco poderia adulterar o texto cifrado e a aplicação
 * decifraria lixo sem perceber.
 *
 * Formato: iv.tag.dados, tudo em base64url.
 */
export function cifrar(texto: string): string {
  const chave = Buffer.from(env.ENCRYPTION_KEY, 'base64')
  const iv = randomBytes(12)
  const c = createCipheriv(ALGO, chave, iv)
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return [iv, tag, dados].map((b) => b.toString('base64url')).join('.')
}

export function decifrar(pacote: string): string {
  const partes = pacote.split('.')
  if (partes.length !== 3) throw new Error('Pacote cifrado em formato inesperado')
  const [iv, tag, dados] = partes.map((p) => Buffer.from(p!, 'base64url'))
  const d = createDecipheriv(ALGO, Buffer.from(env.ENCRYPTION_KEY, 'base64'), iv!)
  d.setAuthTag(tag!)
  return Buffer.concat([d.update(dados!), d.final()]).toString('utf8')
}

// ---------------------------------------------------------------------------
// Cadeia de hash da linha do tempo
// ---------------------------------------------------------------------------

/**
 * Encadeia cada evento ao anterior.
 *
 * Alterar um evento antigo obriga a recalcular todos os posteriores; apagar um
 * quebra a corrente no ponto exato. É isto que faz o histórico responder
 * "quem mexeu no quê" com valor de prova, e não apenas de anotação.
 */
export function hashEvento(entrada: {
  ordemId: string
  sequencia: number
  etapaNova: string
  tipo: string
  autorId: string | null
  criadoEm: Date
  payload: unknown
  hashAnterior: string | null
}): string {
  const canonico = JSON.stringify([
    entrada.ordemId,
    entrada.sequencia,
    entrada.etapaNova,
    entrada.tipo,
    entrada.autorId ?? '',
    entrada.criadoEm.toISOString(),
    entrada.payload === undefined ? null : entrada.payload,
    entrada.hashAnterior ?? '',
  ])
  return createHash('sha256').update(canonico).digest('hex')
}

/** SHA-256 de arquivo — prova que a foto ou o PDF não foi trocado depois. */
export function hashArquivo(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex')
}
