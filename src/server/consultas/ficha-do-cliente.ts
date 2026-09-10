import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { mascararDocumento } from '@/lib/documentos'

/**
 * A FICHA DO CLIENTE, PARA LER DE DENTRO DA JANELA DA O.S.
 *
 * =============================================================================
 * POR QUE ELA NÃO É A TELA DE CLIENTES
 * =============================================================================
 * A tela de clientes é para CADASTRAR: formulários, endereço de cobrança,
 * endereço de coleta, representante legal. Isto aqui é para RESPONDER, com a
 * O.S. na frente, as perguntas que aparecem enquanto se trabalha uma ordem:
 *
 *   "esse cliente é PJ?"        → tipo e documento
 *   "para onde eu ligo?"        → telefone, WhatsApp e o contato do local
 *   "ele já teve problema?"     → as outras ordens dele, com etapa e data
 *   "tem contrato com a gente?" → os contratos, ativos e vencidos
 *   "ele deve alguma coisa?"    → o que está em aberto, e há quanto tempo
 *
 * Sair da ordem para descobrir isso é o movimento que faz alguém perder o lugar
 * — e é exatamente o que o dono do sistema pediu para acabar: *"assim que eu
 * quero que apareça a ficha completa do cliente tipo aba por aba dentro dessa
 * janela"*.
 *
 * =============================================================================
 * O DINHEIRO SAI DAQUI COM CORTE, E O CORTE VEM DE FORA
 * =============================================================================
 * A pendência financeira só é calculada quando quem chama diz que pode ver
 * dinheiro. O parâmetro é obrigatório de propósito: uma tela nova que esquecer
 * de passá-lo mostra o cliente sem o financeiro, que é o erro seguro. O
 * contrário — um default `true` — faria a próxima tela vazar o caixa por
 * omissão.
 */
export type FichaDoCliente = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  razaoSocial: string | null
  /** Mascarado: a ficha responde "é ele mesmo?", não serve de cópia do CPF. */
  documento: string
  email: string | null
  telefone: string | null
  whatsapp: string | null
  endereco: string | null
  /** O endereço de coleta, quando é outro. */
  enderecoDeColeta: string | null
  pontoReferencia: string | null
  contatoNome: string | null
  contatoTelefone: string | null
  representante: string | null
  observacoes: string | null
  clienteDesde: string
  /** Os aparelhos deste cliente que passaram por aqui. */
  aparelhos: Array<{
    id: string
    marca: string
    modelo: string
    numeroSerie: string | null
    ordens: number
  }>
  /** As outras ordens dele — a desta janela sai da lista. */
  outrasOrdens: Array<{
    id: string
    numero: number
    etapa: string
    equipamento: string
    abertaEm: string
    encerrada: boolean
  }>
  contratos: Array<{
    numero: number
    equipamento: string
    periodicidade: string
    fim: string | null
    ativo: boolean
  }>
  /**
   * O que ele deve. `null` quando quem pediu não pode ver dinheiro — e a tela
   * desenha um cartão dizendo isso, em vez de um zero que mentiria.
   */
  financeiro: {
    emAbertoCentavos: number
    faturasEmAberto: number
    /** Dias desde o vencimento mais antigo em aberto. Zero = nada vencido. */
    diasDeAtrasoMaior: number
  } | null
}

export async function fichaDoCliente(
  ctx: ContextoAcesso,
  clienteId: string,
  opcoes: { ordemAtual: string; podeVerDinheiro: boolean },
): Promise<FichaDoCliente | null> {
  return comEscopo(ctx, async (tx) => {
    const c = await tx.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        tipo: true,
        razaoSocial: true,
        documento: true,
        email: true,
        telefone: true,
        whatsapp: true,
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        pontoReferencia: true,
        contatoNome: true,
        contatoTelefone: true,
        coletaMesmoEndereco: true,
        coletaLogradouro: true,
        coletaNumero: true,
        coletaComplemento: true,
        coletaBairro: true,
        coletaCidade: true,
        coletaUf: true,
        representanteNome: true,
        representanteVinculo: true,
        representanteTelefone: true,
        observacoes: true,
        criadoEm: true,
        equipamentos: {
          orderBy: { criadoEm: 'desc' },
          take: 20,
          select: {
            id: true,
            marca: true,
            modelo: true,
            numeroSerie: true,
            _count: { select: { ordens: true } },
          },
        },
        ordens: {
          orderBy: { abertaEm: 'desc' },
          take: 30,
          select: {
            id: true,
            numero: true,
            etapa: true,
            abertaEm: true,
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
        contratos: {
          orderBy: { inicio: 'desc' },
          take: 20,
          select: {
            numero: true,
            periodicidade: true,
            fim: true,
            ativo: true,
            equipamento: { select: { marca: true, modelo: true } },
          },
        },
      },
    })
    if (!c) return null

    /**
     * AS FATURAS EM ABERTO SÓ SÃO CONSULTADAS QUANDO ALGUÉM PODE VER.
     *
     * Não é só não mostrar: é não buscar. Um dado que não sai do banco não
     * escapa por um `console.log`, por um erro serializado, nem pela próxima
     * pessoa que der um `JSON.stringify` no objeto inteiro para depurar.
     */
    let financeiro: FichaDoCliente['financeiro'] = null
    if (opcoes.podeVerDinheiro) {
      const faturas = await tx.fatura.findMany({
        where: { ordem: { clienteId }, status: { notIn: ['QUITADA', 'CANCELADA'] } },
        select: { valorTotalCentavos: true, valorPagoCentavos: true, vencimento: true },
      })
      const agora = Date.now()
      let emAberto = 0
      let maisAntigo = 0
      for (const f of faturas) {
        emAberto += f.valorTotalCentavos - f.valorPagoCentavos
        if (f.vencimento && f.vencimento.getTime() < agora) {
          const dias = Math.floor((agora - f.vencimento.getTime()) / 86_400_000)
          if (dias > maisAntigo) maisAntigo = dias
        }
      }
      financeiro = {
        emAbertoCentavos: emAberto,
        faturasEmAberto: faturas.length,
        diasDeAtrasoMaior: maisAntigo,
      }
    }

    const linha = (partes: Array<string | null | undefined>) =>
      partes.filter(Boolean).join(', ') || null

    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      razaoSocial: c.razaoSocial,
      documento: mascararDocumento(c.documento),
      email: c.email,
      telefone: c.telefone,
      whatsapp: c.whatsapp,
      endereco: linha([
        c.logradouro && c.numero ? `${c.logradouro}, ${c.numero}` : c.logradouro,
        c.complemento,
        c.bairro,
        c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade,
        c.cep,
      ]),
      // Só quando é OUTRO endereço. Repetir o mesmo em dois cartões faria a
      // pessoa procurar a diferença entre duas linhas iguais.
      enderecoDeColeta: c.coletaMesmoEndereco
        ? null
        : linha([
            c.coletaLogradouro && c.coletaNumero
              ? `${c.coletaLogradouro}, ${c.coletaNumero}`
              : c.coletaLogradouro,
            c.coletaComplemento,
            c.coletaBairro,
            c.coletaCidade && c.coletaUf ? `${c.coletaCidade}/${c.coletaUf}` : c.coletaCidade,
          ]),
      pontoReferencia: c.pontoReferencia,
      contatoNome: c.contatoNome,
      contatoTelefone: c.contatoTelefone,
      representante: c.representanteNome
        ? `${c.representanteNome}${c.representanteVinculo ? ` · ${c.representanteVinculo}` : ''}${
            c.representanteTelefone ? ` · ${c.representanteTelefone}` : ''
          }`
        : null,
      observacoes: c.observacoes,
      clienteDesde: DATA.format(c.criadoEm),
      aparelhos: c.equipamentos.map((e) => ({
        id: e.id,
        marca: e.marca,
        modelo: e.modelo,
        numeroSerie: e.numeroSerie,
        ordens: e._count.ordens,
      })),
      outrasOrdens: c.ordens
        .filter((o) => o.id !== opcoes.ordemAtual)
        .map((o) => ({
          id: o.id,
          numero: o.numero,
          etapa: o.etapa,
          equipamento: `${o.equipamento.marca} ${o.equipamento.modelo}`,
          abertaEm: DATA.format(o.abertaEm),
          encerrada: o.etapa === 'FINALIZADO' || o.etapa === 'CANCELADO',
        })),
      contratos: c.contratos.map((k) => ({
        numero: k.numero,
        equipamento: `${k.equipamento.marca} ${k.equipamento.modelo}`,
        periodicidade: k.periodicidade,
        fim: k.fim ? DATA.format(k.fim) : null,
        ativo: k.ativo,
      })),
      financeiro,
    }
  })
}

const DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
