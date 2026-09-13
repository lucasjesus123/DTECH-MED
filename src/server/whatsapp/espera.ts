/**
 * "O WHATSAPP AINDA NÃO ESTÁ DE PÉ" — que não é o mesmo que "deu erro".
 *
 * =============================================================================
 * A PROMESSA QUE O SISTEMA FAZIA E NÃO CUMPRIA
 * =============================================================================
 * Três lugares diziam a mesma coisa a quem instala e a quem opera:
 *
 *   DEPLOY.md  · "as mensagens ficam guardadas na fila e disparam sozinhas
 *                 quando o token entrar"
 *   PROCESSOS  · "a fila funciona e acumula; ela só não tem para onde entregar"
 *   worker.ts  · "se o WhatsApp estiver fora do ar neste minuto, a mensagem
 *                 sai quando ele voltar"
 *
 * Nenhuma das três era verdade. Sem número conectado, o trabalho levantava um
 * erro comum, e erro comum gasta tentativa: 30s, 1min, 2min, 4min, 8min,
 * 16min — **em trinta e um minutos o aviso está DESCARTADO para sempre.** Não
 * é o cliente esperando o WhatsApp subir: é o cliente que nunca mais vai ser
 * avisado, e ninguém olhando.
 *
 * Isso importa fora do dia da instalação. O celular da empresa fica sem
 * bateria numa sexta à noite; na segunda de manhã a conexão volta e as
 * mensagens do fim de semana inteiro já morreram.
 *
 * =============================================================================
 * ESPERAR É DIFERENTE DE TENTAR DE NOVO
 * =============================================================================
 * Tentar de novo serve para falha passageira — rede que oscilou, provedor que
 * engasgou. Repetir resolve, e por isso a tentativa é contada e tem fim.
 *
 * Aqui não há o que repetir: falta uma coisa que só uma PESSOA pode fazer —
 * ler o QR Code. Enquanto ela não faz, tentar mil vezes rende o mesmo que
 * tentar uma. Então o trabalho marcado com este erro **espera**, de cinco em
 * cinco minutos, sem gastar tentativa nenhuma.
 *
 * =============================================================================
 * MAS ESPERAR PARA SEMPRE TAMBÉM SERIA MENTIRA
 * =============================================================================
 * "O motorista está a caminho" que chega ao cliente dois dias depois não é um
 * aviso: é uma confusão. Um aparelho que já voltou, um motorista que já passou.
 * Por isso a espera tem prazo — e quando ele vence, o trabalho é descartado
 * dizendo exatamente isso, em vez de disparar um aviso que envelheceu.
 */
export class EsperandoWhatsapp extends Error {
  constructor(readonly porque: string) {
    super(porque)
    this.name = 'EsperandoWhatsapp'
  }
}
