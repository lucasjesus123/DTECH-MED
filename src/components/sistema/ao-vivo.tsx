'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import estilo from './pecas.module.css'

/**
 * A TELA QUE SE ATUALIZA SOZINHA (`<AoVivo>`).
 *
 * =============================================================================
 * O PROBLEMA QUE ELA RESOLVE
 * =============================================================================
 * A central acompanha a rota do dia num monitor. O Adriano aceita a corrida na
 * calçada, marca a saída, chega no cliente — e a tela do escritório continua
 * mostrando o mundo de cinco minutos atrás, até alguém apertar F5. Quem
 * despacha passa a ligar para perguntar o que a tela já saberia.
 *
 * =============================================================================
 * É SONDAGEM, E ISSO ESTÁ ESCRITO DE PROPÓSITO
 * =============================================================================
 * Não há websocket nem SSE aqui. A cada intervalo o componente pede ao Next
 * que refaça o componente de servidor desta rota — `router.refresh()` — e o
 * React troca só o que mudou, sem piscar a tela, sem perder rolagem e sem
 * derrubar o que estiver digitado.
 *
 * A escolha é proporcional ao problema. Uma oficina tem poucos motoristas e
 * uma dúzia de paradas por dia; um canal permanente por aba aberta custaria
 * conexão viva, reconexão, estado no servidor e um modo de falhar novo — para
 * ganhar segundos que ninguém está contando. Chamar isso de "tempo real" seria
 * vender mais do que se entrega: é atualização automática, e o atraso máximo é
 * o intervalo abaixo.
 *
 * Se um dia a operação crescer a ponto de o segundo importar, o lugar de trocar
 * por SSE é este arquivo, e só ele.
 *
 * =============================================================================
 * O QUE ELE NÃO FAZ QUANDO NINGUÉM ESTÁ OLHANDO
 * =============================================================================
 * Aba escondida não sonda. O navegador já atrasa temporizador em segundo plano,
 * e insistir gastaria bateria de celular e requisição de servidor para pintar
 * uma tela que ninguém vê. Ao voltar para a aba, a atualização é IMEDIATA — que
 * é o instante em que a informação volta a valer.
 */
export default function AoVivo({
  segundos = 15,
  rotulo = 'ao vivo',
}: {
  /** Intervalo entre sondagens. 15s é o padrão da rota do dia. */
  segundos?: number
  rotulo?: string
}) {
  const router = useRouter()
  const [desde, setDesde] = useState(0)
  // Zero, e não `Date.now()`: perguntar as horas durante o render é chamada
  // impura, e o compilador do React reprova com razão — dois renders do mesmo
  // estado passariam a devolver telas diferentes. O relógio começa a contar no
  // efeito, que é onde o tempo tem o direito de existir.
  const ultima = useRef(0)

  useEffect(() => {
    let vivo = true
    if (ultima.current === 0) ultima.current = Date.now()

    function atualizar() {
      ultima.current = Date.now()
      setDesde(0)
      router.refresh()
    }

    const relogio = setInterval(() => {
      if (!vivo) return
      // Aba escondida: nem sonda, nem conta o tempo como se soubesse.
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultima.current >= segundos * 1000) atualizar()
      else setDesde(Math.round((Date.now() - ultima.current) / 1000))
    }, 1000)

    // Voltar para a aba vale uma atualização na hora: o dado de trinta minutos
    // atrás não merece mais quinze segundos de espera.
    function aoVoltar() {
      if (document.visibilityState === 'visible') atualizar()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      vivo = false
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [router, segundos])

  return (
    <p className={estilo.aoVivo} aria-live="off">
      <span className={estilo.aoVivoPulso} aria-hidden="true" />
      {rotulo}
      {/* O segundo conta para a pessoa saber que a tela está viva, e não
          congelada. Sem ele, "ao vivo" é só uma palavra bonita no canto. */}
      <span className="num"> · há {desde}s</span>
    </p>
  )
}
