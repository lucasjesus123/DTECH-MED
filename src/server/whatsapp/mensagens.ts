/**
 * Os textos que o cliente recebe no WhatsApp.
 *
 * Este arquivo é puro: recebe valores já formatados e devolve string. Nenhuma
 * consulta, nenhuma data calculada aqui dentro. O motivo é direto — esse texto
 * é a cara da franquia. Se um campo trocar de nome numa refatoração e a
 * mensagem sair com "undefined" ou com uma linha vazia solta, quem paga é a
 * reputação do cliente, não a nossa build.
 *
 * Por ser puro, é coberto por teste. Ver mensagens.test.ts.
 *
 * Convenções que o teste trava:
 *   • linha condicional some da lista quando o dado não existe (.filter(Boolean)),
 *     nunca deixa linha em branco solta no meio;
 *   • valor ausente vira um texto de reserva sensato, nunca "undefined";
 *   • datas e valores chegam FORMATADOS, para a função continuar pura.
 */

export type DadosMensagem = {
  /** Nome da pessoa, não a razão social. Quem lê WhatsApp é gente. */
  contato?: string | null
  cliente: string
  equipamento?: string | null
  numeroOrdem: string | number
  /** Já formatado: "12/08 às 14h22". */
  quando?: string | null
  motorista?: string | null
  endereco?: string | null
  /** Já formatado: "R$ 1.840,00". */
  valor?: string | null
  prazo?: string | null
  garantiaDias?: number | null
  linkPortal?: string | null
  empresa: string
  motivo?: string | null
  tecnico?: string | null
  qtdFotos?: number | null
}

/** Monta o corpo juntando só as linhas que têm conteúdo. */
function montar(linhas: Array<string | null | false | undefined>): string {
  return linhas.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function saudacao(d: DadosMensagem): string {
  const nome = (d.contato ?? '').trim()
  // Sem o nome da pessoa, falamos com a empresa — mas nunca com "undefined".
  return nome ? `Oi, ${nome}!` : `Olá, ${d.cliente}!`
}

function equipamento(d: DadosMensagem): string {
  return (d.equipamento ?? '').trim() || 'seu equipamento'
}

type Construtor = (d: DadosMensagem) => string

/**
 * Um texto por transição da máquina de estados. A chave é a mesma do
 * `tipo` da transição, então adicionar uma etapa e esquecer a mensagem
 * aparece na hora: o motor não acha o template e registra o aviso.
 */
export const TEMPLATES: Record<string, Construtor> = {
  'retirada.agendada': (d) =>
    montar([
      saudacao(d),
      '',
      `Sua retirada está agendada ✅`,
      '',
      `📦 ${equipamento(d)}`,
      d.quando && `🕒 ${d.quando}`,
      d.endereco && `📍 ${d.endereco}`,
      d.motorista && `🚚 Quem vai buscar: ${d.motorista}`,
      '',
      `Qualquer imprevisto é só responder por aqui.`,
      `— ${d.empresa}`,
    ]),

  'retirada.em_rota': (d) =>
    montar([
      saudacao(d),
      '',
      `${d.motorista ? `O ${d.motorista} ` : 'Nosso motorista '}saiu para buscar ${equipamento(d)} 🚚`,
      d.quando && `Previsão de chegada: ${d.quando}.`,
      '',
      `Ordem ${d.numeroOrdem}.`,
      `— ${d.empresa}`,
    ]),

  'ordem.coletada': (d) =>
    montar([
      saudacao(d),
      '',
      `${equipamento(d)} saiu daí agora e já está vindo para a nossa assistência ✅`,
      '',
      d.motorista && `🚚 Motorista: ${d.motorista}`,
      d.endereco && `📍 ${d.endereco}`,
      d.quando && `🕒 ${d.quando}`,
      '',
      `Segue em anexo a ordem de retirada que você assinou.`,
      d.linkPortal && `Acompanhe por aqui: ${d.linkPortal}`,
      `— ${d.empresa}`,
    ]),

  'ordem.coletada_correio': (d) =>
    montar([
      saudacao(d),
      '',
      `Recebemos o aviso de que ${equipamento(d)} foi despachado 📦`,
      `Assim que chegar na assistência, a gente te confirma.`,
      '',
      `Ordem ${d.numeroOrdem}.`,
      d.linkPortal && `Acompanhe por aqui: ${d.linkPortal}`,
      `— ${d.empresa}`,
    ]),

  'ordem.recebida': (d) =>
    montar([
      saudacao(d),
      '',
      `${equipamento(d)} chegou na nossa assistência 🔧`,
      d.qtdFotos ? `Registramos ${d.qtdFotos} fotos do estado em que ele chegou.` : null,
      '',
      `O próximo passo é a análise técnica. Assim que tivermos o diagnóstico, te mandamos o orçamento.`,
      d.linkPortal && `Acompanhe por aqui: ${d.linkPortal}`,
      `— ${d.empresa}`,
    ]),

  'ordem.em_analise': (d) =>
    montar([
      saudacao(d),
      '',
      `${equipamento(d)} está em análise 🔍`,
      d.tecnico && `Quem está com ele: ${d.tecnico}.`,
      '',
      `Te mandamos o orçamento assim que o diagnóstico fechar.`,
      `— ${d.empresa}`,
    ]),

  'orcamento.enviado': (d) =>
    montar([
      saudacao(d),
      '',
      `Ficou pronto o orçamento de ${equipamento(d)} 📋`,
      '',
      d.valor && `Total: *${d.valor}*`,
      d.prazo && `Prazo: ${d.prazo}`,
      d.garantiaDias ? `Garantia: ${d.garantiaDias} dias` : null,
      '',
      `O detalhamento item a item está no PDF em anexo.`,
      d.linkPortal && `Para aprovar, é só abrir aqui:\n${d.linkPortal}`,
      '',
      `Qualquer dúvida, responde nesta conversa que a gente explica.`,
      `— ${d.empresa}`,
    ]),

  'orcamento.aprovado': (d) =>
    montar([
      saudacao(d),
      '',
      `Recebemos sua aprovação ✅`,
      `${equipamento(d)} já entrou na fila de manutenção.`,
      '',
      d.prazo && `Prazo combinado: ${d.prazo}`,
      d.garantiaDias ? `Garantia: ${d.garantiaDias} dias` : null,
      '',
      `O contrato assinado está em anexo. Avisamos quando o serviço terminar.`,
      `— ${d.empresa}`,
    ]),

  'orcamento.reprovado': (d) =>
    montar([
      saudacao(d),
      '',
      `Tudo bem, registramos que o orçamento de ${equipamento(d)} não foi aprovado.`,
      '',
      `Se quiser rever alguma coisa, é só responder aqui. Caso contrário, combinamos a devolução do equipamento.`,
      `— ${d.empresa}`,
    ]),

  'manutencao.iniciada': (d) =>
    montar([
      saudacao(d),
      '',
      `A manutenção de ${equipamento(d)} começou 🔧`,
      d.tecnico && `Técnico responsável: ${d.tecnico}.`,
      d.prazo && `Previsão de conclusão: ${d.prazo}.`,
      '',
      d.linkPortal && `Acompanhe por aqui: ${d.linkPortal}`,
      `— ${d.empresa}`,
    ]),

  'manutencao.concluida': (d) =>
    montar([
      saudacao(d),
      '',
      `Boa notícia: ${equipamento(d)} está pronto ✅`,
      `Os testes finais passaram e o serviço foi concluído.`,
      '',
      `Agora ele segue para a conferência e o faturamento. Já já combinamos a entrega.`,
      `— ${d.empresa}`,
    ]),

  'ordem.faturada': (d) =>
    montar([
      saudacao(d),
      '',
      `Pagamento confirmado, obrigado! 🙌`,
      d.valor && `Valor: ${d.valor}`,
      '',
      `${equipamento(d)} está liberado para entrega. Entramos em contato para combinar o horário.`,
      `— ${d.empresa}`,
    ]),

  'entrega.em_rota': (d) =>
    montar([
      saudacao(d),
      '',
      `${equipamento(d)} saiu para entrega 🚚`,
      d.motorista && `Quem está levando: ${d.motorista}`,
      d.quando && `Previsão: ${d.quando}`,
      d.endereco && `📍 ${d.endereco}`,
      '',
      `— ${d.empresa}`,
    ]),

  'entrega.em_rota_sem_reparo': (d) =>
    montar([
      saudacao(d),
      '',
      `${equipamento(d)} saiu para devolução 🚚`,
      d.motorista && `Quem está levando: ${d.motorista}`,
      d.quando && `Previsão: ${d.quando}`,
      '',
      `Como o orçamento não foi aprovado, ele volta sem reparo.`,
      `— ${d.empresa}`,
    ]),

  'ordem.entregue': (d) =>
    montar([
      saudacao(d),
      '',
      `Entregue! ✅`,
      `${equipamento(d)} voltou para você${d.quando ? ` em ${d.quando}` : ''}.`,
      '',
      d.garantiaDias ? `A garantia de ${d.garantiaDias} dias começa a contar hoje.` : null,
      `O comprovante assinado está em anexo.`,
      '',
      `Qualquer coisa, é só chamar aqui. Obrigado pela confiança!`,
      `— ${d.empresa}`,
    ]),

  'ordem.devolucao_sem_reparo': (d) =>
    montar([
      saudacao(d),
      '',
      `Combinado: ${equipamento(d)} será devolvido sem reparo.`,
      d.motivo && `Motivo: ${d.motivo}`,
      '',
      `Entramos em contato para agendar a devolução.`,
      `— ${d.empresa}`,
    ]),

  'ordem.cancelada': (d) =>
    montar([
      saudacao(d),
      '',
      `A ordem ${d.numeroOrdem}, de ${equipamento(d)}, foi cancelada.`,
      d.motivo && `Motivo: ${d.motivo}`,
      '',
      `Se isso não estava combinado, responde aqui que a gente verifica.`,
      `— ${d.empresa}`,
    ]),
}

/**
 * Monta a mensagem de uma transição.
 *
 * Devolve `null` quando não existe template para o tipo — assim o motor
 * registra que aquela etapa não avisa ninguém, em vez de mandar texto vazio
 * para o cliente.
 */
export function montarMensagem(tipo: string, dados: DadosMensagem): string | null {
  const t = TEMPLATES[tipo]
  if (!t) return null
  const corpo = t(dados)
  return corpo.length > 0 ? corpo : null
}

/**
 * Normaliza o número para o formato que a uazapi aceita: só dígitos, com DDI.
 *
 * Devolve `null` quando o número não dá para discar. É melhor não enviar do
 * que enviar para o número errado — mensagem de cliente que cai na caixa de
 * outra pessoa é vazamento de dado, não só engano.
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
