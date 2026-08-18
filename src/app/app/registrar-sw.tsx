'use client'

import { useEffect } from 'react'

/**
 * Liga o service worker do app de campo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM COMPONENTE, E NÃO UM `<script>` NA PÁGINA
 * ---------------------------------------------------------------------------
 * A política de segurança do site exige nonce em script inline. Um `<script>`
 * solto no HTML ou seria bloqueado, ou obrigaria a abrir a política — e política
 * de segurança que se abre "só um pouquinho" fica aberta para sempre. Um
 * componente cliente vira um módulo comum, servido do próprio domínio, que a
 * regra `script-src 'self'` já aceita.
 *
 * ---------------------------------------------------------------------------
 * ESCOPO
 * ---------------------------------------------------------------------------
 * Registrado com `scope: '/'` porque a página de socorro mora fora de `/app` —
 * ela precisa abrir sem sessão, e dentro de `/app` o middleware a mandaria para
 * o login. O arquivo do worker fica na raiz por isso.
 *
 * Só entra em produção com HTTPS ou em localhost: o navegador recusa service
 * worker em origem insegura, e insistir só encheria o console de erro.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Registro depois do carregamento: durante a primeira pintura a rede está
    // disputada, e o worker não tem pressa nenhuma.
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Falhar aqui não pode quebrar o aplicativo: sem worker ele continua
        // funcionando, só perde o socorro offline.
      })
    }
    if (document.readyState === 'complete') registrar()
    else {
      addEventListener('load', registrar)
      return () => removeEventListener('load', registrar)
    }
  }, [])

  return null
}
