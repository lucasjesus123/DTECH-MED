import { Papel } from '@/generated/prisma/enums'
import type { NomeIcone } from '@/app/painel/nav'

/**
 * AS ABAS DO SISTEMA, E QUEM VÊ CADA UMA.
 *
 * =============================================================================
 * O MODELO, EM UMA FRASE
 * =============================================================================
 * O PAPEL diz o que a pessoa **pode fazer**. As ABAS dizem o que ela **vê**.
 *
 * São duas perguntas diferentes e o sistema tratava as duas como uma só. O
 * resultado era um técnico enxergando a agenda inteira e um financeiro
 * atravessando telas de bancada que não são trabalho dele — não por falha de
 * segurança, mas por falta de escolha: ninguém podia dizer "esta pessoa aqui só
 * mexe com dinheiro".
 *
 * Agora o administrador da empresa monta cada acesso: escolhe o papel e marca
 * as abas. Marcou só Financeiro? A pessoa entra e é isso que existe para ela —
 * o menu não oferece o resto, e o resto recusa pelo endereço.
 *
 * =============================================================================
 * POR QUE MARCAR UMA ABA NÃO DÁ PODER NENHUM
 * =============================================================================
 * A regra que sustenta tudo isto: **a marcação SUBTRAI, nunca SOMA.**
 *
 * Cada aba tem um piso de papel. Marcar "Financeiro" para um motorista não faz
 * ele ver o caixa — o piso dessa aba é FINANCEIRO, e o motorista está abaixo.
 * A marcação só consegue TIRAR do que o papel já permitia.
 *
 * Sem essa regra, a hierarquia inteira cairia por uma caixinha: bastaria um
 * administrador marcar todas as abas de um motorista para dar a ele o alcance
 * de um gestor, contornando a regra de que ninguém cria alguém acima de si. E
 * a caixinha é bem mais fácil de clicar por engano do que um papel é de trocar.
 *
 * Na tela, as abas que o papel não alcança aparecem — desligadas, com o motivo
 * escrito. Esconder faria a pessoa procurar; mostrar desligado ensina.
 *
 * =============================================================================
 * QUEM NÃO MARCA NADA
 * =============================================================================
 * Fica com o conjunto padrão do papel dela. Sistema em que cada acesso precisa
 * ser montado do zero é sistema em que alguém esquece de marcar — e o esquecido
 * vira chamado no dia seguinte, com a pessoa parada sem conseguir trabalhar.
 */

export type Tela = {
  /** O que vai gravado no banco. Curto e estável: ele sobrevive a renomeações. */
  chave: string
  rotulo: string
  grupo: Grupo
  href: string
  icone: NomeIcone
  /** O papel MÍNIMO. Abaixo dele, marcar a aba não adianta. */
  piso: Papel
  /**
   * A chave da tela DONA, quando esta é aba de outra.
   *
   * Ordens, Acompanhar e Rota respondem à mesma pergunta — "cadê esta O.S. e o
   * que falta nela" — e ocupavam três linhas do menu. Pela regra da casa isso é
   * ABA, não item.
   *
   * O que este campo NÃO faz é tirar permissão. As três continuam com chave
   * própria, piso próprio e marcação própria: quem só pode ver a Rota continua
   * podendo, e a barra de abas mostra só as abas que a pessoa alcança. O campo
   * decide uma coisa só — se a tela ganha linha no menu lateral ou aparece
   * como aba dentro da dona.
   *
   * Sem isso a alternativa seria fundir as três chaves numa, e aí a marcação de
   * quem já escolheu "só Rota" apontaria para uma chave que deixou de existir.
   */
  abaDe?: string
}

/**
 * OS GRUPOS, NA ORDEM EM QUE O DIA ACONTECE.
 *
 * =============================================================================
 * POR QUE ELES FORAM REDESENHADOS
 * =============================================================================
 * O menu tinha treze itens em quatro grupos, e a lista de pedidos somava mais
 * sete telas. Vinte entradas numa coluna deixam de ser navegação e viram índice
 * de manual: a pessoa não pergunta mais "onde eu clico", pergunta "em qual
 * destes vinte estava aquilo".
 *
 * Pior que o tamanho era a SOBREPOSIÇÃO. Quatro entradas respondiam a mesma
 * pergunta — "cadê o motorista e o que ele tem para hoje": Agenda de rota, Ao
 * vivo, App do motorista e App do técnico.
 *
 * A regra do redesenho é uma frase:
 *
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │  O que responde à MESMA PERGUNTA vira ABA, não item de menu. │
 *     └──────────────────────────────────────────────────────────────┘
 *
 * Os quatro viraram "Rota", com Planejada e Ao vivo em abas e os aplicativos
 * como botões — porque aplicativo de campo não é outra aba do painel, é outra
 * superfície, feita para o celular de quem está na rua.
 *
 * =============================================================================
 * A ORDEM DOS GRUPOS É A ORDEM DO DIA
 * =============================================================================
 * "Hoje" é o que se abre de manhã. "O trabalho" é a esteira andando.
 * "Comercial" é o que ainda não virou ordem. Cadastros alimentam tudo, Dinheiro
 * fecha, Retaguarda sustenta, e Equipe é quem faz. Um menu ordenado por
 * frequência de uso poupa uma decisão por clique, o dia inteiro.
 */
export type Grupo =
  | 'Hoje'
  | 'O trabalho'
  | 'Comercial'
  | 'Cadastros'
  | 'Dinheiro'
  | 'Retaguarda'
  | 'Equipe'

export const TELAS: readonly Tela[] = [
  // "PAINEL DO DIA" VIROU "DASHBOARD", e só o rótulo mudou.
  //
  // A CHAVE continua `painel`: ela está gravada na marcação de abas de cada
  // pessoa, e renomeá-la tiraria o acesso de quem já marcou. É para isso que a
  // chave é curta e estável, e o rótulo é que é a palavra da tela — a mesma
  // razão pela qual `auditoria` continua `auditoria` chamando-se "Quem fez o
  // quê", e `contatos` continua `contatos` chamando-se "Comercial".
  { chave: 'painel',       rotulo: 'Dashboard',         grupo: 'Hoje',       href: '/painel',              icone: 'mostrador',   piso: Papel.MOTORISTA },
  // O ÚNICO item novo desta rodada de seis telas, e ele é item porque não é
  // recorte de nenhuma outra: atravessa rota, preventiva, contas e contratos,
  // e a pergunta que faz — "o que vem por aí" — não é feita de dentro de
  // nenhuma delas. Ao lado do Dashboard porque um mostra o agora e o outro
  // mostra o depois.
  //
  // Piso MOTORISTA: ele precisa ver as paradas da semana para se organizar.
  //
  // NÃO HÁ DINHEIRO nesta tela, e por isso não há corte a fazer nela. Ela já
  // trouxe conta a pagar e a receber, e precisava de um corte por papel para o
  // motorista não ver salário e aluguel. As fontes de dinheiro saíram — o
  // vencimento se responde no Financeiro — e a trava saiu junto com o motivo
  // dela: nenhuma visão nova pode esquecer um corte que não existe.
  { chave: 'calendario',   rotulo: 'Calendário',        grupo: 'Hoje',       href: '/painel/calendario',   icone: 'preventiva',  piso: Papel.MOTORISTA },

  // ---------------------------------------------------------------------------
  // O.S. — as três que eram três linhas do menu
  // ---------------------------------------------------------------------------
  // Ordens, Acompanhar e Rota nunca foram assuntos diferentes: são três modos
  // de olhar A MESMA O.S. — a lista dela, o estágio dela, e a rua dela. Três
  // linhas no menu obrigavam a pessoa a escolher o modo ANTES de escolher o
  // assunto, que é a ordem trocada: ninguém abre o sistema querendo "ver a
  // aba Acompanhar", abre querendo saber de uma O.S.
  //
  // Pela regra da casa, isso é ABA. Uma linha no menu — O.S. — e as três como
  // abas dentro dela.
  //
  // As CHAVES continuam três, e é de propósito: elas guardam a permissão de
  // cada pessoa. Fundir as três numa faria a marcação de quem escolheu "só
  // Rota" apontar para uma chave que deixou de existir, e essa pessoa abriria
  // o sistema sem ter para onde ir.
  { chave: 'ordens',       rotulo: 'O.S.',              grupo: 'O trabalho', href: '/painel/ordens',       icone: 'ordens',      piso: Papel.MOTORISTA },
  { chave: 'acompanhar',   rotulo: 'Acompanhar',        grupo: 'O trabalho', href: '/painel/acompanhar',   icone: 'trilha',      piso: Papel.MOTORISTA, abaDe: 'ordens' },
  // Esta já tinha juntado quatro: a agenda, o mapa ao vivo e os dois
  // aplicativos de campo. Agora ela mesma é aba.
  { chave: 'rota',         rotulo: 'Rota',              grupo: 'O trabalho', href: '/painel/rota',         icone: 'rota',        piso: Papel.MOTORISTA, abaDe: 'ordens' },

  // ---------------------------------------------------------------------------
  // OS APLICATIVOS DE CAMPO — o item que eu tinha argumentado para NÃO existir
  // ---------------------------------------------------------------------------
  // Eles estavam a três cliques: menu O.S. → aba Rota → botão. E não foi
  // descuido: o `docs/PLANO.md` diz, com estas palavras, que "os aplicativos
  // como botões — porque aplicativo de campo não é outra aba do painel, é outra
  // superfície, feita para o celular de quem está na rua".
  //
  // A frase é verdadeira e a conclusão estava errada. SER outra superfície é
  // exatamente o motivo de precisarem de porta visível, não de botão dentro da
  // terceira aba de outro assunto. E a regra da casa, lida direito, aponta para
  // cá: "quero usar o aplicativo de campo" não é recorte de Ordens, de
  // Acompanhar nem de Rota — é pergunta própria, e pergunta própria é item.
  //
  // Piso MOTORISTA porque ele precisa alcançar o próprio aplicativo. O que a
  // tela MOSTRA muda com o papel: o cartão do aplicativo que o papel não abre
  // aparece sem botão, dizendo de quem é.
  { chave: 'aplicativos',  rotulo: 'Aplicativos',       grupo: 'O trabalho', href: '/painel/aplicativos',  icone: 'rota',        piso: Papel.MOTORISTA },

  // A tela virou DUAS abas — contatos do site e o funil de orçamentos — e o
  // rótulo acompanhou. A chave NÃO muda: ela está gravada na marcação de abas
  // de cada pessoa, e renomeá-la tiraria o acesso de quem já tinha marcado.
  // É para isso que a chave é curta e estável, e o rótulo é que é a palavra
  // da tela.
  { chave: 'contatos',     rotulo: 'Comercial',         grupo: 'Comercial',  href: '/painel/contatos',     icone: 'recado',      piso: Papel.ATENDENTE },

  { chave: 'clientes',     rotulo: 'Clientes',          grupo: 'Cadastros',  href: '/painel/clientes',     icone: 'clientes',    piso: Papel.ATENDENTE },
  { chave: 'equipamentos', rotulo: 'Equipamentos',      grupo: 'Cadastros',  href: '/painel/equipamentos', icone: 'equipamento', piso: Papel.MOTORISTA },
  { chave: 'estoque',      rotulo: 'Estoque',           grupo: 'Cadastros',  href: '/painel/estoque',      icone: 'estoque',     piso: Papel.TECNICO },

  { chave: 'financeiro',   rotulo: 'Financeiro',        grupo: 'Dinheiro',   href: '/painel/financeiro',   icone: 'financeiro',  piso: Papel.FINANCEIRO },

  { chave: 'preventiva',   rotulo: 'Preventiva',        grupo: 'Retaguarda', href: '/painel/preventiva',   icone: 'preventiva',  piso: Papel.ATENDENTE },
  { chave: 'whatsapp',     rotulo: 'WhatsApp',          grupo: 'Retaguarda', href: '/painel/whatsapp',     icone: 'balao',       piso: Papel.GESTOR },

  // O molde do contrato deixou de ser código e virou cadastro. Fica na
  // Retaguarda, ao lado da Preventiva: não é trabalho do dia, é ajuste que se
  // faz uma vez e se revisita quando a regra do negócio muda.
  //
  // Piso FINANCEIRO para VER — quem emite precisa poder conferir com que texto
  // o documento vai sair. Editar é mais restrito (GESTOR para cima), e essa
  // linha é desenhada na ação, não aqui: o molde é o que a empresa promete e
  // cobra, e mudar isso é decisão de quem responde pelo negócio.
  { chave: 'documentos',   rotulo: 'Modelos de documento', grupo: 'Retaguarda', href: '/painel/documentos', icone: 'registro', piso: Papel.FINANCEIRO },

  { chave: 'usuarios',     rotulo: 'Pessoas e acessos', grupo: 'Equipe',     href: '/painel/usuarios',     icone: 'clientes',    piso: Papel.ADMIN_EMPRESA },
  // "TRILHA" ERA O PROBLEMA, e não só o lugar dela no menu.
  //
  // A reclamação foi "está muito escondida mesmo" — e veio logo depois da
  // pergunta "me explica o que é essa trilha". As duas coisas são a mesma: um
  // rótulo que não diz o que a tela faz É esconder a tela, mesmo em cima do
  // menu. Ninguém clica no que não sabe o que é.
  //
  // "Quem fez o quê" diz. E ela subiu de Equipe (último grupo) para Retaguarda,
  // que é onde moram as telas de sustentação — perto da Preventiva e do
  // WhatsApp, e não no fim de tudo.
  //
  // A CHAVE continua `auditoria`: ela guarda a permissão de quem já marcou, e
  // renomeá-la tiraria o acesso dessas pessoas.
  { chave: 'auditoria',    rotulo: 'Quem fez o quê',    grupo: 'Retaguarda', href: '/painel/auditoria',    icone: 'registro',    piso: Papel.ADMIN_EMPRESA },
] as const

/**
 * ONDE CADA PERFIL TRABALHA.
 *
 * =============================================================================
 * ISTO JÁ EXISTIA, ESCONDIDO NUMA FUNÇÃO DA TELA DE ENTRAR
 * =============================================================================
 * A ação de entrar tinha um `casaDe(papel)` que mandava motorista para
 * `/app/motorista` e técnico para `/app/tecnico`. Era a única linha do sistema
 * que sabia que essas duas pessoas não trabalham no painel — e ninguém mais
 * sabia. O catálogo de abas, que decide o menu inteiro, tratava motorista como
 * um usuário de painel com poucas permissões.
 *
 * O efeito aparecia no cadastro: escolher "Motorista" e ver uma grade de
 * quatorze abas do painel, sete delas marcáveis. Quem monta o acesso é obrigado
 * a decidir aba por aba uma coisa que o perfil já respondeu — o motorista
 * trabalha no aplicativo.
 *
 * Com o lugar declarado aqui, a tela de cadastro, o redirecionamento do login e
 * a guarda de aba passam a ler a MESMA frase.
 */
export type Lugar = 'app' | 'painel'

export const LUGAR: Record<Papel, Lugar> = {
  SUPER_ADMIN: 'painel',
  ADMIN_EMPRESA: 'painel',
  GESTOR: 'painel',
  FINANCEIRO: 'painel',
  ATENDENTE: 'painel',
  // A BANCADA É NO APLICATIVO, MAS O TRABALHO DELA NÃO CABE TODO LÁ.
  //
  // O `/app/tecnico` cobre a ENTRADA do aparelho: receber, fotografar,
  // conferir. Laudo, manutenção e lançamento de peça acontecem na janela da
  // O.S., no painel. Chamar o técnico de "pessoa do aplicativo" e cortar o
  // painel dele o deixaria sem metade do próprio serviço.
  //
  // Ele é do aplicativo para efeito de PARA ONDE VAI ao entrar — é lá que o dia
  // dele começa — e continua com o alcance de painel que o trabalho exige. As
  // duas coisas são diferentes, e por isso são dois campos e não um.
  TECNICO: 'app',
  MOTORISTA: 'app',
}

/** A superfície em que este papel trabalha — o aplicativo, ou o painel. */
export function casaDoPapel(papel: Papel): string {
  if (papel === Papel.MOTORISTA) return '/app/motorista'
  if (papel === Papel.TECNICO) return '/app/tecnico'
  return '/painel'
}

/**
 * A PRIMEIRA TELA QUE ESTA PESSOA CONSEGUE ABRIR.
 *
 * =============================================================================
 * POR QUE NÃO BASTA "VAI PARA /painel"
 * =============================================================================
 * O modelo de abas permite — e recomenda — apertar um acesso até uma tela só:
 * *"deixar uma pessoa vendo apenas o Financeiro"*, diz a própria tela de
 * cadastro. Só que entrar sempre caía em `/painel`, o Dashboard. Essa pessoa
 * entrava, via um menu com uma linha, e a tela em que ela caiu não era essa
 * linha.
 *
 * Enquanto o Dashboard não conferia a aba, o resultado era só estranho. No
 * instante em que ele passa a conferir — que é o certo, senão esconder a aba do
 * menu vira enfeite —, o mesmo caminho vira um beco: a pessoa entra e é
 * mandada para "sem permissão" pela porta de entrada do sistema.
 *
 * Aqui a resposta é montada do que ela TEM: a primeira aba efetiva dela. Como
 * essa aba sai de `telasEfetivas`, `podeAbrir` é verdadeiro para ela por
 * construção — não há como esta função devolver um endereço que vai recusar
 * quem chegar, e portanto não há como criar laço de redirecionamento.
 */
export function primeiraTela(papel: Papel, marcadas: string[] | null | undefined): string {
  const casa = casaDoPapel(papel)
  if (casa !== '/painel') return casa
  // O dono da plataforma atravessa tudo: o Dashboard é a casa dele.
  if (papel === Papel.SUPER_ADMIN) return '/painel'
  const telas = telasEfetivas(papel, marcadas)
  return telas.find((t) => t.chave === 'painel')?.href ?? telas[0]?.href ?? '/painel'
}

/**
 * O PADRÃO ENXUTO — quem não precisa do painel não nasce com ele.
 *
 * =============================================================================
 * O QUE ESTAVA ERRADO
 * =============================================================================
 * "Sem marcação = o padrão do papel" e "o padrão do papel = tudo que o papel
 * alcança" eram a mesma frase, e é aí que o motorista nascia com sete abas do
 * painel: Dashboard, Calendário, O.S., Acompanhar, Rota, Aplicativos e
 * Equipamentos. Nenhuma delas é o trabalho dele — o trabalho dele é a rota, no
 * aplicativo, com a assinatura do cliente no celular.
 *
 * Não era falha de segurança: cada uma dessas telas mostra ao motorista só o
 * que é dele. Era falha de DESENHO. Uma pessoa que entra num sistema e encontra
 * sete portas, seis das quais não levam ao serviço dela, gasta o primeiro dia
 * descobrindo qual é a que interessa — e a central gasta o dia explicando.
 *
 * =============================================================================
 * ALCANÇAR CONTINUA SENDO OUTRA COISA
 * =============================================================================
 * Isto muda o PADRÃO, não o TETO. `telasDoPapel` continua devolvendo as sete: o
 * administrador que tiver um motivo real — um motorista que também confere a
 * agenda da semana no computador da oficina — marca a aba e ela funciona. O que
 * deixou de acontecer é isso vir ligado sem ninguém ter pedido.
 *
 * O TÉCNICO NÃO ENTRA AQUI, e a ausência é a parte pensada: metade do serviço
 * dele — laudo, manutenção, peça — mora na janela da O.S., no painel. Enxugar
 * o padrão dele seria tirar ferramenta de trabalho para arrumar o menu.
 */
const PADRAO_ENXUTO: Partial<Record<Papel, readonly string[]>> = {
  // Uma porta só, e ela leva ao aplicativo dele. `/painel/aplicativos` é a tela
  // cujo assunto é exatamente esse — abrir o app de campo. Deixar o padrão
  // vazio seria pior: a pessoa que caísse no painel por um link não teria menu
  // nenhum, e menu vazio parece defeito.
  MOTORISTA: ['aplicativos'],
}

const NIVEL: Record<Papel, number> = {
  SUPER_ADMIN: 100,
  ADMIN_EMPRESA: 80,
  GESTOR: 60,
  FINANCEIRO: 40,
  ATENDENTE: 30,
  TECNICO: 20,
  MOTORISTA: 10,
}

/** As abas que este papel ALCANÇA — o teto do que a marcação pode liberar. */
export function telasDoPapel(papel: Papel): Tela[] {
  return TELAS.filter((t) => NIVEL[papel] >= NIVEL[t.piso])
}

/**
 * O que esta pessoa vê, de verdade.
 *
 * Sem marcação: o padrão do papel. Com marcação: a interseção — o que ela marcou
 * E o papel alcança. A interseção é a regra do "subtrai, nunca soma", escrita
 * num lugar só, para não depender de nenhuma tela lembrar dela.
 */
export function telasEfetivas(papel: Papel, marcadas: string[] | null | undefined): Tela[] {
  const doPapel = telasDoPapel(papel)
  if (!marcadas || marcadas.length === 0) return padraoDoPapel(papel)
  const escolhidas = new Set(marcadas)
  const filtradas = doPapel.filter((t) => escolhidas.has(t.chave))

  // Marcação que não sobrou nada devolve o padrão. Acontece em dois casos: papel
  // rebaixado depois de marcar, e — desde o redesenho dos grupos — marcação
  // feita com CHAVES QUE NÃO EXISTEM MAIS ('agenda', 'ao-vivo'). As duas viraram
  // a aba 'rota'; quem tinha só elas marcadas cairia num menu vazio, que é uma
  // pessoa abrindo o sistema sem ter para onde ir. Isso parece defeito, não
  // permissão.
  return filtradas.length > 0 ? filtradas : padraoDoPapel(papel)
}

/**
 * O que este papel vê quando NINGUÉM marcou nada.
 *
 * É o teto para quase todo mundo, e o recorte do `PADRAO_ENXUTO` para quem
 * trabalha noutra superfície. Uma função só, porque os dois lugares que
 * respondiam "e quando não há marcação?" — o caminho sem marcas e o caminho da
 * marcação que não sobrou nada — precisam responder igual.
 */
export function padraoDoPapel(papel: Papel): Tela[] {
  const enxuto = PADRAO_ENXUTO[papel]
  const doPapel = telasDoPapel(papel)
  if (!enxuto) return doPapel
  const recorte = doPapel.filter((t) => enxuto.includes(t.chave))
  // Se um dia a chave do recorte sumir do catálogo, cair no teto é melhor do
  // que devolver lista vazia: menu vazio é pessoa sem ter para onde ir.
  return recorte.length > 0 ? recorte : doPapel
}

/** Esta pessoa alcança esta aba? */
export function podeAbrir(papel: Papel, marcadas: string[] | null | undefined, chave: string): boolean {
  // O dono da plataforma atravessa: as telas dele são outras, e quando ele
  // entra numa empresa é para ver o que a empresa vê.
  if (papel === Papel.SUPER_ADMIN) return true
  return telasEfetivas(papel, marcadas).some((t) => t.chave === chave)
}
