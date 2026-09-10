import { Papel } from '@/generated/prisma/enums'
import { podeAbrir } from '@/server/auth/telas'
import type { Sessao } from '@/server/auth/sessao'
import type { NomeIcone } from '@/components/sistema/icones'

/**
 * O MENU DO SISTEMA NOVO — agrupado por INTENÇÃO, não por entidade.
 *
 * =============================================================================
 * A DIFERENÇA, EM UMA FRASE
 * =============================================================================
 * O menu antigo era organizado por ASSUNTO: Clientes, Equipamentos, Estoque,
 * Financeiro, WhatsApp. Sete assuntos paralelos, e a pessoa tinha de traduzir
 * "preciso despachar aquele aparelho" para "isso mora em qual assunto?".
 *
 * Aqui são três blocos, e eles respondem a "o que eu vim fazer":
 *
 *   OPERAÇÃO DIÁRIA — o que se usa toda hora. É o dia acontecendo.
 *   GESTÃO          — conferir, cobrar, planejar, medir.
 *   ADMINISTRAÇÃO   — ajustar o sistema. Se faz uma vez e se revisita.
 *
 * O efeito prático é o que interessa: quem trabalha na operação NUNCA esbarra
 * em configuração. Não porque a tela esteja escondida, mas porque ela não é
 * oferecida a quem não a usa.
 *
 * =============================================================================
 * DUAS TRAVAS, E AS DUAS NO SERVIDOR
 * =============================================================================
 * O documento de direção pede "RBAC de verdade: visibilidade de menu, telas e
 * ações por papel — no servidor (não só esconder no CSS)". São duas perguntas
 * diferentes, e cada tela responde às duas:
 *
 *   1. O PAPEL alcança esta tela?  → `papeis`, aqui embaixo.
 *   2. A MARCAÇÃO desta pessoa permite?  → `espelha`, logo abaixo.
 *
 * A segunda é a parte que não podia ser esquecida. O sistema antigo deixa o
 * administrador da empresa apertar um acesso até uma tela só — *"deixar uma
 * pessoa vendo apenas o Financeiro"*. Se o menu novo lesse só o papel, toda
 * essa configuração seria silenciosamente ignorada no dia em que a empresa
 * ligasse a `uiV2`: a pessoa restrita ao Financeiro abriria o sistema e
 * encontraria a esteira inteira.
 *
 * Por isso cada tela nova aponta para a CHAVE ANTIGA equivalente, e a
 * marcação continua valendo. A regra do sistema antigo — *a marcação SUBTRAI,
 * nunca SOMA* — vale aqui inteira: `papeis` é o teto, `espelha` é o recorte.
 *
 * =============================================================================
 * ESCONDER NÃO É PROTEGER
 * =============================================================================
 * Este arquivo decide o que o MENU OFERECE. Quem recusa de verdade é a guarda
 * de cada página (`exigirTela`, abaixo) e, para agir, o motor da esteira, que
 * confere papel e pré-condição por conta própria. Nenhuma tela depende de o
 * menu ter escondido o link.
 */

export type GrupoV2 = 'OPERAÇÃO DIÁRIA' | 'GESTÃO' | 'ADMINISTRAÇÃO'

export type TelaV2 = {
  chave: string
  rotulo: string
  grupo: GrupoV2
  href: string
  icone: NomeIcone
  /** Os papéis que ALCANÇAM esta tela. O teto. */
  papeis: Papel[]
  /**
   * A chave da tela equivalente no sistema antigo.
   *
   * É por ela que a marcação de abas de cada pessoa continua valendo. Sem
   * espelho, a tela responde só ao papel — é o caso das telas que não existiam
   * antes e para as quais não há marcação gravada em lugar nenhum.
   */
  espelha?: string
  /**
   * Tela de CONSTRUÇÃO: sempre escura, independente do tema escolhido.
   *
   * Padrão 8 da direção — hierarquia por luminosidade. O olho aprende em dois
   * dias: claro é onde eu opero, escuro é onde eu configuro.
   */
  obra?: boolean
}

const ADMIN = Papel.ADMIN_EMPRESA
const GESTOR = Papel.GESTOR
const FIN = Papel.FINANCEIRO
const ATEND = Papel.ATENDENTE
const TEC = Papel.TECNICO
const MOTO = Papel.MOTORISTA

/**
 * A "GESTÃO" do documento de direção são DOIS papéis aqui.
 *
 * O documento fala em GESTAO como se fosse um papel só; o sistema tem
 * ADMIN_EMPRESA e GESTOR, e os dois decidem. Escrever a dupla uma vez, com
 * nome, evita a lista divergir entre uma tela e a seguinte.
 */
const GESTAO: Papel[] = [ADMIN, GESTOR]

/**
 * A "CENTRAL" também não é um papel: é quem atende o telefone e despacha.
 *
 * No motor da esteira essa mesma trinca já se chama CENTRAL. Manter o mesmo
 * recorte aqui é o que faz o menu oferecer exatamente as telas cujas ações a
 * pessoa vai conseguir executar.
 */
const CENTRAL: Papel[] = [ADMIN, GESTOR, ATEND]

export const TELAS_V2: readonly TelaV2[] = [
  // ---------------------------------------------------------------------------
  // OPERAÇÃO DIÁRIA
  // ---------------------------------------------------------------------------
  // O Painel é de TODOS, e é a única tela que é. Ele não mostra "o sistema":
  // mostra o que AQUELA pessoa precisa fazer agora. Duas pessoas de papéis
  // diferentes abrem o mesmo endereço e veem listas que não se parecem.
  {
    chave: 'painel', rotulo: 'Painel', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema', icone: 'painel', espelha: 'painel',
    papeis: [ADMIN, GESTOR, FIN, ATEND, TEC, MOTO],
  },
  {
    chave: 'ordens', rotulo: 'Ordens de Serviço', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema/ordens', icone: 'ordens', espelha: 'ordens',
    /**
     * O FINANCEIRO ENTRA AQUI, E A OMISSÃO DELE ERA UM BECO SEM SAÍDA.
     *
     * =========================================================================
     * O QUE ACONTECIA SEM ESTA LINHA
     * =========================================================================
     * A ficha da O.S. é onde mora a folha de pagamento — `?fluxo=pagamento`. É
     * dali que o financeiro dá a baixa, e `acaoDaVez(FATURAMENTO, FINANCEIRO)`
     * devolve "Confirmar pagamento" justamente para ele.
     *
     * Só que esta lista não o incluía. O efeito, medido numa jornada de ponta a
     * ponta: o Fábio abria a tela dele, via a O.S. liberada na fila, clicava em
     * "Emitir cobrança" — e caía em "sem permissão". TODOS os caminhos da tela
     * do financeiro levavam ao mesmo lugar. O papel inteiro não conseguia
     * trabalhar, e nada acusava: nem erro, nem log, nem teste.
     *
     * O painel antigo nunca teve esse problema — lá a tela de O.S. tem
     * `piso: MOTORISTA`, e todo mundo alcança. A regressão nasceu ao traduzir
     * "piso" para uma lista explícita, e a lista esqueceu um nome.
     *
     * O MOTORISTA continua fora de propósito: ele trabalha pela fila do app de
     * campo, e a ficha o manda para lá. "Fora da lista" só é aceitável quando
     * existe outro lugar para fazer o trabalho — e para o financeiro não
     * existia. A trava contra o esquecimento está em `navegacao.test.ts`.
     */
    papeis: [...CENTRAL, TEC, FIN],
  },
  {
    // A GESTÃO ENTRA NA BANCADA, e a inclusão é deliberada.
    //
    // A direção lista a Bancada como [TECNICO]. Numa oficina de três pessoas o
    // dono recebe o aparelho, fotografa e fecha o laudo que o técnico ditou —
    // e o motor da esteira já reconhece isso: as transições de laudo e de
    // conclusão de manutenção aceitam ADMIN_EMPRESA e GESTOR, com o comentário
    // de que quem protege o passo é a EXIGÊNCIA (diagnóstico gravado, peças
    // declaradas), não o papel.
    //
    // Cortar a gestão daqui recriaria exatamente o defeito que aquele
    // comentário conta ter consertado: o dono com o laudo escrito na tela e o
    // sistema dizendo "nada para fazer agora com o seu perfil".
    chave: 'bancada', rotulo: 'Bancada', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema/bancada', icone: 'bancada', espelha: 'ordens',
    papeis: [TEC, ...GESTAO],
  },
  {
    chave: 'rotas', rotulo: 'Rotas', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema/rotas', icone: 'rotas', espelha: 'rota',
    papeis: [...CENTRAL, MOTO],
  },
  {
    chave: 'clientes', rotulo: 'Clientes', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema/clientes', icone: 'clientes', espelha: 'clientes',
    papeis: CENTRAL,
  },
  {
    chave: 'equipamentos', rotulo: 'Equipamentos', grupo: 'OPERAÇÃO DIÁRIA',
    href: '/sistema/equipamentos', icone: 'equipamentos', espelha: 'equipamentos',
    papeis: [TEC, ...GESTAO],
  },

  // ---------------------------------------------------------------------------
  // GESTÃO
  // ---------------------------------------------------------------------------
  {
    chave: 'conferencia', rotulo: 'Conferência', grupo: 'GESTÃO',
    href: '/sistema/conferencia', icone: 'conferencia', espelha: 'ordens',
    papeis: GESTAO,
  },
  {
    chave: 'financeiro', rotulo: 'Financeiro', grupo: 'GESTÃO',
    href: '/sistema/financeiro', icone: 'financeiro', espelha: 'financeiro',
    papeis: [FIN, ...GESTAO],
  },
  {
    chave: 'preventiva', rotulo: 'Preventiva', grupo: 'GESTÃO',
    href: '/sistema/preventiva', icone: 'preventiva', espelha: 'preventiva',
    papeis: GESTAO,
  },
  {
    chave: 'relatorios', rotulo: 'Relatórios', grupo: 'GESTÃO',
    href: '/sistema/relatorios', icone: 'relatorios', espelha: 'financeiro',
    papeis: GESTAO,
  },

  // ---------------------------------------------------------------------------
  // ADMINISTRAÇÃO — telas de construção, sempre escuras
  // ---------------------------------------------------------------------------
  {
    chave: 'modelos', rotulo: 'Modelos', grupo: 'ADMINISTRAÇÃO',
    href: '/sistema/admin/modelos', icone: 'modelos', espelha: 'documentos',
    papeis: GESTAO, obra: true,
  },
  {
    chave: 'usuarios', rotulo: 'Usuários & Papéis', grupo: 'ADMINISTRAÇÃO',
    href: '/sistema/admin/usuarios', icone: 'usuarios', espelha: 'usuarios',
    papeis: [ADMIN], obra: true,
  },
  {
    chave: 'integracoes', rotulo: 'WhatsApp / Integrações', grupo: 'ADMINISTRAÇÃO',
    href: '/sistema/admin/integracoes', icone: 'integracoes', espelha: 'whatsapp',
    papeis: [ADMIN], obra: true,
  },
  {
    // Sem espelho: não existe "configurações do tenant" no sistema antigo, e
    // portanto não existe marcação gravada apontando para ela. Responde só ao
    // papel, que é o teto de qualquer jeito.
    chave: 'config', rotulo: 'Configurações', grupo: 'ADMINISTRAÇÃO',
    href: '/sistema/admin/config', icone: 'config',
    papeis: [ADMIN], obra: true,
  },
] as const

const ORDEM_DOS_GRUPOS: GrupoV2[] = ['OPERAÇÃO DIÁRIA', 'GESTÃO', 'ADMINISTRAÇÃO']

/** Esta pessoa alcança esta tela? Papel E marcação, nesta ordem. */
export function podeVer(sessao: Sessao, tela: TelaV2): boolean {
  // O dono da plataforma atravessa, como já atravessa no sistema antigo. Quando
  // ele ENTRA numa empresa, continua atravessando: a visita existe para ele ver
  // o que a empresa vê, e a empresa é vista por alguém com papel próprio.
  if (sessao.papel === Papel.SUPER_ADMIN) return true
  if (!tela.papeis.includes(sessao.papel)) return false
  if (!tela.espelha) return true
  return podeAbrir(sessao.papel, sessao.telas, tela.espelha)
}

/** As telas desta pessoa, na ordem dos grupos. */
export function telasDaSessao(sessao: Sessao): TelaV2[] {
  return TELAS_V2.filter((t) => podeVer(sessao, t))
}

export type GrupoDeMenu = { titulo: GrupoV2; itens: TelaV2[] }

/**
 * O menu montado — já filtrado, já agrupado, já ordenado.
 *
 * Sai do servidor pronto. O componente da lateral nunca recebe um item que a
 * pessoa não poderia ver para depois escondê-lo: esconder no navegador é
 * enfeite, não permissão.
 *
 * Grupo que ficou vazio não vira título órfão. Um cabeçalho "GESTÃO" sem nada
 * embaixo é pior que a ausência dele — parece defeito.
 */
export function menuDaSessao(sessao: Sessao): GrupoDeMenu[] {
  const minhas = telasDaSessao(sessao)
  return ORDEM_DOS_GRUPOS.map((titulo) => ({
    titulo,
    itens: minhas.filter((t) => t.grupo === titulo),
  })).filter((g) => g.itens.length > 0)
}

export function telaPorChave(chave: string): TelaV2 | undefined {
  return TELAS_V2.find((t) => t.chave === chave)
}

/**
 * A PRIMEIRA TELA QUE ESTA PESSOA CONSEGUE ABRIR.
 *
 * O sistema antigo aprendeu isto do jeito caro e escreveu o motivo: mandar todo
 * mundo para a home fixa vira um beco para quem teve o acesso apertado até uma
 * tela só — a pessoa entra e é mandada para "sem permissão" pela porta de
 * entrada do sistema.
 *
 * Aqui a resposta é montada do que ela TEM. Como a lista sai de `telasDaSessao`,
 * o endereço devolvido é, por construção, um que ela abre — não há como esta
 * função criar um laço de redirecionamento.
 */
export function primeiraTelaV2(sessao: Sessao): string {
  const minhas = telasDaSessao(sessao)
  return minhas.find((t) => t.chave === 'painel')?.href ?? minhas[0]?.href ?? '/sistema'
}

/**
 * ONDE O DIA DESTA PESSOA COMEÇA.
 *
 * O motorista trabalha na rua, com o celular na mão: a casa dele é o app de
 * campo, não uma tela de mesa. O técnico tem as duas superfícies — a bancada no
 * computador da oficina e o app para a captura de fotos — e o dia dele começa
 * na fila da bancada, que é onde está o aparelho.
 */
export function casaDoPapelV2(papel: Papel): string {
  if (papel === Papel.MOTORISTA) return '/campo'
  if (papel === Papel.TECNICO) return '/sistema/bancada'
  return '/sistema'
}
