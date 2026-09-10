import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { validarTransicao } from '@/server/ordem/maquina-estados'

/**
 * A ESTEIRA ENXUTA — 13 estados no lugar de 18, e nenhum evento a menos.
 *
 * =============================================================================
 * A REGRA QUE SUSTENTA TUDO ISTO
 * =============================================================================
 *
 *     ┌──────────────────────────────────────────────────────────────────┐
 *     │  MENOS CLIQUES, MESMA AUDITORIA.                                 │
 *     │  O front funde a EXPERIÊNCIA; o backend preserva os EVENTOS.     │
 *     └──────────────────────────────────────────────────────────────────┘
 *
 * O banco continua com as 18 etapas do `EtapaOrdem`, e o motor continua sendo a
 * lei: cada salto passa por `validarTransicao`, confere pré-condição, grava um
 * `EventoOrdem` encadeado por hash e carimba o próprio horário.
 *
 * O que muda é a TELA. Onde antes havia dois botões em sequência que ninguém
 * pensava separadamente — "concluir laudo" e depois "enviar orçamento" —, agora
 * há UM botão que dispara os dois saltos, em ordem, na mesma ação. A pessoa
 * clica uma vez; a linha do tempo continua com dois carimbos, dois autores e
 * dois horários.
 *
 * Isso importa muito mais aqui do que num sistema comum. A folha de
 * rastreabilidade conta ao cliente, ao fabricante e à vigilância sanitária
 * quantas provas existem e de que dia são. Fundir a experiência é conforto;
 * fundir o registro seria apagar prova.
 *
 * =============================================================================
 * A FUSÃO ANDA ATÉ ONDE O PAPEL ALCANÇA
 * =============================================================================
 * Nem toda fusão é legal para todo mundo, e a diferença é regra de negócio, não
 * de tela. "Aprovar conferência" é um botão só para a gestão, porque ela pode
 * dar os dois passos. Para o TÉCNICO, o segundo salto — liberar o faturamento —
 * é da gestão: o motor recusa.
 *
 * Então a fusão é ELÁSTICA. Ela caminha enquanto o motor deixa e para no
 * primeiro "não", com o rótulo do que realmente vai acontecer. O técnico vê
 * "Enviar para conferência"; a gestora vê "Aprovar conferência". Ninguém vê um
 * botão que promete o que não vai entregar, e nenhuma regra foi afrouxada para
 * caber no desenho.
 *
 * Quem decide quanto a fusão anda é sempre o motor, nunca esta lista — por isso
 * a mudança que deu ao técnico o envio do orçamento não custou uma linha aqui:
 * o botão dele passou de um salto para dois sozinho, no dia em que a transição
 * mudou.
 *
 * =============================================================================
 * OS DESVIOS NÃO SUMIRAM
 * =============================================================================
 * A esteira de 13 é o caminho FELIZ. Existem três saídas laterais — orçamento
 * recusado, devolução sem reparo e cancelamento — que a direção não lista
 * porque não são degraus do caminho. Elas estão aqui mesmo assim, marcadas como
 * desvio: uma O.S. recusada precisa aparecer em algum lugar, e o único jeito de
 * ela sumir da tela é sumir da cabeça de quem deveria resolvê-la.
 */

const E = EtapaOrdem

export type TomEstado = 'ok' | 'warn' | 'danger' | 'info' | 'pending'

export type EstadoEsteira = {
  /** A chave do estado ENXUTO — a que aparece na coluna do Kanban. */
  chave: string
  /** A posição na esteira, de 1 a 13. Desvios ficam fora da contagem. */
  passo: number | null
  rotulo: string
  /** Uma linha explicando o que está acontecendo, para quem nunca viu a tela. */
  resumo: string
  /** As etapas do banco que este estado representa. */
  etapas: EtapaOrdem[]
  tom: TomEstado
  /** Quem tem a bola agora. Texto de gente, para o chip da lista. */
  quemAge: string
  /** Saída lateral: não é degrau do caminho feliz. */
  desvio?: boolean
}

export const ESTEIRA: readonly EstadoEsteira[] = [
  {
    chave: 'ABERTA', passo: 1, rotulo: 'Aberta',
    resumo: 'A O.S. existe e ainda não tem coleta marcada.',
    etapas: [E.SOLICITACAO_RECEBIDA, E.ORDEM_RETIRADA_GERADA],
    tom: 'warn', quemAge: 'Central',
  },
  {
    chave: 'AGENDADA_COLETA', passo: 2, rotulo: 'Coleta agendada',
    resumo: 'Dia, hora e motorista marcados. O cliente já foi avisado.',
    etapas: [E.RETIRADA_AGENDADA],
    tom: 'info', quemAge: 'Motorista',
  },
  {
    chave: 'EM_ROTA_COLETA', passo: 3, rotulo: 'Em rota de coleta',
    resumo: 'O motorista saiu para buscar o aparelho.',
    etapas: [E.EM_ROTA_RETIRADA],
    tom: 'info', quemAge: 'Motorista',
  },
  {
    chave: 'COLETADO', passo: 4, rotulo: 'Coletado',
    resumo: 'Assinado pelo cliente. O aparelho está a caminho da oficina.',
    etapas: [E.COLETADO],
    tom: 'info', quemAge: 'Técnico',
  },
  {
    chave: 'NA_BANCADA', passo: 5, rotulo: 'Na bancada',
    resumo: 'Recebido e fotografado. Esperando a análise começar.',
    etapas: [E.RECEBIDO_NA_EMPRESA],
    tom: 'warn', quemAge: 'Técnico',
  },
  {
    // A FUSÃO 2 mora aqui: análise e revisão do orçamento são o mesmo trecho de
    // trabalho para quem olha de fora — o aparelho está sendo diagnosticado e o
    // preço, fechado. Continuam sendo dois carimbos no banco.
    chave: 'EM_ANALISE', passo: 6, rotulo: 'Em análise',
    resumo: 'O técnico está diagnosticando e montando o orçamento.',
    etapas: [E.EM_ANALISE, E.ORCAMENTO_INTERNO],
    tom: 'info', quemAge: 'Técnico',
  },
  {
    chave: 'ORCAMENTO_ENVIADO', passo: 7, rotulo: 'Orçamento enviado',
    resumo: 'Está no WhatsApp do cliente, esperando a resposta dele.',
    etapas: [E.ORCAMENTO_ENVIADO],
    tom: 'warn', quemAge: 'Cliente',
  },
  {
    chave: 'ORCAMENTO_APROVADO', passo: 8, rotulo: 'Aprovado',
    resumo: 'O cliente assinou. Pode pôr a mão no aparelho.',
    etapas: [E.ORCAMENTO_APROVADO],
    tom: 'ok', quemAge: 'Técnico',
  },
  {
    // FUSÃO: iniciar e concluir continuam sendo dois toques — os dois são
    // necessários, e a direção manteve os dois de propósito. O que se funde
    // aqui é a COLUNA: quem olha o quadro quer saber "está na mão do técnico",
    // não em qual dos dois instantes.
    chave: 'EM_MANUTENCAO', passo: 9, rotulo: 'Em manutenção',
    resumo: 'Serviço em execução na bancada.',
    etapas: [E.EM_MANUTENCAO, E.MANUTENCAO_CONCLUIDA],
    tom: 'info', quemAge: 'Técnico',
  },
  {
    // FUSÃO 3: conferir e liberar viraram um aval só.
    chave: 'LIBERADO_FATURAMENTO', passo: 10, rotulo: 'Liberado para faturar',
    resumo: 'A gestão conferiu. O financeiro pode cobrar.',
    etapas: [E.APROVACAO_GESTAO, E.FATURAMENTO],
    tom: 'warn', quemAge: 'Financeiro',
  },
  {
    chave: 'PAGO', passo: 11, rotulo: 'Pago',
    resumo: 'Pagamento confirmado. Liberado para a entrega.',
    etapas: [E.FATURADO],
    tom: 'ok', quemAge: 'Central',
  },
  {
    chave: 'EM_ROTA_ENTREGA', passo: 12, rotulo: 'Em rota de entrega',
    resumo: 'O motorista está levando o aparelho de volta.',
    etapas: [E.EM_ROTA_ENTREGA],
    tom: 'info', quemAge: 'Motorista',
  },
  {
    chave: 'ENTREGUE', passo: 13, rotulo: 'Entregue',
    // Quando já estava paga, a ordem chega aqui e é encerrada no mesmo
    // instante, pelo motor. O que fica esperando baixa é a entrega que ainda
    // deve — e a devolução sem reparo, que não tem o que cobrar.
    resumo: 'Assinado na porta do cliente. Se já estava paga, encerra sozinha.',
    etapas: [E.ENTREGUE, E.FINALIZADO],
    tom: 'ok', quemAge: 'Gestão',
  },

  // --- Saídas laterais -------------------------------------------------------
  {
    chave: 'RECUSADO', passo: null, rotulo: 'Orçamento recusado',
    resumo: 'O cliente não aprovou. Ou se refaz o orçamento, ou o aparelho volta.',
    etapas: [E.ORCAMENTO_REPROVADO],
    tom: 'danger', quemAge: 'Gestão', desvio: true,
  },
  {
    chave: 'DEVOLVIDO', passo: null, rotulo: 'Devolvido sem reparo',
    resumo: 'Volta para o cliente do jeito que veio.',
    etapas: [E.DEVOLVIDO_SEM_REPARO],
    tom: 'danger', quemAge: 'Motorista', desvio: true,
  },
  {
    chave: 'CANCELADA', passo: null, rotulo: 'Cancelada',
    resumo: 'Encerrada antes do fim, com motivo registrado.',
    etapas: [E.CANCELADO],
    tom: 'pending', quemAge: '—', desvio: true,
  },
] as const

/** As colunas do quadro: o caminho feliz, na ordem. */
export const COLUNAS_ESTEIRA = ESTEIRA.filter((e) => !e.desvio)

const POR_ETAPA = new Map<EtapaOrdem, EstadoEsteira>()
for (const estado of ESTEIRA) {
  for (const etapa of estado.etapas) POR_ETAPA.set(etapa, estado)
}

/**
 * O estado enxuto de uma etapa do banco.
 *
 * Nunca devolve `undefined`: o `Map` é montado a partir da própria lista, e um
 * teste confere que as 21 etapas do enum estão cobertas. Uma etapa nova sem
 * casa quebra o teste, e não a tela de alguém às onze da noite.
 */
export function estadoDaEtapa(etapa: EtapaOrdem): EstadoEsteira {
  const e = POR_ETAPA.get(etapa)
  if (e) return e
  // Rede de segurança para o dia em que alguém acrescentar uma etapa e esquecer
  // desta lista. Mostrar a etapa crua é feio; sumir com a O.S. é pior.
  return {
    chave: 'DESCONHECIDO', passo: null, rotulo: String(etapa),
    resumo: 'Etapa sem lugar na esteira.', etapas: [etapa],
    tom: 'pending', quemAge: '—', desvio: true,
  }
}

// ===========================================================================
// O BOTÃO-DA-VEZ
// ===========================================================================

/**
 * O que a tela precisa abrir ANTES de disparar os saltos.
 *
 * Um botão que só avança a etapa não serve para metade dos degraus: "Cheguei"
 * precisa de foto e assinatura, "Agendar coleta" precisa de motorista e hora,
 * "Confirmar pagamento" precisa do valor. O fluxo diz qual folha abrir; os
 * saltos acontecem no fim dela.
 *
 * `direto` é o resto: o botão avança e pronto.
 */
export type FluxoDaAcao =
  | 'direto'
  | 'agendar-coleta'
  | 'agendar-entrega'
  | 'captura-coleta'
  | 'captura-bancada'
  | 'captura-entrega'
  | 'laudo'
  | 'orcamento'
  | 'pecas'
  | 'pagamento'

export type AcaoDaVez = {
  /** Verbo no imperativo. É o que a pessoa lê no botão. */
  rotulo: string
  tom: TomEstado
  /** A sequência de saltos que este clique dispara, na ordem. */
  passos: EtapaOrdem[]
  fluxo: FluxoDaAcao
  /** `true` quando o clique dispara mais de um salto — a fusão aconteceu. */
  fundida: boolean
}

type Receita = {
  /** Os saltos, na ordem, quando o papel alcança todos. */
  passos: EtapaOrdem[]
  /** O rótulo quando a fusão inteira acontece. */
  rotulo: string
  /** O rótulo quando o papel só alcança o primeiro salto. */
  rotuloParcial?: string
  tom: TomEstado
  fluxo: FluxoDaAcao
  /**
   * Ação que NÃO avança etapa — ela prepara o terreno.
   *
   * "Agendar entrega" cria a parada do motorista e não move a O.S.: quem a move
   * é o motorista, ao sair. Sem este campo a tela não teria como oferecer o
   * agendamento, porque não há salto para validar.
   */
  papeisSemSalto?: Papel[]
}

const CENTRAL: Papel[] = [Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]

/**
 * O QUE FAZER A PARTIR DE CADA ETAPA — uma receita por etapa, e só uma.
 *
 * Esta é a fonte única da verdade do `<StageButton>`. Antes, cada tela decidia
 * sozinha que botões oferecer, e o resultado era um menu de opções em que a
 * pessoa tinha de escolher o passo certo. Aqui a escolha já foi feita: existe
 * UM próximo passo natural, e é ele que vira botão.
 *
 * Os outros caminhos possíveis (devolver, recusar, cancelar) continuam
 * existindo — eles moram no painel da O.S., como ações secundárias, e não
 * competem com o botão principal.
 */
const RECEITAS: Partial<Record<EtapaOrdem, Receita>> = {
  [E.SOLICITACAO_RECEBIDA]: {
    // A fusão mais barata da lista: gerar a ordem de retirada nunca foi uma
    // decisão, é papelada. Quem agenda quer agendar.
    passos: [E.ORDEM_RETIRADA_GERADA, E.RETIRADA_AGENDADA],
    rotulo: 'Agendar coleta',
    rotuloParcial: 'Gerar ordem de retirada',
    tom: 'info', fluxo: 'agendar-coleta',
  },
  [E.ORDEM_RETIRADA_GERADA]: {
    passos: [E.RETIRADA_AGENDADA],
    rotulo: 'Agendar coleta',
    tom: 'info', fluxo: 'agendar-coleta',
  },
  [E.RETIRADA_AGENDADA]: {
    passos: [E.EM_ROTA_RETIRADA],
    rotulo: 'Sair para coleta',
    tom: 'info', fluxo: 'direto',
  },
  [E.EM_ROTA_RETIRADA]: {
    passos: [E.COLETADO],
    rotulo: 'Cheguei',
    tom: 'ok', fluxo: 'captura-coleta',
  },
  [E.COLETADO]: {
    // FUSÃO 1: assumir + dar entrada + as 6 fotos, num fluxo só. O motor já
    // exigia MIN_6_FOTOS para este salto; o que era três telas virou uma folha.
    passos: [E.RECEBIDO_NA_EMPRESA],
    rotulo: 'Receber na bancada',
    tom: 'info', fluxo: 'captura-bancada',
  },
  [E.RECEBIDO_NA_EMPRESA]: {
    passos: [E.EM_ANALISE],
    rotulo: 'Iniciar análise',
    tom: 'info', fluxo: 'direto',
  },
  [E.EM_ANALISE]: {
    // FUSÃO 2: laudo e envio num clique, para o técnico e para a gestão.
    //
    // O técnico passou a enviar por decisão do dono — o segundo par de olhos
    // antes do envio deixou de existir, e o motivo inteiro está escrito na
    // própria transição, em `maquina-estados.ts`.
    //
    // `rotuloParcial` continua aqui: se um dia a permissão voltar a ser só da
    // gestão, o botão do técnico volta a dizer "Emitir laudo" sozinho, sem
    // ninguém tocar neste arquivo.
    passos: [E.ORCAMENTO_INTERNO, E.ORCAMENTO_ENVIADO],
    rotulo: 'Emitir laudo + orçamento',
    rotuloParcial: 'Emitir laudo',
    tom: 'info', fluxo: 'laudo',
  },
  [E.ORCAMENTO_INTERNO]: {
    passos: [E.ORCAMENTO_ENVIADO],
    rotulo: 'Enviar orçamento ao cliente',
    tom: 'info', fluxo: 'orcamento',
  },
  [E.ORCAMENTO_APROVADO]: {
    passos: [E.EM_MANUTENCAO],
    rotulo: 'Iniciar manutenção',
    tom: 'info', fluxo: 'direto',
  },
  [E.EM_MANUTENCAO]: {
    passos: [E.MANUTENCAO_CONCLUIDA],
    rotulo: 'Concluir manutenção',
    tom: 'ok', fluxo: 'pecas',
  },
  [E.MANUTENCAO_CONCLUIDA]: {
    // FUSÃO 3: conferir e liberar viraram um aval só. Os dois passos são da
    // gestão, então a fusão vale inteira para quem a alcança.
    passos: [E.APROVACAO_GESTAO, E.FATURAMENTO],
    rotulo: 'Aprovar conferência',
    rotuloParcial: 'Enviar para conferência',
    tom: 'ok', fluxo: 'direto',
  },
  [E.APROVACAO_GESTAO]: {
    passos: [E.FATURAMENTO],
    rotulo: 'Liberar para faturamento',
    tom: 'ok', fluxo: 'direto',
  },
  [E.FATURAMENTO]: {
    passos: [E.FATURADO],
    rotulo: 'Confirmar pagamento',
    tom: 'ok', fluxo: 'pagamento',
  },
  [E.FATURADO]: {
    // Não há salto: quem move a O.S. daqui é o motorista, ao sair. Este botão
    // cria a parada — e sem parada o motor recusa a saída, com razão.
    passos: [],
    rotulo: 'Agendar entrega',
    tom: 'info', fluxo: 'agendar-entrega',
    papeisSemSalto: CENTRAL,
  },
  [E.EM_ROTA_ENTREGA]: {
    passos: [E.ENTREGUE],
    rotulo: 'Cheguei',
    tom: 'ok', fluxo: 'captura-entrega',
  },
  [E.ENTREGUE]: {
    /**
     * A baixa que SOBROU para a gestão.
     *
     * A O.S. entregue com a fatura já quitada é encerrada pelo próprio motor,
     * na hora — ninguém vê este botão nela, porque ela nem chega a parar aqui.
     *
     * O que continua caindo nesta fila é a entrega que ainda tem algo a
     * decidir: a que não foi paga, e a devolução sem reparo, que chega em
     * ENTREGUE sem fatura nenhuma. Nas duas sobra uma conferência humana, e é
     * ela que este botão fecha.
     */
    passos: [E.FINALIZADO],
    rotulo: 'Dar baixa final',
    tom: 'ok', fluxo: 'direto',
  },
  [E.DEVOLVIDO_SEM_REPARO]: {
    passos: [E.EM_ROTA_ENTREGA],
    rotulo: 'Sair para devolução',
    tom: 'warn', fluxo: 'direto',
  },
  [E.ORCAMENTO_REPROVADO]: {
    passos: [E.ORCAMENTO_INTERNO],
    rotulo: 'Refazer orçamento',
    tom: 'warn', fluxo: 'orcamento',
  },
}

/**
 * O BOTÃO-DA-VEZ desta O.S. para ESTA pessoa — ou `null`, quando a bola não é
 * dela.
 *
 * =============================================================================
 * QUEM DECIDE SE PODE É O MOTOR, NÃO ESTA LISTA
 * =============================================================================
 * Nenhuma receita declara papéis para os saltos. A permissão é perguntada a
 * `validarTransicao` — a mesma função que o motor consulta na hora de executar.
 *
 * É de propósito, e é a diferença entre um botão que some e um botão que mente:
 * se a permissão fosse copiada para cá, um dia as duas listas discordariam, e o
 * jeito de descobrir seria alguém clicar num botão grande e verde e receber
 * "seu perfil não tem permissão".
 *
 * A pré-condição (foto, assinatura, peça declarada) continua sendo conferida na
 * execução, e não aqui: ela depende de dados da ordem, e esta função é pura.
 * O botão aparece; se faltar prova, o motor recusa com a frase que diz o que
 * falta — e é essa frase que a tela mostra.
 */
export function acaoDaVez(etapa: EtapaOrdem, papel: Papel): AcaoDaVez | null {
  const receita = RECEITAS[etapa]
  if (!receita) return null

  // Ação que não move a O.S.: quem autoriza é a lista da própria receita,
  // porque não há salto para o motor validar.
  if (receita.passos.length === 0) {
    const pode = papel === Papel.SUPER_ADMIN || (receita.papeisSemSalto ?? []).includes(papel)
    if (!pode) return null
    return { rotulo: receita.rotulo, tom: receita.tom, passos: [], fluxo: receita.fluxo, fundida: false }
  }

  // A fusão anda até onde o papel alcança, e para no primeiro "não".
  const permitidos: EtapaOrdem[] = []
  let de = etapa
  for (const para of receita.passos) {
    if (!validarTransicao({ de, para, papel }).ok) break
    permitidos.push(para)
    de = para
  }
  if (permitidos.length === 0) return null

  const inteira = permitidos.length === receita.passos.length
  return {
    rotulo: inteira ? receita.rotulo : (receita.rotuloParcial ?? receita.rotulo),
    tom: receita.tom,
    passos: permitidos,
    fluxo: receita.fluxo,
    fundida: permitidos.length > 1,
  }
}

/**
 * As etapas em que ESTE papel tem a bola.
 *
 * É a pergunta que o Radar faz: "o que está esperando por mim?". Sai daqui, e
 * não de uma lista escrita à mão em cada painel, porque uma lista escrita à mão
 * envelhece — muda-se a permissão de uma transição e o painel de alguém
 * continua prometendo trabalho que ela não pode mais fazer.
 */
export function etapasDoPapel(papel: Papel): EtapaOrdem[] {
  return (Object.keys(RECEITAS) as EtapaOrdem[]).filter((e) => acaoDaVez(e, papel) !== null)
}
