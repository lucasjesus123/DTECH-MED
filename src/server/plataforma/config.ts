import { cifrar, decifrar } from '@/lib/cripto'
import { comContextoPlataforma, comEscopo, type ContextoAcesso } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * A configuração da plataforma — o que é do dono do SaaS, não de uma franquia.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O BANCO VENCE A VARIÁVEL DE AMBIENTE, E NÃO O CONTRÁRIO
 * ---------------------------------------------------------------------------
 * A variável continua valendo como PISO: numa instalação nova, antes de alguém
 * abrir a tela, o sistema já tem por onde falar com a uazapi. Assim nada quebra
 * no dia do deploy, e o que já estava no ar continua no ar.
 *
 * Mas no dia em que o dono digitar o token na tela, é o que ele digitou que
 * vale — senão a tela mentiria: mostraria "configurado" enquanto o sistema
 * seguiria usando o valor velho do arquivo, e a caça a esse tipo de defeito
 * leva horas.
 */

const CHAVE_URL = 'uazapi.base_url'
const CHAVE_TOKEN = 'uazapi.admin_token'

export type ConfigWhatsapp = {
  /** O endereço em uso, venha do banco ou da variável de ambiente. */
  baseUrl: string
  /** De onde veio o endereço — a tela diz isso a quem está olhando. */
  origemUrl: 'tela' | 'ambiente'
  /** Só isto sobre o token. O valor NUNCA sai do servidor. */
  temToken: boolean
  origemToken: 'tela' | 'ambiente' | 'nenhuma'
  atualizadoEm: string | null
}

function limparUrl(u: string): string {
  return u.trim().replace(/\/+$/, '')
}

/**
 * Lê a configuração para USO — inclusive o token em claro.
 *
 * Roda na janela estreita da plataforma, e não no escopo da sessão, porque
 * quem chama pode ser o gestor de uma franquia conectando o próprio número. Ver
 * `comContextoPlataforma`.
 */
export async function configWhatsappEmUso(): Promise<{ baseUrl: string; adminToken: string | null }> {
  const linhas = await comContextoPlataforma((tx) =>
    tx.configPlataforma.findMany({ where: { chave: { in: [CHAVE_URL, CHAVE_TOKEN] } } }),
  )
  const doBanco = new Map(linhas.map((l) => [l.chave, l]))

  const url = doBanco.get(CHAVE_URL)?.valor
  const token = doBanco.get(CHAVE_TOKEN)?.valor

  return {
    baseUrl: limparUrl(url || env.UAZAPI_BASE_URL),
    // Decifrar pode falhar se a chave de criptografia do ambiente mudar. Falhar
    // alto aqui é melhor que devolver `null` calado: `null` viraria "token não
    // configurado" na tela, e alguém digitaria o token de novo achando que
    // tinha esquecido — quando o problema é outro, e no arquivo de ambiente.
    adminToken: token ? decifrar(token) : (env.UAZAPI_ADMIN_TOKEN ?? null),
  }
}

/** Lê para MOSTRAR. O token não vem junto — nem cifrado. */
export async function configWhatsappParaTela(ctx: ContextoAcesso): Promise<ConfigWhatsapp> {
  const linhas = await comEscopo(ctx, (tx) =>
    tx.configPlataforma.findMany({ where: { chave: { in: [CHAVE_URL, CHAVE_TOKEN] } } }),
  )
  const doBanco = new Map(linhas.map((l) => [l.chave, l]))
  const url = doBanco.get(CHAVE_URL)
  const token = doBanco.get(CHAVE_TOKEN)

  const datas = [url?.atualizadoEm, token?.atualizadoEm].filter(Boolean) as Date[]

  return {
    baseUrl: limparUrl(url?.valor || env.UAZAPI_BASE_URL),
    origemUrl: url ? 'tela' : 'ambiente',
    temToken: Boolean(token?.valor || env.UAZAPI_ADMIN_TOKEN),
    origemToken: token ? 'tela' : env.UAZAPI_ADMIN_TOKEN ? 'ambiente' : 'nenhuma',
    atualizadoEm: datas.length
      ? new Date(Math.max(...datas.map((d) => d.getTime()))).toISOString()
      : null,
  }
}

/** Grava. Só o dono da plataforma chega aqui — o guarda está na ação. */
export async function gravarConfigWhatsapp(
  ctx: ContextoAcesso,
  quem: string | null,
  dados: { baseUrl: string; adminToken?: string | null },
): Promise<void> {
  await comEscopo(ctx, async (tx) => {
    const url = limparUrl(dados.baseUrl)
    await tx.configPlataforma.upsert({
      where: { chave: CHAVE_URL },
      create: { chave: CHAVE_URL, valor: url, sigiloso: false, atualizadoPorId: quem },
      update: { valor: url, atualizadoPorId: quem },
    })

    // Campo de token em branco significa "não mexi nele", e não "apague".
    // Apagar por omissão é como se perde a chave da rede inteira num salvamento
    // distraído da tela de configuração.
    if (dados.adminToken && dados.adminToken.trim()) {
      const cifrado = cifrar(dados.adminToken.trim())
      await tx.configPlataforma.upsert({
        where: { chave: CHAVE_TOKEN },
        create: { chave: CHAVE_TOKEN, valor: cifrado, sigiloso: true, atualizadoPorId: quem },
        update: { valor: cifrado, atualizadoPorId: quem },
      })
    }
  })
}
