import { StatusOrcamento } from '@/generated/prisma/enums'

/**
 * O CORPO DA ORDEM DE SERVIÇO — o papel que vai para a mão do cliente.
 *
 * =============================================================================
 * POR QUE ISTO É UM MÓDULO PURO, E NÃO DESENHO DIRETO NO PDF
 * =============================================================================
 * Porque uma das regras aqui não pode depender de alguém lembrar dela.
 *
 * O `parecerTecnico` é INTERNO. A tela que o coleta diz isso com todas as
 * letras — "parecer interno, o cliente não vê... é o que a gestão lê para
 * formar preço, e não entra no documento que vai para o cliente". É onde o
 * técnico escreve se vale a pena consertar, se o cliente é encrenqueiro, se o
 * aparelho está no fim da vida.
 *
 * Mandar isso junto com a O.S. seria o tipo de vazamento que ninguém percebe
 * até o dia em que percebe — e aí já foi. Enquanto a decisão morava dentro de
 * 700 linhas de desenho de PDF, ela era uma linha que alguém podia acrescentar
 * sem querer. Aqui ela é uma função sem banco e sem tela, e o teste ao lado
 * cobra: `parecerTecnico` não sai na O.S., nunca.
 *
 * =============================================================================
 * O QUE ENTRA, E EM QUE ORDEM
 * =============================================================================
 * Na ordem em que o cliente lê, que não é a ordem em que o sistema preenche:
 *
 *   1. O QUE FOI ENCONTRADO   o diagnóstico — o texto que sustenta o preço, e
 *                             que a própria tela diz ser "o que o cliente lê".
 *   2. O QUE FOI FEITO        serviço executado e testes finais. Só aparece
 *                             quando existe: numa O.S. emitida no começo do
 *                             conserto esses campos ainda estão vazios, e um
 *                             bloco com dois travessões não informa nada.
 *   3. VALORES                os itens do orçamento APROVADO e o total. É o
 *                             aprovado, e não o mais recente: uma versão nova
 *                             em rascunho não é o que foi combinado.
 *   4. GARANTIA               prazo em dias e a data em que vence. É a linha
 *                             que o cliente procura seis meses depois.
 */

/**
 * O item como o Prisma devolve: `quantidade` vem como `Decimal`, não `number`.
 * Aceitar os dois aqui evita que a conversão fique espalhada por quem chama —
 * e é ela que produziria um "1.0000" na coluna Qtd do papel.
 */
export type ItemCru = {
  descricao: string
  quantidade: number | { toString(): string }
  valorUnitCentavos: number
  valorTotalCentavos: number
}

/** O item já normalizado, do jeito que vai para a folha. */
export type LinhaDeItem = {
  descricao: string
  quantidade: number
  valorUnitCentavos: number
  valorTotalCentavos: number
}

export type Secao =
  | { tipo: 'bloco'; titulo: string; linhas: Array<[string, string]> }
  | { tipo: 'itens'; itens: LinhaDeItem[]; totalCentavos: number; rodape: string }

/** O recorte da ordem que a O.S. precisa. Só isto, e nada de `parecerTecnico`. */
export type OrdemParaDocumento = {
  diagnostico: string | null
  servicoExecutado: string | null
  testesFinais: string | null
  garantiaAte: Date | null
  tecnico: { nome: string } | null
  orcamentos: Array<{
    status: StatusOrcamento
    versao: number
    garantiaDias: number
    prazoExecucaoDias: number
    totalCentavos: number
    itens: ItemCru[]
  }>
}

/**
 * O orçamento que VALE para este papel.
 *
 * O aprovado, sempre — é o que o cliente assinou pelo link e o que a O.S.
 * executa. Só na falta dele (uma ordem que andou sem orçamento formal) cai para
 * a versão mais recente, para que o documento não saia sem valor nenhum.
 */
export function orcamentoQueVale(orcamentos: OrdemParaDocumento['orcamentos']) {
  const aprovado = orcamentos.find((o) => o.status === StatusOrcamento.APROVADO)
  if (aprovado) return aprovado
  return [...orcamentos].sort((a, b) => b.versao - a.versao)[0] ?? null
}

const temTexto = (v: string | null | undefined): v is string => Boolean(v && v.trim())

export function corpoDaOrdemDeServico(o: OrdemParaDocumento): Secao[] {
  const secoes: Secao[] = []

  // 1. O QUE FOI ENCONTRADO -------------------------------------------------
  // Sai mesmo sem diagnóstico escrito, com um travessão: a ausência é um fato
  // sobre a ordem, e esconder o bloco faria o cliente achar que a etapa nem
  // existe. Diferente dos blocos de execução abaixo, que só existem depois.
  secoes.push({
    tipo: 'bloco',
    titulo: 'O QUE FOI ENCONTRADO',
    linhas: [
      ['Técnico responsável', o.tecnico?.nome ?? '—'],
      ['Constatação', temTexto(o.diagnostico) ? o.diagnostico : '—'],
    ],
  })

  // 2. O QUE FOI FEITO ------------------------------------------------------
  const execucao: Array<[string, string]> = []
  if (temTexto(o.servicoExecutado)) execucao.push(['Serviço executado', o.servicoExecutado])
  if (temTexto(o.testesFinais)) execucao.push(['Testes finais', o.testesFinais])
  if (execucao.length) {
    secoes.push({ tipo: 'bloco', titulo: 'O QUE FOI FEITO', linhas: execucao })
  }

  // 3. VALORES --------------------------------------------------------------
  const orc = orcamentoQueVale(o.orcamentos)
  if (orc && orc.itens.length) {
    secoes.push({
      tipo: 'itens',
      itens: orc.itens.map((i) => ({ ...i, quantidade: Number(i.quantidade) })),
      totalCentavos: orc.totalCentavos,
      rodape: `Prazo de execução: ${orc.prazoExecucaoDias} dias úteis  ·  Garantia: ${orc.garantiaDias} dias`,
    })
  }

  // 4. GARANTIA -------------------------------------------------------------
  if (orc || o.garantiaAte) {
    const linhas: Array<[string, string]> = []
    if (orc) linhas.push(['Prazo', `${orc.garantiaDias} dias a contar da entrega`])
    linhas.push([
      'Vence em',
      o.garantiaAte
        ? o.garantiaAte.toLocaleDateString('pt-BR')
        : 'a contar da entrega do equipamento',
    ])
    linhas.push([
      'Não cobre',
      'mau uso, oscilação da rede elétrica, intervenção de terceiros e desgaste natural',
    ])
    secoes.push({ tipo: 'bloco', titulo: 'GARANTIA', linhas })
  }

  return secoes
}
