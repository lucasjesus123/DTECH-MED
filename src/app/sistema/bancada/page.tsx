import { Papel } from '@/generated/prisma/enums'
import { exigirTela } from '@/server/sistema/guarda'
import { filaDaBancada } from '@/server/sistema/radar'
import RadarList from '@/components/sistema/radar-lista'
import { CabecalhoTela, EmptyState, StatCardRow, type Stat } from '@/components/sistema/pecas'

/**
 * A BANCADA — a fila do técnico.
 *
 * =============================================================================
 * "A FILA DELE", E NÃO "A FILA DA OFICINA"
 * =============================================================================
 * Um técnico com quarenta aparelhos na casa não quer os quarenta: quer os que
 * são dele. O recorte acontece na consulta — `tecnicoId` igual ao dele, mais os
 * que ainda não têm dono.
 *
 * O SEM DONO aparece para todos de propósito. É justamente o aparelho que
 * ninguém assumiu que corre o risco de ficar sem ninguém: some da fila de cada
 * um por não ser de nenhum.
 *
 * A GESTÃO vê a bancada inteira, porque a pergunta dela é outra — "a oficina
 * está andando?" — e ela é o único papel que enxerga o todo.
 *
 * =============================================================================
 * O MESMO ESQUELETO DAS OUTRAS TELAS-LISTA
 * =============================================================================
 * Quatro números, a fila, o botão-da-vez em cada linha. Quem aprendeu Ordens
 * de Serviço já sabe operar esta.
 */
export default async function Bancada() {
  const { ctx, sessao } = await exigirTela('bancada')

  const linhas = await filaDaBancada(ctx, sessao.papel, sessao.userId)

  const aReceber = linhas.filter((l) => l.estado.chave === 'COLETADO').length
  const emAnalise = linhas.filter((l) => l.estado.chave === 'EM_ANALISE').length
  const emServico = linhas.filter((l) => l.estado.chave === 'EM_MANUTENCAO').length
  const paradas = linhas.filter((l) => l.diasParado >= 4).length

  const stats: Stat[] = [
    {
      rotulo: 'Chegando',
      valor: aReceber,
      apoio: 'para receber na bancada',
      tom: aReceber > 0 ? 'info' : 'neutro',
      icone: 'bancada',
    },
    { rotulo: 'Em análise', valor: emAnalise, apoio: 'diagnóstico em curso', icone: 'ordens' },
    { rotulo: 'Em serviço', valor: emServico, apoio: 'chave na mão', icone: 'config' },
    {
      rotulo: 'Parados +4 dias',
      valor: paradas,
      apoio: paradas === 0 ? 'tudo andando' : 'sem andar',
      tom: paradas > 0 ? 'warn' : 'ok',
      icone: 'preventiva',
    },
  ]

  const daGestao = sessao.papel !== Papel.TECNICO

  return (
    <>
      <CabecalhoTela
        titulo="Bancada"
        apoio={
          daGestao
            ? 'Todos os aparelhos que estão dentro da oficina agora.'
            : 'Os aparelhos que estão com você, mais os que ainda não têm dono.'
        }
      />

      <StatCardRow stats={stats} />

      <RadarList
        titulo="Esteira // bancada"
        linhas={linhas}
        vazio={
          <EmptyState
            titulo="Bancada limpa ✓"
            apoio={
              daGestao
                ? 'Nenhum aparelho dentro da oficina esperando ação.'
                : 'Nada esperando por você. Quando um aparelho chegar, ele aparece aqui com o botão do próximo passo.'
            }
          />
        }
      />
    </>
  )
}
