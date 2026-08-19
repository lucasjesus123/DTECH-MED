'use server'

import { Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { exigirPapel } from '@/server/auth/guarda'
import { montarTrilha, type Trilha } from '@/server/ordem/trilha'
import { pendenciaDePecas } from '@/server/estoque/pendencia'

/**
 * O DOSSIÊ DA ORDEM, PARA A TELINHA.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SOB DEMANDA, E NÃO JUNTO COM A LISTA
 * ---------------------------------------------------------------------------
 * A tela Acompanhar mostra até sessenta cartões. Trazer fotos, assinaturas,
 * pagamentos e documentos dos sessenta para o caso de alguém clicar em UM seria
 * carregar sessenta vezes mais dado do que se usa — e a tela que existe para
 * responder rápido ficaria lenta justamente no dia cheio, que é quando ela
 * importa.
 *
 * Aqui o cartão continua leve e o dossiê vem no clique.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE DEVOLVE, E O QUE NÃO DEVOLVE
 * ---------------------------------------------------------------------------
 * Devolve o que responde "me conta tudo dessa ordem" com o cliente ao telefone:
 * onde está, quanto é, quanto falta pagar, que provas existem, quem assinou.
 *
 * NÃO devolve o token do portal. Ele é a credencial do cliente e não tem o que
 * fazer trafegando para uma tela que só precisa mostrar estado — quem quiser o
 * link abre a ficha, onde ele já vive, com o resto do contexto junto.
 */

export type Dossie = {
  id: string
  numero: number
  etapa: string
  abertaEm: string
  prazoPrometido: string | null
  atrasada: boolean
  emGarantia: boolean
  cliente: { nome: string; whatsapp: string | null; cidade: string | null; uf: string | null; endereco: string | null }
  equipamento: { id: string; marca: string; modelo: string; numeroSerie: string | null }
  tecnico: string | null
  trilha: Trilha
  orcamento: {
    numero: number
    versao: number
    status: string
    totalCentavos: number
    garantiaDias: number
    aprovadoPorNome: string | null
    respondidoEm: string | null
    itens: Array<{ tipo: string; descricao: string; quantidade: number; totalCentavos: number }>
  } | null
  fatura: {
    numero: number
    status: string
    valorTotalCentavos: number
    valorPagoCentavos: number
    emAbertoCentavos: number
    pagamentos: Array<{ id: string; forma: string; valorCentavos: number; recebidoEm: string }>
  } | null
  fotos: Array<{ id: string; categoria: string; legenda: string | null }>
  assinaturas: Array<{
    id: string
    tipo: string
    nome: string
    documento: string | null
    quando: string
    coordenada: string | null
  }>
  documentos: Array<{ id: string; tipo: string; token: string | null }>
  agendamentos: Array<{ id: string; tipo: string; status: string; previstoPara: string; motorista: string | null }>
  faltaPeca: string | null
  /** O que dá para despachar agora: retirada, entrega, ou nada. */
  despacho: 'RETIRADA' | 'ENTREGA' | null
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export async function dossieDaOrdem(
  ordemId: string,
): Promise<{ ok: true; dossie: Dossie } | { ok: false; motivo: string }> {
  const { ctx } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )

  const dados = await comEscopo(ctx, async (tx) => {
    const o = await tx.ordem.findUnique({
      where: { id: ordemId },
      select: {
        id: true,
        numero: true,
        etapa: true,
        abertaEm: true,
        prazoPrometido: true,
        emGarantia: true,
        cliente: {
          select: { nome: true, whatsapp: true, cidade: true, uf: true, logradouro: true },
        },
        equipamento: { select: { id: true, marca: true, modelo: true, numeroSerie: true } },
        tecnico: { select: { nome: true } },
        eventos: {
          orderBy: { sequencia: 'asc' },
          select: { etapaNova: true, criadoEm: true, autorNome: true },
        },
        orcamentos: {
          orderBy: { versao: 'desc' },
          take: 1,
          select: {
            numero: true,
            versao: true,
            status: true,
            totalCentavos: true,
            garantiaDias: true,
            aprovadoPorNome: true,
            respondidoEm: true,
            itens: {
              orderBy: { ordem: 'asc' },
              select: { tipo: true, descricao: true, quantidade: true, valorTotalCentavos: true },
            },
          },
        },
        fatura: {
          select: {
            numero: true,
            status: true,
            valorTotalCentavos: true,
            valorPagoCentavos: true,
            pagamentos: {
              orderBy: { recebidoEm: 'asc' },
              select: { id: true, forma: true, valorCentavos: true, recebidoEm: true },
            },
          },
        },
        fotos: { orderBy: { criadoEm: 'asc' }, select: { id: true, categoria: true, legenda: true } },
        assinaturas: {
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            tipo: true,
            assinanteNome: true,
            assinanteDocumento: true,
            criadoEm: true,
            latitude: true,
            longitude: true,
          },
        },
        documentos: { orderBy: { geradoEm: 'desc' }, select: { id: true, tipo: true, tokenAcesso: true } },
        agendamentos: {
          orderBy: { previstoPara: 'asc' },
          select: {
            id: true,
            tipo: true,
            status: true,
            previstoPara: true,
            motorista: { select: { nome: true } },
          },
        },
      },
    })
    if (!o) return null

    const pend = await pendenciaDePecas(tx, o.id)
    return { o, pend }
  })

  // Ordem de outra franquia não devolve linha nenhuma pelo RLS. A resposta é a
  // mesma de "não existe" — e é essa indistinção que evita confirmar o registro.
  if (!dados) return { ok: false, motivo: 'Ordem não encontrada.' }
  const { o, pend } = dados

  const orc = o.orcamentos[0] ?? null
  const agora = new Date()

  /**
   * O que dá para despachar AGORA.
   *
   * Só duas etapas pedem a rua, e são as duas pontas do serviço: a ordem de
   * retirada esperando alguém buscar, e a faturada esperando alguém entregar.
   * Fora delas o botão não aparece — botão que aparece e recusa ensina a
   * ignorar botão.
   */
  const despacho: Dossie['despacho'] =
    o.etapa === 'ORDEM_RETIRADA_GERADA' ? 'RETIRADA' : o.etapa === 'FATURADO' ? 'ENTREGA' : null

  return {
    ok: true,
    dossie: {
      id: o.id,
      numero: o.numero,
      etapa: o.etapa,
      abertaEm: o.abertaEm.toISOString(),
      prazoPrometido: iso(o.prazoPrometido),
      atrasada: !!o.prazoPrometido && o.prazoPrometido < agora,
      emGarantia: o.emGarantia,
      cliente: {
        nome: o.cliente.nome,
        whatsapp: o.cliente.whatsapp,
        cidade: o.cliente.cidade,
        uf: o.cliente.uf,
        endereco: o.cliente.logradouro,
      },
      equipamento: o.equipamento,
      tecnico: o.tecnico?.nome ?? null,
      trilha: montarTrilha(
        o.etapa,
        o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
      ),
      orcamento: orc
        ? {
            numero: orc.numero,
            versao: orc.versao,
            status: orc.status,
            totalCentavos: orc.totalCentavos,
            garantiaDias: orc.garantiaDias,
            aprovadoPorNome: orc.aprovadoPorNome,
            respondidoEm: iso(orc.respondidoEm),
            itens: orc.itens.map((i) => ({
              tipo: i.tipo,
              descricao: i.descricao,
              quantidade: Number(i.quantidade),
              totalCentavos: i.valorTotalCentavos,
            })),
          }
        : null,
      fatura: o.fatura
        ? {
            numero: o.fatura.numero,
            status: o.fatura.status,
            valorTotalCentavos: o.fatura.valorTotalCentavos,
            valorPagoCentavos: o.fatura.valorPagoCentavos,
            emAbertoCentavos: o.fatura.valorTotalCentavos - o.fatura.valorPagoCentavos,
            pagamentos: o.fatura.pagamentos.map((p) => ({
              id: p.id,
              forma: p.forma,
              valorCentavos: p.valorCentavos,
              recebidoEm: p.recebidoEm.toISOString(),
            })),
          }
        : null,
      fotos: o.fotos,
      assinaturas: o.assinaturas.map((s) => ({
        id: s.id,
        tipo: s.tipo,
        nome: s.assinanteNome,
        documento: s.assinanteDocumento,
        quando: s.criadoEm.toISOString(),
        coordenada:
          s.latitude != null && s.longitude != null
            ? `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`
            : null,
      })),
      documentos: o.documentos.map((d) => ({ id: d.id, tipo: d.tipo, token: d.tokenAcesso })),
      agendamentos: o.agendamentos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        status: a.status,
        previstoPara: a.previstoPara.toISOString(),
        motorista: a.motorista?.nome ?? null,
      })),
      faltaPeca: pend.aviso,
      despacho,
    },
  }
}
