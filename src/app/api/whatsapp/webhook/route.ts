import { NextResponse } from 'next/server'
import { comEscopo } from '@/lib/db'
import { decifrar } from '@/lib/cripto'
import { env } from '@/lib/env'
import { anotarConexao, conexaoViva } from '@/server/whatsapp/uazapi'
import { conferirSegredo, empresaDoNome, envelopeUazapi } from '@/server/whatsapp/webhook'

/**
 * O QUE A UAZAPI NOS CONTA SOZINHA.
 *
 * =============================================================================
 * O BURACO QUE ISTO FECHA
 * =============================================================================
 * O crachá no topo do painel dizia "WhatsApp conectado" com base no campo
 * `status` da instância — e esse campo só era escrito quando alguém clicava em
 * "Atualizar status" na tela. Quer dizer: o celular da empresa podia estar
 * desligado desde sexta e a tela jurando que estava tudo bem até segunda, sem
 * ninguém suspeitar.
 *
 * Agora o provedor avisa. Qualquer evento que chegue desta instância faz o
 * sistema perguntar ao provedor como está a conexão e gravar a resposta.
 *
 * =============================================================================
 * POR QUE PERGUNTAR EM VEZ DE LER O QUE O EVENTO DIZ
 * =============================================================================
 * O evento de conexão traz "o novo estado" — e o nome exato desse campo não
 * está no contrato que temos em mãos. Ler um campo que ninguém confirmou seria
 * inventar contrato, e inventar contrato em cima de um webhook é como o
 * sistema passa a acreditar em coisa que não aconteceu.
 *
 * Então o webhook é o GATILHO, e a verdade vem do `GET /instance/status`, que é
 * documentado. A consulta é memorizada por um minuto (`conexaoViva`), então
 * cem mensagens num minuto continuam sendo uma pergunta só.
 *
 * =============================================================================
 * O QUE ELE AINDA NÃO FAZ, E POR QUE NÃO
 * =============================================================================
 * O enum `StatusMensagem` prevê ENTREGUE e LIDA. Nenhum evento documentado da
 * uazapi (`messages`, `connection`, `presence`, `chat`, `group`, `poll`,
 * `label`) entrega um comprovante de leitura com formato confirmado. Preencher
 * esses dois estados hoje exigiria adivinhar a forma do payload — e uma tela
 * que diz "entregue" por adivinhação é pior que uma que não diz nada.
 *
 * Quando o primeiro evento real chegar, o `console.info` abaixo registra QUAIS
 * CHAVES ele trouxe (nunca os valores, que carregam telefone e texto de
 * cliente). Com essa evidência na mão, dá para estender isto sem chutar.
 */
export const dynamic = 'force-dynamic'

/** Sempre 200, e sempre vazio. Ver o comentário de `POST`. */
const ok = () => new NextResponse(null, { status: 200 })

export async function POST(req: Request) {
  /**
   * SEM SEGREDO CONFIGURADO, O ENDEREÇO NÃO EXISTE.
   *
   * Falhar fechado: uma instalação que ainda não configurou o segredo não pode
   * aceitar qualquer corpo que chegue. E o 404 — em vez de 401 — é escolhido:
   * um 401 confirma a quem está sondando que existe algo ali para adivinhar.
   */
  const segredo = env.UAZAPI_WEBHOOK_SECRET
  if (!segredo) return new NextResponse(null, { status: 404 })

  const url = new URL(req.url)
  if (!conferirSegredo(url.searchParams.get('s'), segredo)) {
    return new NextResponse(null, { status: 404 })
  }

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const lido = envelopeUazapi.safeParse(corpo)
  // Corpo que não tem nem `token` não dá para atribuir a ninguém. Responder 200
  // mesmo assim é de propósito: um 4xx faz o provedor reenfileirar e repetir
  // para sempre um evento que nunca vamos conseguir processar.
  if (!lido.success) return ok()

  const evento = lido.data

  /**
   * DE QUAL EMPRESA — pelo nome que NÓS demos à instância, conferido pelo token.
   *
   * As duas coisas precisam bater. O nome sozinho é adivinhável (basta ter um
   * id de empresa); o token sozinho obrigaria a decifrar a instância de todas
   * as empresas a cada chamada. Juntos: caminho direto e prova de origem.
   */
  const tenantDoNome = empresaDoNome(evento.instanceName)

  /**
   * O ESCOPO CERTO PARA LER ESTA TABELA, E POR QUE NÃO É O ÓBVIO.
   *
   * A política de RLS de `whatsapp_instances` é
   * `tenantId = app.current_tenant_id() OR app.is_super_admin()` — e mais nada.
   * Nem o contexto de plataforma nem o de worker estão nela: os dois leem ZERO
   * linhas, sem erro. A primeira versão desta rota usava o de plataforma e
   * ignorava todos os eventos em silêncio.
   *
   * Com o nome da instância, sabemos a empresa antes de consultar, e a leitura
   * é do escopo DELA — menor privilégio, uma linha só. Sem o nome, não há como
   * saber de quem é o evento sem olhar todas: aí, e só aí, a leitura é de
   * super-admin, restrita a dois campos e sem tocar em nenhum dado de negócio.
   */
  const escopo = tenantDoNome
    ? { tenantId: tenantDoNome, userId: null, ehSuperAdmin: false }
    : { tenantId: null, userId: null, ehSuperAdmin: true }

  const empresa = await comEscopo(escopo, async (tx) => {
    const candidatas = await tx.whatsappInstance.findMany({
      where: tenantDoNome ? { tenantId: tenantDoNome } : {},
      select: { tenantId: true, uazTokenCifrado: true },
    })
    for (const c of candidatas) {
      if (!c.uazTokenCifrado) continue
      let claro: string
      try {
        claro = decifrar(c.uazTokenCifrado)
      } catch {
        // Chave de criptografia trocada: não dá para conferir esta linha.
        continue
      }
      // O token do corpo tem de bater com o da instância. É isto que impede
      // alguém que só descobriu a URL de se passar por uma empresa.
      if (conferirSegredo(evento.token, claro)) return c.tenantId
    }
    return null
  })

  // Token que não bate com instância nenhuma: alguém acertou a URL e mandou
  // corpo inventado. Nada a fazer, e nada a contar a quem mandou.
  if (!empresa) return ok()

  try {
    const viva = await conexaoViva(empresa, evento.token)
    // `null` é "não deu para saber" — e o que não se sabe não se grava.
    if (viva !== null) await anotarConexao(empresa, viva)
  } catch {
    // O provedor não respondeu agora. Não é motivo para devolver erro ao
    // webhook: ele tentaria de novo, e o problema não é do evento.
  }

  /**
   * O RASTRO PARA ESTENDER DEPOIS — só os nomes dos campos, nunca os valores.
   *
   * `message.text` carrega o que o cliente escreveu e `chat.phone` o telefone
   * dele. Nada disso entra em log. O que entra é a FORMA do evento, que é o
   * que falta para preencher ENTREGUE e LIDA sem adivinhar.
   */
  console.info(
    `[whatsapp] evento recebido · empresa=${empresa} · campos=${Object.keys(evento).sort().join(',')}` +
      (evento.message ? ` · message=${Object.keys(evento.message).sort().join(',')}` : ''),
  )

  return ok()
}
