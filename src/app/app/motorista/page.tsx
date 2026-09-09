import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { NIVEL, exigirSessao } from '@/server/auth/guarda'
import { rotaDoDia } from '@/server/consultas/campo'
import { Saida } from './saida'
import { Aceite } from './aceite'
import { Rastro } from './rastro'
import { AtualizaRota } from './atualiza'
import { AvisosNoCelular } from '../avisos'
import type { Parada } from '@/server/consultas/campo'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

/**
 * A ROTA DO MOTORISTA — o que falta fazer, e nada mais.
 *
 * =============================================================================
 * O DEFEITO QUE ESTA TELA TINHA, MEDIDO
 * =============================================================================
 * A tela listava as paradas do dia em ordem cronológica, todas do mesmo
 * tamanho, com as já concluídas na frente. Num dia real de demonstração isso
 * deu:
 *
 *     página de 7.897 px  ·  11,9 telas de rolagem
 *     32 cartões, 30 deles concluídos
 *     a primeira parada que dava para FAZER começava em y = 5.451 px
 *          → 8,2 telas de rolagem até o trabalho
 *
 * O motorista abre o aplicativo na rua, com uma mão, e a primeira coisa que vê
 * é serviço que ele já entregou. O topo ainda anunciava "32 paradas · 30
 * concluídas" — o número grande sendo o do passado.
 *
 * =============================================================================
 * A REGRA DESTA TELA AGORA
 * =============================================================================
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │  O que ele ainda tem de fazer ocupa a tela. O que já foi      │
 *     │  feito cabe atrás de um toque.                                │
 *     └──────────────────────────────────────────────────────────────┘
 *
 * A PRÓXIMA parada abre inteira, com os botões à mão. As outras pendentes
 * ficam fechadas, mostrando hora, cliente e endereço numa linha — e abrem no
 * toque, com os mesmos botões. É `<details>` do navegador: sem JavaScript,
 * funciona no 4G ruim e o leitor de tela entende sozinho.
 *
 * As concluídas viram uma linha cada, dentro de um bloco fechado. Elas não
 * somem — o motorista precisa poder conferir o que já fez, e a central pergunta
 * por elas o dia inteiro.
 */
export default async function Motorista() {
  const { sessao, ctx } = await exigirSessao()

  /**
   * QUEM ENTRA AQUI, E POR QUE ISSO MUDOU.
   *
   * Antes: só MOTORISTA e SUPER_ADMIN. Quem administra a empresa não conseguia
   * nem abrir a tela — e o efeito prático era que ninguém acima do motorista
   * sabia o que o aplicativo mostra. Não dava para conferir se a parada chegou,
   * nem para explicar por telefone o que ele está vendo, nem para descobrir que
   * o endereço saiu errado antes de o cliente reclamar.
   *
   * Agora quem gerencia entra em MODO GESTÃO: vê a rota da empresa inteira, com
   * o nome do motorista em cada parada, e não vê botão de ação nenhum. Abrir a
   * tela não abre a ação — a máquina de estados confere o dono da parada na hora
   * da assinatura, e continua conferindo.
   */
  const gerencia = NIVEL[sessao.papel] >= NIVEL[Papel.GESTOR]
  if (sessao.papel !== Papel.MOTORISTA && !gerencia) redirect('/painel')

  // Modo gestão vê a rota de TODOS; o motorista vê a dele.
  const paradas = await rotaDoDia(ctx, gerencia ? null : sessao.userId)
  const pendentes = paradas.filter((p) => !p.concluida)
  const feitas = paradas.filter((p) => p.concluida)
  const atrasadas = pendentes.filter((p) => p.atrasada).length

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Rota de hoje</span>
        <h1>{gerencia ? (sessao.tenantNome ?? 'A rota do dia') : sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          {/* O NÚMERO GRANDE É O QUE FALTA, e não o total.
              "32 paradas · 30 concluídas" fazia o dia parecer enorme quando
              sobravam duas. Quem está na rua conta para trás. */}
          <span>
            {pendentes.length === 0
              ? `${feitas.length} ${feitas.length === 1 ? 'parada feita' : 'paradas feitas'}`
              : `Faltam ${pendentes.length}`}
            {feitas.length > 0 && pendentes.length > 0 ? ` · ${feitas.length} feitas` : ''}
            {atrasadas > 0 ? ` · ${atrasadas} atrasada${atrasadas > 1 ? 's' : ''}` : ''}
          </span>
          <span className={estilo.mono}>{hoje()}</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        {/* A faixa que separa olhar de agir. Sem ela, quem gerencia acha que a
            tela não funciona quando o botão de "cheguei" não aparece. */}
        {gerencia ? (
          <p className={estilo.modoGestao}>
            <strong>Modo gestão.</strong> Você está vendo a rota de todos os motoristas, como eles
            veem. Registrar chegada e colher assinatura continua sendo de quem está na rua.
          </p>
        ) : null}

        {paradas.length === 0 ? (
          <p className={estilo.vazio}>
            {gerencia
              ? 'Nenhuma parada agendada para hoje na empresa. O que a central marcar aparece aqui.'
              : 'Nenhuma parada atribuída a você hoje. Quando a central agendar uma retirada ou entrega, ela aparece aqui.'}
          </p>
        ) : null}

        {/* Dia cumprido: a tela diz isso em vez de mostrar uma lista de coisas
            feitas e deixar a pessoa procurando o que sobrou. */}
        {paradas.length > 0 && pendentes.length === 0 ? (
          <p className={estilo.diaFechado}>
            <strong>Dia fechado.</strong>{' '}
            {gerencia
              ? 'Todas as paradas de hoje foram concluídas.'
              : 'Você concluiu todas as suas paradas de hoje.'}
          </p>
        ) : null}

        {pendentes.map((p, i) => (
          <CartaoDeParada
            key={p.id}
            p={p}
            posicao={i + 1}
            total={pendentes.length}
            agora={i === 0}
            gerencia={gerencia}
            quemSou={sessao.userId}
          />
        ))}

        {/* AS CONCLUÍDAS, RECOLHIDAS.
            Uma linha cada, atrás de um toque. Some da frente sem sumir do dia:
            "eu já passei lá?" é pergunta que aparece toda tarde, e a resposta
            precisa continuar a um toque de distância. */}
        {feitas.length > 0 ? (
          <details className={estilo.feitasBloco}>
            <summary className={estilo.feitasResumo}>
              {feitas.length} {feitas.length === 1 ? 'parada já concluída' : 'paradas já concluídas'}{' '}
              hoje
            </summary>
            <ul className={estilo.feitasLista}>
              {feitas.map((p) => (
                <li key={p.id}>
                  <span className={estilo.mono}>{hora(p.previstoPara)}</span>
                  <span className={estilo.feitasTipo}>
                    {p.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'} #
                    {String(p.numero).padStart(4, '0')}
                  </span>
                  <span className={estilo.feitasCliente}>{p.cliente}</span>
                  {gerencia && p.motorista ? (
                    <span className={estilo.feitasQuem}>{primeiroNome(p.motorista)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {/* O aviso no celular e o relógio da tela ficam no fim: são ajuste, não
            trabalho. Quem abre o aplicativo vem fazer parada, e o que ele veio
            fazer ocupa o alto. */}
        {!gerencia ? <AvisosNoCelular /> : null}
        {pendentes.length > 0 ? <AtualizaRota /> : null}
      </main>
    </>
  )
}

/**
 * O CARTÃO DE UMA PARADA.
 *
 * A primeira pendente vem aberta; as outras vêm fechadas e abrem no toque. É o
 * mesmo conteúdo nos dois casos — fechar não esconde ação nenhuma, só tira da
 * frente o que não é o agora. Um motorista que passa na porta do terceiro
 * cliente antes do segundo abre o cartão dele e trabalha igual.
 */
function CartaoDeParada({
  p,
  posicao,
  total,
  agora,
  gerencia,
  quemSou,
}: {
  p: Parada
  posicao: number
  total: number
  agora: boolean
  gerencia: boolean
  quemSou: string
}) {
  const cabecalho = (
    <>
      <span className={estilo.mono}>{p.tipo === 'RETIRADA' ? 'RETIRADA' : 'ENTREGA'}</span>
      <span className={estilo.mono}>#{String(p.numero).padStart(4, '0')}</span>
    </>
  )

  const miolo = (
    <div className={estilo.paCorpo}>
      <h2>{p.cliente}</h2>
      <p className={estilo.paEq}>{p.equipamento}</p>

      {/* QUEM VAI, no modo gestão. O comentário do arquivo prometia isto desde
          que o modo existe e a tela nunca imprimiu o campo: a rota da empresa
          inteira aparecia sem dizer de quem era cada parada. */}
      {gerencia ? (
        <p className={estilo.paQuem}>
          {p.motorista ? `Com ${p.motorista}` : 'Sem motorista definido'}
          {p.aceitoEm ? ' · aceitou' : p.motorista ? ' · ainda não aceitou' : ''}
        </p>
      ) : null}

      <p className={estilo.paEnd}>
        {p.endereco}
        {p.referencia ? <span className={estilo.paRef}>Referência: {p.referencia}</span> : null}
      </p>

      {/* O RECADO DA CENTRAL.
          Ele existe no formulário de agendar desde sempre ("Levar carrinho,
          estacionar nos fundos"), era gravado, e nenhuma tela do aplicativo o
          lia. Quem escrevia achava que estava avisando. Agora ele chega — e
          chega em destaque, porque é a única coisa do cartão que a pessoa não
          consegue adivinhar sozinha ao chegar no endereço. */}
      {p.observacoes ? (
        <p className={estilo.paRecado}>
          <span className={estilo.paRecadoRot}>Recado da central</span>
          {p.observacoes}
        </p>
      ) : null}

      {p.contatoDaParada ? (
        <p className={estilo.paContato}>Procurar por {p.contatoDaParada}</p>
      ) : null}

      {precisaAceitar(p, quemSou, gerencia) ? (
        /* Enquanto não aceitar, esta é a ÚNICA coisa no cartão. Mostrar o mapa
           e o telefone junto convidaria a sair sem aceitar — e o servidor
           recusaria depois, com a pessoa já no carro. Ver `aceite.tsx`. */
        <Aceite agendamentoId={p.id} />
      ) : gerencia ? null : (
        <>
          {/* Aceita, e a hora fica à vista: é o recibo de quem combinou o quê,
              para os dois lados. */}
          {p.aceitoEm ? (
            <p className={estilo.aceiteFeito}>Você aceitou às {hora(p.aceitoEm)}</p>
          ) : null}
          <div className={estilo.paAcoes}>
            <a
              className={estilo.miniBtn}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no mapa
            </a>
            {p.telefone ? (
              <a className={estilo.miniBtn} href={`tel:${p.telefone}`}>
                Ligar
              </a>
            ) : null}
          </div>
          {/* Marcar a saída dispara o aviso ao cliente. Quem esquecer não fica
              travado: a coleta registra o trecho sozinha, na hora de assinar. */}
          {!p.emRota ? <Saida ordemId={p.ordemId} tipo={p.tipo} /> : null}
          {/* O rastro só existe DEPOIS da saída, e some quando a parada é
              concluída. Fora da rota o servidor recusa de qualquer jeito — aqui
              a tela só não oferece o que ia falhar. */}
          {p.emRota ? <Rastro agendamentoId={p.id} /> : null}
          <Link href={`/app/motorista/${p.ordemId}`} className={estilo.btnGrande}>
            Cheguei · coletar assinatura
          </Link>
        </>
      )}
    </div>
  )

  if (agora) {
    return (
      <article className={`${estilo.parada} ${estilo.paradaAgora}`}>
        <p className={estilo.paSelo}>
          <span>Agora</span>
          {total > 1 ? <span className={estilo.paSeloPos}>{posicao} de {total}</span> : null}
          <Quando p={p} />
        </p>
        <div className={estilo.paTopoDestaque}>{cabecalho}</div>
        {miolo}
      </article>
    )
  }

  return (
    <details className={estilo.parada}>
      <summary className={estilo.paResumo}>
        <span className={estilo.paResumoTopo}>
          <span className={estilo.mono}>
            {posicao} de {total}
          </span>
          <Quando p={p} />
        </span>
        <span className={estilo.paResumoCliente}>{p.cliente}</span>
        <span className={estilo.paResumoLinha}>
          {p.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'} #{String(p.numero).padStart(4, '0')} ·{' '}
          {p.endereco}
        </span>
      </summary>
      <div className={estilo.paTopo}>{cabecalho}</div>
      {miolo}
    </details>
  )
}

/**
 * A HORA DA PARADA — que a tela não mostrava em lugar nenhum.
 *
 * Motorista organiza o dia por horário: o que é às 9h vem antes do que é às 14h,
 * e a janela combinada com o cliente ("entre 14h e 17h") é o que decide se dá
 * para encaixar mais uma no meio. Nada disso aparecia; o cartão trazia cliente,
 * aparelho e endereço, e a hora ficava só no painel de quem marcou.
 *
 * O atraso vem junto, e em vermelho: uma parada marcada para as 9h às 11h da
 * manhã é a informação mais urgente daquele cartão.
 */
function Quando({ p }: { p: Parada }) {
  const faixa = p.janelaFim ? `${hora(p.previstoPara)}–${hora(p.janelaFim)}` : hora(p.previstoPara)
  return (
    <span className={p.atrasada ? estilo.paHoraAtrasada : estilo.paHora}>
      {faixa}
      {p.atrasada ? ' · atrasada' : ''}
    </span>
  )
}

/**
 * QUEM PRECISA ACEITAR, E QUEM NÃO PRECISA.
 *
 * Três condições, e cada uma tira do caminho um jeito de a regra atrapalhar
 * quem trabalha:
 *
 *   • **É dele.** Parada de outro motorista, ou sem motorista designado, não
 *     pede aceite nenhum — a sem dono é de quem pegar, e cobrar aceite de
 *     ninguém seria travar por um campo vazio.
 *   • **Ainda não aceitou.** Óbvio, e é o que faz o botão sumir depois.
 *   • **Ainda não saiu.** Esta é a que protege o dia da virada: as paradas que
 *     já estavam na rua quando a regra entrou têm `aceitoEm` nulo para sempre,
 *     e sem isto o motorista abriria o aplicativo no meio da rota e seria
 *     obrigado a "aceitar" uma corrida que ele já está fazendo.
 *
 * O modo gestão nunca vê o botão: quem olha não aceita no lugar de quem vai.
 */
function precisaAceitar(p: Parada, quemSou: string, gerencia: boolean): boolean {
  if (gerencia) return false
  return p.motoristaId === quemSou && !p.aceitoEm && !p.emRota
}

/** "Adriano Martins" → "Adriano". Na lista recolhida, o sobrenome não cabe. */
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n

const hora = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(d)

const hoje = () =>
  new Date()
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })
    .replace('.', '')
    .toUpperCase()
