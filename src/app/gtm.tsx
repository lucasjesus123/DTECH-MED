import Script from 'next/script'
import { headers } from 'next/headers'

/**
 * GOOGLE TAG MANAGER — só no site público.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO ESTÁ NO LAYOUT RAIZ
 * ---------------------------------------------------------------------------
 * O layout raiz embrulha TUDO: o site, o painel, os aplicativos de campo e o
 * portal do cliente. Colocar a tag lá ligaria o Google em três lugares onde ela
 * não pode entrar:
 *
 *  • `/os/<token>` — o token NA URL é a credencial do cliente. Quem tem o link
 *    abre a ordem: nome, documento, aparelho, valores, fotos e assinaturas. Um
 *    "pageview" manda essa URL inteira para o Google. Não é dado de navegação
 *    vazando; é a CHAVE vazando, para fora da empresa, e sem como recolher.
 *
 *  • `/painel` e `/app` — ferramenta de trabalho. Valor de marketing nenhum, e
 *    mandaria para fora a rotina de quem trabalha aqui, em URLs que carregam id
 *    de ordem e de cliente.
 *
 * Por isso a tag mora na PÁGINA do site, e não no layout de todo mundo. É uma
 * garantia estrutural: para o GTM alcançar o painel, alguém teria de importar
 * este arquivo lá dentro, de propósito. Um `if (caminho.startsWith('/painel'))`
 * daria a mesma proteção hoje e nenhuma daqui a um ano.
 *
 * ---------------------------------------------------------------------------
 * O NONCE, E POR QUE SEM ELE NADA DISSO FUNCIONA
 * ---------------------------------------------------------------------------
 * Este site roda com `script-src 'self' 'nonce-…' 'strict-dynamic'`. Script
 * inline sem o nonce da requisição simplesmente não executa — e o sintoma é
 * cruel: a página fica perfeita, nada aparece errado na tela, e o GTM só não
 * mede nada. Alguém descobre semanas depois, olhando um relatório vazio.
 *
 * O trecho `var n = d.querySelector('[nonce]')` é o snippet oficial do Google
 * para CSP: copia o nonce da página para o `gtm.js` que acabou de criar. Com
 * isso a corrente inteira — snippet → gtm.js → tags de dentro do GTM — carrega
 * a marca daquela requisição.
 */

const NS = 'https://www.googletagmanager.com/ns.html'

/**
 * O carregador, o mais cedo que dá num aplicativo React.
 *
 * O Google manda colar "o mais alto possível no <head>". Em HTML puro isso é
 * literal. Aqui o Next injeta assim que a página fica interativa
 * (`afterInteractive`) — a estratégia que a documentação do Next indica para
 * gerenciador de tag, e a que o componente oficial `@next/third-parties` usa.
 *
 * O motivo é o de sempre: script de terceiro no caminho crítico atrasa a
 * primeira pintura, e a primeira pintura é o que o Google mede para ranquear.
 * `beforeInteractive` poria a tag alguns milissegundos antes e cobraria isso de
 * todo visitante, em toda visita — inclusive das campanhas que a tag existe
 * para medir.
 */
export async function GoogleTagManager({ id }: { id: string }) {
  if (!id) return null
  const nonce = (await headers()).get('x-nonce') ?? ''

  return (
    <Script id="gtm" strategy="afterInteractive" nonce={nonce}>
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;
var n=d.querySelector('[nonce]');n&&j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));
f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`}
    </Script>
  )
}

/**
 * A moldura de socorro, para quem está sem JavaScript.
 *
 * Vai no começo do corpo da página. Não desenha nada — é um pixel de contagem,
 * e por isso sai da árvore de acessibilidade e do caminho do teclado.
 */
export function GoogleTagManagerNoScript({ id }: { id: string }) {
  if (!id) return null

  return (
    <noscript>
      <iframe
        src={`${NS}?id=${encodeURIComponent(id)}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
        title="Google Tag Manager"
        aria-hidden="true"
        tabIndex={-1}
      />
    </noscript>
  )
}
