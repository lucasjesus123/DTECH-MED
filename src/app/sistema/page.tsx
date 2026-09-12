import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { contextoDe, lerSessao } from '@/server/auth/sessao'
import { podeVer } from '@/server/auth/guarda'
import { alertaDoDia, resumoDoDia } from '@/server/consultas/painel'
import { radarDoPapel } from '@/server/sistema/radar'
import { casaDoPapelV2 } from '@/server/sistema/navegacao'
import AoVivo from '@/components/sistema/ao-vivo'
import RadarList from '@/components/sistema/radar-lista'
import { Alerta, CabecalhoTela, EmptyState, Secao, StatCardRow, type Stat } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * O PAINEL — "o que eu preciso fazer agora".
 *
 * =============================================================================
 * A RÉGUA DE OURO DESTE ARQUIVO
 * =============================================================================
 * Qualquer pessoa, ao entrar, vê UMA coisa: a fila dela, com um botão por
 * linha. Não há menu de módulos, não há grade de atalhos, não há "escolha por
 * onde começar". Se esta tela exigir que alguém DECIDA onde clicar, ela falhou.
 *
 * O mesmo endereço serve sete papéis e devolve sete telas diferentes — porque a
 * pergunta "o que eu faço agora" tem sete respostas. O que muda não é a
 * apresentação: é a CONSULTA. A O.S. que não é trabalho desta pessoa não é
 * lida.
 *
 * =============================================================================
 * A ORDEM DA TELA É A ORDEM DA URGÊNCIA
 * =============================================================================
 *   1. O alerta, quando existe. Um problema por vez, o mais caro primeiro, com
 *      nome e número — nunca "3 atrasadas", que é uma estatística sobre a qual
 *      não se faz nada.
 *   2. O radar: a fila desta pessoa, do mais parado para o mais recente.
 *   3. Os quatro números. Contagem é o que se lê DEPOIS de saber que está tudo
 *      bem; ela nunca abre a tela.
 *
 * Esta ordem é o oposto da do dashboard antigo, e é de propósito.
 */

export default async function Painel() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  // O motorista trabalha na rua, com o celular na mão. Mandá-lo para uma tela
  // de mesa é a mesma falha que o sistema antigo já corrigira no login.
  if (sessao.papel === Papel.MOTORISTA) redirect(casaDoPapelV2(sessao.papel))

  const ctx = contextoDe(sessao)
  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)

  const [linhas, resumo, alerta] = await Promise.all([
    radarDoPapel(ctx, sessao.papel),
    resumoDoDia(ctx, { comDinheiro }),
    alertaDoDia(ctx, { comDinheiro }),
  ])

  const primeiroNome = sessao.nome.split(' ')[0] ?? sessao.nome

  /**
   * OS QUATRO NÚMEROS, ESCOLHIDOS PELO PAPEL.
   *
   * Não é a mesma fileira com campos escondidos: quem não pode ver dinheiro
   * recebe outros quatro números, porque a consulta do dinheiro nem chega a
   * rodar para essa pessoa. Esconder depois mandaria o valor pelo fio até o
   * navegador de quem não deve vê-lo, onde qualquer um lê no inspetor.
   */
  const stats: Stat[] = [
    {
      rotulo: 'Esperando você',
      valor: linhas.length,
      apoio: linhas.length === 0 ? 'fila vazia' : 'na sua fila agora',
      tom: linhas.length > 0 ? 'info' : 'ok',
      icone: 'painel',
    },
    {
      rotulo: 'O.S. abertas',
      valor: resumo.ordensAbertas,
      apoio: 'na esteira',
      icone: 'ordens',
      href: '/sistema/ordens',
    },
    {
      rotulo: 'Prazo vencido',
      valor: resumo.atrasadas,
      apoio: resumo.atrasadas === 0 ? 'nenhuma' : 'promessa quebrada',
      tom: resumo.atrasadas > 0 ? 'danger' : 'ok',
      icone: 'conferencia',
      href: '/sistema/ordens?filtro=atrasadas',
    },
    comDinheiro
      ? {
          rotulo: 'A receber',
          valor: formatarBRL(resumo.aReceber ?? 0),
          apoio: `recebido no mês: ${formatarBRL(resumo.recebidoNoMes ?? 0)}`,
          tom: 'ok',
          icone: 'financeiro',
          href: '/sistema/financeiro',
        }
      : {
          rotulo: 'Avisos na fila',
          valor: resumo.avisosNaFila,
          apoio:
            resumo.avisosFalhados > 0
              ? `${resumo.avisosFalhados} falharam`
              : 'saindo normalmente',
          tom: resumo.avisosFalhados > 0 ? 'danger' : 'neutro',
          icone: 'integracoes',
        },
  ]

  return (
    <>
      <CabecalhoTela
        titulo={`Bom trabalho, ${primeiroNome}`}
        apoio={
          linhas.length === 0
            ? 'Nada esperando por você agora.'
            : `${linhas.length} ${linhas.length === 1 ? 'item espera' : 'itens esperam'} uma ação sua.`
        }
      />

      {/* A FILA SE ATUALIZA SOZINHA.
          Este painel é a tela que fica aberta o dia inteiro num monitor — e
          era exatamente a que mostrava o mundo de cinco minutos atrás. O
          motorista aceita na calçada, o técnico fecha um laudo na bancada, e
          quem despacha só descobria ao recarregar. */}
      <AoVivo rotulo="fila ao vivo" />

      {/* O ALERTA vem antes de tudo. Ele é o único bloco da tela que a pessoa
          não pediu para ver — e é o único que ela precisava ver antes de
          escolher qualquer coisa. */}
      {alerta.tipo ? (
        <Alerta
          titulo={alerta.titulo}
          apoio={alerta.consequencia}
          acao={
            <Link href={aqui(alerta.href)} className={estilo.acaoLinha}>
              Ver {alerta.total > 4 ? `os ${alerta.total}` : 'agora'}
            </Link>
          }
        />
      ) : null}

      <Secao titulo="Ações pendentes // radar">
        <RadarList
          titulo={tituloDoRadar(sessao.papel)}
          linhas={linhas}
          vazio={
            <EmptyState
              titulo="Tudo em dia ✓"
              apoio={vazioDoPapel(sessao.papel)}
              acao={
                sessao.papel === Papel.ATENDENTE ||
                sessao.papel === Papel.ADMIN_EMPRESA ||
                sessao.papel === Papel.GESTOR ? (
                  <Link href="/sistema/ordens/nova" className={estilo.acao}>
                    Abrir O.S.
                  </Link>
                ) : undefined
              }
            />
          }
        />
      </Secao>

      <Secao titulo="Números de hoje">
        <StatCardRow stats={stats} />
      </Secao>
    </>
  )
}

/** `/painel/...` → `/sistema/...`. O alerta é montado pela consulta antiga. */
function aqui(href: string): string {
  return href.replace(/^\/painel\b/, '/sistema')
}

/**
 * O título da fila, no vocabulário de quem a lê.
 *
 * "Ações pendentes" serve para todo mundo e não significa nada para ninguém. O
 * técnico chama de bancada, o financeiro de recebíveis. Falar a língua de quem
 * está na frente da tela é metade do trabalho de uma tela que não precisa de
 * treinamento.
 */
function tituloDoRadar(papel: Papel): string {
  switch (papel) {
    case Papel.TECNICO:
      return 'Sua bancada'
    case Papel.FINANCEIRO:
      return 'Esperando cobrança'
    case Papel.ATENDENTE:
      return 'Esperando a central'
    case Papel.GESTOR:
    case Papel.ADMIN_EMPRESA:
      return 'Esperando seu aval'
    default:
      return 'Esperando você'
  }
}

function vazioDoPapel(papel: Papel): string {
  switch (papel) {
    case Papel.TECNICO:
      return 'Nenhum aparelho esperando na sua bancada. Quando chegar um, ele aparece aqui com o botão do próximo passo.'
    case Papel.FINANCEIRO:
      return 'Nenhuma O.S. liberada esperando cobrança. As que a gestão liberar caem aqui.'
    case Papel.ATENDENTE:
      return 'Nenhuma coleta ou entrega esperando agendamento.'
    default:
      return 'Nada esperando seu aval. Quando o técnico concluir um serviço, ele aparece aqui.'
  }
}
