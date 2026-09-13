import { EsperandoWhatsapp } from '@/server/whatsapp/espera'

/**
 * O QUE FAZER COM UM TRABALHO DA FILA QUE FALHOU.
 *
 * Módulo puro de propósito: sem banco, sem rede, sem variável de ambiente. A
 * regra que ele carrega é a que custou caro descobrir, e é a que precisa de
 * teste — a gravação no banco é a parte fácil, e fica no worker.
 */

/**
 * De quanto em quanto tempo um trabalho parado por falta de WhatsApp volta a
 * tentar. Cinco minutos: curto o bastante para a mensagem sair logo depois de
 * alguém ler o QR Code, longo o bastante para a fila não martelar o provedor.
 */
const ESPERA_PELO_WHATSAPP_MS = 5 * 60_000

/**
 * POR QUANTO TEMPO UM AVISO AINDA VALE A PENA SER ENVIADO.
 *
 * Doze horas. Não é um número bonito: é o turno. Um aviso que nasceu de manhã
 * e sai à noite ainda faz sentido para quem está esperando um aparelho; o que
 * nasceu ontem e sai hoje, não — "o motorista está a caminho" de um motorista
 * que já passou é pior do que silêncio, porque o cliente age em cima dele.
 *
 * Vencido o prazo, o trabalho é descartado DIZENDO ISSO. Ele não some: fica na
 * fila marcado, com o motivo escrito, e aparece em Painel → WhatsApp.
 */
const VALIDADE_DO_AVISO_MS = 12 * 60 * 60_000


export type PlanoDaFalha = {
  /** O que acontece com o trabalho. */
  destino: 'espera' | 'nova-tentativa' | 'descarte'
  /** Quantos milissegundos até ele ser pego de novo. Zero no descarte. */
  emMs: number
  /** O contador de tentativas depois desta falha. */
  tentativas: number
  /** O motivo, escrito para uma pessoa ler na tela. */
  motivo: string
}

/**
 * O QUE FAZER COM UM TRABALHO QUE FALHOU — decidido sem tocar no banco.
 *
 * Está separado para poder ser testado de verdade. A regra que ele carrega é a
 * que custou caro descobrir: **esperar e tentar de novo são coisas diferentes,
 * e tratá-las igual mata o aviso do cliente em trinta e um minutos.**
 *
 *   nova tentativa → falha passageira. Gasta tentativa, espera dobrada, e um
 *                    dia desiste. Repetir é o que resolve.
 *   espera         → falta o QR Code lido por uma pessoa, ou o celular caiu.
 *                    NÃO gasta tentativa: a que a tomada somou é devolvida.
 *                    Repetir não resolve; o tempo resolve.
 *   descarte       → estourou as tentativas, ou o aviso ficou velho demais
 *                    para ser dito. Nos dois casos com o motivo por escrito.
 */
export function planoDaFalha(
  job: { tentativas: number; maxTentativas: number; criadoEm: Date },
  erro: unknown,
  agora: Date = new Date(),
): PlanoDaFalha {
  const msg = erro instanceof Error ? erro.message : String(erro)

  if (erro instanceof EsperandoWhatsapp) {
    const idade = agora.getTime() - job.criadoEm.getTime()
    const horas = Math.round(idade / 3_600_000)
    if (idade > VALIDADE_DO_AVISO_MS) {
      return {
        destino: 'descarte',
        emMs: 0,
        // Escrito para quem abre Painel → WhatsApp, e diz as duas coisas que
        // essa pessoa precisa: que ninguém recebeu, e por quê. "Erro
        // desconhecido" a mandaria abrir o log da VPS.
        tentativas: job.tentativas,
        motivo:
          `O WhatsApp ficou ${horas}h sem conectar e este aviso venceu — ninguém ` +
          `recebeu. Reenvie pela tela se ainda fizer sentido. (${msg})`,
      }
    }
    return {
      destino: 'espera',
      emMs: ESPERA_PELO_WHATSAPP_MS,
      tentativas: Math.max(0, job.tentativas - 1),
      motivo: msg,
    }
  }

  if (job.tentativas >= job.maxTentativas) {
    return { destino: 'descarte', emMs: 0, tentativas: job.tentativas, motivo: msg }
  }

  // 30s, 1min, 2min, 4min... com teto de 30 minutos.
  return {
    destino: 'nova-tentativa',
    emMs: Math.min(30_000 * 2 ** (job.tentativas - 1), 30 * 60_000),
    tentativas: job.tentativas,
    motivo: msg,
  }
}
