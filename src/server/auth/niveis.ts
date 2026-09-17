import { Papel } from '@/generated/prisma/enums'

/**
 * A HIERARQUIA DOS PAPÉIS, E O QUE UM PODE FAZER COM O OUTRO.
 *
 * =============================================================================
 * POR QUE ISTO VIROU UM ARQUIVO
 * =============================================================================
 * A tabela de níveis existia DUAS vezes — uma em `plataforma.ts`, que decide de
 * verdade, e outra em `equipe.tsx`, que desenha a tela. Cópias iguais,
 * escritas à mão, mantidas por lembrança.
 *
 * O dia em que a regra mudou — o administrador da empresa passou a poder nomear
 * outro administrador — foi o dia em que essa duplicação cobrou: havia SEIS
 * comparações espalhadas por quatro arquivos, todas com a mesma cara
 * (`NIVEL[a] >= NIVEL[b]`), e cada uma precisava ser encontrada e corrigida uma
 * a uma. Esquecer uma delas não daria erro nenhum: daria uma tela oferecendo o
 * que o servidor recusa, ou — pior — um servidor aceitando o que a tela nem
 * ofereceu.
 *
 * Aqui a regra é escrita uma vez, com nome, e as duas pontas perguntam para o
 * mesmo lugar.
 *
 * =============================================================================
 * AS TRÊS PERGUNTAS, QUE NÃO SÃO A MESMA
 * =============================================================================
 * **CRIAR** aceita o próprio nível. Nomear um igual é acrescentar um par à
 * casa, e é o que permite a uma empresa ter mais de um administrador. Uma
 * empresa com um administrador só fica sem ninguém que mexa na equipe no dia em
 * que essa pessoa sai, esquece a senha ou perde o telefone.
 *
 * **MEXER** (editar a ficha, trocar a senha, desativar) exige estar ACIMA.
 * Editar um par não é acrescentar, é mandar: o formulário carrega o campo de
 * senha, e trocar a senha de alguém derruba as sessões dele e entrega a conta a
 * quem digitou. Se administrador pudesse editar administrador, o segundo
 * administrador que a empresa nomeia seria, sem ninguém perceber, um jeito de
 * tomar a conta do primeiro. Desativar é a outra metade do mesmo estrago: entre
 * iguais, ganha quem clicar primeiro.
 *
 * **EXCLUIR** aceita o próprio nível de novo, e é seguro porque não sobra nada
 * para apagar: a exclusão já recusa qualquer pessoa que tenha entrado uma vez
 * ou que apareça em um registro do histórico. O que passa por aqui é só o
 * cadastro criado há dez minutos com o e-mail digitado errado. Sem isso, errar
 * o e-mail ao nomear um administrador deixaria de pé um acesso de nível máximo,
 * inalcançável, com uma senha provisória viva — a exclusão bloqueada seria o
 * próprio buraco.
 *
 * =============================================================================
 * O SUPER ADMIN
 * =============================================================================
 * Passa em tudo, e não por exceção escrita à mão: ele é o número mais alto da
 * tabela, e ninguém alcança o nível dele. `SUPER_ADMIN` também não existe no
 * formulário — o `schemaUsuario` não aceita esse valor em campo nenhum. São
 * duas travas independentes para o mesmo degrau, e é de propósito.
 */
export const NIVEL: Record<Papel, number> = {
  SUPER_ADMIN: 100,
  ADMIN_EMPRESA: 80,
  GESTOR: 60,
  FINANCEIRO: 40,
  ATENDENTE: 30,
  TECNICO: 20,
  MOTORISTA: 10,
}

/**
 * O número de um papel, aceitando string solta.
 *
 * A tela recebe o papel como `string` — vem de um `select`, de uma linha da
 * tabela, do banco. Papel desconhecido vale ZERO, e não o topo: um valor que
 * ninguém reconhece não pode ganhar poder por ser estranho.
 */
export function nivelDe(papel: string): number {
  return NIVEL[papel as Papel] ?? 0
}

/** Criar (ou promover alguém a) este papel: o próprio nível passa. */
export function podeCriarPapel(quemFaz: string, papelAlvo: string): boolean {
  return nivelDe(papelAlvo) <= nivelDe(quemFaz)
}

/**
 * Mexer na pessoa: editar a ficha, trocar a senha, desativar ou reativar.
 * Exige estar ACIMA dela — inclusive para não poder mexer em si mesmo.
 */
export function podeMexerEm(quemFaz: string, papelAlvo: string): boolean {
  return nivelDe(papelAlvo) < nivelDe(quemFaz)
}

/**
 * Excluir o cadastro: o próprio nível passa.
 *
 * Isto NÃO é permissão para apagar um par de verdade — quem chama continua
 * obrigado a recusar qualquer pessoa com acesso já feito ou com rastro no
 * histórico. É só o que permite desfazer o cadastro que acabou de nascer
 * errado.
 */
export function podeExcluirPapel(quemFaz: string, papelAlvo: string): boolean {
  return nivelDe(papelAlvo) <= nivelDe(quemFaz)
}
