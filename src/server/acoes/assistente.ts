'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { comEscopo } from '@/lib/db'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { auditar, exigirPapel, ipDaRequisicao } from '@/server/auth/guarda'
import { enderecoDaColeta } from '@/lib/endereco'
import { env } from '@/lib/env'
import { aCentavos, lerValorBR } from '@/lib/dinheiro'
import { ROTULO_ETAPA, TERMINAIS, proximosPassos } from '@/server/ordem/maquina-estados'
import { montarRoteiro, type Roteiro } from '@/server/ordem/roteiro'
import {
  agendaDosMotoristas,
  type AgendaDeMotorista,
  type ParadaMarcada,
} from '@/server/consultas/listas'
import { avancarOrdem } from '@/server/ordem/motor'
import { dossieDaOrdem, type Dossie } from './acompanhar'

/**
 * O QUE A JANELA DA O.S. PRECISA SABER — tudo, numa ida só.
 *
 * =============================================================================
 * POR QUE UMA AÇÃO NOVA, E NÃO O DOSSIÊ DA TELINHA
 * =============================================================================
 * O dossiê responde "me conta como está essa ordem" — é para o telefone tocar e
 * alguém RESPONDER. Esta janela é outra coisa: é onde se TRABALHA a ordem. Ela
 * precisa do que o dossiê de propósito não carrega — o que dá para fazer agora,
 * quem pode fazer, o que falta para o próximo passo, a agenda dos motoristas
 * para marcar o dia, e o link do portal.
 *
 * O dossiê continua sendo reaproveitado inteiro: esta ação chama ele e ACRESCENTA
 * a parte de trabalho. Duas leituras num clique é barato; duas cópias da mesma
 * consulta de setenta campos, não — a segunda envelhece sozinha no dia em que
 * alguém mexer só na primeira.
 *
 * =============================================================================
 * O QUE ESTA AÇÃO NÃO FAZ
 * =============================================================================
 * Não decide nada. Ela LÊ e devolve; quem valida transição continua sendo o
 * motor, e quem diz quem pode continua sendo a máquina de estados. Se um dia a
 * tela mostrar um botão a mais por engano, o clique é recusado do mesmo jeito.
 */

export type PassoOferecido = {
  para: EtapaOrdem
  titulo: string
  avisaCliente: boolean
  /** Este passo abre a marcação de parada antes de andar. */
  pedeParada: 'RETIRADA' | 'ENTREGA' | null
}

export type ParadaParaMarcar = {
  tipo: 'RETIRADA' | 'ENTREGA'
  /** Os passos que só andam depois que ela existir. */
  exigidaPor: EtapaOrdem[]
  dias: string[]
  motoristas: AgendaDeMotorista[]
  semMotorista: ParadaMarcada[]
  endereco: string
  contatoNome: string
  contatoTelefone: string
  observacoes: string
}

export type PainelDaOrdem = {
  dossie: Dossie
  roteiro: Roteiro
  etapaRotulo: string
  prioridade: 'NORMAL' | 'ALTA'
  defeitoRelatado: string
  diagnostico: string | null
  /** O cliente é que despacha o aparelho: não há motorista na ida. */
  viaCorreio: boolean
  codigoRastreio: string | null
  valorPrevioCentavos: number | null
  condicaoCombinada: string | null
  contatoNome: string | null
  passos: PassoOferecido[]
  parada: ParadaParaMarcar | null
  podeCancelar: boolean
  /** Só quem pode mexer em dinheiro vê e edita o combinado. */
  podeCombinar: boolean
  /** O endereço da casa, para o aviso de envio dizer para onde mandar. */
  enderecoDaCasa: string | null
  linkPortal: string
}

type Resposta<T = undefined> =
  | { ok: true; dados?: T }
  | { ok: false; motivo: string }

const CENTRAL: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]
/** Quem decide — e cancelar é decisão, não atendimento. */
const GESTAO: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

/** O mesmo preâmbulo das outras ações: a empresa vem da sessão, nunca do form. */
async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return {
    sessao,
    ctx: contextoDe(sessao),
    ator: { id: sessao.userId, nome: sessao.nome, papel: sessao.papel },
  }
}

async function ipAtual() {
  return ipDaRequisicao(await headers(), env.TRUST_PROXY)
}

function enderecoDaCasa(t: {
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}): string | null {
  const rua = [t.logradouro, t.numero].filter(Boolean).join(', ')
  const praca = [t.cidade, t.uf].filter(Boolean).join('/')
  return [rua, t.bairro, praca, t.cep && `CEP ${t.cep}`].filter(Boolean).join(' — ') || null
}

export async function painelDaOrdem(
  ordemId: string,
): Promise<{ ok: true; painel: PainelDaOrdem } | { ok: false; motivo: string }> {
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )

  const [dossie, extra] = await Promise.all([
    dossieDaOrdem(ordemId),
    comEscopo(ctx, (tx) =>
      tx.ordem.findUnique({
        where: { id: ordemId },
        select: {
          etapa: true,
          prioridade: true,
          viaCorreio: true,
          codigoRastreio: true,
          valorPrevioCentavos: true,
          condicaoCombinada: true,
          defeitoRelatado: true,
          diagnostico: true,
          tokenPublico: true,
          cliente: {
            select: {
              contatoNome: true,
              telefone: true,
              logradouro: true,
              numero: true,
              complemento: true,
              bairro: true,
              cidade: true,
              uf: true,
              coletaMesmoEndereco: true,
              coletaLogradouro: true,
              coletaNumero: true,
              coletaComplemento: true,
              coletaBairro: true,
              coletaCidade: true,
              coletaUf: true,
              coletaObservacao: true,
            },
          },
          tenant: {
            select: {
              logradouro: true,
              numero: true,
              bairro: true,
              cidade: true,
              uf: true,
              cep: true,
            },
          },
          eventos: {
            orderBy: { sequencia: 'asc' },
            select: { etapaNova: true, criadoEm: true, autorNome: true },
          },
          agendamentos: { select: { tipo: true, status: true } },
        },
      }),
    ),
  ])

  // Ordem de outra franquia não devolve linha nenhuma pelo RLS, e a resposta é
  // a mesma de "não existe" — é essa indistinção que evita confirmar o registro.
  if (!dossie.ok) return dossie
  if (!extra) return { ok: false, motivo: 'Ordem não encontrada.' }

  const passosDaMaquina = proximosPassos(extra.etapa, sessao.papel)

  /**
   * QUAL PASSO PEDE PARADA sai da própria máquina de estados, pelo `exige` da
   * transição — nunca de uma lista repetida aqui. Uma segunda lista ficaria
   * desencontrada no dia em que a esteira mudasse, e o sintoma seria o pior
   * possível: uma janela de agendamento abrindo para um passo que não precisa
   * dela, ou recusando em silêncio o passo que precisava.
   */
  const tipoQuePede = (exige: readonly string[] | undefined): 'RETIRADA' | 'ENTREGA' | null =>
    exige?.includes('PARADA_DE_RETIRADA')
      ? 'RETIRADA'
      : exige?.includes('PARADA_DE_ENTREGA')
        ? 'ENTREGA'
        : null

  const passos: PassoOferecido[] = passosDaMaquina.map((p) => ({
    para: p.para,
    titulo: p.titulo,
    avisaCliente: p.avisaCliente,
    // A retirada pelo correio não tem parada para marcar: o motor dispensa a
    // exigência, e oferecer a janela do calendário aqui seria pedir motorista
    // para uma viagem que ninguém vai fazer.
    pedeParada:
      tipoQuePede(p.exige) === 'RETIRADA' && extra.viaCorreio ? null : tipoQuePede(p.exige),
  }))

  const pedindo = passos.filter((p) => p.pedeParada !== null)
  const tipoDaParada = pedindo[0]?.pedeParada ?? null

  // A mesma lista de status que o motor usa: cancelada não conta, concluída sim.
  const jaTemParada =
    tipoDaParada !== null &&
    extra.agendamentos.some((a) => a.tipo === tipoDaParada && a.status !== 'CANCELADO')

  const podeAgendar = CENTRAL.includes(sessao.papel)

  // A agenda dos motoristas é consulta cara e só serve quando a janela vai de
  // fato oferecer o calendário. Fora disso ela nem roda.
  const agenda =
    tipoDaParada && !jaTemParada && podeAgendar ? await agendaDosMotoristas(ctx) : null

  const parada: ParadaParaMarcar | null =
    agenda && tipoDaParada
      ? {
          tipo: tipoDaParada,
          exigidaPor: pedindo.map((p) => p.para),
          dias: agenda.dias,
          motoristas: agenda.motoristas,
          semMotorista: agenda.semMotorista,
          endereco: enderecoDaColeta(extra.cliente),
          contatoNome: extra.cliente.contatoNome ?? '',
          contatoTelefone: extra.cliente.telefone ?? '',
          // O recado do cadastro só descreve o OUTRO endereço. No mesmo
          // endereço ele costuma estar vazio, ou falar de outra coisa.
          observacoes: extra.cliente.coletaMesmoEndereco
            ? ''
            : (extra.cliente.coletaObservacao ?? ''),
        }
      : null

  return {
    ok: true,
    painel: {
      dossie: dossie.dossie,
      roteiro: montarRoteiro(
        extra.etapa,
        extra.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
        { viaCorreio: extra.viaCorreio },
      ),
      etapaRotulo: ROTULO_ETAPA[extra.etapa],
      prioridade: extra.prioridade === 'ALTA' ? 'ALTA' : 'NORMAL',
      defeitoRelatado: extra.defeitoRelatado,
      diagnostico: extra.diagnostico,
      viaCorreio: extra.viaCorreio,
      codigoRastreio: extra.codigoRastreio,
      valorPrevioCentavos: extra.valorPrevioCentavos,
      condicaoCombinada: extra.condicaoCombinada,
      contatoNome: extra.cliente.contatoNome,
      passos,
      parada,
      podeCancelar: GESTAO.includes(sessao.papel) && !TERMINAIS.includes(extra.etapa),
      podeCombinar: CENTRAL.includes(sessao.papel),
      enderecoDaCasa: enderecoDaCasa(extra.tenant),
      linkPortal: `${env.APP_URL}/os/${extra.tokenPublico}`,
    },
  }
}

// ---------------------------------------------------------------------------
// O passo 1: o valor combinado antes de existir orçamento
// ---------------------------------------------------------------------------

const schemaCombinado = z.object({
  ordemId: z.string().min(1),
  /** Vazio significa "apagar o que estava lá" — e apagar é correção legítima. */
  valor: z.string().trim().max(20),
  condicao: z.string().trim().max(200),
})

/**
 * Grava o que foi combinado no telefone.
 *
 * Fica na trilha de auditoria com o antes e o depois. Mudar em silêncio o valor
 * que o cliente ouviu é indistinguível de reescrever a conversa — e é
 * exatamente essa a discussão que aparece na hora de cobrar.
 */
export async function salvarCombinado(_anterior: unknown, form: FormData): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!CENTRAL.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não mexe no valor combinado.' }
  }
  const ctx = contextoDe(sessao)

  const d = schemaCombinado.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // `lerValorBR` é quem sabe que "1.200" é mil e duzentos aqui e um vírgula dois
  // para o `Number`. Adivinhar isso na mão multiplica a conta por mil.
  const reais = v.valor === '' ? null : lerValorBR(v.valor)
  if (v.valor !== '' && (reais === null || reais < 0)) {
    return { ok: false, motivo: 'Valor inválido. Escreva como 250,00.' }
  }
  const centavos = reais === null ? null : aCentavos(reais)

  const antes = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: v.ordemId },
      select: { valorPrevioCentavos: true, condicaoCombinada: true },
    }),
  )
  if (!antes) return { ok: false, motivo: 'Ordem não encontrada.' }

  await comEscopo(ctx, (tx) =>
    tx.ordem.update({
      where: { id: v.ordemId },
      data: {
        valorPrevioCentavos: centavos,
        condicaoCombinada: v.condicao || null,
      },
    }),
  )

  await auditar(ctx, sessao, {
    acao: 'ordem.combinado',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    detalhes: {
      de: { valor: antes.valorPrevioCentavos, condicao: antes.condicaoCombinada },
      para: { valor: centavos, condicao: v.condicao || null },
    },
  })

  revalidatePath('/painel/ordens')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// O passo 3: quem leva o aparelho até a bancada
// ---------------------------------------------------------------------------

const schemaEnvio = z.object({
  ordemId: z.string().min(1),
  rastreio: z.string().trim().max(60),
})

/**
 * "O CLIENTE É QUE ENVIA" — a outra metade do passo 3.
 *
 * =============================================================================
 * POR QUE ISTO PRECISOU EXISTIR
 * =============================================================================
 * Os 10% que chegam de transportadora não tinham caminho honesto no sistema. A
 * única saída de `ORDEM_RETIRADA_GERADA` é `RETIRADA_AGENDADA`, que exige
 * parada marcada — e parada é dia, hora e MOTORISTA. Para uma caixa que o
 * cliente vai postar não existe motorista nenhum, então ou a ordem ficava presa
 * ali para sempre, ou alguém marcava uma parada de mentira só para destravar,
 * enfiando na rota de um motorista uma viagem que ele nunca faria.
 *
 * Agora a escolha é explícita e fica gravada: `viaCorreio` marca a ordem, o
 * motor dispensa a parada só para a IDA, e o aviso que sai no WhatsApp é outro
 * texto — com o endereço da casa e o pedido do código de rastreio, em vez de
 * "quem vai buscar".
 *
 * A VOLTA continua exigindo parada. Na entrega o aparelho é nosso e sai daqui:
 * alguém dirige.
 */
export async function marcarComoEnvioDoCliente(
  _anterior: unknown,
  form: FormData,
): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!CENTRAL.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não define como o aparelho vem.' }
  }

  const d = schemaEnvio.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const ordem = await comEscopo(a.ctx, (tx) =>
    tx.ordem.findUnique({ where: { id: v.ordemId }, select: { etapa: true } }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }
  if (ordem.etapa !== EtapaOrdem.ORDEM_RETIRADA_GERADA) {
    return {
      ok: false,
      motivo: `Esta ordem já passou do ponto de escolher como o aparelho vem — ela está em "${ROTULO_ETAPA[ordem.etapa]}".`,
    }
  }

  /**
   * A MARCA VEM ANTES DA TRANSIÇÃO, e a ordem importa.
   *
   * É `viaCorreio` que faz o motor dispensar a parada e o worker escolher o
   * outro texto do WhatsApp. Gravada depois, a transição seria recusada por
   * falta de parada — e, se passasse, o aviso já teria saído prometendo um
   * motorista que não existe.
   */
  await comEscopo(a.ctx, (tx) =>
    tx.ordem.update({
      where: { id: v.ordemId },
      data: { viaCorreio: true, codigoRastreio: v.rastreio || null },
    }),
  )

  const r = await avancarOrdem(a.ctx, a.ator, {
    ordemId: v.ordemId,
    para: EtapaOrdem.RETIRADA_AGENDADA,
    observacao: v.rastreio
      ? `O cliente envia o aparelho. Rastreio ${v.rastreio}.`
      : 'O cliente envia o aparelho.',
    ip: await ipAtual(),
  })

  await auditar(a.ctx, a.sessao, {
    acao: 'ordem.envio_do_cliente',
    entidade: 'ordem',
    entidadeId: v.ordemId,
    negado: !r.ok,
    detalhes: r.ok ? { rastreio: v.rastreio || null } : { motivo: r.motivo },
  })

  if (!r.ok) {
    // A transição foi recusada: desfazemos a marca para a ordem não ficar
    // dizendo "vem pelo correio" enquanto continua parada esperando motorista.
    await comEscopo(a.ctx, (tx) =>
      tx.ordem.update({ where: { id: v.ordemId }, data: { viaCorreio: false } }),
    )
    return { ok: false, motivo: r.motivo }
  }

  revalidatePath('/painel/ordens')
  revalidatePath('/painel')
  return { ok: true }
}
