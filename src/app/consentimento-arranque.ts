/**
 * O BLOCO DE ARRANQUE DO CONSENTIMENTO.
 *
 * Vive num arquivo só dele, sem `'use client'` e sem JSX, porque é importado
 * pelos dois lados: pelo carregador das tags (componente de servidor) e pela
 * faixa (componente de cliente). Um texto exportado de dentro de um módulo de
 * cliente atravessa a fronteira como referência, não como valor — e o que
 * chegaria ao servidor não seria a string.
 *
 * =============================================================================
 * POR QUE ELE É TEXTO, E NÃO UM `<Script>`
 * =============================================================================
 * Porque a ORDEM é a coisa toda. Este bloco é colado no COMEÇO do mesmo script
 * inline que carrega o Tag Manager e o gtag. Como `<Script>` separado, ele
 * dependeria de o Next executar dois arquivos na ordem em que foram escritos —
 * e consentimento que chega depois da tag não vale nada, porque a tag já
 * gravou.
 *
 * =============================================================================
 * O PADRÃO É NEGADO
 * =============================================================================
 * Nenhum cookie de análise ou de anúncio antes do clique. Se a faixa nunca
 * carregar, se a pessoa fechar a aba em dois segundos, se algo quebrar no meio,
 * o desfecho continua sendo o mais protegido. Um padrão que só fica seguro
 * depois que um segundo script roda não é um padrão seguro.
 *
 * `functionality_storage` e `security_storage` ficam liberados: são o que faz
 * a página funcionar e o que protege contra fraude — não são medição, e a
 * própria LGPD trata cookie estritamente necessário de outro jeito.
 *
 * `wait_for_update: 500` dá meio segundo para a resposta de quem já respondeu
 * antes chegar às tags. Sem essa espera, a primeira visualização de página de
 * quem tinha aceitado sairia como negada, todas as vezes.
 */

/** Onde a escolha fica guardada. Só neste navegador — nunca sai daqui. */
export const CHAVE_CONSENTIMENTO = 'dtm_consentimento'

export const ARRANQUE_CONSENTIMENTO = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=window.gtag||gtag;
if(!window.__dtmConsentimento){
  window.__dtmConsentimento=1;
  var __c='negado';
  try{__c=localStorage.getItem('${CHAVE_CONSENTIMENTO}')||'negado';}catch(e){}
  var __v=__c==='aceito'?'granted':'denied';
  gtag('consent','default',{
    ad_storage:__v,
    ad_user_data:__v,
    ad_personalization:__v,
    analytics_storage:__v,
    functionality_storage:'granted',
    security_storage:'granted',
    wait_for_update:500
  });
}`.trim()
