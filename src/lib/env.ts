import { z } from 'zod'

/**
 * Validação das variáveis de ambiente na partida.
 *
 * O objetivo é falhar no boot, não no meio de um atendimento. Um sistema que
 * sobe com `SESSION_SECRET` vazio parece saudável até a primeira sessão ser
 * forjada; um que se recusa a subir avisa enquanto ainda dá para corrigir.
 *
 * Nada aqui é lido pelo navegador: este módulo só roda no servidor, e não há
 * nenhuma variável com prefixo público. Segredo que chega ao bundle é segredo
 * publicado.
 */

const base64Min = (bytes: number, nome: string) =>
  z
    .string()
    .min(1, `${nome} é obrigatório`)
    .refine(
      (v) => Buffer.from(v, 'base64').length >= bytes,
      `${nome} precisa ter no mínimo ${bytes} bytes. Gere com: openssl rand -base64 ${bytes}`,
    )

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  APP_NAME: z.string().default('DTECH MED'),

  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  SESSION_SECRET: base64Min(32, 'SESSION_SECRET'),
  ENCRYPTION_KEY: base64Min(32, 'ENCRYPTION_KEY'),
  DOCUMENT_HASH_SALT: z.string().min(16, 'DOCUMENT_HASH_SALT precisa de ao menos 16 caracteres'),

  UAZAPI_BASE_URL: z.string().url().default('https://free.uazapi.com'),
  /** Chave-mestra: controla o WhatsApp de TODAS as franquias. Só servidor. */
  UAZAPI_ADMIN_TOKEN: z.string().optional(),
  UAZAPI_WEBHOOK_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),

  WORKER_ENABLED: z.coerce.boolean().default(true),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(3000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),

  /** Sem curinga. Em produção, a lista fechada dos domínios que podem chamar. */
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(15 * 60_000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().default(8),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  /** Só ative atrás de proxy reverso confiável: senão o IP vira campo forjável. */
  TRUST_PROXY: z.coerce.boolean().default(false),
})

function carregar() {
  const r = schema.safeParse(process.env)
  if (!r.success) {
    const problemas = r.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Configuração inválida. O servidor não vai subir assim:\n${problemas}\n\n` +
        'Copie .env.example para .env e preencha os campos.',
    )
  }
  return r.data
}

export const env = carregar()

export const origensPermitidas = env.ALLOWED_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export const ehProducao = env.NODE_ENV === 'production'
