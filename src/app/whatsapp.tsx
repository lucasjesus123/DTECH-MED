'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPRESA, linkWhatsapp } from '@/lib/empresa'
import { IconeFechar, IconeWhatsapp } from './icones'
import estilo from './whatsapp.module.css'

/**
 * O botão flutuante do WhatsApp, com uma antessala.
 *
 * Por que uma antessala, e não um link direto: quem clica num botão de
 * WhatsApp cru chega no aplicativo com a tela em branco e precisa inventar a
 * primeira frase. Uma boa parte desiste ali — e a DTECH nunca fica sabendo
 * que a pessoa existiu. Aqui a pessoa escolhe o assunto num toque, e a
 * mensagem chega escrita e já classificada: o atendimento abre a conversa
 * sabendo se é orçamento, urgência ou acompanhamento.
 *
 * O que ele NÃO é: um chat. Nada é digitado aqui, nada é enviado daqui,
 * nenhuma mensagem trafega pelo nosso servidor. É uma escolha de assunto que
 * termina num link `wa.me` comum — o que significa que funciona no celular e
 * no desktop, sem integração, sem token e sem nada para dar errado.
 *
 * DEGRADAÇÃO: sem JavaScript, o `<noscript>` deixa no lugar um link direto
 * para o WhatsApp. A pessoa perde as opções, não perde o contato.
 */

/**
 * ---------------------------------------------------------------------------
 * OS ASSUNTOS — é aqui que se mexe
 * ---------------------------------------------------------------------------
 * Cada item vira um botão na antessala. `rotulo` é o que a pessoa lê;
 * `mensagem` é o que chega escrito no WhatsApp da DTECH.
 *
 * Para trocar, acrescentar ou tirar um assunto, mexa SÓ nesta lista — o resto
 * do arquivo se ajusta sozinho. Quatro ou cinco itens é o limite prático: a
 * partir daí a antessala vira um menu, e menu longo trava a decisão em vez de
 * facilitá-la.
 *
 * A mensagem começa com o assunto porque é o que aparece na prévia da
 * notificação, antes de alguém abrir a conversa.
 */
const ASSUNTOS = [
  {
    emoji: '🔧',
    rotulo: 'Meu equipamento parou',
    mensagem:
      'Meu equipamento parou de funcionar e preciso de manutenção corretiva.',
  },
  {
    emoji: '💰',
    rotulo: 'Quero um orçamento',
    mensagem: 'Gostaria de um orçamento para manutenção de um equipamento.',
  },
  {
    emoji: '📅',
    rotulo: 'Manutenção preventiva',
    mensagem:
      'Quero agendar manutenção preventiva / calibração dos meus equipamentos.',
  },
  {
    emoji: '🚚',
    rotulo: 'Agendar retirada',
    mensagem: 'Preciso agendar a retirada de um equipamento.',
  },
  {
    emoji: '📍',
    rotulo: 'Já sou cliente',
    mensagem: 'Já sou cliente e queria falar sobre um atendimento em andamento.',
  },
] as const

/** O que chega se a pessoa apertar o botão verde sem escolher assunto. */
const MENSAGEM_PADRAO = 'Olá! Vim pelo site e gostaria de falar com um técnico.'

export function BotaoWhatsapp() {
  const [aberto, setAberto] = useState(false)
  const [escolhido, setEscolhido] = useState<number | null>(null)

  const painel = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)

  // `?? MENSAGEM_PADRAO` no fim, e não só no ternário: o índice guardado no
  // estado poderia apontar para fora da lista se alguém encurtar ASSUNTOS —
  // e o resultado seria um link `wa.me` sem texto, silenciosamente.
  const mensagem =
    (escolhido === null ? undefined : ASSUNTOS[escolhido]?.mensagem) ?? MENSAGEM_PADRAO

  /**
   * Fecha e devolve o foco ao botão que abriu.
   *
   * Sem essa devolução, quem navega por teclado fecha o painel e o foco volta
   * para o começo do documento — ou seja, perde o lugar onde estava lendo.
   */
  const fechar = useCallback(() => {
    setAberto(false)
    gatilho.current?.focus()
  }, [])

  useEffect(() => {
    if (!aberto) return

    // Esc fecha: é o gesto que todo mundo tenta primeiro, e a única saída de
    // quem não usa mouse.
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        fechar()
      }
    }

    // Clique fora fecha. `pointerdown` e não `click` porque o clique que abre
    // o painel ainda está subindo pela árvore no momento em que o efeito
    // registra o ouvinte — com `click`, o painel fecharia no mesmo toque que
    // o abriu.
    function aoApontar(e: PointerEvent) {
      const alvo = e.target as Node
      if (painel.current?.contains(alvo)) return
      if (gatilho.current?.contains(alvo)) return
      setAberto(false)
    }

    document.addEventListener('keydown', aoTeclar)
    document.addEventListener('pointerdown', aoApontar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('pointerdown', aoApontar)
    }
  }, [aberto, fechar])

  // O foco entra no painel ao abrir — no título, e não no primeiro botão,
  // para que o leitor de tela anuncie de onde a pessoa é atendida antes de
  // listar as opções.
  useEffect(() => {
    if (aberto) painel.current?.focus()
  }, [aberto])

  return (
    <div className={estilo.raiz}>
      <div
        className={estilo.painel}
        data-aberto={aberto ? 'sim' : 'nao'}
        // `inert` tira o painel fechado da ordem de tabulação e da árvore de
        // acessibilidade de uma vez. Sem isto, a animação de saída deixa cinco
        // botões invisíveis capturando o Tab.
        inert={!aberto}
        role="dialog"
        aria-modal="false"
        aria-label={`Falar com a ${EMPRESA.nome} no WhatsApp`}
        tabIndex={-1}
        ref={painel}
      >
        <div className={estilo.topo}>
          <div>
            <strong className={estilo.topoNome}>{EMPRESA.nome}</strong>
            <span className={estilo.topoStatus}>
              <span className={estilo.bolinha} aria-hidden="true" />
              Fale agora com um técnico
            </span>
          </div>
          <button
            type="button"
            className={estilo.fechar}
            onClick={fechar}
            aria-label="Fechar"
          >
            <IconeFechar className={estilo.fecharIcone} />
          </button>
        </div>

        <div className={estilo.corpo}>
          <div className={estilo.balao}>
            <span className={estilo.balaoAutor}>{EMPRESA.nome}</span>
            <p className={estilo.balaoTexto}>
              Oi! 👋 Aqui é a {EMPRESA.nome}, de {EMPRESA.endereco.cidade}/
              {EMPRESA.endereco.uf}. Me conta o que houve com o seu aparelho?
            </p>
          </div>

          <p className={estilo.instrucao} id="zap-instrucao">
            Escolha um assunto 👇
          </p>

          <ul className={estilo.opcoes} aria-labelledby="zap-instrucao">
            {ASSUNTOS.map((assunto, i) => (
              <li key={assunto.rotulo}>
                <button
                  type="button"
                  className={estilo.opcao}
                  // O estado marcado é o que o leitor de tela anuncia; a cor
                  // sozinha não serve, porque nem todo mundo a enxerga.
                  aria-pressed={escolhido === i}
                  onClick={() => setEscolhido(escolhido === i ? null : i)}
                >
                  <span className={estilo.opcaoEmoji} aria-hidden="true">
                    {assunto.emoji}
                  </span>
                  {assunto.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Fora da área que rola, de propósito.
            Com o botão dentro dela, em tela de celular ele nascia abaixo da
            dobra do painel: a pessoa escolhia o assunto e não via para onde ir.
            Aqui ele fica sempre à vista, e só a lista de assuntos rola. */}
        <div className={estilo.acao}>
          {/* As duas marcas `data-medir-*` são lidas pelo ouvinte único de
              cliques (`./medir-cliques`). O assunto é o ROTULO da opção — texto
              de uma lista fixa deste arquivo, nunca nada que a pessoa digitou.
              É o que responde "qual assunto traz cliente", sem mandar para fora
              nada que identifique alguém. */}
          <a
            className={estilo.enviar}
            href={linkWhatsapp(mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            data-medir-origem="flutuante"
            data-medir-assunto={escolhido === null ? 'sem assunto' : ASSUNTOS[escolhido]?.rotulo}
            onClick={() => setAberto(false)}
          >
            <IconeWhatsapp className={estilo.enviarIcone} />
            Iniciar conversa no WhatsApp
          </a>

          <p className={estilo.rodape}>
            Abre o WhatsApp com a mensagem pronta · {EMPRESA.telefoneExibicao}
          </p>
        </div>
      </div>

      <button
        type="button"
        ref={gatilho}
        className={estilo.gatilho}
        data-aberto={aberto ? 'sim' : 'nao'}
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar atendimento' : 'Falar no WhatsApp'}
      >
        <IconeWhatsapp className={estilo.gatilhoZap} />
        <IconeFechar className={estilo.gatilhoX} />
      </button>

      <noscript>
        <a className={estilo.semJs} href={linkWhatsapp(MENSAGEM_PADRAO)}>
          <IconeWhatsapp className={estilo.gatilhoZap} />
          <span className={estilo.semJsTexto}>WhatsApp</span>
        </a>
      </noscript>
    </div>
  )
}
