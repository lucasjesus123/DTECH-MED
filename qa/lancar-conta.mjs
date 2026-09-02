/**
 * COMO SE LANÇA UMA CONTA, NUM LUGAR SÓ.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * Lançar conta mudou de lugar: era um botão "Lançar conta a pagar" dentro da
 * aba, e virou "+ Nova conta" no cabeçalho, abrindo uma janela. A mudança está
 * certa — o botão da aba estava duplicado em "A pagar" e "A receber", e o tipo
 * vinha decidido pela aba em que a pessoa caísse.
 *
 * O problema foi outro: CINCO roteiros sabiam a sequência de cliques de cor.
 * `caixa`, `inicio`, `calendario`, `fundo-caixa` e `lancar` reprovaram todos de
 * uma vez, pelo mesmo motivo, e cada um teria de ser corrigido à mão — com a
 * chance de o quinto ficar para trás e só reprovar na semana seguinte.
 *
 * Agora a sequência mora aqui. Quando a janela mudar de novo, muda um arquivo,
 * e os cinco acompanham. É a mesma razão pela qual `PALAVRAS` é exportada de
 * `contas.tsx` em vez de copiada: duas cópias da mesma regra é uma cópia que
 * envelhece calada.
 *
 * =============================================================================
 * ELE NÃO CONFERE NADA
 * =============================================================================
 * De propósito. Um ajudante que também afirma esconde qual roteiro reprovou —
 * quem chama é que decide o que provar. Aqui só se executa o caminho e se
 * devolve o controle.
 */

/** O dia de hoje em Lajeado, como o `<input type=date>` espera. */
export function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Abre "+ Nova conta" e preenche a janela. Não clica em Salvar.
 *
 * Separado do salvar porque vários roteiros precisam OLHAR a janela aberta
 * antes de confirmar: a prévia do parcelamento, o exame de acessibilidade, a
 * largura no celular. Quem só quer a conta no banco usa `lancarConta` abaixo.
 */
export async function abrirNovaConta(p, dados = {}) {
  const {
    tipo = 'PAGAR',
    descricao,
    valor,
    vencimento = hojeISO(),
    parcelas,
    modoValor,
    categoria,
    contraparte,
    clienteIndice,
  } = dados

  await p.getByRole('button', { name: '+ Nova conta' }).click()
  // A janela é um `<dialog>` de verdade: até `showModal()` acontecer, os campos
  // existem no DOM e NÃO são preenchíveis. Esperar o atributo `open` é esperar
  // a CONDIÇÃO, e não um tempo fixo — a regra da bateria inteira.
  await p.waitForSelector('dialog[open]', { timeout: 15000 })

  const campo = (s) => p.locator(`dialog[open] ${s}`)

  if (tipo) await campo('select[name=tipo]').selectOption(tipo)
  if (valor !== undefined) await campo('input[name=valor]').fill(String(valor))
  if (vencimento) await campo('input[name=vencimento]').fill(vencimento)
  if (descricao !== undefined) await campo('input[name=descricao]').fill(descricao)
  if (parcelas !== undefined) await campo('select[name=parcelas]').selectOption(String(parcelas))
  if (modoValor) await campo('select[name=modoValor]').selectOption(modoValor)

  // Categoria, cliente e contraparte moram atrás de um `<details>` fechado: quem
  // lança a conta de luz não quer atravessar quatro campos que vai deixar em
  // branco. Só se abre quando alguém pediu um deles.
  if (categoria !== undefined || contraparte !== undefined || clienteIndice !== undefined) {
    await campo('details summary').click()
    await p.waitForTimeout(200)
    if (categoria !== undefined) await campo('input[name=categoria]').fill(categoria)
    if (contraparte !== undefined) await campo('input[name=contraparte]').fill(contraparte)
    if (clienteIndice !== undefined) {
      await campo('select[name=clienteId]').selectOption({ index: clienteIndice })
    }
  }

  // Dá um quadro para a prévia do parcelamento recalcular antes de quem chamou
  // ir lê-la.
  await p.waitForTimeout(300)
}

/** Abre, preenche, salva, e espera a janela fechar sozinha. */
export async function lancarConta(p, dados = {}) {
  await abrirNovaConta(p, dados)
  await p.locator('dialog[open]').getByRole('button', { name: 'Salvar' }).click()
  // A janela fecha por conta própria quando a ação devolve sucesso. Esperar o
  // FECHAMENTO em vez de dormir prova que salvou de verdade — se a ação
  // recusar, ela fica aberta com o motivo, e aqui estoura o tempo em vez de
  // seguir em frente fingindo que deu certo.
  await p.waitForSelector('dialog[open]', { state: 'detached', timeout: 20000 }).catch(async () => {
    await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 20000 })
  })
  await p.waitForTimeout(900)
}
