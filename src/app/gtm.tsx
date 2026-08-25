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

/**
 * O `gtag` — Analytics e Google Ads, sem depender do Tag Manager.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE EXISTE AO LADO DO GTM
 * ---------------------------------------------------------------------------
 * São duas coisas diferentes, e confundi-las é o que faz alguém rodar campanha
 * um mês inteiro sem medição. O Tag Manager é o CANO por onde tag de terceiro
 * passa; o Analytics é o RELATÓRIO de quem entrou; o Ads é o que devolve a
 * conversão para o anúncio que a gerou.
 *
 * Quem já mede tudo pelo GTM não precisa deste bloco — e o campo do Analytics
 * fica vazio de propósito nesse caso, porque preencher os dois conta a mesma
 * visita duas vezes.
 *
 * ---------------------------------------------------------------------------
 * O MESMO CUIDADO DO GTM, PELOS MESMOS MOTIVOS
 * ---------------------------------------------------------------------------
 * Vazio não escreve nada. O nonce da requisição vai junto, senão o script
 * inline não executa sob a nossa CSP e o sintoma é o pior possível: a página
 * fica perfeita e o relatório fica vazio. E isto mora na PÁGINA do site, nunca
 * no layout de todo mundo — o painel, os aplicativos de campo e o link do
 * cliente ficam de fora, porque aquele link é a credencial da ordem dele.
 */
export async function GoogleGtag({ ga4Id, adsId }: { ga4Id: string; adsId: string }) {
  const ids = [ga4Id, adsId].filter(Boolean)
  if (ids.length === 0) return null
  const nonce = (await headers()).get('x-nonce') ?? ''

  // Um carregador só para os dois: o gtag.js aceita quantos `config` vierem, e
  // pedir o mesmo arquivo duas vezes atrasaria a página para não medir nada a
  // mais. O `src` leva o primeiro id; os `config` abaixo ligam todos.
  return (
    <>
      <Script
        id="gtag-js"
        strategy="afterInteractive"
        nonce={nonce}
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0]!)}`}
      />
      <Script id="gtag-config" strategy="afterInteractive" nonce={nonce}>
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${ids.map((i) => `gtag('config', '${i}');`).join('\n')}`}
      </Script>
    </>
  )
}
