import { formatarBRL } from '@/lib/dinheiro'
import { reaisPorExtenso } from '@/lib/extenso'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * O QUE ENTRA NO LUGAR DE CADA `{{marcador}}`.
 *
 * =============================================================================
 * A PONTE ENTRE A ORDEM E O MODELO
 * =============================================================================
 * O modelo é texto puro com marcadores; a ordem é um monte de tabelas ligadas.
 * Esta função é o único lugar onde as duas coisas se encontram — e por isso ela
 * é a única que precisa saber que `{{cliente_endereco}}` se monta juntando seis
 * colunas.
 *
 * =============================================================================
 * NADA AQUI DEVOLVE `null`
 * =============================================================================
 * Toda chave sai como TEXTO, e o vazio é a string vazia. Quem decide o que
 * fazer com o vazio é o renderizador — ele põe um traço e denuncia. Devolver
 * `null` aqui espalharia essa decisão por trinta lugares.
 *
 * =============================================================================
 * O EXTENSO É GERADO, NUNCA GUARDADO
 * =============================================================================
 * Num título de crédito o extenso PREVALECE quando discorda do algarismo. Ele
 * sai do mesmo número que o algarismo, na mesma linha de código — não há como
 * os dois divergirem.
 */

/** O formato que o `gerarPdfDaOrdem` já carrega. Tipado pelo uso, não por interface. */
type DadosDaOrdem = {
  numero: number
  etapa: string
  abertaEm: Date
  prazoPrometido: Date | null
  defeitoRelatado: string | null
  diagnostico: string | null
  tenant: {
    nome: string
    razaoSocial: string | null
    cnpj: string | null
    logradouro: string | null
    numero: string | null
    cidade: string | null
    uf: string | null
    telefone: string | null
  }
  cliente: {
    nome: string
    documento: string
    email: string | null
    telefone: string | null
    whatsapp: string | null
    contatoNome: string | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
  }
  equipamento: { marca: string; modelo: string; numeroSerie: string | null; acessorios: string | null }
  tecnico: { nome: string } | null
  fatura: {
    valorTotalCentavos: number
    valorPagoCentavos: number
    multaCentavos: number
    jurosCentavos: number
  } | null
  orcamentos: Array<{ totalCentavos: number }>
}

const dia = (d: Date | null) =>
  d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "28 de agosto de 2026" — a forma que contrato usa na linha da assinatura. */
function diaPorExtenso(d: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(d)
  const n = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${n('day')} de ${MESES[Number(n('month')) - 1]} de ${n('year')}`
}

/** Junta o endereço pulando o que não existe, sem deixar vírgula órfã. */
function endereco(e: {
  logradouro: string | null
  numero: string | null
  complemento?: string | null
  bairro?: string | null
  cidade: string | null
  uf: string | null
}): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const meio = [e.complemento, e.bairro].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  return [rua, meio, cidade].filter(Boolean).join(' — ')
}

export function valoresDaOrdem(d: DadosDaOrdem, formatarDoc: (s: string) => string): Record<string, string> {
  const total = d.fatura?.valorTotalCentavos ?? d.orcamentos[0]?.totalCentavos ?? 0
  const aberto = d.fatura
    ? d.fatura.valorTotalCentavos + d.fatura.multaCentavos + d.fatura.jurosCentavos - d.fatura.valorPagoCentavos
    : total
  const hoje = new Date()

  return {
    empresa_nome: d.tenant.nome,
    empresa_razao: d.tenant.razaoSocial ?? d.tenant.nome,
    empresa_cnpj: d.tenant.cnpj ? formatarDoc(d.tenant.cnpj) : '',
    empresa_endereco: endereco(d.tenant),
    empresa_telefone: d.tenant.telefone ?? '',

    cliente_nome: d.cliente.nome,
    cliente_documento: formatarDoc(d.cliente.documento),
    cliente_endereco: endereco(d.cliente),
    // O WhatsApp primeiro: é o número por onde a empresa realmente fala com o
    // cliente. O fixo é o que sobra quando não há WhatsApp.
    cliente_telefone: d.cliente.whatsapp ?? d.cliente.telefone ?? '',
    cliente_email: d.cliente.email ?? '',
    cliente_contato: d.cliente.contatoNome ?? '',

    os_numero: String(d.numero).padStart(5, '0'),
    os_abertura: dia(d.abertaEm),
    os_etapa: ROTULO_ETAPA[d.etapa as keyof typeof ROTULO_ETAPA] ?? d.etapa,
    os_defeito: d.defeitoRelatado ?? '',
    os_diagnostico: d.diagnostico ?? '',
    os_tecnico: d.tecnico?.nome ?? '',
    os_prazo: dia(d.prazoPrometido),

    equipamento_marca: d.equipamento.marca,
    equipamento_modelo: d.equipamento.modelo,
    equipamento_serie: d.equipamento.numeroSerie ?? '',
    equipamento_acessorios: d.equipamento.acessorios ?? '',

    // Zero sai como vazio, e não como "R$ 0,00": um contrato que imprime
    // R$ 0,00 parece um contrato de graça; um que mostra o traço do renderizador
    // mostra que o valor não foi preenchido, que é a verdade.
    valor_total: total > 0 ? formatarBRL(total) : '',
    valor_extenso: total > 0 ? reaisPorExtenso(total) : '',
    valor_aberto: aberto > 0 ? formatarBRL(aberto) : '',
    valor_aberto_extenso: aberto > 0 ? reaisPorExtenso(aberto) : '',
    // Ainda não existe forma de pagamento fixada na ordem; quando existir, ela
    // entra aqui e o modelo que já usa o marcador passa a imprimi-la sozinho.
    forma_pagamento: '',

    hoje: dia(hoje),
    hoje_extenso: diaPorExtenso(hoje),
    cidade_foro: [d.tenant.cidade, d.tenant.uf].filter(Boolean).join('/'),
  }
}
