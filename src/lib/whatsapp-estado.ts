/**
 * "O WHATSAPP DA EMPRESA ESTÁ NO AR?" — a resposta, num lugar só.
 *
 * =============================================================================
 * POR QUE ISTO É UMA FUNÇÃO, E NÃO UMA COMPARAÇÃO ESCRITA EM CADA TELA
 * =============================================================================
 * O estado chega como texto — a consulta devolve `status: string`, porque ela
 * também precisa carregar um valor sintético (`SEM_INSTANCIA`) que não existe no
 * enum do banco. Texto solto não avisa quando alguém erra.
 *
 * E alguém errou: duas telas compararam com `'CONECTADO'`, no masculino, quando
 * o enum é `CONECTADA`. O TypeScript não reclamou (os dois lados eram `string`),
 * a tela não quebrou, e o resultado era o pior tipo de defeito deste sistema —
 * o selo da barra dizia "WhatsApp fora do ar" o tempo todo, inclusive com o
 * número perfeitamente conectado.
 *
 * Um selo de alarme que grita todo dia deixa de ser alarme em uma semana. No dia
 * em que o número caísse de verdade, ninguém olharia.
 *
 * Com a função, a comparação existe uma vez e o nome dela diz o que ela
 * responde. As telas perguntam; elas não conferem string.
 */

/** O valor que a consulta inventa quando a empresa nunca conectou um número. */
export const SEM_INSTANCIA = 'SEM_INSTANCIA'

/**
 * O número está conectado e falando com o mundo?
 *
 * Comparação sem diferenciar maiúsculas de propósito: o valor atravessa banco,
 * webhook do provedor e uma coluna de texto, e nenhum desses três é lugar onde
 * se queira depender da caixa das letras.
 */
export function whatsappNoAr(status: string | null | undefined): boolean {
  return (status ?? '').toUpperCase() === 'CONECTADA'
}

/** Uma frase de gente para o estado, para a tela não mostrar o valor cru. */
export function rotuloDoWhatsapp(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'CONECTADA':
      return 'No ar'
    case 'CONECTANDO':
      return 'Conectando'
    case 'DESCONECTADA':
      return 'Fora do ar'
    case 'ERRO':
      return 'Com erro'
    case SEM_INSTANCIA:
      return 'Sem número'
    default:
      return 'Desconhecido'
  }
}
