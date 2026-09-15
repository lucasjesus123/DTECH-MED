'use server'

import { revalidatePath } from 'next/cache'
import { Papel, type TipoDocumento } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { gerarPdfDaOrdem } from '@/server/documentos/gerar'
import { guardarPdfRecebido } from '@/server/arquivos/storage'
import { hashEvento, novoToken } from '@/lib/cripto'

/**
 * EMITIR UM DOCUMENTO SOB DEMANDA.
 *
 * =============================================================================
 * POR QUE ESTES DOIS SÃO PEDIDOS, E NÃO AUTOMÁTICOS
 * =============================================================================
 * Os outros documentos nascem sozinhos, disparados pela esteira: a ordem de
 * retirada quando a coleta é agendada, o recibo quando a fatura é quitada. Eles
 * acompanham fatos que sempre acontecem.
 *
 * Contrato de prestação e nota promissória não. O contrato só é preciso quando
 * o cliente é hospital ou órgão público e o setor de compras exige instrumento
 * assinado; a nota promissória, quando o cliente leva o aparelho e paga depois.
 * Emitir os dois em toda ordem encheria a pasta de papel que ninguém pediu — e
 * uma nota promissória gerada sem necessidade é um TÍTULO DE CRÉDITO solto, com
 * o valor da dívida escrito nele.
 *
 * =============================================================================
 * QUEM EMITE
 * =============================================================================
 * Do FINANCEIRO para cima. Os dois documentos obrigam o cliente — um em
 * contrato, outro em título — e assinar em nome da empresa não é trabalho de
 * bancada nem de balcão.
 *
 * =============================================================================
 * O VALOR NUNCA É DIGITADO
 * =============================================================================
 * Ele vem da fatura, ou do orçamento aprovado quando ainda não há fatura. Um
 * campo de valor aqui seria a porta para cobrar diferente do que foi combinado
 * — e, na nota promissória, para emitir um título por uma quantia que o cliente
 * nunca aprovou.
 */

type Resposta = { ok: true; mensagem: string } | { ok: false; motivo: string }

const PODE_EMITIR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.FINANCEIRO,
]

/** Só estes dois. Os demais nascem da esteira e não se pedem à mão. */
const SOB_DEMANDA: TipoDocumento[] = ['CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA']

const NOME: Record<string, string> = {
  CONTRATO_PRESTACAO: 'Contrato de prestação de serviço',
  NOTA_PROMISSORIA: 'Nota promissória',
}

export async function emitirDocumento(ordemId: string, tipo: string): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_EMITIR.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não emite contrato nem nota promissória.' }
  }
  if (!SOB_DEMANDA.includes(tipo as TipoDocumento)) {
    return { ok: false, motivo: 'Este documento não é emitido à mão — ele nasce da esteira.' }
  }

  const ctx = contextoDe(sessao)
  let tenantId: string
  try {
    tenantId = exigirEmpresa(ctx)
  } catch {
    return { ok: false, motivo: 'Você está fora de uma empresa. Entre numa empresa para emitir.' }
  }

  // A ORDEM É CONFERIDA DENTRO DO ESCOPO ANTES DE GERAR. `gerarPdfDaOrdem`
  // monta o próprio contexto a partir do tenantId que recebe; sem esta leitura,
  // um id de outra franquia chegaria lá dentro e a checagem dependeria de um
  // detalhe daquela função. Aqui a recusa é explícita e local.
  const ordem = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({
      where: { id: ordemId },
      select: {
        id: true,
        numero: true,
        fatura: {
          select: {
            valorTotalCentavos: true,
            valorPagoCentavos: true,
            multaCentavos: true,
            jurosCentavos: true,
          },
        },
        orcamentos: {
          where: { status: 'APROVADO' },
          orderBy: { versao: 'desc' },
          take: 1,
          select: { totalCentavos: true },
        },
      },
    }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

  /**
   * OS DOIS DOCUMENTOS OLHAM NÚMEROS DIFERENTES, E ISSO É O PONTO.
   *
   * O CONTRATO vale o serviço combinado: é o valor TOTAL, e ele não muda quando
   * o cliente paga — um contrato de dez mil continua sendo de dez mil depois de
   * quitado.
   *
   * A NOTA PROMISSÓRIA é promessa do que AINDA SE DEVE: é o saldo em ABERTO.
   * Emiti-la pelo total transformaria um título em cobrança de coisa já paga.
   *
   * A primeira versão errou exatamente aqui: a trava conferia o total e o PDF
   * imprimia o saldo. Numa ordem já quitada a trava aprovava (total = 1.795,00)
   * e saía uma nota promissória de R$ 0,00, com "ZERO REAL" por extenso no
   * meio da folha. Um título sem objeto, assinável.
   *
   * Agora o número que a trava confere é O MESMO que o documento imprime.
   */
  const total = ordem.fatura?.valorTotalCentavos ?? ordem.orcamentos[0]?.totalCentavos ?? 0
  const emAberto = ordem.fatura
    ? ordem.fatura.valorTotalCentavos +
      ordem.fatura.multaCentavos +
      ordem.fatura.jurosCentavos -
      ordem.fatura.valorPagoCentavos
    : total

  const valor = tipo === 'NOTA_PROMISSORIA' ? emAberto : total

  if (valor <= 0) {
    return {
      ok: false,
      motivo:
        tipo === 'NOTA_PROMISSORIA'
          ? 'Não há saldo em aberto nesta ordem. Nota promissória é promessa de pagamento — sem dívida, ela sairia zerada.'
          : 'Esta ordem ainda não tem valor aprovado. O contrato sai com o valor do orçamento — sem ele, sairia zerado.',
    }
  }

  try {
    await gerarPdfDaOrdem({ ordemId, documento: tipo as TipoDocumento }, tenantId)
  } catch (e) {
    return {
      ok: false,
      motivo: `Não foi possível gerar o documento: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
    }
  }

  await auditar(ctx, sessao, {
    acao: 'documento.emitido',
    entidade: 'ordem',
    entidadeId: ordemId,
    detalhes: { tipo, valorCentavos: valor },
  })

  revalidatePath(`/painel/ordens/${ordemId}`)
  return { ok: true, mensagem: `${NOME[tipo] ?? 'Documento'} emitido.` }
}

/* ==========================================================================
   ANEXAR A O.S. QUE O CLIENTE DEVOLVEU ASSINADA
   --------------------------------------------------------------------------
   O pedido do dono, descrevendo a etapa 2:

     "A PESSOA ASSINA COM O CPF E RUBRICA NA TELA DO CELULAR **OU MANDA A O.S
      ASSINADA PELO GOV E ANEXAMOS NO PRONTUÁRIO**"

   O primeiro caminho existia e funciona: o cliente abre o link, digita o CPF e
   rabisca com o dedo — e o traço, o documento e a hora ficam guardados. O
   segundo não existia em canto nenhum. Um cliente que é hospital ou órgão
   público muitas vezes NÃO PODE assinar com o dedo numa tela: o setor jurídico
   exige assinatura com certificado, feita no gov.br. Sem este caminho, essas
   ordens ficavam com a aprovação combinada por telefone e nada no prontuário.

   --------------------------------------------------------------------------
   O QUE ISTO NÃO É
   --------------------------------------------------------------------------
   Não é aprovação de orçamento, e não anda a esteira. A ordem continua onde
   está, e quem a move continua sendo a máquina de estados com as travas dela.
   Anexar é juntar prova ao prontuário — e prova que vem de fora entra como
   veio, sem o sistema fingir que a produziu.

   Por isso o tipo é `OS_ASSINADA_CLIENTE` e não `ORDEM_SERVICO`: numa
   auditoria, "este PDF saiu do nosso gerador" e "este PDF chegou de fora" são
   afirmações diferentes, e a folha de rastreabilidade precisa conseguir
   dizer qual é qual.

   --------------------------------------------------------------------------
   E ENTRA NA CORRENTE DE EVENTOS
   --------------------------------------------------------------------------
   O anexo vira um evento encadeado, com o mesmo `hashEvento` das transições e
   o hash do arquivo dentro do payload. É o que faz a pergunta "quem juntou
   este documento ao prontuário, e quando" ter resposta com valor de prova — e
   o que impede alguém de trocar o arquivo depois e o sistema não perceber.

   `etapaNova` recebe a etapa em que a ordem JÁ ESTÁ. O campo é obrigatório e a
   coluna guarda onde o aparelho estava quando o fato aconteceu; repetir a
   etapa atual é dizer a verdade — nada se moveu.
   ========================================================================== */

/** Quem anexa. Do ATENDENTE para cima: é trabalho de escritório, não de bancada. */
const PODE_ANEXAR: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.FINANCEIRO,
  Papel.ATENDENTE,
]

export async function anexarOsAssinada(
  ordemId: string,
  formulario: FormData,
): Promise<Resposta> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_ANEXAR.includes(sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não anexa documento ao prontuário.' }
  }

  const ctx = contextoDe(sessao)
  let tenantId: string
  try {
    tenantId = exigirEmpresa(ctx)
  } catch {
    return { ok: false, motivo: 'Você está fora de uma empresa. Entre numa empresa para anexar.' }
  }

  const arquivo = formulario.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, motivo: 'Escolha o arquivo assinado.' }

  // A ORDEM É LIDA DENTRO DO ESCOPO ANTES DE O ARQUIVO IR PARA O DISCO. Um id
  // de outra franquia não devolve linha nenhuma pelo RLS — e gravar primeiro
  // para conferir depois deixaria lixo no acervo a cada tentativa recusada.
  const ordem = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({ where: { id: ordemId }, select: { id: true, numero: true, etapa: true } }),
  )
  if (!ordem) return { ok: false, motivo: 'Ordem não encontrada.' }

  const guardado = await guardarPdfRecebido({ tenantId, ordemId: ordem.id, arquivo })
  if (!guardado.ok) return { ok: false, motivo: guardado.motivo }

  /**
   * O MESMO ARQUIVO ANEXADO DUAS VEZES NÃO VIRA DUAS PROVAS.
   *
   * O caminho no acervo sai do hash, então reenviar o mesmo PDF reescreve o
   * mesmo arquivo com o mesmo conteúdo — inofensivo. O que não pode é a folha
   * de rastreabilidade passar a contar dois documentos onde há um, só porque
   * alguém clicou duas vezes ou a rede repetiu o envio. É a mesma trava que o
   * gerador de PDF ganhou quando recarregar a página virava prova a mais.
   */
  const jaEstava = await comEscopo(ctx, (tx) =>
    tx.documento.findFirst({
      where: { ordemId: ordem.id, tipo: 'OS_ASSINADA_CLIENTE', hash: guardado.hash },
      select: { id: true },
    }),
  )
  if (jaEstava) {
    return { ok: true, mensagem: 'Este arquivo já estava anexado nesta ordem.' }
  }

  const nomeOriginal = typeof arquivo.name === 'string' ? arquivo.name.slice(0, 200) : null

  await comEscopo(ctx, async (tx) => {
    await tx.documento.create({
      data: {
        tenantId,
        ordemId: ordem.id,
        tipo: 'OS_ASSINADA_CLIENTE',
        numero: `OS_ASSINADA_CLIENTE-${String(ordem.numero).padStart(5, '0')}`,
        caminho: guardado.caminho,
        hash: guardado.hash,
        tamanhoBytes: guardado.bytes,
        anexadoPorNome: sessao.nome,
        nomeOriginal,
        // 256 bits. O link pode ir para o WhatsApp e o token é a credencial.
        tokenAcesso: novoToken(),
      },
    })

    const anterior = await tx.eventoOrdem.findFirst({
      where: { ordemId: ordem.id },
      orderBy: { sequencia: 'desc' },
      select: { sequencia: true, hash: true },
    })
    const sequencia = (anterior?.sequencia ?? 0) + 1
    const criadoEm = new Date()
    const payload = {
      documento: 'OS_ASSINADA_CLIENTE',
      hashArquivo: guardado.hash,
      bytes: guardado.bytes,
      nomeOriginal,
    }
    const hash = hashEvento({
      ordemId: ordem.id,
      sequencia,
      etapaNova: ordem.etapa,
      tipo: 'documento.anexado',
      autorId: sessao.userId,
      criadoEm,
      payload,
      hashAnterior: anterior?.hash ?? null,
    })

    await tx.eventoOrdem.create({
      data: {
        tenantId,
        ordemId: ordem.id,
        sequencia,
        // A ordem não se moveu: a etapa nova é a mesma de antes, e é isso que a
        // coluna passa a contar. `etapaAnterior` fica nulo de propósito —
        // preenchê-la com a mesma etapa faria a linha do tempo parecer uma
        // transição que não houve.
        etapaNova: ordem.etapa,
        tipo: 'documento.anexado',
        titulo: 'O.S. assinada pelo cliente, anexada ao prontuário',
        descricao: nomeOriginal,
        autorId: sessao.userId,
        autorNome: sessao.nome,
        autorPapel: sessao.papel,
        payload,
        hash,
        hashAnterior: anterior?.hash ?? null,
        // O cliente VÊ: foi ele que mandou o arquivo, e o portal confirmando o
        // recebimento é o que evita o telefonema "vocês receberam?".
        visivelCliente: true,
        criadoEm,
      },
    })
  })

  await auditar(ctx, sessao, {
    acao: 'documento.anexado',
    entidade: 'ordem',
    entidadeId: ordemId,
    detalhes: { tipo: 'OS_ASSINADA_CLIENTE', hash: guardado.hash, bytes: guardado.bytes },
  })

  revalidatePath(`/painel/ordens/${ordemId}`)
  return { ok: true, mensagem: 'O.S. assinada anexada ao prontuário.' }
}
