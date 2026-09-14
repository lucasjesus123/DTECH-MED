import { NextResponse } from 'next/server'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { auditar, ipDaRequisicao } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { gerarPdfDaOrdem } from '@/server/documentos/gerar'
import { lerArquivo } from '@/server/arquivos/storage'
import { env } from '@/lib/env'

/**
 * A ORDEM DE SERVIÇO EM PDF, NUM ENDEREÇO FIXO.
 *
 * =============================================================================
 * POR QUE É UMA ROTA, E NÃO UM BOTÃO QUE PEDE E DEPOIS ABRE
 * =============================================================================
 * A primeira tentativa foi um botão que chamava o servidor e, com o token na
 * mão, mandava a aba nova para o documento. Funcionava no papel e não
 * funcionava na tela: a aba reservada ficava em branco. O navegador dá pouca
 * margem para uma aba aberta num clique e apontada só depois — e o que sobra é
 * uma janela vazia, sem erro em lugar nenhum para explicar.
 *
 * Um endereço fixo não tem esse problema porque não tem esse passo. O botão
 * vira um `<a href target="_blank">`, o navegador abre como abre qualquer link,
 * e quem recebe o pedido gera o PDF e devolve os bytes. Menos peças, e as que
 * sobraram são as que o navegador já sabe operar.
 *
 * De quebra o endereço é COLÁVEL: dá para mandar "abre a O.S. desta ordem" para
 * alguém da equipe, e recarregar traz a versão de agora.
 *
 * =============================================================================
 * POR QUE GERA SEMPRE, EM VEZ DE DEVOLVER O ARQUIVO JÁ GRAVADO
 * =============================================================================
 * A esteira emite uma ORDEM_SERVICO quando o conserto começa — e naquele
 * momento não há serviço executado, nem teste final, nem data de garantia.
 * Devolver aquele arquivo seria entregar ao cliente a descrição de um serviço
 * que ainda não aconteceu.
 *
 * Gerar custa menos de um segundo e devolve a O.S. como ela é AGORA, que é o
 * que a pessoa quer dizer ao pedir "o PDF pronto". Os anteriores continuam na
 * aba de documentos: cada emissão é um fato com hora e hash, e apagar o de
 * terça para deixar só o de hoje seria reescrever o histórico da ordem.
 *
 * =============================================================================
 * QUEM ENTRA
 * =============================================================================
 * Aqui há SESSÃO, diferente de `/api/documento/[token]`, que é o link do
 * cliente. Então a credencial é a sessão, o escopo é o da empresa dela, e o RLS
 * devolve nulo para ordem de outra franquia — não existe parâmetro de empresa
 * para manipular.
 */

const PODE: Papel[] = [
  Papel.SUPER_ADMIN,
  Papel.ADMIN_EMPRESA,
  Papel.GESTOR,
  Papel.FINANCEIRO,
  Papel.ATENDENTE,
  Papel.TECNICO,
]

export async function GET(req: Request, rota: { params: Promise<{ id: string }> }) {
  const { id } = await rota.params

  const sessao = await lerSessao()
  if (!sessao) return new NextResponse('Sessão expirada.', { status: 401 })
  if (!PODE.includes(sessao.papel)) {
    return new NextResponse('Seu perfil não emite a ordem de serviço.', { status: 403 })
  }

  const ctx = contextoDe(sessao)
  let tenantId: string
  try {
    tenantId = exigirEmpresa(ctx)
  } catch {
    return new NextResponse('Você está fora de uma empresa.', { status: 403 })
  }

  // Conferida DENTRO do escopo antes de gerar: o RLS devolve nulo para ordem de
  // outra franquia, e aí nenhum byte chega ao disco.
  const ordem = await comEscopo(ctx, (tx) =>
    tx.ordem.findUnique({ where: { id }, select: { numero: true } }),
  )
  if (!ordem) return new NextResponse('Ordem não encontrada.', { status: 404 })

  let pdf: Buffer | null
  try {
    // `gerarPdfDaOrdem` grava e devolve o CAMINHO (o campo `bytes` é o tamanho,
    // não o conteúdo). Lemos de volta do acervo, como faz a rota do token.
    const r = await gerarPdfDaOrdem({ ordemId: id, documento: 'ORDEM_SERVICO' }, tenantId)
    pdf = await lerArquivo(r.caminho)
    if (!pdf) throw new Error('arquivo não encontrado logo após ser gravado')
  } catch (e) {
    console.error('[os.pdf] falhou ao gerar', e instanceof Error ? e.message : e)
    return new NextResponse('Não foi possível montar a O.S. agora.', { status: 500 })
  }

  await auditar(ctx, sessao, {
    acao: 'documento.emitido',
    entidade: 'ordem',
    entidadeId: id,
    detalhes: { tipo: 'ORDEM_SERVICO', porPedido: true },
    ip: ipDaRequisicao(req.headers, env.TRUST_PROXY),
  })

  const nome = `OS-${String(ordem.numero).padStart(4, '0')}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // `inline`: abre no visualizador, que é o que se espera de um botão
      // chamado "O.S. em PDF". Quem quiser o arquivo salva de lá.
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
