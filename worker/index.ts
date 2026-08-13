import 'dotenv/config'
import { iniciarWorker } from '../src/server/outbox/worker'

/**
 * Ponto de entrada do processo que consome a fila de automação.
 *
 * Roda separado do web de propósito: gerar PDF e falar com a API do WhatsApp
 * são operações lentas e sujeitas a travar. Dentro do processo web, um
 * provedor fora do ar viraria página que não carrega para todo mundo.
 */
iniciarWorker().catch((e) => {
  console.error('[fila] worker morreu:', e)
  process.exit(1)
})
