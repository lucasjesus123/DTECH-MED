'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { CHAVE_CONSENTIMENTO } from './consentimento-arranque'
import estilo from './site.module.css'

/**
 * A FAIXA DE COOKIES — e por que ela passou a ser obrigatória aqui.
 *
 * =============================================================================
 * O QUE MUDOU
 * =============================================================================
 * Enquanto o site não media nada, não havia o que consentir: ele servia texto e
 * ia embora. No dia em que o Tag Manager, o Analytics e o Google Ads entraram,
 * o site passou a coletar comportamento ligado a um identificador de navegador —
 * e a LGPD tem nome para isso: tratamento de dado pessoal, que precisa de base
 * legal e de aviso.
 *
 * Medir sem avisar não é uma escolha de produto. É coleta acontecendo sem que a
 * pessoa saiba, num site que estampa o CNPJ da empresa no rodapé.
 *
 * =============================================================================
 * POR QUE CONSENT MODE, E NÃO SIMPLESMENTE NÃO CARREGAR A TAG
 * =============================================================================
 * Havia dois caminhos:
 *
 *   1. Bloquear tudo até o clique. O mais rígido, e o mais fácil de explicar. O
 *      custo: quem fecha a faixa sem responder — a maioria das pessoas — some
 *      inteiro do relatório, e a campanha paga fica sem base para decidir nada.
 *
 *   2. Consent Mode v2, que é este. As tags carregam com o armazenamento
 *      NEGADO: nenhum cookie de análise ou de anúncio é gravado, nenhum
 *      identificador persiste, e o Google recebe apenas um sinal sem cookie.
 *      Quem aceita libera pelo `update`; quem recusa segue sem cookie nenhum.
 *
 * O segundo respeita a recusa **e** mantém a medição de volume de pé. É o
 * desenho que o próprio Google publica para o GDPR — norma mais dura que a LGPD
 * justamente no ponto do consentimento.
 *
 * =============================================================================
 * DUAS ESCOLHAS, DO MESMO TAMANHO
 * =============================================================================
 * "Aceitar" e "Só o essencial" ficam lado a lado, os dois clicáveis, os dois
 * legíveis. Recusa escondida num link cinza de dez pixels é recusa que não
 * existe — e uma faixa desenhada para empurrar o "sim" não colhe consentimento,
 * colhe cansaço.
 *
 * Não há "X" para fechar sem responder. Fechar sem responder deixaria a pessoa
 * achando que resolveu, e a faixa voltaria na próxima página.
 */

type Escolha = 'aceito' | 'negado'

/**
 * A escolha guardada, lida como FONTE EXTERNA e não como estado copiado.
 *
 * `localStorage` não é do React: ele existe antes da árvore montar, pode ser
 * limpo por fora, e não avisa ninguém quando muda. Ler no `useEffect` e copiar
 * para um `useState` seria manter duas versões da mesma verdade — e o React 19
 * reclama disso com razão, porque o primeiro desenho sai com a versão errada.
 *
 * `useSyncExternalStore` é a ferramenta feita para exatamente isto: ele lê a
 * fonte, e o React redesenha quando a fonte avisa.
 */
let ouvintes: Array<() => void> = []

function assinar(avisar: () => void) {
  ouvintes = [...ouvintes, avisar]
  return () => {
    ouvintes = ouvintes.filter((o) => o !== avisar)
  }
}

function lerEscolha(): Escolha | null {
  try {
    const v = localStorage.getItem(CHAVE_CONSENTIMENTO)
    return v === 'aceito' || v === 'negado' ? v : null
  } catch {
    // Navegador com armazenamento bloqueado (janela anônima restrita, algumas
    // configurações corporativas). Sem lugar onde guardar, a faixa volta a
    // aparecer — chato, e ainda assim melhor do que assumir um "sim" que a
    // pessoa nunca deu.
    return null
  }
}

/**
 * No servidor a resposta é sempre "já respondeu".
 *
 * Não é mentira: é o que faz a faixa NÃO sair no HTML. Se saísse, ela apareceria
 * por um instante na tela de quem respondeu meses atrás, em toda visita, até o
 * JavaScript chegar e apagá-la. Piscar um aviso de cookie que a pessoa já
 * resolveu é o tipo de detalhe que faz um site parecer quebrado.
 */
function noServidor(): Escolha | null {
  return 'negado'
}

export default function Consentimento() {
  const escolha = useSyncExternalStore(assinar, lerEscolha, noServidor)

  function responder(valor: Escolha) {
    try {
      localStorage.setItem(CHAVE_CONSENTIMENTO, valor)
    } catch {
      // Não conseguir guardar não pode impedir a resposta de valer AGORA: o
      // `update` abaixo é o que muda o comportamento das tags nesta visita, e
      // ele acontece de qualquer jeito.
    }

    const permitido = valor === 'aceito' ? 'granted' : 'denied'

    // Pelo `gtag` que o bloco de arranque definiu, e não por um `push` nosso.
    // A fila do Google guarda o objeto `arguments` cru; empurrar um array no
    // lugar faz o comando ser ignorado em silêncio — a pior falha possível,
    // porque a tela não muda e o consentimento simplesmente não vale.
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
    g?.('consent', 'update', {
      ad_storage: permitido,
      ad_user_data: permitido,
      ad_personalization: permitido,
      analytics_storage: permitido,
    })

    for (const avisar of ouvintes) avisar()
  }

  if (escolha !== null) return null

  return (
    <div className={estilo.consentimento} role="dialog" aria-label="Aviso de cookies">
      <p className={estilo.consentTexto}>
        <strong>Este site usa cookies de medição.</strong> Eles dizem quantas pessoas chegam e por
        onde saem, para não gastarmos anúncio à toa. Nada disso identifica você pelo nome, e
        recusar não tira nenhuma função do site.{' '}
        <Link href="/privacidade">Como tratamos seus dados</Link>.
      </p>
      <div className={estilo.consentBotoes}>
        <button type="button" className={estilo.consentRecusar} onClick={() => responder('negado')}>
          Só o essencial
        </button>
        <button type="button" className={estilo.consentAceitar} onClick={() => responder('aceito')}>
          Aceitar
        </button>
      </div>
    </div>
  )
}
