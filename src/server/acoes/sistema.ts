'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { avancarOrdem } from '@/server/ordem/motor'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'

/**
 * AS AÇÕES DO BOTÃO-DA-VEZ.
 *
 * =============================================================================
 * UM CLIQUE, VÁRIOS CARIMBOS
 * =============================================================================
 * O redesenho funde passos que ninguém pensava separadamente — "concluir laudo"
 * e depois "enviar orçamento", "conferir" e depois "liberar". Esta função é
 * onde a fusão acontece, e ela faz uma coisa só: chama o motor, uma vez por
 * salto, na ordem.
 *
 * O motor não sabe que foi um clique só. Ele valida cada salto, confere cada
 * pré-condição e grava um `EventoOrdem` por passo, encadeado por hash, com o
 * horário do instante em que aconteceu. A linha do tempo da O.S. e a folha de
 * rastreabilidade continuam contando a história completa.
 *
 * =============================================================================
 * O QUE ACONTECE QUANDO UM SALTO NO MEIO FALHA
 * =============================================================================
 * Nada é desfeito, e isso é a escolha certa.
 *
 * Cada salto já aconteceu de verdade: o laudo foi gerado, o documento existe, o
 * cliente pode até já ter sido avisado. Desfazer significaria apagar evento de
 * uma trilha que é encadeada por hash justamente para não ser reescrita — e
 * apagar prova é o único pecado que este sistema não pode cometer.
 *
 * Então a ordem para onde parou, e a resposta diz exatamente até onde foi e o
 * que barrou. A pessoa vê "o laudo saiu; o orçamento não foi enviado porque
 * ainda não tem valor montado", que é uma frase acionável — e não um "erro ao
 * avançar" que a deixa sem saber em que pé está o aparelho.
 */

export type RespostaEsteira =
  | { ok: true; etapa: EtapaOrdem; passosDados: number }
  | { ok: false; motivo: string; passosDados: number; etapa?: EtapaOrdem }

export async function avancarNaEsteira(entrada: {
  ordemId: string
  /** A sequência de saltos, na ordem. Vem do `acaoDaVez` da esteira. */
  passos: EtapaOrdem[]
  observacao?: string
}): Promise<RespostaEsteira> {
  const sessao = await lerSessao()
  if (!sessao) return { ok: false, motivo: 'Sessão expirada. Entre de novo.', passosDados: 0 }
  if (entrada.passos.length === 0) {
    return { ok: false, motivo: 'Nenhum passo a dar.', passosDados: 0 }
  }

  const ctx = contextoDe(sessao)
  const ator = { id: sessao.userId, nome: sessao.nome, papel: sessao.papel }
  const ip = ipDaRequisicao(await headers(), env.TRUST_PROXY)

  let dados = 0
  let ultima: EtapaOrdem | undefined

  for (const para of entrada.passos) {
    const r = await avancarOrdem(ctx, ator, {
      ordemId: entrada.ordemId,
      para,
      // A observação acompanha o PRIMEIRO salto. Repeti-la em todos encheria a
      // linha do tempo com a mesma frase três vezes, e a linha do tempo é lida
      // por quem quer entender o que aconteceu, não por quem quer contar
      // quantas vezes leu.
      observacao: dados === 0 ? entrada.observacao : undefined,
      ip,
    })

    await auditar(ctx, sessao, {
      acao: `sistema.esteira.${para}`,
      entidade: 'ordem',
      entidadeId: entrada.ordemId,
      negado: !r.ok,
      detalhes: r.ok
        ? { passo: dados + 1, de: entrada.passos.length }
        : { motivo: r.motivo, passo: dados + 1, de: entrada.passos.length },
    })

    if (!r.ok) {
      revalidarSistema(entrada.ordemId)
      return {
        ok: false,
        // Quando algum passo já passou, a frase precisa dizer isso: "não deu"
        // sozinho faria a pessoa tentar de novo do começo, e o começo já
        // aconteceu.
        motivo:
          dados > 0
            ? `Parou em "${ROTULO_ETAPA[ultima!]}": ${r.motivo}`
            : r.motivo,
        passosDados: dados,
        etapa: ultima,
      }
    }

    dados += 1
    ultima = r.etapa
  }

  revalidarSistema(entrada.ordemId)
  return { ok: true, etapa: ultima!, passosDados: dados }
}

/**
 * As telas que precisam ser remontadas depois de a O.S. andar.
 *
 * O Radar de TODO mundo muda quando uma ordem anda — ela sai da fila de um
 * papel e entra na de outro. Revalidar só a ficha da ordem deixaria o painel
 * do técnico oferecendo um botão para um aparelho que já saiu da bancada dele.
 */
function revalidarSistema(ordemId: string) {
  revalidatePath('/sistema')
  revalidatePath('/sistema/ordens')
  revalidatePath(`/sistema/ordens/${ordemId}`)
  revalidatePath('/sistema/bancada')
  revalidatePath('/sistema/conferencia')
  revalidatePath('/sistema/financeiro')
  revalidatePath('/sistema/rotas')
  revalidatePath('/campo')
}
