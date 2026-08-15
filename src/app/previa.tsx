'use client'

import { useEffect } from 'react'

/**
 * A ponte da prévia ao vivo.
 *
 * ---------------------------------------------------------------------------
 * COMO A PRÉVIA FUNCIONA
 * ---------------------------------------------------------------------------
 * A tela de edição mostra o site de verdade dentro de uma moldura, e não uma
 * imitação dele. Isso importa mais do que parece: prévia desenhada à parte
 * mente — ela não tem a fonte certa, não quebra a linha no mesmo lugar, não
 * mostra que o título ficou grande demais no celular. A única prévia que vale
 * é a página real.
 *
 * O que falta, então, é fazer a página real mudar enquanto a pessoa digita,
 * sem ir ao servidor a cada tecla. É isto:
 *
 *  1. cada texto editável do site carrega `data-c="caminho.do.campo"`;
 *  2. a tela de edição manda o rascunho pela `postMessage`;
 *  3. este componente escreve cada valor no elemento correspondente.
 *
 * Uma tecla, uma escrita no DOM. Sem requisição, sem recarregar, sem esperar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO É UM BURACO DE SEGURANÇA
 * ---------------------------------------------------------------------------
 * `postMessage` aceita mensagem de qualquer janela que consiga uma referência
 * para esta — inclusive de um site que nos coloque num iframe. Três travas:
 *
 *  · o componente só existe quando a página é aberta com `?previa=1`, o que
 *    não acontece para nenhum visitante;
 *  · a origem da mensagem é conferida contra a da própria página;
 *  · o valor entra por `textContent`, nunca por `innerHTML`. Mesmo que alguém
 *    conseguisse mandar `<script>`, ele apareceria como texto na tela em vez de
 *    executar.
 *
 * E vale lembrar que a política do sistema já impede a página de ser colocada
 * dentro de site alheio (`frame-ancestors 'none'`), então o único pai possível
 * é o nosso próprio painel.
 */
export function PontePrevia() {
  useEffect(() => {
    /** Achata `{a:{b:'x'}}` em `{'a.b':'x'}`, que é o formato do `data-c`. */
    function achatar(obj: unknown, prefixo = '', saida: Record<string, string> = {}) {
      if (obj === null || typeof obj !== 'object') return saida
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const caminho = prefixo ? `${prefixo}.${k}` : k
        if (v !== null && typeof v === 'object') achatar(v, caminho, saida)
        else if (v !== undefined) saida[caminho] = String(v)
      }
      return saida
    }

    function aoReceber(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      const m = e.data as { tipo?: string; conteudo?: unknown } | null
      if (!m || m.tipo !== 'dtechmed:previa' || !m.conteudo) return

      const plano = achatar(m.conteudo)
      for (const [caminho, valor] of Object.entries(plano)) {
        document.querySelectorAll(`[data-c="${CSS.escape(caminho)}"]`).forEach((el) => {
          // `textContent`, e não `innerHTML`. É o que transforma qualquer
          // tentativa de injeção em texto visível e inofensivo.
          if (el.textContent !== valor) el.textContent = valor
        })
      }

      // Avisa a tela de edição de que o quadro foi aplicado. Ela usa isto para
      // saber que a moldura está viva — se a página dentro dela quebrar, o
      // aviso para de chegar e a tela mostra o botão de recarregar.
      window.parent?.postMessage({ tipo: 'dtechmed:previa:ok' }, window.location.origin)
    }

    window.addEventListener('message', aoReceber)
    // Avisa que já está pronta para receber. Sem isto, um rascunho mandado
    // antes de este efeito rodar se perderia, e a prévia abriria desatualizada.
    window.parent?.postMessage({ tipo: 'dtechmed:previa:pronta' }, window.location.origin)

    return () => window.removeEventListener('message', aoReceber)
  }, [])

  return null
}
