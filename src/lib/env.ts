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
  /**
   * Chutes de CPF no portal do cliente, por IP e por link.
   *
   * Mais folgado que o do login de propósito: ali do outro lado está um
   * cliente digitando o próprio documento no celular, não um funcionário que
   * sabe a senha de cor. Dez erros em quinze minutos é gente com dificuldade;
   * o décimo primeiro já não é.
   */
  PORTAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(15 * 60_000),
  PORTAL_RATE_LIMIT_MAX: z.coerce.number().int().default(10),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  /** Só ative atrás de proxy reverso confiável: senão o IP vira campo forjável. */
  TRUST_PROXY: z.coerce.boolean().default(false),

  /**
   * Qual empresa recebe os contatos deste site.
   *
   * Existe porque o sistema é multiempresa e o site é de uma delas. Amarrar o
   * destino a uma variável de ambiente — e não a um campo do formulário —
   * impede que alguém troque o destinatário no corpo do request e despeje
   * contatos na caixa de entrada da franquia vizinha.
   */
  SITE_TENANT_SLUG: z.string().min(1).default('dtechmed-lajeado'),
  LEAD_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(10 * 60_000),
  LEAD_RATE_LIMIT_MAX: z.coerce.number().int().default(5),
})

/**
 * Os valores de mentira que o Dockerfile usa para a construção passar.
 *
 * Eles existem porque o `next build` precisa que as variáveis obrigatórias
 * estejam preenchidas para montar as páginas pré-renderizadas, e o `.env` de
 * produção — corretamente — não entra na imagem.
 *
 * O risco de ter valores de fachada é um só, e é grave: alguém sobe a
 * aplicação a partir do estágio de construção, esquece de passar o `.env`, e
 * ela funciona. Funcionando com uma chave que está escrita num Dockerfile
 * versionado, ou seja, pública. Sessão assinada com chave conhecida é sessão
 * que qualquer um forja, e nada na tela denuncia.
 *
 * Por isso a lista é conferida em execução. Em construção eles passam; servindo
 * gente, não passam.
 */
const FACHADA = new Set([
  'Q09OU1RSVUNBTy1TRU0tU0VHUkVETy1SRUFMLTAwMDE=',
  'Q09OU1RSVUNBTy1TRU0tU0VHUkVETy1SRUFMLTAwMDI=',
  'construcao-sem-segredo-real',
])

/**
 * Estamos dentro do `next build`?
 *
 * O Next define esta variável durante a construção e não a define ao servir.
 * É o que permite ser tolerante num momento e intransigente no outro.
 */
const emConstrucao = process.env.NEXT_PHASE === 'phase-production-build'

function carregar() {
  if (!emConstrucao) {
    const usados = (['SESSION_SECRET', 'ENCRYPTION_KEY', 'DOCUMENT_HASH_SALT'] as const).filter(
      (n) => FACHADA.has(process.env[n] ?? ''),
    )
    if (usados.length > 0) {
      throw new Error(
        `Configuração inválida. O servidor não vai subir assim:\n` +
          usados.map((n) => `  • ${n}: está com o valor de fachada da construção`).join('\n') +
          '\n\nEsses valores estão escritos no Dockerfile, ou seja, são públicos. Eles servem\n' +
          'só para o `next build` terminar. Passe o .env de produção ao contêiner —\n' +
          'no compose isso é o `env_file: .env`.',
      )
    }
  }

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
