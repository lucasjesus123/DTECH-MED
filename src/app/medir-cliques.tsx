'use client'

import { useEffect } from 'react'
import { EVENTOS, evento } from './analitico'

/**
 * A medição dos cliques de contato, por escuta delegada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM OUVINTE SÓ, E NÃO UM `onClick` EM CADA BOTÃO
 * ---------------------------------------------------------------------------
 * Os botões de WhatsApp do site são cinco, espalhados por cinco seções, e todos
 * são renderizados no SERVIDOR — são `<a href="wa.me/…">` puros, que funcionam
 * sem uma linha de JavaScript. Pendurar um `onClick` em cada um obrigaria a
 * transformar os cinco em componentes de cliente só para contar cliques: mais
 * JavaScript no navegador do visitante, e um site que passa a depender de
 * hidratação para uma coisa que hoje é um link comum.
 *
 * Um ouvinte só, no documento, resolve os cinco. E resolve o SEXTO: no dia em
 * que alguém acrescentar outro botão de WhatsApp — numa seção nova, numa
 * campanha, num teste — ele já nasce medido, sem ninguém lembrar de nada. Essa
 * é a parte que costuma falhar em medição feita botão a botão.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `capture`, E POR QUE NÃO SE ESPERA O EVENTO CHEGAR
 * ---------------------------------------------------------------------------
 * O clique num `wa.me` tira a pessoa da página. A escuta é na fase de captura,
 * antes de qualquer coisa cancelar o evento, e o `push` no `dataLayer` é
 * síncrono — entra na fila antes de a navegação começar.
 *
 * O que NÃO se faz aqui: segurar a navegação esperando o Google confirmar. É a
 * troca clássica de medição por conversão, e ela é péssima — quem clicou quer
 * abrir o WhatsApp, e meio segundo de espera para "contar direitinho" custa
 * exatamente o contato que a conta estava tentando medir.
 */

/**
 * De onde partiu o clique — é o que responde "qual CTA converte".
 *
 * A marca explícita ganha do palpite. O palpite é o `id` da seção mais próxima,
 * que serve bem para `#servicos`, `#a-empresa`, `#solicitar` e `#onde-estamos`
 * — nomes que já dizem alguma coisa no relatório.
 *
 * `conteudo` é descartado porque é o `<main>` que embrulha a página inteira:
 * ele casaria com quase todo clique e encheria o relatório de uma origem que
 * não distingue nada. Onde ele apareceria, a marca explícita foi posta no HTML.
 */
const GENERICOS = new Set(['conteudo', 'topo', 'rodape-marca'])

function origemDoClique(el: Element): string {
  const marcado = el.closest('[data-medir-origem]')?.getAttribute('data-medir-origem')
  if (marcado) return marcado

  for (let n: Element | null = el; n; n = n.parentElement) {
    const id = n.getAttribute('id')
    if (id && !GENERICOS.has(id)) return id
  }
  return 'pagina'
}

export function MedirCliques() {
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      const alvo = e.target
      if (!(alvo instanceof Element)) return
      const link = alvo.closest('a[href]')
      if (!link) return

      const href = link.getAttribute('href') ?? ''

      if (href.includes('wa.me') || href.includes('api.whatsapp.com')) {
        evento(EVENTOS.whatsapp, {
          canal: 'whatsapp',
          origem: origemDoClique(link),
          // Só quando a antessala marcou o assunto. Nunca texto digitado.
          assunto: link.getAttribute('data-medir-assunto') || undefined,
        })
        return
      }

      if (href.startsWith('tel:')) {
        evento(EVENTOS.telefone, { canal: 'telefone', origem: origemDoClique(link) })
      }
    }

    document.addEventListener('click', aoClicar, { capture: true })
    return () => document.removeEventListener('click', aoClicar, { capture: true })
  }, [])

  return null
}
