'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import estilo from '../app.module.css'

/**
 * A ROTA SE ATUALIZA SOZINHA — sem recarregar a página.
 *
 * =============================================================================
 * O QUE ELA CONSERTA
 * =============================================================================
 * A tela é renderizada no servidor a cada visita. Com o aplicativo ABERTO, ela
 * envelhecia parada: a central remarcava a parada das 14h, trocava o motorista,
 * cancelava uma corrida — e o celular na mão do motorista seguia mostrando o
 * que era verdade quando ele abriu, sem nada indicando que já não era.
 *
 * =============================================================================
 * TRÊS CUIDADOS QUE VÊM DA RUA
 * =============================================================================
 *  • **Para quando a tela não está à vista.** É o mais importante: o aplicativo
 *    fica aberto no bolso o dia inteiro, e um relógio batendo no servidor a
 *    cada minuto com a tela apagada é bateria e 4G do motorista, gastos para
 *    ninguém ver. `visibilitychange` desliga e religa.
 *  • **Atualiza ao voltar.** Guardar o celular, dirigir vinte minutos e
 *    desbloquear precisa mostrar o agora — não esperar o próximo minuto.
 *  • **`router.refresh()`, e não recarregar.** Recarregar joga a rolagem para o
 *    topo e recomeça o leitor de tela no meio da frase; o refresh busca os
 *    dados e troca só o que mudou. É o mesmo motivo pelo qual o
 *    `<meta http-equiv="refresh">` saiu do Ao vivo do painel.
 *
 * Não há botão de pausar aqui, e a diferença para a tela do painel é o critério
 * 2.2.1 da WCAG: lá o conteúdo era um texto que alguém lê com calma; aqui a
 * atualização não move nada da leitura — a parada de agora continua sendo a
 * parada de agora — e o que ela evita é o motorista sair para um endereço que
 * mudou. Se um dia isso incomodar, o botão entra.
 */
export function AtualizaRota({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter()
  const [visivel, setVisivel] = useState(true)

  useEffect(() => {
    const aoTrocar = () => {
      const agoraVisivel = document.visibilityState === 'visible'
      setVisivel(agoraVisivel)
      // Voltou para a tela: o dado de antes do bolso já não serve.
      if (agoraVisivel) router.refresh()
    }
    document.addEventListener('visibilitychange', aoTrocar)
    return () => document.removeEventListener('visibilitychange', aoTrocar)
  }, [router])

  useEffect(() => {
    if (!visivel) return
    const relogio = setInterval(() => router.refresh(), segundos * 1000)
    return () => clearInterval(relogio)
  }, [visivel, segundos, router])

  return (
    <p className={estilo.atualizando} aria-live="off">
      Esta lista se atualiza sozinha enquanto você está com ela aberta.
    </p>
  )
}
