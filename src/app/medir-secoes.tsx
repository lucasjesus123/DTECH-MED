'use client'

import { useEffect } from 'react'
import { EVENTOS, evento } from './analitico'

/**
 * Quanto da página a pessoa chegou a ver.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE NUM SITE DE UMA PÁGINA SÓ
 * ---------------------------------------------------------------------------
 * O site inteiro é uma página com âncoras. Para o Google Analytics, isso é UMA
 * página vista — e uma página vista não distingue quem leu a chamada e foi
 * embora de quem desceu até "Onde estamos" e não achou o botão.
 *
 * Sem isto, a única pergunta que os relatórios respondem é "quantos entraram".
 * Com isto, respondem a que decide investimento: **onde eles param**. Se metade
 * chega em Serviços e só um em cada dez chega ao formulário, o problema está
 * entre os dois — e essa é uma informação que se compra com anúncio caro e se
 * descobre de graça com um evento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA VEZ POR SEÇÃO, POR VISITA
 * ---------------------------------------------------------------------------
 * Quem rola para baixo, volta e desce de novo veria a mesma seção três vezes. O
 * `Set` corta a repetição: o que interessa é se a pessoa CHEGOU ali, não quantas
 * vezes o retângulo cruzou a tela. Sem isso, o relatório de rolagem vira um
 * número inflado por quem estava procurando algo que perdeu.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `IntersectionObserver` E NÃO ESCUTAR A ROLAGEM
 * ---------------------------------------------------------------------------
 * Escutar `scroll` roda dezenas de vezes por segundo, na linha principal, no
 * celular de quem está com pouca bateria — para responder uma pergunta que o
 * navegador já sabe responder sozinho, fora dessa linha. O observador é a
 * ferramenta feita para isso, e custa perto de nada.
 *
 * Cinquenta por cento do bloco visível: a seção conta como vista quando metade
 * dela entrou na tela. Um pixel seria ruído de rolagem rápida; a seção inteira
 * excluiria os blocos altos, que em celular nunca cabem na tela de uma vez.
 */

/** As seções que valem medir, e o nome do evento de cada uma. */
const SECOES: ReadonlyArray<{ id: string; evento: string }> = [
  { id: 'servicos', evento: EVENTOS.viuServicos },
  { id: 'prontuario', evento: EVENTOS.viuProntuario },
  { id: 'a-empresa', evento: EVENTOS.viuEmpresa },
  { id: 'solicitar', evento: EVENTOS.viuFormulario },
  { id: 'onde-estamos', evento: EVENTOS.viuOndeEstamos },
]

export default function MedirSecoes() {
  useEffect(() => {
    // Navegador antigo sem o observador: o site funciona igual, só não mede.
    // Medição nunca pode ser o motivo de uma página quebrar.
    if (typeof IntersectionObserver === 'undefined') return

    const jaContadas = new Set<string>()

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          const nome = SECOES.find((s) => s.id === e.target.id)?.evento
          if (!nome || jaContadas.has(nome)) continue
          jaContadas.add(nome)
          evento(nome, { secao: e.target.id })
          // Contada, para de observar: o observador só carrega o que ainda
          // não aconteceu.
          observador.unobserve(e.target)
        }
      },
      { threshold: 0.5 },
    )

    for (const s of SECOES) {
      const el = document.getElementById(s.id)
      if (el) observador.observe(el)
    }

    return () => observador.disconnect()
  }, [])

  return null
}
