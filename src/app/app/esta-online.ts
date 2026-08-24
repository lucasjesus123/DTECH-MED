'use client'

import { useSyncExternalStore } from 'react'

/**
 * O aparelho está com internet AGORA?
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É UM `useState` COM `useEffect`
 * ---------------------------------------------------------------------------
 * A forma antiga era começar em `true` e corrigir depois, dentro de um efeito.
 * Isso significa que o primeiro desenho da tela sempre dizia "tem internet",
 * mesmo no celular que abriu a página no subsolo da clínica — e só no ciclo
 * seguinte o botão de confirmar travava. Um motorista rápido vê o botão
 * habilitado e toca nele.
 *
 * `useSyncExternalStore` lê o valor DURANTE a renderização e assina as
 * mudanças. Não existe o instante de mentira, e não existe a segunda
 * renderização em cascata.
 *
 * O terceiro argumento é o valor do servidor, onde `navigator` não existe:
 * assumimos online, porque a página só chegou até lá com rede.
 */
function assinar(aoMudar: () => void) {
  addEventListener('online', aoMudar)
  addEventListener('offline', aoMudar)
  return () => {
    removeEventListener('online', aoMudar)
    removeEventListener('offline', aoMudar)
  }
}

export function useEstaOnline(): boolean {
  return useSyncExternalStore(
    assinar,
    () => navigator.onLine,
    () => true,
  )
}
