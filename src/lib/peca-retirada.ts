import type { DestinoPeca } from '@/generated/prisma/enums'

/**
 * Para onde vai a peça que sai do aparelho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS RÓTULOS MORAM AQUI, E NÃO EM CADA TELA
 * ---------------------------------------------------------------------------
 * Três lugares mostram este destino: o formulário da ficha, a lista da ficha e
 * o prontuário do equipamento. Com o mapa copiado nos três, basta alguém
 * acrescentar um destino novo no banco para duas telas escreverem
 * `DESCARTE_CONTROLADO` em caixa alta e a terceira escrever direito — e o
 * defeito só aparece meses depois, na tela que ninguém abre.
 *
 * O arquivo fica em `lib` de propósito: o formulário é componente de cliente, e
 * um módulo com `'use server'` no topo só pode exportar função assíncrona.
 */
export const ROTULO_DESTINO: Record<DestinoPeca, string> = {
  DEVOLVIDA_AO_CLIENTE: 'Devolvida ao cliente',
  GUARDADA: 'Guardada aqui',
  DESCARTADA: 'Descartada',
  DESCARTE_CONTROLADO: 'Descarte controlado',
  RECICLADA: 'Reciclada',
}

/**
 * A ordem em que aparecem na lista de escolha.
 *
 * Devolver ao cliente vem primeiro porque é o que ele espera por padrão, e é o
 * que mais dá briga quando não acontece.
 */
export const DESTINOS: Array<{ valor: DestinoPeca; rotulo: string; nota?: string }> = [
  { valor: 'DEVOLVIDA_AO_CLIENTE', rotulo: ROTULO_DESTINO.DEVOLVIDA_AO_CLIENTE },
  { valor: 'GUARDADA', rotulo: ROTULO_DESTINO.GUARDADA, nota: 'fica na prateleira da assistência' },
  { valor: 'DESCARTADA', rotulo: ROTULO_DESTINO.DESCARTADA },
  {
    valor: 'DESCARTE_CONTROLADO',
    rotulo: ROTULO_DESTINO.DESCARTE_CONTROLADO,
    nota: 'resíduo de saúde, com recolhimento',
  },
  { valor: 'RECICLADA', rotulo: ROTULO_DESTINO.RECICLADA },
]
