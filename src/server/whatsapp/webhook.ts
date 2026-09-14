import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * O RECEPTOR DE WEBHOOK DA UAZAPI — a parte que dá para conferir sem rede.
 *
 * =============================================================================
 * NÃO EXISTE ASSINATURA HMAC, E ISSO MUDA O DESENHO
 * =============================================================================
 * O `.env` declarava `UAZAPI_WEBHOOK_SECRET` desde sempre, e o nome sugeria uma
 * assinatura: o provedor calcularia um HMAC do corpo e mandaria num cabeçalho,
 * e nós conferiríamos. **A uazapi não faz isso.** O que ela oferece é outra
 * coisa, e mais simples: a URL que ela chama é a que nós cadastramos, e o corpo
 * traz o `token` da instância.
 *
 * Então a autenticidade se prova por duas coisas independentes, e as duas
 * precisam bater:
 *
 *   1. **Um segredo na própria URL.** Quem não o conhece não acerta o endereço.
 *      É o que a documentação da uazapi recomenda, e é a única coisa que
 *      protege ANTES de olhar o corpo.
 *   2. **O `token` do corpo, conferido contra o da instância no banco.** Ele
 *      diz de qual empresa veio — e, como só nós e a uazapi o conhecemos,
 *      prova que a chamada não foi forjada por quem só descobriu a URL.
 *
 * Uma só não bastaria, e a segunda é a que vale.
 *
 * O SEGREDO DA URL APARECE EM LOG DE ACESSO — medido, não suposto: o próprio
 * servidor de desenvolvimento registrou `POST /api/whatsapp/webhook?s=...` com
 * o segredo por extenso na primeira chamada de teste. Em produção, o mesmo vale
 * para o log da portaria. E não há como evitar: a uazapi só permite configurar
 * uma URL — não aceita cabeçalho, que é onde um segredo deveria viajar.
 *
 * Então o segredo da URL é o que afasta varredura automática e sondagem, e
 * **não** é o que prova identidade. Quem prova é o `token`, que viaja no corpo,
 * fora de qualquer log, e que só nós e o provedor conhecemos. Por isso as duas
 * conferências existem, e por isso a segunda nunca pode ser dispensada.
 *
 * Trocar o segredo da URL é barato — basta reconfigurar o webhook na uazapi —,
 * e vale fazer se um log vazar.
 *
 * =============================================================================
 * A COMPARAÇÃO É DE TEMPO CONSTANTE, E NÃO É PRECIOSISMO
 * =============================================================================
 * `a === b` em string sai no primeiro caractere diferente. Quem chama o
 * endpoint milhares de vezes medindo o tempo de resposta descobre o segredo
 * caractere a caractere. `timingSafeEqual` gasta o mesmo tempo sempre.
 *
 * Módulo puro: sem banco, sem rede, sem ambiente. Testado em `webhook.test.ts`.
 */

/**
 * Compara dois segredos sem entregar o tamanho nem o conteúdo pelo relógio.
 *
 * Devolve `false` para vazio dos dois lados de propósito: um sistema sem
 * segredo configurado não pode aceitar qualquer chamada — ele tem é de recusar
 * todas, até alguém configurar.
 */
export function conferirSegredo(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false

  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  // `timingSafeEqual` exige tamanhos iguais — e o próprio tamanho é informação.
  // Comparar contra um buffer do mesmo tamanho mantém o custo constante e
  // devolve falso do mesmo jeito.
  if (a.length !== b.length) {
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * O ENVELOPE DO WEBHOOK, na forma que a uazapi realmente entrega.
 *
 * O formato é PLANO — não é `{ event, data }`, como a página genérica de
 * documentação sugere. Os campos abaixo são os confirmados em produção.
 *
 * Tudo é opcional menos o `token`, e isso é deliberado: um evento que chega com
 * um campo a mais, ou com um campo que mudou de nome, não pode derrubar o
 * receptor. O que não dá para deixar faltar é o `token`, porque sem ele não há
 * como saber de qual empresa veio — e responder a um evento sem saber de quem
 * ele é seria pior que ignorá-lo.
 */
export const envelopeUazapi = z
  .object({
    token: z.string().min(1),
    /** O nome que NÓS demos à instância ao criá-la: `dtechmed_<tenantId>`. */
    instanceName: z.string().optional(),
    /** O número da PRÓPRIA instância. Nunca é o do outro lado da conversa. */
    owner: z.string().optional(),
    message: z
      .object({
        messageid: z.string().optional(),
        fromMe: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose()

export type EnvelopeUazapi = z.infer<typeof envelopeUazapi>

/**
 * De qual empresa este evento veio, pelo nome da instância.
 *
 * O nome é montado por nós em `criarInstancia` como `dtechmed_<tenantId>`, e
 * volta no webhook. Isso dá o caminho direto até a linha certa — sem varrer
 * todas as instâncias decifrando token uma a uma, que é O(empresas) em cada
 * chamada e não escala numa franquia com cem lojas.
 *
 * `null` quando o nome não veio ou não segue o padrão; aí quem chama cai no
 * caminho lento, que ainda funciona.
 */
export function empresaDoNome(instanceName: string | undefined): string | null {
  if (!instanceName) return null
  const m = /^dtechmed_([A-Za-z0-9_-]{1,64})$/.exec(instanceName)
  return m ? m[1]! : null
}
