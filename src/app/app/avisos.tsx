'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  desinscreverAparelho,
  estadoDosAvisos,
  inscreverAparelho,
} from '@/server/acoes/avisos'
import estilo from './app.module.css'

/**
 * LIGAR O AVISO NO CELULAR — o passo 5 que faltava.
 *
 * =============================================================================
 * POR QUE ELE É UM BOTÃO, E NÃO ACONTECE SOZINHO
 * =============================================================================
 * Nenhum navegador deixa pedir permissão de notificação sem um toque da pessoa
 * — e mesmo que deixasse, seria errado. Um aplicativo que pede notificação na
 * primeira tela, antes de a pessoa saber para que serve, recebe "bloquear" — e
 * "bloquear" no navegador é quase definitivo: some da tela do site e só volta
 * pelas configurações do aparelho, num menu que ninguém acha.
 *
 * Por isso o botão explica ANTES o que vai chegar, e só então pergunta.
 *
 * =============================================================================
 * OS QUATRO ESTADOS QUE ESTA TELA PRECISA SABER DIZER
 * =============================================================================
 *   desligado no servidor  a empresa não configurou as chaves; não há botão
 *   não suportado          navegador antigo, ou iPhone fora da tela de início
 *   bloqueado              a pessoa (ou o sistema) recusou; explicamos onde vira
 *   ligado                 e aí o botão vira "desligar neste aparelho"
 *
 * O terceiro é o que mais aparece na vida real e o que quase todo aplicativo
 * erra: fica mostrando "ativar" para quem já negou, e o clique não faz nada.
 */

type Estado =
  | { t: 'carregando' }
  | { t: 'desligadoNoServidor' }
  | { t: 'naoSuportado' }
  | { t: 'bloqueado' }
  | { t: 'desligado'; chave: string }
  | { t: 'ligado'; endpoint: string }

export function AvisosNoCelular() {
  const [e, setE] = useState<Estado>({ t: 'carregando' })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const conferir = useCallback(async () => {
    const cfg = await estadoDosAvisos()
    if (!cfg.ligado || !cfg.chavePublica) return setE({ t: 'desligadoNoServidor' })

    /**
     * O IPHONE SÓ TEM `PushManager` DEPOIS DE INSTALADO.
     *
     * No Safari do iOS a API de push existe apenas quando a página roda como
     * aplicativo instalado na tela de início. Aberta como aba comum, ela
     * simplesmente não está lá — e o teste abaixo cai em "não suportado", que é
     * a verdade para aquele contexto.
     */
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return setE({ t: 'naoSuportado' })
    }
    if (Notification.permission === 'denied') return setE({ t: 'bloqueado' })

    const reg = await navigator.serviceWorker.ready
    const ja = await reg.pushManager.getSubscription()
    if (ja) return setE({ t: 'ligado', endpoint: ja.endpoint })
    setE({ t: 'desligado', chave: cfg.chavePublica })
  }, [])

  useEffect(() => {
    // Fora do corpo do efeito: `conferir` mexe em estado, e estado mexido
    // durante o efeito faz uma segunda pintura em cascata — o lint da casa
    // recusa, com razão. O mesmo desvio está em `motorista/rastro.tsx`.
    const t = setTimeout(() => void conferir(), 0)
    return () => clearTimeout(t)
  }, [conferir])

  async function ligar(chave: string) {
    setErro(null)
    setOcupado(true)
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        setE({ t: 'bloqueado' })
        return
      }
      const reg = await navigator.serviceWorker.ready
      const inscricao = await reg.pushManager.subscribe({
        // Sem isto o Chrome recusa a inscrição: ele exige que todo push tenha
        // sinal visível para a pessoa. É a regra que impede rastreamento
        // silencioso por push, e nós não temos motivo para contorná-la.
        userVisibleOnly: true,
        applicationServerKey: deBase64Url(chave),
      })
      const j = inscricao.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      const r = await inscreverAparelho({
        endpoint: inscricao.endpoint,
        p256dh: j.keys?.p256dh ?? '',
        auth: j.keys?.auth ?? '',
        aparelho: navigator.userAgent.slice(0, 120),
      })
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setE({ t: 'ligado', endpoint: inscricao.endpoint })
    } catch {
      setErro('Não deu para ligar o aviso neste aparelho. Tente de novo daqui a pouco.')
    } finally {
      setOcupado(false)
    }
  }

  async function desligar(endpoint: string) {
    setErro(null)
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const inscricao = await reg.pushManager.getSubscription()
      if (inscricao) await inscricao.unsubscribe()
      await desinscreverAparelho(endpoint)
      await conferir()
    } finally {
      setOcupado(false)
    }
  }

  // Empresa sem chave configurada: nada na tela. Um bloco dizendo "indisponível"
  // em toda abertura do aplicativo é ruído diário para quem não vai usar.
  if (e.t === 'carregando' || e.t === 'desligadoNoServidor') return null

  return (
    <section className={estilo.avisos}>
      {e.t === 'ligado' ? (
        <>
          <p className={estilo.avisosTitulo}>
            <span className={estilo.avisosPonto} aria-hidden="true" />
            Aviso ligado neste celular
          </p>
          <p className={estilo.notaCampo}>
            Você recebe um toque quando a central marcar uma corrida para você — mesmo com o
            aplicativo fechado.
          </p>
          <button
            type="button"
            className={estilo.avisosDesligar}
            onClick={() => void desligar(e.endpoint)}
            disabled={ocupado}
          >
            {ocupado ? 'Desligando…' : 'Desligar neste aparelho'}
          </button>
        </>
      ) : e.t === 'bloqueado' ? (
        <>
          <p className={estilo.avisosTitulo}>Aviso bloqueado neste celular</p>
          <p className={estilo.notaCampo}>
            A notificação foi negada para este site. Para voltar, abra as configurações do
            navegador, procure por notificações e libere para o endereço deste aplicativo — o botão
            aqui não consegue perguntar de novo.
          </p>
        </>
      ) : e.t === 'naoSuportado' ? (
        <>
          <p className={estilo.avisosTitulo}>Aviso indisponível neste celular</p>
          <p className={estilo.notaCampo}>
            No iPhone, o aviso só funciona com o aplicativo instalado na tela de início: toque em
            compartilhar e em <strong>Adicionar à Tela de Início</strong>, abra por ali e volte
            aqui.
          </p>
        </>
      ) : (
        <>
          <p className={estilo.avisosTitulo}>Quer ser avisado no celular?</p>
          <p className={estilo.notaCampo}>
            Um toque quando a central marcar uma corrida para você, mesmo com o aplicativo fechado.
            Só isso — nada de propaganda.
          </p>
          {erro ? <p className={estilo.erroCampo}>{erro}</p> : null}
          <button
            type="button"
            className={estilo.avisosLigar}
            onClick={() => void ligar(e.chave)}
            disabled={ocupado}
          >
            {ocupado ? 'Ligando…' : 'Ligar o aviso'}
          </button>
        </>
      )}
    </section>
  )
}

/**
 * A chave pública vem em base64url e o navegador exige bytes.
 *
 * Base64url troca `+` e `/` por `-` e `_` e corta o `=` do fim — é o formato
 * que atravessa URL sem escapar. `atob` só entende o base64 clássico, então a
 * conversão desfaz as duas trocas e devolve o preenchimento.
 */
function deBase64Url(chave: string): Uint8Array<ArrayBuffer> {
  const resto = '='.repeat((4 - (chave.length % 4)) % 4)
  const limpa = (chave + resto).replace(/-/g, '+').replace(/_/g, '/')
  const cru = atob(limpa)
  // O buffer é declarado à parte para o tipo sair como `ArrayBuffer` e não como
  // `ArrayBufferLike`: `applicationServerKey` recusa o segundo, porque um
  // `SharedArrayBuffer` não pode atravessar para o service worker.
  const bytes = new Uint8Array(new ArrayBuffer(cru.length))
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i)
  return bytes
}
