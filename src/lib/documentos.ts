/**
 * CPF, CNPJ e telefone, escritos como se escreve.
 *
 * =============================================================================
 * POR QUE ISTO SAIU DE DENTRO DE UMA TELA
 * =============================================================================
 * As duas funções moravam no fim de `clientes/page.tsx`, e serviam a uma tela
 * só. Quando a ficha do cliente nasceu, ela mostrou "11444777000161" e
 * "5551980449274" — números crus, ao lado da mesma informação formatada na
 * lista, a um clique de distância.
 *
 * A saída fácil seria copiar as duas funções para o novo arquivo. Copiar é o
 * que produz o defeito clássico deste tipo de código: alguém corrige a máscara
 * num lugar (o dia em que aparecer um telefone de nove dígitos, ou um CNPJ
 * alfanumérico) e o outro lugar continua errado, mostrando a MESMA informação
 * de dois jeitos na mesma sessão de uso.
 *
 * Aqui elas são puras — sem banco, sem rede, sem React — e por isso testáveis
 * de graça.
 *
 * =============================================================================
 * A REGRA DAS DUAS: NUNCA ESCONDER O QUE NÃO ENTENDERAM
 * =============================================================================
 * Documento com tamanho inesperado volta como veio. Formatar à força um número
 * de 12 dígitos produziria uma máscara que parece certa e não é — e aí ninguém
 * descobre que o cadastro está errado, porque a tela disfarçou.
 */

/** `11444777000161` → `11.444.777/0001-61`. CPF e CNPJ, pelo tamanho. */
export function formatarDocumento(bruto: string): string {
  const d = bruto.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return bruto
}

/**
 * `5551980449274` → `(51) 98044-9274`.
 *
 * O `55` do começo é tirado porque ele entra sozinho quando o número vem do
 * WhatsApp, e ninguém no Brasil lê o código do país num telefone da própria
 * cidade. O número guardado no banco não muda — só a leitura.
 */
export function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return bruto
}
