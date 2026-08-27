import type { EtapaOrdem } from '@/generated/prisma/enums'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * A trilha em português.
 *
 * O banco guarda `financeiro.recebimento` porque nome de ação precisa ser curto,
 * estável e ordenável — ele sobrevive a mudança de tela e de idioma. Quem lê a
 * trilha, porém, não é o banco: é o dono da empresa tentando descobrir quem
 * baixou um pagamento. Para ele a linha tem de dizer "Recebimento lançado".
 *
 * A tradução mora aqui, e não junto da consulta, porque é decisão de TELA. A
 * consulta continua devolvendo a chave crua — que é o que vai no filtro, no
 * agrupamento e num eventual relatório.
 *
 * O que não estiver no mapa **não some**: cai no `humanizar`, que devolve algo
 * legível a partir da própria chave. Ação nova aparece na tela no dia em que é
 * escrita, mesmo que ninguém lembre de traduzir — o contrário disso é uma
 * trilha com buracos, e buraco em trilha é exatamente o que não se pode ter.
 */

const MAPA: Record<string, string> = {
  'agenda.cancelada': 'Agendamento cancelado',
  'agenda.coleta': 'Coleta agendada',
  'agenda.entrega': 'Entrega agendada',
  'agenda.visita': 'Visita agendada',
  'assinatura.retirada': 'Assinatura de retirada colhida',
  'assinatura.entrega': 'Assinatura de entrega colhida',
  'assinatura.orcamento': 'Orçamento assinado pelo cliente',
  'clientes.importados': 'Clientes importados por planilha',
  'empresa.criada': 'Empresa cadastrada',
  'empresa.editada': 'Empresa editada',
  'empresa.entrada_negada': 'Entrada em empresa NEGADA',
  'empresa.entrou': 'Entrou na empresa',
  'empresa.saiu': 'Saiu da empresa',
  'estoque.entrada': 'Entrada de peça no estoque',
  'estoque.saida': 'Saída de peça do estoque',
  'estoque.ajuste': 'Ajuste de estoque',
  'financeiro.conferida': 'Fatura conferida pela gestão',
  'financeiro.estorno': 'Recebimento estornado',
  'financeiro.fatura_emitida': 'Fatura emitida',
  'financeiro.recebimento': 'Recebimento lançado',
  'orcamento.enviado': 'Orçamento enviado ao cliente',
  'orcamento.salvo': 'Orçamento salvo',
  'ordem.aberta': 'Ordem aberta',
  'ordem.cancelada': 'Ordem cancelada',
  'ordem.peca_retirada': 'Peça retirada do aparelho',
  'ordem.responsavel': 'Responsável pela ordem trocado',
  'plataforma.whatsapp_configurado': 'WhatsApp da plataforma configurado',
  'portal.documento.bloqueado': 'Portal BLOQUEADO por tentativas de CPF',
  'portal.documento.errado': 'CPF errado no portal do cliente',
  'preventiva.contrato.aberto': 'Contrato de manutenção aberto',
  'preventiva.contrato.encerrado': 'Contrato de manutenção encerrado',
  'preventiva.visita.virou_ordem': 'Visita preventiva virou ordem',
  'rota.saida': 'Saída para a rua',
  'senha.troca_falhou': 'Troca de senha falhou',
  'senha.troca_negada': 'Troca de senha NEGADA',
  'senha.trocada': 'Senha trocada',
  'senha.esqueci.pedido': 'Pediu recuperação de senha',
  'senha.esqueci.entregue': 'Link de recuperação entregue',
  'senha.esqueci.sem_canal': 'Recuperação sem canal para entregar',
  'senha.esqueci.usado': 'Senha redefinida pelo link',
  'senha.esqueci.invalido': 'Link de recuperação inválido ou vencido',
  'sessoes.encerradas': 'Sessões encerradas',
  'site.conteudo.restaurado': 'Conteúdo do site restaurado',
  'site.conteudo.salvo': 'Conteúdo do site salvo',
  'site.foto.enviada': 'Foto do site enviada',
  'site.foto.removida': 'Foto do site removida',
  'usuario.criado': 'Pessoa cadastrada',
  'usuario.editado': 'Pessoa editada',
  'usuario.excluido': 'Pessoa EXCLUÍDA',
  'whatsapp.conectar': 'WhatsApp conectado',
}

/**
 * Última linha de defesa: transforma a chave crua em algo lido por gente.
 * `preventiva.visita.virou_ordem` vira "Preventiva · visita · virou ordem".
 */
function humanizar(acao: string): string {
  const partes = acao.split('.').map((p) => p.replace(/_/g, ' ').trim())
  const primeiro = partes[0]
  if (!primeiro) return acao
  partes[0] = primeiro.charAt(0).toUpperCase() + primeiro.slice(1)
  return partes.join(' · ')
}

export function rotuloAcao(acao: string): string {
  const pronto = MAPA[acao]
  if (pronto) return pronto

  // As transições da esteira são geradas (`ordem.transicao.EM_MANUTENCAO`) e
  // por isso não cabem num mapa fixo. O rótulo vem de `ROTULO_ETAPA`, a MESMA
  // fonte que a linha do tempo usa — se um dia uma etapa for renomeada, a
  // trilha acompanha sozinha em vez de virar a única tela com o nome velho.
  if (acao.startsWith('ordem.transicao.')) {
    const etapa = acao.slice('ordem.transicao.'.length) as EtapaOrdem
    return `Etapa → ${ROTULO_ETAPA[etapa] ?? etapa.replace(/_/g, ' ').toLowerCase()}`
  }

  return humanizar(acao)
}

/** O papel de quem fez, escrito como as outras telas escrevem. */
export const PAPEL_ROTULO: Record<string, string> = {
  SUPER_ADMIN: 'Dono da plataforma',
  ADMIN_EMPRESA: 'Administrador',
  GESTOR: 'Gestor',
  FINANCEIRO: 'Financeiro',
  ATENDENTE: 'Atendente',
  TECNICO: 'Técnico',
  MOTORISTA: 'Motorista',
}

/** "há 4 minutos", "ontem 14:02", "12/03 09:41" — o tempo como se conta. */
export function quando(d: Date, agora = new Date()): string {
  const min = Math.round((agora.getTime() - d.getTime()) / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`

  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const mesmoDia = d.toDateString() === agora.toDateString()
  if (mesmoDia) return `hoje ${hora}`

  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`

  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}
