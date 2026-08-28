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
  { chave: 'painel',       rotulo: 'Painel do dia',     grupo: 'Hoje',       href: '/painel',              icone: 'mostrador',   piso: Papel.MOTORISTA },

  { chave: 'ordens',       rotulo: 'Ordens',            grupo: 'O trabalho', href: '/painel/ordens',       icone: 'ordens',      piso: Papel.MOTORISTA },
  { chave: 'acompanhar',   rotulo: 'Acompanhar',        grupo: 'O trabalho', href: '/painel/acompanhar',   icone: 'trilha',      piso: Papel.MOTORISTA },
  // Uma entrada onde havia quatro: a agenda, o mapa ao vivo e os dois
  // aplicativos de campo. Ver o comentário dos grupos, acima.
  { chave: 'rota',         rotulo: 'Rota',              grupo: 'O trabalho', href: '/painel/rota',         icone: 'rota',        piso: Papel.MOTORISTA },

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

  { chave: 'usuarios',     rotulo: 'Pessoas e acessos', grupo: 'Equipe',     href: '/painel/usuarios',     icone: 'clientes',    piso: Papel.ADMIN_EMPRESA },
  { chave: 'auditoria',    rotulo: 'Trilha',            grupo: 'Equipe',     href: '/painel/auditoria',    icone: 'registro',    piso: Papel.ADMIN_EMPRESA },
] as const

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
  if (!marcadas || marcadas.length === 0) return doPapel
  const escolhidas = new Set(marcadas)
  const filtradas = doPapel.filter((t) => escolhidas.has(t.chave))

  // Marcação que não sobrou nada devolve o padrão. Acontece em dois casos: papel
  // rebaixado depois de marcar, e — desde o redesenho dos grupos — marcação
  // feita com CHAVES QUE NÃO EXISTEM MAIS ('agenda', 'ao-vivo'). As duas viraram
  // a aba 'rota'; quem tinha só elas marcadas cairia num menu vazio, que é uma
  // pessoa abrindo o sistema sem ter para onde ir. Isso parece defeito, não
  // permissão.
  return filtradas.length > 0 ? filtradas : doPapel
}

/** Esta pessoa alcança esta aba? */
export function podeAbrir(papel: Papel, marcadas: string[] | null | undefined, chave: string): boolean {
  // O dono da plataforma atravessa: as telas dele são outras, e quando ele
  // entra numa empresa é para ver o que a empresa vê.
  if (papel === Papel.SUPER_ADMIN) return true
  return telasEfetivas(papel, marcadas).some((t) => t.chave === chave)
}
