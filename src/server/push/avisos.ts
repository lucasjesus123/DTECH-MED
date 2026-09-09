import webpush from 'web-push'
import { env } from '@/lib/env'
import type { Transacao } from '@/lib/db'

/**
 * O AVISO QUE CHEGA NO CELULAR DE QUEM ESTÁ NA RUA.
 *
 * =============================================================================
 * O QUE FALTAVA
 * =============================================================================
 * O processo escrito pelo dono diz, no passo 5: *"já vai para o app do
 * motorista (calendário e notificação)"*. O calendário existia. A notificação
 * não existia em linha nenhuma do código — procurei por `Notification`,
 * `pushManager` e `showNotification` no projeto inteiro e não havia nada.
 *
 * O efeito prático: a central marcava a corrida, o aparelho do cliente ficava
 * esperando, e o motorista só descobria se abrisse o aplicativo por vontade
 * própria. Ele está dirigindo.
 *
 * =============================================================================
 * POR QUE WEB PUSH, E NÃO WHATSAPP PARA O MOTORISTA
 * =============================================================================
 * A fila de WhatsApp já existe e seria mais barata de usar. Só que ela depende
 * do `UAZAPI_ADMIN_TOKEN`, que hoje está vazio em produção: um aviso por ali
 * nasceria mudo, exatamente como os avisos ao cliente estão mudos. O push não
 * depende de nada além do navegador do próprio motorista.
 *
 * =============================================================================
 * ELE É OPCIONAL, E DESLIGADO NÃO QUEBRA NADA
 * =============================================================================
 * Sem `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`, `ligado()` devolve falso, o
 * aplicativo não oferece o botão e diz por escrito que o aviso não está ligado
 * nesta empresa. Nenhuma tela quebra, nenhum job falha em laço.
 */

/** O par de chaves está configurado? É o interruptor de todo este módulo. */
export function ligado(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

/** A chave pública, que o navegador precisa para se inscrever. */
export function chavePublica(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null
}

let configurado = false
function configurar() {
  if (configurado || !ligado()) return
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  configurado = true
}

export type Aviso = {
  titulo: string
  corpo: string
  /** Para onde o toque na notificação leva. Caminho interno, começando com /. */
  destino: string
  /**
   * A ETIQUETA QUE IMPEDE A AVALANCHE.
   *
   * Duas notificações com a mesma etiqueta se substituem no aparelho em vez de
   * empilhar. A central que remarca a mesma parada três vezes em cinco minutos
   * deixa UM aviso na tela, o último — e não três, que é o que faz alguém
   * desligar a notificação do aplicativo para sempre.
   */
  etiqueta?: string
}

export type ResultadoEnvio = {
  enviados: number
  /** Endpoints que o fabricante recusou de vez: o aparelho não existe mais. */
  mortos: string[]
  /** Endpoints que falharam por outro motivo — sinal, servidor fora do ar. */
  falharam: string[]
}

/**
 * Manda o aviso para todos os aparelhos de uma pessoa.
 *
 * NÃO recebe `tx`: o envio é rede, e rede dentro de transação é o jeito de
 * segurar uma conexão de banco aberta esperando o servidor da Apple responder.
 * Quem chama grava o resultado depois, com a transação já fechada.
 */
export async function enviarAviso(
  inscricoes: Array<{ endpoint: string; p256dh: string; auth: string }>,
  aviso: Aviso,
): Promise<ResultadoEnvio> {
  const saida: ResultadoEnvio = { enviados: 0, mortos: [], falharam: [] }
  if (!ligado() || inscricoes.length === 0) return saida
  configurar()

  const corpo = JSON.stringify(aviso)

  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          corpo,
          // TTL de duas horas: um aviso de corrida que chega no dia seguinte,
          // porque o celular ficou desligado, é pior que aviso nenhum — a
          // pessoa vai até um endereço onde ninguém a espera mais.
          { TTL: 7200, urgency: 'high' },
        )
        saida.enviados++
      } catch (e: unknown) {
        /**
         * 404 e 410 são o fabricante dizendo "este aparelho não existe mais":
         * o aplicativo foi desinstalado, ou a inscrição foi revogada. A linha
         * é apagada por quem chamou — insistir com ela é gastar tentativa para
         * sempre num endereço que nunca mais vai responder.
         */
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) saida.mortos.push(i.endpoint)
        else saida.falharam.push(i.endpoint)
      }
    }),
  )

  return saida
}

/** Os aparelhos de uma pessoa, dentro do escopo já aberto pelo chamador. */
export async function aparelhosDe(tx: Transacao, usuarioId: string) {
  return tx.pushInscricao.findMany({
    where: { usuarioId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
}
