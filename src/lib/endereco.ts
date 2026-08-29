/**
 * O ENDEREÇO PARA ONDE O MOTORISTA VAI.
 *
 * =============================================================================
 * POR QUE ISTO É UMA FUNÇÃO, E NÃO UMA LINHA REPETIDA
 * =============================================================================
 * A regra "usa o de coleta quando houver, senão o do cadastro" precisa valer no
 * agendamento, no aplicativo do motorista, na ficha do cliente e em qualquer
 * lugar que venha depois. Escrita em quatro lugares, ela envelhece em três.
 *
 * E o custo de errar não é dado errado no banco: é o motorista atravessando a
 * cidade e voltando de mãos vazias, com o cliente esperando.
 *
 * =============================================================================
 * O QUE `coletaMesmoEndereco` RESOLVE
 * =============================================================================
 * Sem a marca, a única pista seria "os campos de coleta estão vazios" — e vazio
 * é ambíguo: pode ser "é o mesmo endereço" ou "ninguém perguntou ainda". As
 * duas coisas parecem iguais no banco e são opostas na rua.
 *
 * Com a marca, `true` é uma AFIRMAÇÃO: alguém conferiu e é o mesmo lugar.
 */

type Partes = {
  logradouro: string | null
  numero: string | null
  complemento?: string | null
  bairro?: string | null
  cidade: string | null
  uf: string | null
}

/** Junta as partes pulando o que não existe, sem deixar vírgula órfã. */
export function juntarEndereco(e: Partes): string {
  return [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ')
}

type ComColeta = Partes & {
  coletaMesmoEndereco: boolean
  coletaLogradouro: string | null
  coletaNumero: string | null
  coletaComplemento: string | null
  coletaBairro: string | null
  coletaCidade: string | null
  coletaUf: string | null
}

export function enderecoDaColeta(c: ComColeta): string {
  if (c.coletaMesmoEndereco) return juntarEndereco(c)

  const coleta = juntarEndereco({
    logradouro: c.coletaLogradouro,
    numero: c.coletaNumero,
    complemento: c.coletaComplemento,
    bairro: c.coletaBairro,
    cidade: c.coletaCidade,
    uf: c.coletaUf,
  })

  // Desmarcado E vazio: alguém disse "é outro lugar" e não preencheu qual.
  // Cair no endereço do cadastro aqui seria pior do que parece — ele foi
  // explicitamente marcado como NÃO sendo o lugar da coleta, e mandar o
  // motorista para lá é mandá-lo ao endereço que a pessoa acabou de negar.
  //
  // Devolver o do cadastro mesmo assim é o menor mal (é o único endereço que
  // existe), mas quem chama precisa saber: por isso a frase entre parênteses,
  // que aparece na tela de quem marca a parada e provoca a pergunta certa.
  if (!coleta) return juntarEndereco(c) ? `${juntarEndereco(c)} (CONFERIR: coleta é noutro endereço, não informado)` : ''
  return coleta
}
