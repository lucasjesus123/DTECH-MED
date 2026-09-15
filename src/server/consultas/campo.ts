import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { diaLocal, horaLocal, janelaDoDia } from '@/lib/datas'
import { ROTULO_ETAPA, TERMINAIS } from '@/server/ordem/maquina-estados'
import { NIVEL } from '@/server/auth/guarda'

/**
 * Consultas dos apps de campo.
 *
 * A regra que vale para as duas: **cada um só enxerga o que é dele**. O filtro
 * por motorista não é conforto de tela — um entregador fechando a parada de
 * outro bagunça a operação e a comissão. E a restrição vive aqui, no servidor,
 * não num filtro do componente.
 */

export type Parada = {
  id: string
  ordemId: string
  /** De quem é a parada. Só o modo gestão desenha isto. */
  motorista: string | null
  tipo: 'RETIRADA' | 'ENTREGA'
  numero: number
  cliente: string
  contato: string | null
  telefone: string | null
  equipamento: string
  endereco: string
  referencia: string | null
  /**
   * O RECADO QUE A CENTRAL ESCREVE E O MOTORISTA NUNCA VIA.
   *
   * O formulário de marcar a parada tem um campo "Recado para o motorista", com
   * o exemplo "Levar carrinho, estacionar nos fundos". Ele era gravado em
   * `agendamentos.observacoes` e parava ali: nenhuma tela do aplicativo lia esta
   * coluna. Quem escrevia achava que estava avisando; quem precisava do aviso
   * chegava sem ele, e descobria o carrinho na hora de carregar.
   */
  observacoes: string | null
  /**
   * Com quem falar NAQUELE endereço — congelado na parada, não no cadastro.
   *
   * A tela usava o contato do CLIENTE, que muitas vezes é outra pessoa: quem
   * assina o contrato não é quem abre a porta do depósito. A parada tem os
   * dados de quem está lá, e são eles que servem para tocar a campainha.
   */
  contatoDaParada: string | null
  telefoneDaParada: string | null
  previstoPara: Date
  /** O fim da janela combinada — "entre 14h e 17h" — quando existe. */
  janelaFim: Date | null
  status: string
  concluida: boolean
  atrasada: boolean
  /** Já saiu para esta parada? É o que decide qual botão a tela oferece. */
  emRota: boolean
  /**
   * Quando o motorista aceitou esta corrida — nulo enquanto ele não aceitou.
   *
   * É o que separa "a central marcou" de "ele vai". Enquanto for nulo, o
   * aplicativo não oferece nem a saída nem a chegada, e a `sairParaParada`
   * recusa no servidor.
   *
   * Paradas de antes desta regra têm nulo aqui e continuam nulas — inventar um
   * aceite retroativo seria escrever no passado de alguém. Por isso a tela só
   * cobra o aceite de quem TEM motorista designado E ainda não saiu: a corrida
   * antiga que já está na rua não volta a pedir permissão.
   */
  aceitoEm: Date | null
  /** De quem é a parada, para a tela saber se é do próprio motorista. */
  motoristaId: string | null
}

/**
 * As paradas do dia, na ordem da rota.
 *
 * =============================================================================
 * `motoristaId: null` É O MODO GESTÃO, E NÃO UM DESCUIDO
 * =============================================================================
 * Quem administra a empresa precisava ver o aplicativo de campo e não
 * conseguia: a tela recusava qualquer papel que não fosse MOTORISTA, e mesmo
 * atravessando essa recusa ela mostraria a rota DELE — que é vazia, porque ele
 * não dirige.
 *
 * O efeito prático era que ninguém acima do motorista sabia o que o aplicativo
 * mostra. Não dava para conferir se uma parada chegou, não dava para explicar
 * por telefone o que o motorista está vendo, e não dava para descobrir que o
 * endereço saiu errado antes de o cliente reclamar.
 *
 * Com `null`, vêm as paradas de TODA a empresa, e cada uma diz de quem é. É
 * leitura: quem age na parada continua sendo o motorista dela, porque a máquina
 * de estados confere o dono na hora da assinatura — não é a tela que decide
 * isso, e por isso abrir a tela não abre a ação.
 */
export async function rotaDoDia(
  ctx: ContextoAcesso,
  motoristaId: string | null,
): Promise<Parada[]> {
  // A janela do dia DE LAJEADO, e não a do fuso do processo. Ver `@/lib/datas`:
  // com `setHours` numa máquina em UTC, o "dia" corria das 21h às 21h e a rota
  // perdia toda parada marcada para depois das 21h.
  const { inicio, fim } = janelaDoDia()

  const ags = await comEscopo(ctx, (tx) =>
    tx.agendamento.findMany({
      where: {
        // Sem motorista: a rota da empresa inteira (modo gestão).
        ...(motoristaId ? { motoristaId } : {}),
        previstoPara: { gte: inicio, lt: fim },
        /**
         * A PARADA SEM DONO APARECE NO MODO GESTÃO — e não aparecia.
         *
         * `PENDENTE` é o status de uma parada marcada para a qual ninguém foi
         * designado. Para o MOTORISTA ela não é dele, e continua fora: seria
         * trabalho de outra pessoa na tela de quem está dirigindo.
         *
         * Para quem GERENCIA é o contrário — a parada sem motorista é
         * exatamente a que precisa de decisão hoje, e era a única que a tela
         * escondia. O efeito medido: a empresa com uma retirada marcada e sem
         * ninguém designado abria o aplicativo em modo gestão e lia "nenhuma
         * parada agendada para hoje". A parada existia, estava no calendário, e
         * o aplicativo dizia que o dia estava vazio.
         */
        status: motoristaId
          ? { in: ['ATRIBUIDO', 'EM_ROTA', 'CONCLUIDO'] }
          : { in: ['PENDENTE', 'ATRIBUIDO', 'EM_ROTA', 'CONCLUIDO'] },
      },
      orderBy: [{ posicaoRota: 'asc' }, { previstoPara: 'asc' }],
      include: {
        ordem: {
          include: {
            cliente: { select: { nome: true, contatoNome: true, telefone: true, whatsapp: true } },
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
        // Só interessa no modo gestão, onde a lista mistura motoristas.
        motorista: { select: { nome: true } },
      },
    }),
  )

  const agora = Date.now()
  return ags.map((a) => ({
    id: a.id,
    ordemId: a.ordemId,
    motorista: a.motorista?.nome ?? null,
    motoristaId: a.motoristaId,
    aceitoEm: a.aceitoEm,
    tipo: a.tipo as 'RETIRADA' | 'ENTREGA',
    numero: a.ordem.numero,
    cliente: a.ordem.cliente.nome,
    contato: a.ordem.cliente.contatoNome,
    // O da PARADA na frente: é o número de quem está no local. O do cadastro
    // fica de reserva, para a parada antiga que não tem contato próprio.
    telefone: a.contatoTelefone ?? a.ordem.cliente.whatsapp ?? a.ordem.cliente.telefone,
    equipamento: `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`.trim(),
    endereco: a.enderecoSnapshot,
    referencia: a.pontoReferencia,
    observacoes: a.observacoes,
    contatoDaParada: a.contatoNome,
    telefoneDaParada: a.contatoTelefone,
    previstoPara: a.previstoPara,
    janelaFim: a.janelaFim,
    status: a.status,
    concluida: a.status === 'CONCLUIDO',
    atrasada: a.status !== 'CONCLUIDO' && a.previstoPara.getTime() < agora,
    // A verdade está na etapa da ordem, não no status do agendamento: é ela
    // que a máquina de estados consulta na hora de aceitar a assinatura.
    emRota:
      a.ordem.etapa === 'EM_ROTA_RETIRADA' || a.ordem.etapa === 'EM_ROTA_ENTREGA',
  }))
}

/** A ordem de uma parada, já conferindo que ela pertence a este motorista. */
export async function paradaDoMotorista(ctx: ContextoAcesso, motoristaId: string, ordemId: string) {
  return comEscopo(ctx, async (tx) => {
    const ag = await tx.agendamento.findFirst({
      where: { ordemId, motoristaId, status: { in: ['ATRIBUIDO', 'EM_ROTA'] } },
      include: {
        ordem: {
          include: {
            cliente: true,
            equipamento: true,
            assinaturas: { select: { tipo: true } },
            // Quantas fotos de campo já subiram, para a tela não pedir de novo
            // as que a pessoa já tirou.
            fotos: { select: { categoria: true } },
          },
        },
      },
    })
    // Nulo tanto para ordem inexistente quanto para ordem de outro motorista:
    // quem tenta o id alheio não descobre sequer que ele existe.
    return ag
  })
}

/**
 * A MESMA PARADA, PELOS OLHOS DE QUEM ADMINISTRA.
 *
 * =============================================================================
 * O DEFEITO QUE ELA CONSERTA
 * =============================================================================
 * A queixa do dono, com print da agenda do aplicativo aberta:
 *
 *     "quando clica aqui joga pro sistema (não poderia, esse é o APP)"
 *
 * Ele está certo, e o caminho até ali tinha sido construído pela metade. A
 * agenda do aplicativo passou a ter MODO GESTÃO: quem administra abre e vê a
 * rua inteira, todas as paradas de todos os motoristas. Foi decisão tomada e
 * escrita — "a resposta certa não era mandar embora, era responder".
 *
 * Só que o cartão dessa agenda leva à página da parada, e ELA continuava
 * fechada: `if (papel !== MOTORISTA && papel !== SUPER_ADMIN) redirect('/painel')`.
 * Um toque no cartão e o administrador era cuspido do aplicativo para dentro do
 * painel — no meio do celular, sem aviso.
 *
 * `paradaDoMotorista` filtra por `motoristaId` de propósito: é o que faz um
 * motorista não alcançar a parada de outro pelo id. Essa trava fica de pé. O
 * que muda é que existe uma segunda porta, para quem administra, SEM esse
 * filtro — porque para a gestão ver a rua inteira é justamente o trabalho.
 *
 * O RLS continua sendo o chão de tudo: fora da empresa não há linha nenhuma.
 */
export async function paradaDaGestao(ctx: ContextoAcesso, ordemId: string) {
  return comEscopo(ctx, (tx) =>
    tx.agendamento.findFirst({
      where: { ordemId, status: { in: ['ATRIBUIDO', 'EM_ROTA'] } },
      include: {
        motorista: { select: { nome: true } },
        ordem: {
          include: {
            cliente: true,
            equipamento: true,
            assinaturas: { select: { tipo: true } },
            fotos: { select: { categoria: true } },
          },
        },
      },
    }),
  )
}

export type NaBancada = {
  ordemId: string
  numero: number
  etapa: EtapaOrdem
  cliente: string
  equipamento: string
  numeroSerie: string | null
  defeito: string
  fotosRecebimento: number
  desdeQuando: Date
}

/**
 * A fila do técnico.
 *
 * Inclui o que está chegando (para dar entrada) e o que já está com ele. Um
 * técnico vê o trabalho da oficina inteira de propósito: diferente do
 * motorista, aqui a bancada é compartilhada e esconder atrapalha.
 */
export async function bancada(ctx: ContextoAcesso, tecnicoId: string): Promise<NaBancada[]> {
  const ordens = await comEscopo(ctx, (tx) =>
    tx.ordem.findMany({
      where: {
        OR: [
          { etapa: { in: [EtapaOrdem.COLETADO, EtapaOrdem.RECEBIDO_NA_EMPRESA] } },
          {
            tecnicoId,
            etapa: {
              in: [EtapaOrdem.EM_ANALISE, EtapaOrdem.ORCAMENTO_APROVADO, EtapaOrdem.EM_MANUTENCAO],
            },
          },
        ],
      },
      orderBy: { atualizadoEm: 'asc' },
      include: {
        cliente: { select: { nome: true } },
        equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
        _count: { select: { fotos: true } },
      },
    }),
  )

  const contagens = await comEscopo(ctx, (tx) =>
    tx.foto.groupBy({
      by: ['ordemId'],
      where: { ordemId: { in: ordens.map((o) => o.id) }, categoria: 'RECEBIMENTO' },
      _count: { _all: true },
    }),
  )
  const porOrdem = new Map(contagens.map((c) => [c.ordemId, c._count._all]))

  return ordens.map((o) => ({
    ordemId: o.id,
    numero: o.numero,
    etapa: o.etapa,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    numeroSerie: o.equipamento.numeroSerie,
    defeito: o.defeitoRelatado,
    fotosRecebimento: porOrdem.get(o.id) ?? 0,
    desdeQuando: o.atualizadoEm,
  }))
}

/**
 * A AGENDA DE QUEM TRABALHA NA RUA E NA BANCADA — a semana dela, não o dia.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É A MESMA COISA QUE A TELA DE HOJE
 * =============================================================================
 * O aplicativo abre no HOJE de propósito: quem está na rua com uma mão só
 * precisa da próxima parada, não de um calendário. Só que hoje era tudo o que
 * existia, e o efeito é uma pessoa que não consegue responder a pergunta mais
 * banal do trabalho dela — "amanhã eu tenho o quê?". Para saber, tinha de ligar
 * para a central.
 *
 * =============================================================================
 * O MOTORISTA E O TÉCNICO NÃO TÊM A MESMA AGENDA, E FORÇAR ISSO SERIA MENTIR
 * =============================================================================
 * A agenda do motorista é feita de PARADAS: hora marcada, endereço, alguém
 * esperando. A do técnico é feita de PRAZOS: a ordem não tem hora, tem um dia
 * em que precisa estar pronta. Espremer as duas no mesmo formato daria ao
 * técnico uma agenda de compromissos que ele não tem, e ao motorista uma lista
 * de prazos que não diz para onde ir.
 *
 * Então cada um recebe o que é dele, e o tipo de item diz qual é qual.
 *
 * O atrasado vem junto, e vem primeiro: prazo vencido não é passado, é a coisa
 * mais urgente que aquela pessoa tem.
 */
export type ItemDaAgenda = {
  id: string
  /**
   * A ordem a que este compromisso leva — NULO na visita preventiva que ainda
   * não virou O.S.
   *
   * A visita nasce do contrato e só ganha ordem quando alguém aperta "gerar a
   * ordem". Entre marcar e gerar existe um intervalo real, e é justamente nele
   * que o técnico precisa saber que tem visita na quarta. Forçar um id aqui
   * obrigaria a inventar uma O.S. que ninguém abriu.
   */
  ordemId: string | null
  /** 'AAAA-MM-DD' em Lajeado — a chave que agrupa a tela. */
  dia: string
  /** 'HH:MM' quando existe hora marcada; o prazo do técnico não tem. */
  hora: string | null
  tipo: 'RETIRADA' | 'ENTREGA' | 'PRAZO' | 'PREVENTIVA'
  /** Nº da O.S. na parada e no prazo; nº do CONTRATO na visita preventiva. */
  numero: number
  cliente: string
  equipamento: string
  /** Endereço só na parada — prazo de bancada não tem para onde ir. */
  endereco: string | null
  etapaRotulo: string
  /** Passou da data e continua em aberto. */
  atrasado: boolean
  /**
   * De quem é o compromisso. Só o modo gestão desenha.
   *
   * Nulo numa parada é a PARADA SEM DONO — que para quem gerencia não é um
   * campo vazio, é a linha que precisa de decisão hoje.
   */
  motorista: string | null
}

/**
 * QUANTOS DIAS A AGENDA DE CAMPO OLHA PARA A FRENTE.
 *
 * Exportado porque a TELA escreve este número por extenso ("próximos 14 dias"),
 * em três lugares. Enquanto ele vivia só aqui, mudar a janela deixava a tela
 * prometendo um prazo e a consulta devolvendo outro — e ninguém veria, porque
 * as duas continuariam "funcionando".
 */
export const DIAS_DA_AGENDA = 14

export async function agendaDeCampo(
  ctx: ContextoAcesso,
  papel: Papel,
  userId: string,
  dias = DIAS_DA_AGENDA,
): Promise<ItemDaAgenda[]> {
  const { inicio } = janelaDoDia()
  /**
   * O ÚLTIMO DIA ENTRA INTEIRO.
   *
   * `inicio + dias` termina à MEIA-NOITE do 14º dia, e isso deixava o dia 14
   * de fora por completo: no dia 15, uma visita marcada para o dia 29 às 8h30
   * não aparecia, e a tela dizia "0 compromissos" prometendo "próximos 14
   * dias". Um dia de diferença é pouco no calendário e é tudo para quem tem uma
   * visita marcada: o técnico só descobriria na véspera.
   *
   * Com `+ 1` a janela vai até a meia-noite SEGUINTE, então o 14º dia cabe
   * inteiro — inclusive um compromisso às 23h.
   */
  const fim = new Date(inicio.getTime() + (dias + 1) * 86_400_000)
  const agora = new Date()

  /**
   * O MODO GESTÃO DA AGENDA — que não existia, e era o buraco.
   *
   * ===========================================================================
   * O QUE ACONTECIA
   * ===========================================================================
   * Quem administra não é MOTORISTA, então caía no ramo do TÉCNICO e a consulta
   * perguntava por `tecnicoId: <ele>` — que é vazio, porque ele não conserta.
   * A Agenda abria sem nada e um aviso mandava ir ao Calendário do painel.
   *
   * O efeito, na voz de quem usa: *"eu abri uma O.S., vinculei um motorista, e
   * ela não aparece aqui"*. A parada existia, tinha dono e tinha data. O
   * aplicativo simplesmente nunca perguntou por ela.
   *
   * ===========================================================================
   * POR QUE MANDAR PARA O CALENDÁRIO NÃO RESOLVIA
   * ===========================================================================
   * O calendário do painel mostra a empresa inteira — visita, compromisso,
   * vencimento. Quem abre o aplicativo de campo em modo gestão está fazendo
   * OUTRA pergunta: *o que a minha rua tem pela frente, e com quem está?* É a
   * pergunta do motorista, feita por quem coordena os motoristas, e a resposta
   * é a agenda deles — não uma terceira tela com outro recorte.
   *
   * Então gestão vê a agenda de TODOS, com o nome de quem vai em cada linha e
   * a parada sem dono aparecendo como tal. É leitura: agir na parada continua
   * sendo de quem está na rua, porque a máquina de estados confere o dono na
   * hora da assinatura.
   */
  const gerencia = NIVEL[papel] >= NIVEL[Papel.GESTOR]

  if (papel === Papel.MOTORISTA || gerencia) {
    const paradas = await comEscopo(ctx, (tx) =>
      tx.agendamento.findMany({
        where: {
          // Gestão não filtra por dono: vem a rua inteira.
          ...(gerencia ? {} : { motoristaId: userId }),
          /**
           * A AGENDA É O QUE VEM PELA FRENTE — e a concluída saiu dela.
           *
           * Ela listava também as paradas já cumpridas que caíssem na janela de
           * 14 dias, o que na prática significa TODAS as de hoje. Num dia com 30
           * entregas feitas, a pergunta "o que eu tenho amanhã?" era respondida
           * com trinta cartões de ontem à frente da resposta.
           *
           * Parada concluída não é compromisso: é histórico. Ela continua a um
           * toque de distância na tela da Rota, no bloco recolhido das
           * concluídas de hoje, que é onde alguém procura por ela.
           */
          status: { notIn: ['CANCELADO', 'CONCLUIDO'] },
          // O atrasado entra pela porta de baixo: sem `gte`, tudo o que ficou
          // para trás e não foi concluído continua aparecendo.
          OR: [
            { previstoPara: { gte: inicio, lt: fim } },
            { previstoPara: { lt: inicio } },
          ],
        },
        orderBy: [{ previstoPara: 'asc' }],
        take: 200,
        select: {
          id: true,
          tipo: true,
          status: true,
          previstoPara: true,
          janelaInicio: true,
          enderecoSnapshot: true,
          motorista: { select: { nome: true } },
          ordem: {
            select: {
              id: true,
              numero: true,
              etapa: true,
              cliente: { select: { nome: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          },
        },
      }),
    )

    return paradas.map((a) => ({
      id: a.id,
      ordemId: a.ordem.id,
      dia: diaLocal(a.previstoPara),
      /**
       * A hora sai de `janelaInicio`, com `previstoPara` de reserva.
       *
       * As duas são preenchidas juntas quando a parada nasce no formulário de
       * agendar. Mas `previstoPara` é obrigatória e `janelaInicio` é opcional —
       * então uma parada criada por qualquer outro caminho (importação, script,
       * código futuro) tinha hora no banco e aparecia aqui como "sem hora
       * combinada". Ler a obrigatória como reserva custa nada e fecha o buraco.
       */
      hora: horaLocal(a.janelaInicio ?? a.previstoPara),
      tipo: a.tipo as 'RETIRADA' | 'ENTREGA',
      numero: a.ordem.numero,
      cliente: a.ordem.cliente.nome,
      equipamento: `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`.trim(),
      endereco: a.enderecoSnapshot,
      etapaRotulo: ROTULO_ETAPA[a.ordem.etapa] ?? a.ordem.etapa,
      atrasado: a.status !== 'CONCLUIDO' && a.previstoPara < agora,
      motorista: a.motorista?.nome ?? null,
    }))
  }

  /**
   * TÉCNICO — o que ele tem para entregar, e quando.
   *
   * ===========================================================================
   * A VISITA PREVENTIVA ENTRA AQUI, e antes não entrava
   * ===========================================================================
   * Esta consulta perguntava só por ORDEM com `tecnicoId` e prazo. A visita
   * preventiva tem responsável, dia e hora — e não é ordem nenhuma até alguém
   * apertar "gerar a ordem". Resultado: a central marcava a revisão da autoclave
   * para a quarta, escolhia o técnico, avisava o cliente no WhatsApp — e o
   * aplicativo do técnico escolhido dizia "0 compromissos".
   *
   * O erro não era da preventiva: ela gravava tudo certo, e o calendário do
   * painel mostrava. Era desta consulta, que nunca perguntou. Quem descobriria
   * o buraco é o cliente, na quarta, ligando para saber por que ninguém foi.
   *
   * Só as AGENDADAS: a PREVISTA é projeção do contrato, não tem dia combinado
   * nem dono, e encher a agenda de alguém com datas que ninguém marcou é pior
   * que a agenda vazia.
   */
  const [ordens, visitas] = await comEscopo(ctx, (tx) =>
    Promise.all([
      tx.ordem.findMany({
      where: {
        tecnicoId: userId,
        etapa: { notIn: TERMINAIS },
        prazoPrometido: { not: null, lt: fim },
      },
        orderBy: [{ prazoPrometido: 'asc' }],
        take: 200,
        select: {
          id: true,
          numero: true,
          etapa: true,
          prazoPrometido: true,
          cliente: { select: { nome: true } },
          equipamento: { select: { marca: true, modelo: true } },
        },
      }),
      tx.visitaPreventiva.findMany({
        where: {
          responsavelId: userId,
          status: 'AGENDADA',
          agendadaPara: { not: null, lt: fim },
        },
        orderBy: [{ agendadaPara: 'asc' }],
        take: 200,
        select: {
          id: true,
          agendadaPara: true,
          hora: true,
          ordemId: true,
          contrato: {
            select: {
              numero: true,
              cliente: { select: { nome: true, logradouro: true, cidade: true, uf: true } },
              equipamento: { select: { marca: true, modelo: true } },
            },
          },
        },
      }),
    ]),
  )

  const prazos: ItemDaAgenda[] = ordens.map((o) => ({
    id: o.id,
    ordemId: o.id,
    dia: diaLocal(o.prazoPrometido!),
    hora: null,
    tipo: 'PRAZO' as const,
    numero: o.numero,
    cliente: o.cliente.nome,
    equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`.trim(),
    endereco: null,
    etapaRotulo: ROTULO_ETAPA[o.etapa] ?? o.etapa,
    atrasado: o.prazoPrometido! < agora,
    // Prazo de bancada não tem motorista: é trabalho parado, não deslocamento.
    motorista: null,
  }))

  const preventivas: ItemDaAgenda[] = visitas.map((v) => ({
    id: v.id,
    /**
     * Nulo enquanto a visita não virou O.S. — a linha existe para avisar, e a
     * tela não oferece um toque que levaria a lugar nenhum.
     */
    ordemId: v.ordemId,
    dia: diaLocal(v.agendadaPara!),
    /**
     * A hora combinada é o campo de texto que a central preenche; `agendadaPara`
     * guarda o meio-dia do fuso da casa para o dia não escorregar. Ler a hora de
     * lá mostraria 12:00 em toda visita — igual para todas, e errado em todas.
     */
    hora: v.hora,
    tipo: 'PREVENTIVA' as const,
    numero: v.contrato.numero,
    cliente: v.contrato.cliente.nome,
    equipamento: `${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}`.trim(),
    endereco: enderecoDoCliente(v.contrato.cliente),
    etapaRotulo: 'Revisão preventiva',
    atrasado: v.agendadaPara! < agora,
    motorista: null,
  }))

  // Uma agenda só, em ordem cronológica: a tela agrupa por dia e contaria a
  // história errada se os prazos viessem todos antes das visitas.
  return [...prazos, ...preventivas].sort((a, b) =>
    a.dia === b.dia ? (a.hora ?? '').localeCompare(b.hora ?? '') : a.dia.localeCompare(b.dia),
  )
}

/** O endereço da visita é o do cliente — é para lá que o técnico vai. */
function enderecoDoCliente(c: {
  logradouro: string | null
  cidade: string | null
  uf: string | null
}): string | null {
  const partes = [c.logradouro, c.cidade, c.uf].filter((p): p is string => Boolean(p?.trim()))
  return partes.length ? partes.join(', ') : null
}

export { Papel }


/**
 * O QUE VEM DEPOIS DE HOJE — a resposta que o dia vazio precisava.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * Sem parada hoje, a tela dizia "nenhuma parada agendada para hoje" dentro de
 * uma caixa tracejada e parava ali. É uma resposta verdadeira e inútil: quem
 * abre o aplicativo de manhã e vê o dia vazio faz imediatamente a pergunta
 * seguinte — *"e amanhã?"* — e para respondê-la tinha de trocar de aba.
 *
 * Pior no modo gestão, que é como o dono do sistema abriu: uma tela larga, um
 * aviso azul e uma caixa tracejada dizendo que não há nada. A empresa tinha
 * retirada marcada para a semana.
 *
 * =============================================================================
 * ELA NÃO É A AGENDA
 * =============================================================================
 * A aba Agenda mostra QUATORZE dias agrupados, com atrasado em cima. Isto aqui
 * são as PRÓXIMAS, poucas, para caber num painel — a pergunta é "o dia está
 * vazio, e daí?", não "me mostre a quinzena".
 */
export type ProximaParada = {
  id: string
  ordemId: string
  /** 'AAAA-MM-DD' em Lajeado. */
  dia: string
  hora: string
  tipo: 'RETIRADA' | 'ENTREGA'
  numero: number
  cliente: string
  endereco: string
  /** Só o modo gestão desenha — e é o campo que denuncia a parada sem dono. */
  motorista: string | null
}

export async function proximasParadas(
  ctx: ContextoAcesso,
  motoristaId: string | null,
  limite = 6,
): Promise<ProximaParada[]> {
  // Começa DEPOIS do fim de hoje: o que é de hoje já está na tela, em cima.
  const { fim } = janelaDoDia()

  const ags = await comEscopo(ctx, (tx) =>
    tx.agendamento.findMany({
      where: {
        ...(motoristaId ? { motoristaId } : {}),
        previstoPara: { gte: fim },
        // Concluída no futuro não existe; cancelada não é compromisso. O que
        // sobra é o que ainda vai acontecer — inclusive a sem motorista, que no
        // modo gestão é justamente a que precisa de decisão.
        status: motoristaId
          ? { in: ['ATRIBUIDO', 'EM_ROTA'] }
          : { in: ['PENDENTE', 'ATRIBUIDO', 'EM_ROTA'] },
      },
      orderBy: [{ previstoPara: 'asc' }],
      take: limite,
      select: {
        id: true,
        tipo: true,
        previstoPara: true,
        janelaInicio: true,
        enderecoSnapshot: true,
        motorista: { select: { nome: true } },
        ordem: {
          select: {
            id: true,
            numero: true,
            cliente: { select: { nome: true } },
          },
        },
      },
    }),
  )

  return ags.map((a) => ({
    id: a.id,
    ordemId: a.ordem.id,
    dia: diaLocal(a.previstoPara),
    hora: horaLocal(a.janelaInicio ?? a.previstoPara),
    tipo: a.tipo as 'RETIRADA' | 'ENTREGA',
    numero: a.ordem.numero,
    cliente: a.ordem.cliente.nome,
    endereco: a.enderecoSnapshot,
    motorista: a.motorista?.nome ?? null,
  }))
}
