import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { NIVEL, exigirSessao } from '@/server/auth/guarda'
import { proximasParadas, rotaDoDia } from '@/server/consultas/campo'
import { Saida } from './saida'
import { Aceite } from './aceite'
import { Rastro } from './rastro'
import { AtualizaRota } from './atualiza'
import { AvisosNoCelular } from '../avisos'
import type { Parada, ProximaParada } from '@/server/consultas/campo'
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
  const quem = gerencia ? null : sessao.userId
  const [paradas, proximas] = await Promise.all([
    rotaDoDia(ctx, quem),
    /**
     * O QUE VEM DEPOIS — buscado sempre, desenhado quando serve.
     *
     * Numa ida só junto com a rota, porque a alternativa seria buscar depois de
     * descobrir que o dia está vazio: uma segunda espera exatamente na tela que
     * já não tinha nada para mostrar.
     */
    proximasParadas(ctx, quem, 6),
  ])
  const pendentes = paradas.filter((p) => !p.concluida)
  const feitas = paradas.filter((p) => p.concluida)
  const atrasadas = pendentes.filter((p) => p.atrasada).length
  // Designadas e ainda não aceitas: a pergunta que a central faz o dia inteiro.
  const semAceite = pendentes.filter((p) => p.motoristaId && !p.aceitoEm).length
  const semDono = pendentes.filter((p) => !p.motoristaId).length

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
            {paradas.length === 0
              ? 'Nada marcado para hoje'
              : pendentes.length === 0
                ? `${feitas.length} ${feitas.length === 1 ? 'parada feita' : 'paradas feitas'}`
                : `Faltam ${pendentes.length}`}
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

        {/* -------------------------------------------------------------------
            O RESUMO DO DIA
            -------------------------------------------------------------------
            A tela tinha uma linha de texto no cabeçalho — "Faltam 3 · 2 feitas"
            — e nada mais. Isso responde "quanto falta" e deixa de fora as três
            perguntas que decidem o dia: quanto já andou, o que está ATRASADO, e
            quem foi designado e ainda não disse que vai.

            A barra existe porque progresso é a única coisa desta tela que se lê
            melhor em desenho que em número: 7 de 9 é conta, a barra quase cheia
            é um olhar. Ela só aparece quando há o que medir.
            ------------------------------------------------------------------- */}
        {paradas.length > 0 ? (
          <ResumoDoDia
            feitas={feitas.length}
            total={paradas.length}
            atrasadas={atrasadas}
            semAceite={semAceite}
            semDono={semDono}
            gerencia={gerencia}
            proxima={pendentes[0] ?? null}
            porMotorista={gerencia ? contarPorMotorista(paradas) : []}
          />
        ) : null}

        {/* O DIA VAZIO PASSOU A RESPONDER A PERGUNTA SEGUINTE.
            Antes: uma caixa tracejada dizendo "nenhuma parada agendada para
            hoje", e ponto. Quem lê isso pergunta na mesma hora "e amanhã?" — e
            para responder tinha de trocar de aba. */}
        {paradas.length === 0 ? (
          <div className={estilo.vazioRico}>
            <p className={estilo.vazioTitulo}>
              {gerencia ? 'Nenhuma parada marcada para hoje.' : 'Hoje você não tem parada.'}
            </p>
            <p className={estilo.vazioTexto}>
              {gerencia
                ? 'O que a central marcar aparece aqui — inclusive a parada que ainda está sem motorista.'
                : 'Quando a central agendar uma retirada ou entrega para você, ela aparece aqui e o celular avisa.'}
            </p>
          </div>
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

        {/* O QUE VEM DEPOIS DE HOJE.
            Sempre visível quando existe, e não só no dia vazio: saber que
            amanhã tem seis paradas muda como se organiza o fim da tarde de
            hoje. Recolhido quando o dia ainda tem trabalho, aberto quando não
            tem — a atenção vai para o que dá para fazer agora. */}
        {proximas.length > 0 ? (
          <OQueVem itens={proximas} aberto={pendentes.length === 0} gerencia={gerencia} />
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


/**
 * O RESUMO DO DIA — quatro perguntas, num painel só.
 *
 * =============================================================================
 * O QUE ELE RESPONDE, E POR QUE CADA UMA MERECE ESTAR AQUI
 * =============================================================================
 *   QUANTO JÁ ANDOU   a barra. É a única coisa desta tela que se lê melhor em
 *                     desenho que em número: "7 de 9" é conta, a barra quase
 *                     cheia é um olhar.
 *   O QUE É AGORA     a próxima parada, com hora e cliente. Sem isso a pessoa
 *                     rola até o primeiro cartão para descobrir o que já
 *                     poderia estar no alto.
 *   O QUE ATRASOU     em vermelho, porque uma parada das 9h às 11h da manhã é a
 *                     informação mais urgente do dia.
 *   QUEM NÃO ACEITOU  só no modo gestão. Designar não é combinar: entre as duas
 *                     cabe um motorista de folga e um aparelho que ninguém foi
 *                     buscar.
 *
 * Os selos só aparecem quando contam alguma coisa. Um "0 atrasadas" ocuparia a
 * mesma linha para dizer que está tudo bem, e o dia normal ficaria com três
 * selos cinzentos disputando espaço com o que importa.
 */
function ResumoDoDia({
  feitas,
  total,
  atrasadas,
  semAceite,
  semDono,
  gerencia,
  proxima,
  porMotorista,
}: {
  feitas: number
  total: number
  atrasadas: number
  semAceite: number
  semDono: number
  gerencia: boolean
  proxima: Parada | null
  /** Só no modo gestão, e só quando há mais de um motorista na rua. */
  porMotorista: Array<{ nome: string; feitas: number; total: number }>
}) {
  const porcento = total === 0 ? 0 : Math.round((feitas / total) * 100)

  return (
    <section className={estilo.resumo}>
      <div className={estilo.resumoTopo}>
        <span className={estilo.resumoConta}>
          <strong>{feitas}</strong> de {total} {total === 1 ? 'parada' : 'paradas'}
        </span>
        <span className={estilo.mono}>{porcento}%</span>
      </div>
      <div
        className={estilo.resumoBarra}
        role="progressbar"
        aria-valuenow={porcento}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Paradas concluídas hoje"
      >
        <span className={estilo.resumoBarraCheia} style={{ width: `${porcento}%` }} />
      </div>

      {atrasadas > 0 || semAceite > 0 || semDono > 0 ? (
        <div className={estilo.resumoSelos}>
          {atrasadas > 0 ? (
            <span className={`${estilo.selo} ${estilo.seloAtraso}`}>
              {atrasadas} {atrasadas === 1 ? 'atrasada' : 'atrasadas'}
            </span>
          ) : null}
          {gerencia && semDono > 0 ? (
            <span className={`${estilo.selo} ${estilo.seloFalta}`}>
              {semDono} sem motorista
            </span>
          ) : null}
          {gerencia && semAceite > 0 ? (
            <span className={`${estilo.selo} ${estilo.seloAceite}`}>
              {semAceite} sem aceite
            </span>
          ) : null}
        </div>
      ) : null}

      {/* QUEM ESTÁ COM QUANTAS — só quando há mais de um na rua.
          Com um motorista só, a linha repetiria a barra de cima com um nome na
          frente. A partir de dois ela responde a pergunta que a central faz de
          hora em hora: quem está segurando o dia. */}
      {porMotorista.length > 1 ? (
        <ul className={estilo.resumoQuem}>
          {porMotorista.map((m) => (
            <li key={m.nome}>
              <span className={estilo.resumoQuemNome}>{m.nome}</span>
              <span className={estilo.mono}>
                {m.feitas}/{m.total}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {proxima ? (
        <p className={estilo.resumoProxima}>
          <span className={estilo.resumoProximaRot}>
            {proxima.atrasada ? 'Atrasada' : 'A próxima'}
          </span>
          <span className={estilo.mono}>{hora(proxima.previstoPara)}</span>
          {' · '}
          {proxima.tipo === 'RETIRADA' ? 'buscar em' : 'entregar em'} {proxima.cliente}
        </p>
      ) : null}
    </section>
  )
}

/**
 * O QUE VEM DEPOIS DE HOJE.
 *
 * Uma linha por parada — dia, hora, cliente — e nada mais. Não é a agenda: é a
 * resposta à pergunta que o dia vazio provoca, e à que o fim de tarde provoca
 * ("amanhã está cheio?"). Quem quer a quinzena inteira toca em "Minha agenda".
 */
function OQueVem({
  itens,
  aberto,
  gerencia,
}: {
  itens: ProximaParada[]
  aberto: boolean
  gerencia: boolean
}) {
  return (
    <details className={estilo.vemBloco} open={aberto}>
      <summary className={estilo.vemResumo}>
        Depois de hoje · {itens.length}
        {itens.length === 6 ? '+' : ''}
      </summary>
      <ul className={estilo.vemLista}>
        {itens.map((i) => (
          <li key={i.id}>
            <Link href={`/app/motorista/${i.ordemId}`} className={estilo.vemItem}>
              <span className={estilo.mono}>
                {diaCurto(i.dia)} {i.hora}
              </span>
              <span className={estilo.vemCliente}>{i.cliente}</span>
              <span className={estilo.vemNota}>
                {i.tipo === 'RETIRADA' ? 'Buscar' : 'Entregar'}
                {gerencia ? ` · ${i.motorista ?? 'sem motorista'}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/app/agenda" className={estilo.vemTudo}>
        Ver a agenda inteira
      </Link>
    </details>
  )
}

/** 'AAAA-MM-DD' → '12/09'. Sem deixar o navegador escolher o fuso. */
function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-')
  return d && m ? `${d}/${m}` : dia
}


/**
 * Quantas paradas cada motorista tem hoje, e quantas já fez.
 *
 * A parada SEM DONO entra como "Sem motorista" e fica por último: ela não é de
 * ninguém, e listá-la junto dos nomes com uma linha própria é o que faz a
 * central perceber que ela existe. Ordenado por quem tem mais pela frente —
 * quem está segurando o dia aparece em cima.
 */
function contarPorMotorista(paradas: Parada[]): Array<{ nome: string; feitas: number; total: number }> {
  const SEM = 'Sem motorista'
  const m = new Map<string, { feitas: number; total: number }>()
  for (const p of paradas) {
    const nome = p.motorista ?? SEM
    const atual = m.get(nome) ?? { feitas: 0, total: 0 }
    atual.total += 1
    if (p.concluida) atual.feitas += 1
    m.set(nome, atual)
  }
  return [...m.entries()]
    .map(([nome, c]) => ({ nome, ...c }))
    .sort((a, b) => {
      if (a.nome === SEM) return 1
      if (b.nome === SEM) return -1
      return b.total - b.feitas - (a.total - a.feitas)
    })
}
