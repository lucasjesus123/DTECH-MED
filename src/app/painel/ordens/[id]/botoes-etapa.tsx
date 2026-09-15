'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { avancar } from '@/server/acoes/ordem'
import AgendarParada, { type DadosDaParada } from './agendar-parada'
import estilo from '../../painel.module.css'

type Passo = { para: EtapaOrdem; titulo: string; avisaCliente: boolean }

/**
 * Os botões de avanço da ordem.
 *
 * Três cuidados de interface que evitam erro caro:
 *
 *  • O botão diz **se o cliente vai ser avisado**. Um passo que dispara
 *    WhatsApp para a clínica não pode parecer igual a um passo interno — quem
 *    clica precisa saber que a mensagem sai na hora.
 *  • O motivo da recusa aparece inteiro. A máquina de estados escreve mensagens
 *    para serem lidas por gente ("faltam 3 fotos"), e engoli-las obrigaria a
 *    pessoa a adivinhar por que o botão não funcionou.
 *  • **O passo que exige parada abre a marcação, em vez de recusar.** Era a
 *    recusa mais frequente da ficha: "Marque a parada na Agenda de rota antes".
 *    A mensagem está certa e não resolve nada — mandava a pessoa decorar o
 *    número da O.S., abrir outra tela, achar a ordem na fila e voltar. Agora o
 *    mesmo clique abre a janela com a agenda dos motoristas, marca a parada e o
 *    passo anda em seguida. Quando a parada JÁ existe, o botão volta a ser o
 *    botão de sempre — a trava do motor continua sendo a do motor.
 */
export default function BotoesEtapa({
  ordemId,
  passos,
  parada,
  abrirDireto = false,
  noRodape = false,
}: {
  ordemId: string
  passos: Passo[]
  /**
   * Presente só quando falta a parada. Nulo quando ela já existe (ou quando o
   * perfil não agenda rota) — e aí nenhum passo abre janela nenhuma.
   */
  parada?: { exigidaPor: EtapaOrdem[]; dados: DadosDaParada } | null
  /** Chegou do assistente de abertura: a janela do despacho já abre. */
  abrirDireto?: boolean
  /**
   * DESENHA O PRIMEIRO PASSO COMO O BOTÃO GRANDE DO RODAPÉ.
   *
   * "Agora deixa a ficha completa no mesmo padrão." Na janela da O.S. a ação
   * principal mora numa quina só, e é sempre a mesma quina — o pedido veio com
   * print do outro sistema do dono: "PERCEBA QUE TUDO TEM O AVANCAR".
   *
   * Aqui os botões eram uma fila de iguais no meio da ficha, a uma altura
   * diferente em cada etapa. Com `noRodape`, o primeiro passo sai como pílula
   * sólida e os outros ficam secundários ao lado; o campo de observação
   * continua no bloco de cima, que é onde se escreve.
   */
  noRodape?: boolean
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  /**
   * O DESPACHO QUE ABRE SOZINHO — e abre UMA VEZ.
   *
   * Vindo do assistente, `abrirDireto` já nasce verdadeiro, e a janela é o
   * estado INICIAL — não um efeito depois da montagem. Duas razões, e as duas
   * doem na tela:
   *
   *   • `abrirDireto` vem da URL, e a URL não muda quando a pessoa fecha a
   *     janela. Num efeito, todo `router.refresh()` desta ficha reabriria a
   *     janela recém-fechada, e não haveria como sair dela.
   *   • Efeito roda DEPOIS da pintura: a janela apareceria num segundo tempo,
   *     piscando por cima da ficha já desenhada.
   */
  const [marcando, setMarcando] = useState<Passo | null>(() => {
    if (!abrirDireto || !parada) return null
    return passos.find((p) => parada.exigidaPor.includes(p.para)) ?? null
  })
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function executar(p: Passo) {
    setErro(null)
    iniciar(async () => {
      const r = await avancar({ ordemId, para: p.para, observacao: observacao.trim() || undefined })
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      setObservacao('')
      router.refresh()
    })
  }

  function aoClicar(p: Passo) {
    if (parada && parada.exigidaPor.includes(p.para)) {
      setErro(null)
      setMarcando(p)
      return
    }
    executar(p)
  }

  /**
   * O RÓTULO DO BOTÃO DE RODAPÉ — sem o "· avisa o cliente" dentro dele.
   *
   * A regra de sempre continua valendo: quem clica precisa saber que o
   * WhatsApp sai na hora. O que mudou é ONDE isso está escrito.
   *
   * Dentro de uma pílula, "Motorista saiu para a retirada · avisa o cliente"
   * tem 47 caracteres e, medido na tela de 1440, empurrava o rodapé inteiro
   * para uma segunda linha — com "Editar / Cancelar / Excluir" em cima e o
   * botão grande embaixo, que é justamente o oposto de "sempre no mesmo
   * canto".
   *
   * O aviso vira uma marca ao lado do botão. Fica na mesma altura do olho, e
   * o rótulo cabe.
   */
  function rotulo(p: Passo, abreJanela: boolean) {
    // "Despachar" é a palavra do dono para o passo que manda a parada ao
    // motorista, e cabe onde o título inteiro não cabe.
    return abreJanela ? 'Despachar ›' : p.titulo
  }

  const janelaDaParada =
    marcando && parada ? (
      <AgendarParada
        dados={parada.dados}
        titulo={marcando.titulo}
        aoFechar={() => setMarcando(null)}
      />
    ) : null

  if (noRodape) {
    const [primeiro] = passos
    return (
      <>
        {erro ? (
          <p className={estilo.erro} role="alert" style={{ flexBasis: '100%', margin: 0 }}>
            {erro}
          </p>
        ) : null}
        {/* OS CAMINHOS ALTERNATIVOS NÃO CABEM AQUI, e a medida é literal:
            com "Equipamento despachado pelo correio" ao lado, o rodapé media
            129px na tela de 1440 — duas linhas, com "Editar / Cancelar /
            Excluir" em cima e o botão grande embaixo. Isso é o oposto de
            "sempre no mesmo canto".

            Eles voltam para o bloco "o que dá para fazer agora", que é onde a
            explicação deles está. O rodapé carrega UMA ação: a principal. */}
        {primeiro ? (
          <>
            {primeiro.avisaCliente && !(parada && parada.exigidaPor.includes(primeiro.para)) ? (
              <span className={estilo.avisaCliente}>avisa o cliente</span>
            ) : null}
            <button
              type="button"
              className={estilo.osAvancar}
              disabled={pendente}
              onClick={() => aoClicar(primeiro)}
            >
              {pendente
                ? 'Um instante…'
                : rotulo(primeiro, Boolean(parada && parada.exigidaPor.includes(primeiro.para)))}
            </button>
          </>
        ) : null}
        {janelaDaParada}
      </>
    )
  }

  return (
    <div className={estilo.form}>
      {erro ? <p className={estilo.erro} role="alert">{erro}</p> : null}

      <div className={estilo.acoesForm}>
        {passos.map((p) => {
          const abreJanela = Boolean(parada && parada.exigidaPor.includes(p.para))
          return (
            <button
              key={p.para}
              type="button"
              className={estilo.btn}
              disabled={pendente}
              onClick={() => aoClicar(p)}
              title={abreJanela ? 'Abre a agenda dos motoristas para marcar a parada' : undefined}
            >
              {p.titulo}
              {/* O passo que ainda vai passar pela janela NÃO promete o aviso
                  aqui: quem dispara o WhatsApp é a marcação, e a janela é que
                  diz isso, depois de a pessoa escolher o dia e quem vai. */}
              {p.avisaCliente && !abreJanela ? ' · avisa o cliente' : ''}
              {abreJanela ? ' · escolher dia e motorista' : ''}
            </button>
          )
        })}
      </div>

      <label className={estilo.rotulo}>
        Observação (opcional)
        <input
          className={estilo.campo}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Fica registrada na linha do tempo, junto do seu nome"
          disabled={pendente}
        />
      </label>

      {janelaDaParada}
    </div>
  )
}
