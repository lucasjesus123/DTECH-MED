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
 * POR QUE AS QUATRO FASES APARECEM
 * ---------------------------------------------------------------------------
 * Dezoito bolinhas numa régua viram um código de barras: dá para contar, não
 * dá para ler. Agrupadas em Retirada, Diagnóstico, Execução e Fechamento, elas
 * ganham a única divisão que o negócio já usa para falar — "está no
 * diagnóstico" é uma frase que se diz ao telefone; "está no passo 7" não é.
 *
 * A numeração de 1 a 18 fica, pequena, porque ela é verdadeira: o processo É
 * uma sequência, e o número é o que a pessoa confere com o dedo.
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
  const { fases, cumpridos, total, porcento, agora, desvio } = trilha

  return (
    <section className={estilo.trilha} aria-label={titulo}>
      <header className={estilo.trilhaTopo}>
        <div className={estilo.trilhaAgora}>
          <span className={estilo.grav}>{titulo}</span>
          <strong className={desvio ? estilo.trilhaDesvio : undefined}>
            {desvio ? desvio.rotulo : agora}
          </strong>
        </div>
        <span className={estilo.trilhaConta}>
          {desvio ? 'saiu do caminho' : `passo ${cumpridos} de ${total}`}
        </span>
      </header>

      <div className={estilo.trilhaPista}>
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
                        <span className={estilo.trilhaNum}>{no.passo}</span>
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
