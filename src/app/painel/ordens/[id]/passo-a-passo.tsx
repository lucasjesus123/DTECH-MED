import type { Roteiro } from '@/server/ordem/roteiro'
import estilo from '../../painel.module.css'

/**
 * O PASSO A PASSO DA FICHA — as mesmas peças da janela da O.S.
 *
 * =============================================================================
 * POR QUE ELE EXISTE
 * =============================================================================
 * O pedido do dono, depois de a janela ficar como ele queria: *"agora deixa a
 * ficha completa no mesmo padrão"*.
 *
 * A ficha desenhava a régua de DEZOITO pontos, herdada de antes — e a janela,
 * ao lado, desenhava três pílulas e uma lista vertical. Duas telas da mesma
 * O.S. contando a mesma história com desenhos diferentes é a definição do que
 * ele vinha chamando de bagunça.
 *
 * =============================================================================
 * AS MESMAS CLASSES, DE PROPÓSITO
 * =============================================================================
 * Ele usa `osFase*` e `osLinha2*`, que são as classes da janela. Não são
 * cópias: se amanhã a pílula mudar de raio ou o ponto de tamanho, as duas telas
 * mudam juntas, porque é a mesma regra de CSS.
 *
 * O que NÃO é compartilhado é o componente da janela, e isso é escolha. Lá as
 * pílulas e os pontos são BOTÕES: clicar visita outra fase, espiar um passo
 * troca o corpo da janela. Aqui não há corpo para trocar — a ficha inteira já
 * está desenhada abaixo. Peça que informa não finge ser botão; um clique que
 * não faz nada é pior que nenhum.
 *
 * =============================================================================
 * O QUE ELE HERDA DA TRILHA ANTIGA
 * =============================================================================
 * A linha do rodapé — "nesta etapa desde tal dia, última mexida por fulano" —
 * era a segunda pergunta de quem olhava a régua, sempre. Ela fica.
 */
export default function PassoAPasso({
  roteiro,
  titulo = 'Onde está o equipamento',
}: {
  roteiro: Roteiro
  titulo?: string
}) {
  const passoDeAgora = roteiro.passos.find((p) => p.n === roteiro.atual) ?? null

  return (
    <section className={estilo.fichaPasso} aria-label={titulo}>
      <header className={estilo.fichaPassoTopo}>
        <div>
          <p className={estilo.grav}>{titulo}</p>
          <p className={estilo.fichaPassoAgora}>
            {roteiro.desvio ? roteiro.desvio.rotulo : roteiro.agora}
          </p>
        </div>
        <span className={estilo.trilhaConta}>
          {roteiro.desvio ? 'saiu do caminho' : `passo ${roteiro.atual} de ${roteiro.total}`}
        </span>
      </header>

      {/* ----- As três fases, em pílula ----- */}
      <div className={estilo.osFases}>
        {roteiro.fases.map((f, i) => (
          <PilhaDeFase key={f.n} fase={f} anterior={roteiro.fases[i - 1] ?? null} primeira={i === 0} />
        ))}
      </div>

      {/* ----- Os passos da fase de agora, de cima para baixo ----- */}
      <ol className={estilo.osLinha2Lista}>
        {roteiro.passos
          .filter((p) => roteiro.fases.find((f) => f.n === roteiro.faseAtual)?.passos.includes(p.n))
          .map((n) => (
            <li key={n.n}>
              <div
                className={`${estilo.osLinha2No} ${estilo.fichaPassoNo} ${
                  n.estado === 'cumprido'
                    ? estilo.osLinha2Feito
                    : n.estado === 'agora'
                      ? estilo.osLinha2Agora
                      : estilo.osLinha2Adiante
                }`}
              >
                <span className={estilo.osLinha2Ponto} aria-hidden="true" />
                <span className={estilo.osLinha2Texto}>
                  <span className={estilo.osLinha2Nome}>{n.nome}</span>
                  <span className={estilo.osLinha2Quando}>
                    {/* Mesma regra da janela: o ESTADO manda, e a data, quando
                        existe, acrescenta. Passo cumprido sem data — o passo 1
                        não tem etapa de máquina — diria "ainda não" embaixo de
                        um ponto verde. */}
                    {n.quando
                      ? `${dataHora(n.quando)}${n.autor ? ` · ${n.autor}` : ''}`
                      : n.estado === 'cumprido'
                        ? 'cumprido'
                        : n.estado === 'agora'
                          ? 'acontecendo agora'
                          : 'ainda não'}
                  </span>
                </span>
              </div>
            </li>
          ))}
      </ol>

      {roteiro.desvio ? (
        <p className={estilo.trilhaRodape}>
          A ordem saiu do caminho normal
          {roteiro.desvio.quando ? ` em ${dataHora(roteiro.desvio.quando)}` : ''}. O passo a passo
          acima mostra até onde o equipamento chegou antes disso.
        </p>
      ) : passoDeAgora?.quando ? (
        <p className={estilo.trilhaRodape}>
          Nesta etapa desde <strong>{dataHora(passoDeAgora.quando)}</strong>
          {passoDeAgora.autor ? <> · última mexida por {passoDeAgora.autor}</> : null}
        </p>
      ) : null}
    </section>
  )
}

function PilhaDeFase({
  fase,
  anterior,
  primeira,
}: {
  fase: Roteiro['fases'][number]
  anterior: Roteiro['fases'][number] | null
  primeira: boolean
}) {
  const classe = [
    estilo.osFase,
    estilo.fichaFase,
    fase.estado === 'concluida'
      ? estilo.osFaseFeita
      : fase.estado === 'agora'
        ? estilo.osFaseAgora
        : fase.estado === 'parada'
          ? estilo.osFaseParada
          : estilo.osFaseAdiante,
  ].join(' ')

  return (
    <>
      {!primeira ? (
        <span
          aria-hidden="true"
          className={
            anterior?.estado === 'concluida'
              ? `${estilo.osFaseFio} ${estilo.osFaseFioFeito}`
              : estilo.osFaseFio
          }
        />
      ) : null}
      {/* `<span>`, e não `<button>`: aqui a peça só informa. Ver a nota no topo. */}
      <span className={classe} aria-label={`Fase ${fase.n}, ${fase.nome}: ${fase.situacao}`}>
        <span className={estilo.osFaseSelo} aria-hidden="true">
          {fase.estado === 'concluida' ? '✓' : fase.estado === 'parada' ? '!' : fase.estado === 'agora' ? '●' : ''}
        </span>
        {fase.nome}
      </span>
    </>
  )
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dataHora = (d: Date) => fmt.format(d).replace(',', ' às')
