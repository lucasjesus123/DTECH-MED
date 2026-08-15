import { z } from 'zod'
import { EMPRESA } from './empresa'

/**
 * O CONTEÚDO DO SITE, COMO DADO.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO RESOLVE
 * ---------------------------------------------------------------------------
 * Até aqui, cada frase do site vivia escrita à mão dentro do componente. Trocar
 * "Bastidores da oficina" por "Bastidores da assistência" exigia alguém que
 * soubesse mexer no código, e uma publicação inteira. Este arquivo é a
 * separação: aqui está a FORMA do conteúdo e o valor padrão de cada campo; o
 * valor de verdade passa a vir do banco, editado pela tela do Super Admin.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM ESQUEMA DE VALIDAÇÃO, E NÃO só um tipo do TypeScript
 * ---------------------------------------------------------------------------
 * Tipo do TypeScript some na compilação. O que chega do banco é JSON — pode ter
 * sido gravado por uma versão antiga do editor, pode ter um campo a menos
 * porque alguém acrescentou uma seção depois, pode ter vindo de um `psql`
 * digitado às pressas. Sem conferência, o site quebra em produção com "não
 * consigo ler a propriedade de undefined", e quebra na página inicial.
 *
 * O esquema confere na LEITURA, e cada campo tem padrão. Conteúdo incompleto
 * completa-se sozinho com o que já existia, em vez de derrubar a página.
 *
 * ---------------------------------------------------------------------------
 * LIMITES DE TAMANHO
 * ---------------------------------------------------------------------------
 * Todo texto tem teto. Não é preciosismo: um campo sem limite é um campo onde
 * cabe um livro, e um dia alguém cola um. O teto de cada um é generoso para o
 * uso real e pequeno o bastante para o layout não explodir.
 */

/** Texto curto obrigatório. */
const t = (max: number) => z.string().trim().min(1).max(max)
/** Texto curto que pode ficar vazio — campo vazio some da tela. */
const opc = (max: number) => z.string().trim().max(max).default('')

const servico = z.object({
  icone: z.enum(['chave', 'calendario', 'medidor', 'laudo', 'caixa', 'escudo']),
  titulo: t(60),
  texto: t(240),
})

const especialidade = z.object({
  nome: t(40),
  texto: t(240),
  /** Nome do arquivo em `public/fotos/`, sem extensão. Vazio usa a marca d'água. */
  foto: opc(40),
})

const prova = z.object({
  valor: t(12),
  sufixo: opc(12),
  rotulo: t(40),
})

const etapa = z.object({
  titulo: t(80),
  quem: t(60),
  quando: t(40),
})

const avaliacao = z.object({
  autor: t(80),
  quando: t(40),
  nota: z.number().int().min(1).max(5),
  texto: opc(400),
})

export const esquemaConteudo = z.object({
  // --- Identidade e contato ------------------------------------------------
  identidade: z.object({
    nome: t(60),
    razaoSocial: t(140),
    descricaoSite: t(200),
    cnpj: opc(20),
  }),
  contato: z.object({
    /** E.164 sem o "+", como a uazapi espera. */
    whatsapp: t(20),
    telefoneExibicao: t(30),
    email: opc(120),
    horarioAtendimento: opc(80),
  }),
  endereco: z.object({
    logradouro: t(120),
    numero: t(12),
    complemento: opc(40),
    bairro: t(60),
    cidade: t(60),
    uf: t(2),
    cep: t(12),
  }),
  redes: z.object({
    instagram: opc(40),
    instagramFeed: opc(400),
    facebook: opc(200),
    googleMeuNegocio: opc(400),
    mapaEmbed: opc(1200),
  }),

  // --- Primeira dobra ------------------------------------------------------
  dobra: z.object({
    chamada: t(140),
    subChamada: t(300),
    botaoWhatsapp: t(40),
    botaoFormulario: t(40),
    provas: z.array(prova).min(1).max(6),
  }),

  // --- Marcas --------------------------------------------------------------
  marcas: z.object({
    titulo: t(80),
    lista: z.array(t(40)).min(1).max(24),
  }),

  // --- Serviços ------------------------------------------------------------
  servicos: z.object({
    titulo: t(80),
    lead: t(300),
    lista: z.array(servico).min(1).max(12),
  }),

  // --- Especialidades ------------------------------------------------------
  especialidades: z.object({
    titulo: t(90),
    lead: t(300),
    lista: z.array(especialidade).min(1).max(8),
  }),

  // --- Prontuário ----------------------------------------------------------
  prontuario: z.object({
    titulo: t(90),
    destaque: t(40),
    lead: t(400),
    itens: z.array(t(140)).min(1).max(10),
    ordemExemplo: z.object({
      numero: t(20),
      equipamento: t(80),
      detalhe: t(120),
    }),
    etapas: z.array(etapa).min(1).max(16),
  }),

  // --- A empresa -----------------------------------------------------------
  sobre: z.object({
    titulo: t(90),
    paragrafos: z.array(t(600)).min(1).max(6),
    botao: t(40),
    clientesNumero: t(30),
    clientesTexto: t(300),
    missao: t(500),
    visao: t(500),
    valores: t(500),
  }),

  // --- Google --------------------------------------------------------------
  google: z.object({
    categoria: t(80),
    nota: z.number().min(0).max(5),
    quantidade: z.number().int().min(0),
    avaliacoes: z.array(avaliacao).max(12),
    tituloFotos: t(60),
    botao: t(60),
  }),

  // --- Bastidores ----------------------------------------------------------
  bastidores: z.object({
    titulo: t(80),
    lead: t(300),
    botao: t(60),
  }),

  // --- Formulário ----------------------------------------------------------
  formulario: z.object({
    titulo: t(80),
    lead: t(300),
    botao: t(40),
    nota: t(200),
    contatoDireto: t(60),
  }),

  // --- Onde estamos --------------------------------------------------------
  onde: z.object({
    titulo: t(60),
    lead: t(300),
    botaoRota: t(40),
    botaoGoogle: t(40),
  }),

  // --- Busca ---------------------------------------------------------------
  seo: z.object({
    titulo: t(120),
    descricao: t(320),
  }),
})

export type Conteudo = z.infer<typeof esquemaConteudo>

/**
 * O conteúdo que o site mostra quando ainda não há nada gravado.
 *
 * São exatamente as palavras que estavam escritas à mão nos componentes até
 * agora, movidas para cá sem mudar uma vírgula. Isso importa: no dia em que
 * esta mudança subiu, o site continuou idêntico. Refatoração que muda o
 * resultado ao mesmo tempo é refatoração que ninguém consegue conferir.
 */
export const CONTEUDO_PADRAO: Conteudo = {
  identidade: {
    nome: EMPRESA.nome,
    razaoSocial: EMPRESA.razaoSocial,
    descricaoSite: EMPRESA.descricaoSite,
    cnpj: EMPRESA.cnpj,
  },
  contato: {
    whatsapp: EMPRESA.whatsapp,
    telefoneExibicao: EMPRESA.telefoneExibicao,
    email: EMPRESA.email,
    horarioAtendimento: EMPRESA.horarioAtendimento,
  },
  endereco: { ...EMPRESA.endereco },
  redes: {
    instagram: EMPRESA.instagram,
    instagramFeed: EMPRESA.instagramFeed,
    facebook: EMPRESA.facebook,
    googleMeuNegocio: EMPRESA.googleMeuNegocio,
    mapaEmbed: EMPRESA.mapaEmbed,
  },

  dobra: {
    chamada: EMPRESA.chamada,
    subChamada:
      `${EMPRESA.subChamada} E você acompanha cada etapa pelo celular, com o ` +
      'nome de quem mexeu e a hora.',
    botaoWhatsapp: 'Peça orçamento no WhatsApp',
    botaoFormulario: 'Solicitar retirada pelo site',
    provas: [
      { valor: '300', sufixo: '+', rotulo: 'Clientes atendidos' },
      { valor: '5,0', sufixo: '', rotulo: 'No Google' },
      { valor: '9', sufixo: '', rotulo: 'Marcas atendidas' },
      { valor: '90', sufixo: 'dias', rotulo: 'De garantia' },
    ],
  },

  marcas: {
    titulo: 'Atendemos as marcas do mercado',
    lista: [...EMPRESA.marcas],
  },

  servicos: {
    titulo: 'O que a gente resolve',
    lead: 'Do conserto ao laudo, com peça original e prazo dito na hora de fechar. Seu aparelho volta a trabalhar.',
    lista: EMPRESA.servicos.map((s) => ({ icone: s.icone, titulo: s.titulo, texto: s.texto })),
  },

  especialidades: {
    titulo: 'Inclusive a marca que ninguém quer pegar',
    lead: 'Se a peça saiu de linha, procuramos equivalente e contamos antes, não depois. Você decide se vale.',
    lista: [
      {
        nome: 'Estética',
        texto:
          'Laser, luz intensa pulsada, criolipólise, radiofrequência e ultrassom micro e macrofocado.',
        foto: 'estetica',
      },
      {
        nome: 'Médico',
        texto: 'Monitor multiparâmetro, bisturi eletrônico, foco cirúrgico e bomba de infusão.',
        foto: 'medico',
      },
      {
        nome: 'Odontológico',
        texto: 'Cadeira, refletor, autoclave, compressor, fotopolimerizador e ultrassom.',
        foto: 'odontologico',
      },
      {
        nome: 'Hospitalar',
        texto: 'Autoclave de grande porte, mesa cirúrgica, aspirador, seladora e estufa.',
        foto: 'hospitalar',
      },
    ],
  },

  prontuario: {
    titulo: 'Seu equipamento tem',
    destaque: 'prontuário',
    lead:
      'Toda assistência promete avisar. A diferença aqui é que o aviso não depende de alguém ' +
      'lembrar: a mensagem sai sozinha quando a etapa vira, e fica registrada.',
    itens: [
      'Assinatura na tela, ali na retirada, com data e horário.',
      'Pelo menos seis fotos de como o aparelho chegou.',
      'Orçamento item a item, aprovado por link, com CPF ou CNPJ conferido.',
      'Ninguém abre nada antes de você aprovar.',
      'Histórico que não dá para alterar depois. Nem nós conseguimos.',
    ],
    ordemExemplo: {
      numero: '#DT-2419',
      equipamento: 'Laser Lavieen · Duo',
      detalhe: 'NS 8842-LV-2021 · 220V · Clínica Bella Pelle',
    },
    etapas: [
      { titulo: 'Retirada assinada pelo cliente', quem: 'Motorista · Adriano M.', quando: '08/08 · 14:22' },
      { titulo: 'Recebido na assistência · 8 fotos', quem: 'Técnico · Rafael S.', quando: '08/08 · 17:05' },
      { titulo: 'Laudo e orçamento enviados', quem: 'Gestora · Camila R.', quando: '09/08 · 10:40' },
      { titulo: 'Orçamento aprovado e assinado', quem: 'Cliente · portal, CNPJ conferido', quando: '09/08 · 16:18' },
      { titulo: 'Em manutenção · troca da fonte', quem: 'Técnico · Rafael S.', quando: '12/08 · 09:12' },
    ],
  },

  sobre: {
    titulo: EMPRESA.sobreTitulo,
    paragrafos: [...EMPRESA.sobre],
    botao: 'Peça orçamento no WhatsApp',
    clientesNumero: EMPRESA.clientesAtendidos,
    clientesTexto:
      'clientes atendidos. Somos referência na manutenção de equipamentos ' +
      'médico-estéticos, odontológicos e hospitalares.',
    missao: EMPRESA.missao,
    visao: EMPRESA.visao,
    valores: EMPRESA.valores,
  },

  google: {
    categoria: 'Assistência técnica',
    nota: EMPRESA.google.nota,
    quantidade: EMPRESA.google.quantidade,
    avaliacoes: EMPRESA.google.avaliacoes.map((a) => ({ ...a })),
    tituloFotos: 'Fotos da assistência',
    botao: 'Ver todas as avaliações no Google',
  },

  bastidores: {
    titulo: 'Bastidores da assistência',
    lead:
      'Equipamento aberto, peça trocada, teste final. O que acontece antes de o ' +
      'aparelho voltar funcionando.',
    botao: 'Seguir',
  },

  formulario: {
    titulo: 'Conta pra gente o que houve',
    lead: 'Respondemos em até 24 horas úteis, já com a data da retirada.',
    botao: 'Solicitar retirada',
    nota: 'Usamos seus dados só para atender este chamado. Nada de lista de disparo.',
    contatoDireto: 'Prefere falar agora?',
  },

  onde: {
    titulo: 'Onde estamos',
    lead: 'Assistência própria em Lajeado. Retiramos e entregamos, mas se preferir trazer, a porta é esta.',
    botaoRota: 'Como chegar',
    botaoGoogle: 'Ver no Google',
  },

  seo: {
    titulo: 'Assistência técnica de equipamentos médicos e estéticos · DTECH MED',
    descricao:
      'Consertamos aparelho de estética, médico, odontológico e hospitalar, de qualquer marca. ' +
      'A gente busca na sua sala, registra cada passo e devolve funcionando, com laudo, garantia e assinatura.',
  },
}

/**
 * Interpreta o que veio do banco, completando o que faltar.
 *
 * A estratégia é FUNDIR com o padrão antes de conferir, e não conferir direto.
 * A diferença aparece no dia em que uma seção nova é acrescentada ao site: o
 * conteúdo gravado antes dela não tem esse campo, e conferir direto recusaria o
 * conteúdo inteiro — o site voltaria ao padrão e o dono perderia todo o texto
 * que escreveu. Fundindo, ele mantém o que escreveu e ganha o padrão só do que
 * ainda não existia.
 *
 * Se mesmo assim não passar (JSON corrompido, tipo trocado), devolve o padrão.
 * O site no ar com o texto de fábrica é ruim; o site fora do ar é pior.
 */
export function interpretarConteudo(bruto: unknown): {
  conteudo: Conteudo
  usouPadrao: boolean
  erro?: string
} {
  if (bruto === null || bruto === undefined) {
    return { conteudo: CONTEUDO_PADRAO, usouPadrao: true }
  }

  const r = esquemaConteudo.safeParse(fundir(CONTEUDO_PADRAO, bruto))
  if (r.success) return { conteudo: r.data, usouPadrao: false }

  return {
    conteudo: CONTEUDO_PADRAO,
    usouPadrao: true,
    erro: r.error.issues[0]
      ? `${r.error.issues[0].path.join('.')}: ${r.error.issues[0].message}`
      : 'formato inesperado',
  }
}

/**
 * Funde `novo` sobre `base`, campo a campo.
 *
 * Vetores NÃO são fundidos item a item — o vetor novo substitui o antigo
 * inteiro. É o comportamento certo aqui: se o dono apagou o sexto serviço, ele
 * quer cinco serviços, e não cinco mais o sexto de volta.
 */
function fundir(base: unknown, novo: unknown): unknown {
  if (Array.isArray(novo)) return novo
  if (novo === null || typeof novo !== 'object') return novo === undefined ? base : novo
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return novo

  const saida: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [chave, valor] of Object.entries(novo as Record<string, unknown>)) {
    saida[chave] = chave in saida ? fundir(saida[chave], valor) : valor
  }
  return saida
}

// ---------------------------------------------------------------------------
// Derivados — as mesmas contas que `empresa.ts` fazia, agora sobre o conteúdo
// ---------------------------------------------------------------------------

export function enderecoEmUmaLinhaDe(c: Conteudo): string {
  const e = c.endereco
  const numero = e.complemento ? `${e.numero}, ${e.complemento}` : e.numero
  return `${e.logradouro}, ${numero} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`
}

export function enderecoParaBuscaDe(c: Conteudo): string {
  const e = c.endereco
  return `${c.identidade.nome}, ${e.logradouro}, ${e.numero} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`
}

export function mapaUrlDe(c: Conteudo): string {
  if (c.redes.mapaEmbed) return c.redes.mapaEmbed
  return `https://www.google.com/maps?q=${encodeURIComponent(enderecoParaBuscaDe(c))}&output=embed`
}

export function linkMapsDe(c: Conteudo): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaBuscaDe(c))}`
}

export function linkWhatsappDe(c: Conteudo, mensagem?: string): string {
  const base = `https://wa.me/${c.contato.whatsapp}`
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base
}

export function instagramUsuarioDe(c: Conteudo): string {
  return c.redes.instagram.replace(/^@/, '')
}
