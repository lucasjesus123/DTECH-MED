/**
 * O TELEFONE, E O LINK QUE ABRE A CONVERSA.
 *
 * =============================================================================
 * POR QUE ESTE ARQUIVO NASCEU
 * =============================================================================
 * `normalizarNumero` morava em `server/whatsapp/mensagens.ts`, junto dos textos
 * que o sistema manda. Só que ele não é assunto de mensagem — é assunto de
 * TELEFONE, e quem mais precisava dele eram quatro telas do painel que não
 * podem importar um módulo de servidor: arrastariam a tabela inteira de
 * modelos de texto para dentro do pacote do navegador.
 *
 * Sem ele à mão, as quatro montaram o link na unha. E erraram.
 *
 * =============================================================================
 * O DEFEITO QUE ISTO CORRIGE ESTAVA NA TELA DE TODO CLIENTE
 * =============================================================================
 * Três telas escreviam:
 *
 *     `https://wa.me/55${telefone.replace(/\D/g, '')}`
 *
 * Prefixar o 55 só está certo quando o número NÃO tem DDI. Um cadastro salvo
 * como "+55 51 98044-9274" — que é como se copia e cola de um WhatsApp —
 * vira `5551980449274`, e o prefixo produz **555551980449274**: quinze
 * dígitos, país 55 duas vezes, número inexistente.
 *
 * Medido na carteira de demonstração: QUATRO de quatro clientes com o link
 * quebrado. Ninguém percebe pelo sistema — o link existe, é azul, e o erro só
 * aparece no celular de quem clicou, já fora da tela.
 *
 * E a quarta tela (a janela da O.S.) fazia o OPOSTO: não prefixava nada. Então
 * a mesma clínica abria uma conversa diferente conforme o botão clicado — e
 * uma das duas estava sempre errada.
 *
 * =============================================================================
 * A REGRA: SE NÃO DÁ PARA DISCAR, NÃO VIRA LINK
 * =============================================================================
 * `linkDeWhatsapp` devolve `null` para o que não é discável, e a tela mostra o
 * estado apagado que ela já tem para "sem WhatsApp no cadastro". É melhor dizer
 * que não dá para chamar do que oferecer um botão que abre a conversa errada —
 * mensagem de cliente que cai na caixa de outra pessoa é vazamento de dado,
 * não engano.
 */

/**
 * Normaliza o número para o formato que se disca: só dígitos, com DDI.
 *
 * Devolve `null` quando o número não dá para discar. É melhor não enviar do
 * que enviar para o número errado.
 */
export function normalizarNumero(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  let n = bruto.replace(/\D/g, '')
  if (!n) return null

  // Sem DDI: assume Brasil, que é o caso de 100% da operação hoje.
  if (n.length === 10 || n.length === 11) n = `55${n}`
  if (!n.startsWith('55')) return n.length >= 11 && n.length <= 15 ? n : null

  const semDDI = n.slice(2)
  // Com DDD, o número nacional tem 10 (fixo) ou 11 (celular) dígitos.
  if (semDDI.length !== 10 && semDDI.length !== 11) return null

  const ddd = Number(semDDI.slice(0, 2))
  if (ddd < 11 || ddd > 99) return null

  // Validar só o DDD não basta, e isso escapou até o teste pegar: "55019804492"
  // tem 11 dígitos e DDD 55 (Santa Maria), então passava — mas o assinante
  // "019804492" começa com zero e não existe. O número seria discado e a
  // mensagem do cliente cairia na caixa de outra pessoa, o que é vazamento de
  // dado, não engano.
  const assinante = semDDI.slice(2)
  if (assinante.length === 9) {
    // Celular no Brasil sempre começa com 9 desde a migração do nono dígito.
    if (!assinante.startsWith('9')) return null
  } else {
    // Fixo começa em 2 a 5. Prefixo 0, 1, 6, 7, 8 ou 9 não é assinante válido.
    if (!/^[2-5]/.test(assinante)) return null
  }

  return n
}

/**
 * O endereço que abre a conversa no WhatsApp de quem clicou.
 *
 * `null` quando o número não é discável — a tela decide o que mostrar no lugar,
 * e todas as que usam isto já têm o estado "sem WhatsApp no cadastro".
 *
 * O texto é opcional e vai codificado. Ele NÃO substitui a integração da casa:
 * esta é a pessoa falando com o cliente do aparelho que tiver na mão; aquela é
 * o sistema avisando sozinho.
 */
export function linkDeWhatsapp(bruto: string | null | undefined, texto?: string): string | null {
  const n = normalizarNumero(bruto)
  if (!n) return null
  return texto ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/${n}`
}
