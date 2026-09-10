import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { podeVer } from '@/server/auth/guarda'
import { alertaDoDia } from '@/server/consultas/painel'
import { exigirTela } from '@/server/sistema/guarda'
import { ETAPAS_DE_CONFERENCIA, filaDeEtapas } from '@/server/sistema/radar'
import RadarList from '@/components/sistema/radar-lista'
import { Alerta, CabecalhoTela, EmptyState, StatCardRow, type Stat } from '@/components/sistema/pecas'

/**
 * CONFERÊNCIA — a fila de aprovação da gestão.
 *
 * =============================================================================
 * O QUE ESTA TELA IMPEDE
 * =============================================================================
 * O serviço acabou na bancada e agora falta alguém dizer "está bom, pode
 * cobrar". Sem uma fila com nome, esse aval é um item mental — e itens mentais
 * são esquecidos por três semanas com o aparelho pronto na prateleira.
 *
 * Aqui a fusão vale inteira: conferir e liberar viraram UM botão, porque os
 * dois passos são da gestão e ninguém nunca pensou neles separadamente. A linha
 * do tempo continua com os dois carimbos.
 *
 * =============================================================================
 * A ENTREGA NÃO PAGA TAMBÉM MORA AQUI
 * =============================================================================
 * A O.S. entregue e ainda não baixada é a última pendência da gestão, e é
 * exatamente a que some: o cliente já está com o aparelho, ninguém reclama, e a
 * ordem fica aberta para sempre. Ela entra nesta fila junto com as outras.
 */
export default async function Conferencia() {
  const { ctx, sessao } = await exigirTela('conferencia')

  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)
  const [linhas, alerta] = await Promise.all([
    filaDeEtapas(ctx, sessao.papel, ETAPAS_DE_CONFERENCIA),
    alertaDoDia(ctx, { comDinheiro }),
  ])

  const paraAvaliar = linhas.filter(
    (l) => l.etapa === EtapaOrdem.MANUTENCAO_CONCLUIDA || l.etapa === EtapaOrdem.APROVACAO_GESTAO,
  ).length
  const paraBaixar = linhas.filter((l) => l.etapa === EtapaOrdem.ENTREGUE).length
  const atrasadas = linhas.filter((l) => l.atrasada).length
  const paradas = linhas.filter((l) => l.diasParado >= 4).length

  const stats: Stat[] = [
    {
      rotulo: 'Esperando aval',
      valor: paraAvaliar,
      apoio: 'serviço concluído na bancada',
      tom: paraAvaliar > 0 ? 'warn' : 'ok',
      icone: 'conferencia',
    },
    {
      rotulo: 'Baixa final',
      valor: paraBaixar,
      apoio: 'entregues e ainda abertas',
      tom: paraBaixar > 0 ? 'warn' : 'ok',
      icone: 'ordens',
    },
    { rotulo: 'Prazo vencido', valor: atrasadas, tom: atrasadas > 0 ? 'danger' : 'ok', icone: 'preventiva' },
    { rotulo: 'Paradas +4 dias', valor: paradas, tom: paradas > 0 ? 'warn' : 'ok', icone: 'relatorios' },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Conferência"
        apoio="O que já foi feito e espera o seu aval para virar cobrança."
      />

      {/* O alerta do dia aparece também aqui, e não só no Painel: a gestora que
          entra direto na Conferência pela manhã precisa saber do problema caro
          antes de começar a aprovar. */}
      {alerta.tipo === 'atraso' ? (
        <Alerta titulo={alerta.titulo} apoio={alerta.consequencia} />
      ) : null}

      <StatCardRow stats={stats} />

      <RadarList
        titulo="Gestão // conferência"
        linhas={linhas}
        vazio={
          <EmptyState
            titulo="Nada esperando seu aval ✓"
            apoio={
              comDinheiro
                ? 'Quando o técnico concluir um serviço, ele cai aqui com o botão de aprovar. Entregas não baixadas também aparecem nesta fila.'
                : 'Quando o técnico concluir um serviço, ele cai aqui com o botão de aprovar.'
            }
          />
        }
      />
    </>
  )
}
