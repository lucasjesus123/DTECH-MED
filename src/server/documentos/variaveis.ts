/**
 * AS VARIÁVEIS DO DOCUMENTO, E O QUE AS SUBSTITUI.
 *
 * =============================================================================
 * POR QUE O MODELO É TEXTO COM `{{marcador}}`, E NÃO CAMPO A CAMPO
 * =============================================================================
 * Um contrato não é um formulário: é um TEXTO CORRIDO onde o dado aparece no
 * meio da frase. "pagará à LOCADORA o valor total de R$ 1.750,00, na forma Pix"
 * não se monta com campos — se escreve, com dois buracos no meio.
 *
 * O marcador `{{...}}` é o formato que quem escreve contrato já reconhece, e é
 * o mesmo que o sistema de locação usa. Quem for montar o modelo copia da
 * paleta e cola no meio da frase.
 *
 * =============================================================================
 * A REGRA QUE PROTEGE O DOCUMENTO: MARCADOR DESCONHECIDO NÃO SOME
 * =============================================================================
 * Este é o erro que estraga um contrato assinado, e ele é silencioso.
 *
 * Se alguém escrever `{{cliente_nomee}}` com um "e" a mais, a tentação é trocar
 * por vazio — e aí sai um contrato com "LOCATÁRIO(A): , portador do documento"
 * no meio da folha, que ninguém relê antes de mandar assinar.
 *
 * Aqui o marcador desconhecido FICA VISÍVEL, escrito como está. Um documento
 * com `{{cliente_nomee}}` impresso é constrangedor e é notado na hora; um
 * documento com um buraco no lugar do nome é assinado.
 *
 * O contador de desconhecidos existe pelo mesmo motivo: a pré-visualização
 * avisa ANTES, na tela de quem monta o modelo.
 *
 * =============================================================================
 * PURO DE PROPÓSITO
 * =============================================================================
 * Sem banco, sem PDF, sem React. Quem monta os valores é quem tem os dados; aqui
 * só entram texto e um mapa. É a parte onde teste é barato — e um erro aqui sai
 * impresso num documento que alguém assina.
 */

/** Um marcador que o modelo pode usar, com o que explicar para quem escreve. */
export type Variavel = {
  /** Sem as chaves: `cliente_nome`. */
  chave: string
  rotulo: string
  /** O grupo da paleta, para a lista não virar um paredão de sessenta itens. */
  grupo: string
  /** O que sai no lugar dele, para a pessoa entender sem precisar testar. */
  exemplo: string
}

/**
 * O CATÁLOGO.
 *
 * Ele é a única lista: a paleta da tela, a validação do modelo e a
 * pré-visualização leem daqui. Duas listas da mesma verdade em arquivos
 * diferentes é como se ganha uma paleta que oferece um marcador que a geração
 * não conhece.
 */
export const VARIAVEIS: readonly Variavel[] = [
  // ---- a empresa que emite -------------------------------------------------
  { chave: 'empresa_nome',        rotulo: 'Nome da empresa',        grupo: 'Empresa',      exemplo: 'DTECH MED' },
  { chave: 'empresa_razao',       rotulo: 'Razão social',           grupo: 'Empresa',      exemplo: 'DTECH MED Assistência Técnica LTDA' },
  { chave: 'empresa_cnpj',        rotulo: 'CNPJ',                   grupo: 'Empresa',      exemplo: '12.345.678/0001-90' },
  { chave: 'empresa_endereco',    rotulo: 'Endereço completo',      grupo: 'Empresa',      exemplo: 'Av. Benjamin Constant, 1180 — Lajeado/RS' },
  { chave: 'empresa_telefone',    rotulo: 'Telefone',               grupo: 'Empresa',      exemplo: '(51) 3714-0000' },

  // ---- o cliente -----------------------------------------------------------
  { chave: 'cliente_nome',        rotulo: 'Nome ou razão social',   grupo: 'Cliente',      exemplo: 'Clínica Bella Pelle' },
  { chave: 'cliente_documento',   rotulo: 'CPF ou CNPJ',            grupo: 'Cliente',      exemplo: '11.444.777/0001-61' },
  { chave: 'cliente_endereco',    rotulo: 'Endereço completo',      grupo: 'Cliente',      exemplo: 'R. Sabiá, 702, Sala 03 — Lajeado/RS' },
  { chave: 'cliente_telefone',    rotulo: 'Telefone',               grupo: 'Cliente',      exemplo: '(51) 98044-9274' },
  { chave: 'cliente_email',       rotulo: 'E-mail',                 grupo: 'Cliente',      exemplo: 'contato@bellapelle.com.br' },
  { chave: 'cliente_contato',     rotulo: 'Quem é o contato',       grupo: 'Cliente',      exemplo: 'Mariana Farias' },

  // ---- a O.S. --------------------------------------------------------------
  { chave: 'os_numero',           rotulo: 'Número da O.S.',         grupo: 'Ordem de serviço', exemplo: '00023' },
  { chave: 'os_abertura',         rotulo: 'Data de abertura',       grupo: 'Ordem de serviço', exemplo: '28/08/2026' },
  { chave: 'os_etapa',            rotulo: 'Etapa atual',            grupo: 'Ordem de serviço', exemplo: 'Em manutenção' },
  { chave: 'os_defeito',          rotulo: 'Defeito relatado',       grupo: 'Ordem de serviço', exemplo: 'Liga e desliga sozinho' },
  { chave: 'os_diagnostico',      rotulo: 'Laudo técnico',          grupo: 'Ordem de serviço', exemplo: 'Fonte com capacitor estufado' },
  { chave: 'os_tecnico',          rotulo: 'Técnico responsável',    grupo: 'Ordem de serviço', exemplo: 'Rafael Souza' },
  { chave: 'os_prazo',            rotulo: 'Prazo prometido',        grupo: 'Ordem de serviço', exemplo: '05/09/2026' },

  // ---- o aparelho ----------------------------------------------------------
  { chave: 'equipamento_marca',   rotulo: 'Marca',                  grupo: 'Equipamento',  exemplo: 'Lavieen' },
  { chave: 'equipamento_modelo',  rotulo: 'Modelo',                 grupo: 'Equipamento',  exemplo: 'Duo' },
  { chave: 'equipamento_serie',   rotulo: 'Número de série',        grupo: 'Equipamento',  exemplo: 'LA-3050-QA' },
  { chave: 'equipamento_acessorios', rotulo: 'Acessórios',          grupo: 'Equipamento',  exemplo: 'Cabo, pedal, ponteira' },

  // ---- dinheiro ------------------------------------------------------------
  // `valor_extenso` não é enfeite: num título de crédito é ele que prevalece
  // quando discorda do algarismo. Por isso ele é gerado, nunca digitado.
  { chave: 'valor_total',         rotulo: 'Valor total',            grupo: 'Dinheiro',     exemplo: 'R$ 1.795,00' },
  { chave: 'valor_extenso',       rotulo: 'Valor por extenso',      grupo: 'Dinheiro',     exemplo: 'mil setecentos e noventa e cinco reais' },
  { chave: 'valor_aberto',        rotulo: 'Saldo em aberto',        grupo: 'Dinheiro',     exemplo: 'R$ 897,50' },
  { chave: 'valor_aberto_extenso',rotulo: 'Saldo por extenso',      grupo: 'Dinheiro',     exemplo: 'oitocentos e noventa e sete reais e cinquenta centavos' },
  { chave: 'forma_pagamento',     rotulo: 'Forma de pagamento',     grupo: 'Dinheiro',     exemplo: 'Pix' },

  // ---- a data de hoje ------------------------------------------------------
  { chave: 'hoje',                rotulo: 'Data de hoje',           grupo: 'Data',         exemplo: '28/08/2026' },
  { chave: 'hoje_extenso',        rotulo: 'Data por extenso',       grupo: 'Data',         exemplo: '28 de agosto de 2026' },
  { chave: 'cidade_foro',         rotulo: 'Cidade do foro',         grupo: 'Data',         exemplo: 'Lajeado/RS' },
]

/** O catálogo agrupado, na ordem em que a paleta mostra. */
export function variaveisPorGrupo(): Array<[string, Variavel[]]> {
  const mapa = new Map<string, Variavel[]>()
  for (const v of VARIAVEIS) {
    const lista = mapa.get(v.grupo)
    if (lista) lista.push(v)
    else mapa.set(v.grupo, [v])
  }
  return [...mapa.entries()]
}

const CONHECIDAS = new Set(VARIAVEIS.map((v) => v.chave))

/**
 * O marcador. Aceita espaço em volta — `{{ cliente_nome }}` é o que sai de um
 * copiar-e-colar de editor de texto, e recusar isso faria a pessoa caçar um
 * espaço invisível.
 */
const MARCADOR = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

export type Renderizacao = {
  texto: string
  /** Marcadores que o catálogo não conhece — erro de digitação de quem montou. */
  desconhecidos: string[]
  /** Conhecidos, mas sem valor NESTA ordem. Ex.: laudo antes de o técnico escrever. */
  vazios: string[]
}

/**
 * Troca os marcadores pelos valores.
 *
 * O que ele NÃO faz, e é a decisão que importa: apagar o que não conhece. Ver o
 * cabeçalho do arquivo — um documento com `{{cliente_nomee}}` impresso é notado
 * na hora; um com um buraco no lugar do nome é assinado.
 */
export function renderizarModelo(corpo: string, valores: Record<string, string>): Renderizacao {
  const desconhecidos = new Set<string>()
  const vazios = new Set<string>()

  const texto = corpo.replace(MARCADOR, (inteiro, bruto: string) => {
    const chave = bruto.toLowerCase()
    if (!CONHECIDAS.has(chave)) {
      desconhecidos.add(chave)
      return inteiro // fica visível, escrito como está
    }
    const valor = valores[chave]
    if (valor === undefined || valor === '') {
      vazios.add(chave)
      // Um traço, e não vazio: o leitor vê que ali havia um campo e que ele
      // não foi preenchido, em vez de ler uma frase truncada sem perceber.
      return '—'
    }
    return valor
  })

  return { texto, desconhecidos: [...desconhecidos], vazios: [...vazios] }
}

/**
 * Os marcadores usados por um modelo, na ordem em que aparecem e sem repetir.
 * A tela de quem monta usa isto para dizer "este modelo pede seis dados".
 */
export function marcadoresDe(corpo: string): string[] {
  const achados: string[] = []
  for (const m of corpo.matchAll(MARCADOR)) {
    const chave = m[1]!.toLowerCase()
    if (!achados.includes(chave)) achados.push(chave)
  }
  return achados
}

/**
 * O texto de exemplo — o que a pré-visualização mostra quando ainda não há uma
 * O.S. escolhida para simular. Ele usa o `exemplo` do catálogo, então quem monta
 * vê a FORMA do documento pronto antes de existir qualquer dado real.
 */
export function valoresDeExemplo(): Record<string, string> {
  return Object.fromEntries(VARIAVEIS.map((v) => [v.chave, v.exemplo]))
}
