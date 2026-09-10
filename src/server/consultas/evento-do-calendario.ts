import { comEscopo, type ContextoAcesso } from '@/lib/db'
import type { Periodicidade, StatusAgendamento, StatusVisita } from '@/generated/prisma/enums'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { ROTEIRO, TOTAL_DE_PASSOS, passoDaEtapa } from '@/server/ordem/roteiro'

/**
 * O QUE HÁ DENTRO DE UM EVENTO DO CALENDÁRIO.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * A grade mostrava um risquinho por evento — "Buscar · LUCAS" — e clicar nele
 * levava embora: a parada abria a ficha da O.S., o contrato abria o cliente, a
 * preventiva abria a lista de preventivas. Três telas diferentes, todas fora do
 * calendário, todas exigindo o botão "voltar" para continuar olhando o mês.
 *
 * E o pior não era o pulo, era o que ele custava: quem clica num evento do
 * calendário quase nunca quer TRABALHAR aquela ordem. Quer saber **o que é
 * aquilo** — que horas, com quem, onde, quem vai, já aceitou, está atrasado. Um
 * `title` de HTML respondia um terço disso, ao passar o mouse, e some no
 * celular.
 *
 * A janela responde tudo isso sem sair do lugar, e continua oferecendo o pulo
 * para quem realmente quer trabalhar — só que como ESCOLHA, com nome, e não
 * como consequência de ter clicado.
 *
 * =============================================================================
 * UMA UNIÃO DISCRIMINADA, E NÃO UM SACO DE `linhas: {rotulo, valor}[]`
 * =============================================================================
 * A forma genérica é tentadora: uma lista de pares e a janela desenha tudo
 * igual. Mas as quatro fontes não têm o mesmo peso nem o mesmo desenho — a
 * parada tem endereço, telefone e recado, e isso é um bloco; o compromisso tem
 * um texto solto e dois botões que MUDAM o dado. Achatar as quatro num par de
 * strings faria a janela desenhar tudo com a mesma importância, que é
 * exatamente o defeito que ela veio corrigir.
 *
 * =============================================================================
 * NENHUM VALOR EM DINHEIRO SAI DAQUI — a mesma trava do resto do calendário
 * =============================================================================
 * O contrato tem `valorVisitaCentavos`, e ele NÃO entra. O calendário é aberto
 * ao MOTORISTA (ver a guarda da página), e a razão de ele não ter corte de
 * permissão é justamente não ter dinheiro nenhum para cortar. Trazer o valor da
 * visita aqui criaria o primeiro, e criaria escondido dentro de uma janela.
 */

/** O prefixo do id diz de que tabela ele veio. Igual ao que a grade monta. */
type Fonte = 'ag' | 'pv' | 'cp' | 'ct'

const PREFIXOS: Record<string, Fonte> = { ag: 'ag', pv: 'pv', cp: 'cp', ct: 'ct' }

export type LinhaDeDetalhe = { rotulo: string; valor: string }

type Comum = {
  /** O id composto, como veio da grade — é ele que fecha e reabre a janela. */
  id: string
  titulo: string
  /** 'AAAA-MM-DD' do evento, para o cabeçalho por extenso. */
  dia: string
  atrasado: boolean
}

export type DetalheDoEvento =
  | (Comum & {
      tipo: 'parada'
      sentido: 'RETIRADA' | 'ENTREGA'
      situacao: string
      /** A faixa combinada, ou só a hora prevista. */
      horario: string
      cliente: string
      clienteId: string
      telefoneCliente: string | null
      equipamento: string
      serie: string | null
      numeroOs: number
      ordemId: string
      etapa: string
      passo: number
      passoNome: string
      viaCorreio: boolean
      endereco: string
      referencia: string | null
      contato: string | null
      telefoneContato: string | null
      recado: string | null
      motorista: string | null
      aceitoEm: string | null
      saiuEm: string | null
      concluidoEm: string | null
      motivoFalha: string | null
      posicaoRota: number | null
    })
  | (Comum & {
      tipo: 'preventiva'
      situacao: string
      cliente: string
      clienteId: string
      equipamento: string
      serie: string | null
      contratoNumero: number
      periodicidade: string
      observacao: string | null
      ordemId: string | null
      numeroOs: number | null
      /** Quantas visitas do contrato já foram feitas, de quantas existem. */
      feitas: number
      totalDeVisitas: number
    })
  | (Comum & {
      tipo: 'contrato'
      numero: number
      cliente: string
      clienteId: string
      equipamento: string
      serie: string | null
      periodicidade: string
      inicio: string
      fim: string | null
      ativo: boolean
      observacoes: string | null
      feitas: number
      totalDeVisitas: number
      /** A próxima visita ainda prevista, se houver. */
      proximaVisita: string | null
    })
  | (Comum & {
      tipo: 'compromisso'
      hora: string | null
      responsavel: string | null
      observacao: string | null
      concluido: boolean
      autor: string | null
      criadoEm: string
    })

/**
 * Um evento da grade, inteiro.
 *
 * Devolve `null` quando o id não existe, não é deste tenant ou tem prefixo
 * desconhecido — os três casos dão no mesmo para quem chama: a janela não abre
 * e o calendário continua na tela. Não jogar erro é de propósito: um endereço
 * velho colado no navegador não pode derrubar a página inteira.
 */
export async function detalheDoEvento(
  ctx: ContextoAcesso,
  idComposto: string,
): Promise<DetalheDoEvento | null> {
  const corte = idComposto.indexOf('-')
  if (corte !== 2) return null
  const fonte = PREFIXOS[idComposto.slice(0, 2)]
  const id = idComposto.slice(3)
  if (!fonte || !id) return null

  const agora = new Date()

  return comEscopo(ctx, async (tx) => {
    if (fonte === 'ag') {
      const a = await tx.agendamento.findUnique({
        where: { id },
        select: {
          id: true,
          tipo: true,
          status: true,
          previstoPara: true,
          janelaInicio: true,
          janelaFim: true,
          aceitoEm: true,
          iniciadoEm: true,
          concluidoEm: true,
          enderecoSnapshot: true,
          contatoNome: true,
          contatoTelefone: true,
          pontoReferencia: true,
          observacoes: true,
          motivoFalha: true,
          posicaoRota: true,
          motorista: { select: { nome: true } },
          ordem: {
            select: {
              id: true,
              numero: true,
              etapa: true,
              viaCorreio: true,
              cliente: { select: { id: true, nome: true, telefone: true } },
              equipamento: {
                select: { marca: true, modelo: true, numeroSerie: true },
              },
            },
          },
        },
      })
      if (!a) return null

      const passo = passoDaEtapa(a.ordem.etapa)
      const doPasso = ROTEIRO[passo - 1]
      const buscar = a.tipo === 'RETIRADA'

      return {
        tipo: 'parada',
        id: idComposto,
        titulo: `${buscar ? 'Buscar' : 'Entregar'} · ${a.ordem.cliente.nome}`,
        dia: diaLocal(a.previstoPara),
        atrasado: a.status !== 'CONCLUIDO' && a.previstoPara < agora,
        sentido: buscar ? 'RETIRADA' : 'ENTREGA',
        situacao: SITUACAO_PARADA[a.status],
        horario: a.janelaFim
          ? `${horaDe(a.janelaInicio ?? a.previstoPara)} às ${horaDe(a.janelaFim)}`
          : horaDe(a.previstoPara),
        cliente: a.ordem.cliente.nome,
        clienteId: a.ordem.cliente.id,
        telefoneCliente: a.ordem.cliente.telefone,
        equipamento: `${a.ordem.equipamento.marca} ${a.ordem.equipamento.modelo}`,
        serie: a.ordem.equipamento.numeroSerie,
        numeroOs: a.ordem.numero,
        ordemId: a.ordem.id,
        etapa: ROTULO_ETAPA[a.ordem.etapa],
        passo,
        passoNome:
          (a.ordem.viaCorreio ? doPasso?.envio?.nome : null) ?? doPasso?.nome ?? '—',
        viaCorreio: a.ordem.viaCorreio,
        endereco: a.enderecoSnapshot,
        referencia: a.pontoReferencia,
        contato: a.contatoNome,
        telefoneContato: a.contatoTelefone,
        recado: a.observacoes,
        motorista: a.motorista?.nome ?? null,
        aceitoEm: a.aceitoEm ? quandoDe(a.aceitoEm) : null,
        saiuEm: a.iniciadoEm ? quandoDe(a.iniciadoEm) : null,
        concluidoEm: a.concluidoEm ? quandoDe(a.concluidoEm) : null,
        motivoFalha: a.motivoFalha,
        posicaoRota: a.posicaoRota,
      }
    }

    if (fonte === 'pv') {
      const v = await tx.visitaPreventiva.findUnique({
        where: { id },
        select: {
          previstaPara: true,
          status: true,
          observacao: true,
          ordem: { select: { id: true, numero: true } },
          contrato: {
            select: {
              numero: true,
              periodicidade: true,
              cliente: { select: { id: true, nome: true } },
              equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
              visitas: { select: { status: true } },
            },
          },
        },
      })
      if (!v) return null

      const visitas = v.contrato.visitas
      return {
        tipo: 'preventiva',
        id: idComposto,
        titulo: `Preventiva · ${v.contrato.cliente.nome}`,
        dia: diaLocal(v.previstaPara),
        atrasado: v.status === 'PREVISTA' && v.previstaPara < agora,
        situacao: SITUACAO_VISITA[v.status],
        cliente: v.contrato.cliente.nome,
        clienteId: v.contrato.cliente.id,
        equipamento: `${v.contrato.equipamento.marca} ${v.contrato.equipamento.modelo}`,
        serie: v.contrato.equipamento.numeroSerie,
        contratoNumero: v.contrato.numero,
        periodicidade: PERIODICIDADE[v.contrato.periodicidade],
        observacao: v.observacao,
        ordemId: v.ordem?.id ?? null,
        numeroOs: v.ordem?.numero ?? null,
        feitas: visitas.filter((x) => x.status === 'REALIZADA').length,
        totalDeVisitas: visitas.length,
      }
    }

    if (fonte === 'ct') {
      const k = await tx.contratoManutencao.findUnique({
        where: { id },
        select: {
          numero: true,
          inicio: true,
          fim: true,
          ativo: true,
          periodicidade: true,
          observacoes: true,
          cliente: { select: { id: true, nome: true } },
          equipamento: { select: { marca: true, modelo: true, numeroSerie: true } },
          visitas: {
            select: { status: true, previstaPara: true },
            orderBy: { previstaPara: 'asc' },
          },
        },
      })
      if (!k || !k.fim) return null

      const proxima = k.visitas.find((x) => x.status === 'PREVISTA' || x.status === 'AGENDADA')
      return {
        tipo: 'contrato',
        id: idComposto,
        titulo: `Contrato #${String(k.numero).padStart(4, '0')} termina`,
        dia: diaLocal(k.fim),
        atrasado: k.fim < agora,
        numero: k.numero,
        cliente: k.cliente.nome,
        clienteId: k.cliente.id,
        equipamento: `${k.equipamento.marca} ${k.equipamento.modelo}`,
        serie: k.equipamento.numeroSerie,
        periodicidade: PERIODICIDADE[k.periodicidade],
        inicio: dataDe(k.inicio),
        fim: dataDe(k.fim),
        ativo: k.ativo,
        observacoes: k.observacoes,
        feitas: k.visitas.filter((x) => x.status === 'REALIZADA').length,
        totalDeVisitas: k.visitas.length,
        proximaVisita: proxima ? dataDe(proxima.previstaPara) : null,
      }
    }

    const c = await tx.compromisso.findUnique({
      where: { id },
      select: {
        titulo: true,
        dia: true,
        hora: true,
        observacao: true,
        concluido: true,
        autorNome: true,
        criadoEm: true,
        responsavel: { select: { nome: true } },
      },
    })
    if (!c) return null

    /**
     * O DIA DO COMPROMISSO É `@db.Date` — sem hora e sem fuso.
     *
     * As outras três fontes guardam instante, e por isso passam por `diaLocal`,
     * que converte para o fuso da casa. Fazer isso aqui empurraria o dia 12
     * para o 11: a meia-noite UTC do `Date` puro é 21h do dia anterior em
     * Lajeado. O `toISOString` cru é o certo justamente porque não há instante
     * nenhum para converter.
     */
    const dia = c.dia.toISOString().slice(0, 10)
    return {
      tipo: 'compromisso',
      id: idComposto,
      titulo: c.titulo,
      dia,
      atrasado: !c.concluido && dia < diaLocal(agora),
      hora: c.hora,
      responsavel: c.responsavel?.nome ?? null,
      observacao: c.observacao,
      concluido: c.concluido,
      autor: c.autorNome,
      criadoEm: quandoDe(c.criadoEm),
    }
  })
}

const SITUACAO_PARADA: Record<StatusAgendamento, string> = {
  PENDENTE: 'Sem motorista definido',
  ATRIBUIDO: 'Motorista designado',
  EM_ROTA: 'A caminho',
  CONCLUIDO: 'Concluída',
  FALHOU: 'Não deu certo',
  CANCELADO: 'Cancelada',
}

const SITUACAO_VISITA: Record<StatusVisita, string> = {
  PREVISTA: 'Prevista pelo contrato',
  AGENDADA: 'Agendada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
}

const PERIODICIDADE: Record<Periodicidade, string> = {
  MENSAL: 'a cada mês',
  BIMESTRAL: 'a cada dois meses',
  TRIMESTRAL: 'a cada três meses',
  SEMESTRAL: 'a cada seis meses',
  ANUAL: 'uma vez por ano',
}

/** O total de passos entra no texto da janela; importado para não repetir 11. */
export const PASSOS_DA_OS = TOTAL_DE_PASSOS

const FUSO = 'America/Sao_Paulo'

const diaLocal = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)

const horaDe = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)

const dataDe = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)

const quandoDe = (d: Date) => `${dataDe(d)} às ${horaDe(d)}`
