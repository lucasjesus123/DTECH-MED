import type { Trilha } from '@/server/ordem/trilha'
import estilo from '../../painel.module.css'

/**
 * A trilha do equipamento, desenhada como uma linha.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELA PRECISA RESPONDER EM UM SEGUNDO
 * ---------------------------------------------------------------------------
 * "Onde está o aparelho do cliente que acabou de ligar." Nada mais. Por isso o
 * ponto de AGORA é a única coisa grande na peça: o resto é contexto, e contexto
 * que compete com a resposta atrapalha.
 *
 * ---------------------------------------------------------------------------
 * POR QUE AS FASES APARECEM, E POR QUE OS NÚMEROS SAÍRAM
 * ---------------------------------------------------------------------------
 * Dezoito bolinhas numa régua viram um código de barras: dá para contar, não
 * dá para ler. Agrupadas nas três fases de `fases.ts` — buscar o aparelho,
 * consertar, devolver e receber — elas ganham a única divisão que o negócio já
 * usa para falar: "está no conserto" é uma frase que se diz ao telefone; "está
 * no passo 7" não é.
 *
 * Este parágrafo já estava escrito aqui, e a peça fazia o contrário do que ele
 * dizia: escrevia 1…18 dentro das bolinhas, que é o que dá dígitos ao código de
 * barras. Os números saíram, e o que cada ponto é continua à mão pelo `title`
 * e pelo texto do leitor de tela — com a etapa, a hora e quem fez, que é mais
 * do que o dígito dizia.
 *
 * O número que a peça ainda escreve é UM: "passo 4 de 11", no canto, e ele
 * agora é o do roteiro. Antes era o dos 18 nós, e a janela da O.S. mostrava o
 * dos 11 — a mesma ordem, na mesma hora, com dois números diferentes.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É CLICÁVEL
 * ---------------------------------------------------------------------------
 * Esta peça INFORMA. Quem avança a ordem são os botões da seção de ações, que
 * conferem papel e pré-condição. Uma régua clicável convidaria a arrastar o
 * equipamento pela linha como se fosse um quadro de tarefas, e a esteira não é
 * um quadro de tarefas: cada passo tem uma trava por trás.
 */
export function TrilhaDoEquipamento({ trilha, titulo = 'Onde está o equipamento' }: { trilha: Trilha; titulo?: string }) {
  const { fases, porcento, agora, desvio, passoDoRoteiro, totalDoRoteiro } = trilha

  return (
    <section className={estilo.trilha} aria-label={titulo}>
      <header className={estilo.trilhaTopo}>
        <div className={estilo.trilhaAgora}>
          <span className={estilo.grav}>{titulo}</span>
          <strong className={desvio ? estilo.trilhaDesvio : undefined}>
            {desvio ? desvio.rotulo : agora}
          </strong>
        </div>
        {/* A CONTAGEM É A DO ROTEIRO, e não a dos 18 nós desenhados abaixo.
            Ver a nota em `Trilha.passoDoRoteiro`: esta caixa dizia "passo 3 de
            18" enquanto a janela da O.S., na mesma hora e sobre a mesma ordem,
            dizia "passo 4 de 11". Agora as duas telas contam igual, e a régua
            continua com os 18 pontos que são o detalhe do prontuário. */}
        <span className={estilo.trilhaConta}>
          {desvio ? 'saiu do caminho' : `passo ${passoDoRoteiro} de ${totalDoRoteiro}`}
        </span>
      </header>

      {/**
       * A PISTA ROLA DE LADO, ENTÃO ELA PRECISA RECEBER O FOCO.
       *
       * Uma região que rola e não é focável é intransponível no teclado: quem
       * não usa mouse chega ao fim da tela sem nunca ver as etapas que ficaram
       * fora do recorte. O `axe` chama isso de `scrollable-region-focusable`, e
       * a queixa é literal — o conteúdo aqui dentro é desenho, não link, então
       * não há nada para o Tab pousar.
       *
       * `tabIndex={0}` resolve, e o `role="group"` com nome é o que faz o leitor
       * de tela anunciar o que essa parada de foco é, em vez de um retângulo
       * mudo no meio da ficha.
       */}
      <div
        className={estilo.trilhaPista}
        tabIndex={0}
        role="group"
        aria-label={`Trilha do equipamento: ${desvio ? desvio.rotulo : `passo ${passoDoRoteiro} de ${totalDoRoteiro}`}`}
      >
        {/* O trilho de fundo e o quanto dele já foi percorrido. A largura é o
            ÚNICO valor calculado em linha: é dado, não estilo. */}
        <div className={estilo.trilhaFio} aria-hidden="true">
          <span
            className={desvio ? estilo.trilhaFioParado : estilo.trilhaFioCheio}
            style={{ width: `${porcento}%` }}
          />
        </div>

        <div className={estilo.trilhaFases}>
          {fases.map((f) => (
            <div key={f.nome} className={estilo.trilhaFase}>
              <div className={estilo.trilhaNos}>
                {f.nos.map((no) => {
                  const classe =
                    no.estado === 'agora' && !desvio
                      ? estilo.trilhaNoAgora
                      : no.estado === 'cumprido'
                        ? estilo.trilhaNoFeito
                        : estilo.trilhaNoAdiante

                  /* O `title` carrega quando e quem para o mouse; o texto
                     escondido carrega a mesma coisa para o leitor de tela.
                     Sem os dois, a régua só serve para quem enxerga e aponta. */
                  const detalhe = no.quando
                    ? `${no.rotulo} · ${fmt(no.quando)}${no.quem ? ` · ${no.quem}` : ''}`
                    : `${no.rotulo} · ainda não`

                  return (
                    <span key={no.etapa} className={estilo.trilhaNoCaixa}>
                      {/* `--ordem` é o passo da etapa, e é ele que faz as
                          bolinhas já cumpridas acenderem EM SEQUÊNCIA, atrás do
                          fio que cresce. O atraso mora no CSS; aqui vai só o
                          número, para o cálculo não virar estilo embutido em
                          dezoito elementos. */}
                      <span
                        className={classe}
                        title={detalhe}
                        style={{ '--ordem': no.passo } as React.CSSProperties}
                      >
                        {/* O NÚMERO DE 1 A 18 SAIU DE DENTRO DA BOLINHA.
                            O comentário no topo deste arquivo já dizia que
                            "dezoito bolinhas numa régua viram um código de
                            barras" — e então escrevia 1…18 dentro delas, que é
                            o que faz o código de barras ter dígitos. Pior: o
                            número aqui era o da etapa, e a contagem no canto
                            passou a ser a do roteiro, então os dois iam
                            discordar dentro da MESMA peça.

                            O que cada ponto é continua à mão: o `title` para o
                            mouse e o texto do leitor de tela logo abaixo, os
                            dois com o nome da etapa, quando ela aconteceu e
                            quem a fez. O `--ordem` fica, porque é ele que faz
                            os pontos cumpridos acenderem em sequência. */}
                      </span>
                      <span className={estilo.soLeitor}>{detalhe}</span>
                    </span>
                  )
                })}
              </div>
              <p className={estilo.trilhaFaseNome}>{f.nome}</p>
              <p className={estilo.trilhaFaseQuem}>{f.quem}</p>
            </div>
          ))}
        </div>
      </div>

      {/* A legenda do ponto atual, embaixo: quem mexeu por último e quando.
          É a segunda pergunta de quem olha a régua, sempre. */}
      {(() => {
        if (desvio) {
          return (
            <p className={estilo.trilhaRodape}>
              A ordem saiu do caminho normal{desvio.quando ? ` em ${fmt(desvio.quando)}` : ''}. A
              régua acima mostra até onde o equipamento chegou antes disso.
            </p>
          )
        }
        const atual = fases.flatMap((f) => f.nos).find((n) => n.estado === 'agora')
        if (!atual?.quando) return null
        return (
          <p className={estilo.trilhaRodape}>
            Nesta etapa desde <strong>{fmt(atual.quando)}</strong>
            {atual.quem ? <> · última mexida por {atual.quem}</> : null}
          </p>
        )
      })()}
    </section>
  )
}

const formatador = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmt = (d: Date) => formatador.format(d).replace(',', ' às')
