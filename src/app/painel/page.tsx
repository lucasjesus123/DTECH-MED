import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL, formatarBRLCurto } from '@/lib/dinheiro'
import { exigirSessao, podeVer } from '@/server/auth/guarda'
import {
  alertaDoDia,
  esteira,
  filaDoDegrau,
  resumoDoDia,
  type AlertaDoDia,
  type Degrau,
} from '@/server/consultas/painel'
import { BigNumber, Delta, Exec, Term } from './console'
import {
  dinheiroMensal,
  movimentoMensal,
  ondeEstaParado,
  oQueMaisQuebra,
  prazoMensal,
  quemTrazTrabalho,
  type MesDeDinheiro,
} from '@/server/consultas/operacao'
import Operacao from './operacao'
import { contatosNovosContagem, leadsNovos } from '@/server/consultas/listas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import estilo from './painel.module.css'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }
// Painel mostra o estado de agora; cache aqui só serviria para mostrar o
// passado com cara de presente.
export const dynamic = 'force-dynamic'

export default async function PainelDoDia({
  searchParams,
}: {
  searchParams: Promise<{ degrau?: string; ver?: string }>
}) {
  const { ctx, sessao } = await exigirSessao()

  // O super admin cai aqui ao entrar, mas "onde a esteira está agora" é a
  // pergunta de quem opera uma franquia — e fora de uma empresa ele não tem
  // esteira. Sem este desvio ele aterrissava numa tela de números vazios que o
  // menu dele nem oferece, e precisava de dois cliques para chegar onde de fato
  // trabalha.
  //
  // `!visitando` é a metade que faltava: DENTRO de uma franquia ele tem esteira
  // sim, e é justamente esta tela que ele foi ver. Sem essa condição, clicar em
  // "Entrar" devolvia a pessoa para a lista de empresas — de onde ela tinha
  // acabado de sair — e a visita parecia não ter funcionado.
  if (sessao.papel === Papel.SUPER_ADMIN && !sessao.visitando) redirect('/painel/empresas')

  const { degrau = 'manut', ver } = await searchParams

  /**
   * DUAS ABAS, DOIS HORIZONTES.
   *
   *   HOJE      o que está parado, e o que fazer nas próximas horas
   *   OPERAÇÃO  como o mês está indo, e o que decidir para o próximo
   *
   * Empilhar os gráficos em cima ou embaixo da esteira empurraria a fila do dia
   * — a informação que a pessoa veio ver de manhã — para a terceira dobra. É a
   * mesma regra que já separou as visões da O.S., do Financeiro, do Comercial e
   * do Calendário.
   */
  const aba: 'hoje' | 'operacao' = ver === 'operacao' ? 'operacao' : 'hoje'

  // O DINHEIRO SÓ VAI PARA QUEM PODE VER DINHEIRO, e o corte é na consulta.
  // Filtrar na tela mandaria o faturamento por cliente pelo fio até o navegador
  // de quem não deve vê-lo, onde qualquer um lê no inspetor.
  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)

  /**
   * Só o que a aba mostrada precisa.
   *
   * As seis consultas da operação varrem o histórico inteiro; rodá-las na aba
   * de hoje seria pagar seis agregações por cada abertura de tela para desenhar
   * uma esteira que não usa nenhuma delas.
   */
  const [degraus, resumo, fila, leads, contatosNovos, alerta, meses] = await Promise.all([
    esteira(ctx, { comDinheiro }),
    resumoDoDia(ctx, { comDinheiro }),
    filaDoDegrau(ctx, degrau),
    // A tira traz três; a contagem diz quantos são de verdade. Sem ela, "3
    // pessoas chamaram" seria mentira num dia de trinta.
    leadsNovos(ctx),
    contatosNovosContagem(ctx),
    // O problema do dia. Ele vem antes de qualquer métrica na tela, e por isso
    // vem junto das outras na mesma viagem — carregá-lo depois faria o
    // primeiro conteúdo da página ser o último a chegar.
    alertaDoDia(ctx, { comDinheiro }),
    // A série do herói. Só para quem vê dinheiro: sem ela, o cartão do
    // motorista mostra outro número e esta consulta não teria para quê.
    comDinheiro ? dinheiroMensal(ctx, 12) : Promise.resolve([]),
  ])

  const op =
    aba === 'operacao'
      ? await (async () => {
          const [movimento, prazo, filas, aparelhos, clientes, dinheiro] = await Promise.all([
            movimentoMensal(ctx),
            prazoMensal(ctx),
            ondeEstaParado(ctx),
            oQueMaisQuebra(ctx),
            quemTrazTrabalho(ctx, { comDinheiro }),
            comDinheiro ? dinheiroMensal(ctx) : Promise.resolve([]),
          ])
          return { movimento, prazo, filas, aparelhos, clientes, dinheiro }
        })()
      : null

  const selecionado = degraus.find((d) => d.chave === degrau) ?? degraus[0]!
  const maiorDegrau = Math.max(...degraus.map((d) => d.total))

  /**
   * A aba de OPERAÇÃO sai por aqui.
   *
   * Duas saídas em vez de um ternário gigante em volta das 170 linhas do
   * "hoje": o ternário deixaria o conteúdo do dia inteiro deslocado um nível,
   * e o custo disso é pago em toda leitura futura do arquivo. O cabeçalho é o
   * mesmo nos dois caminhos e por isso virou `Topo`.
   */
  if (aba === 'operacao' && op) {
    return (
      <>
        <Topo aba={aba} nome={sessao.nome} />
        <Operacao
          movimento={op.movimento}
          prazo={op.prazo}
          filas={op.filas}
          aparelhos={op.aparelhos}
          clientes={op.clientes}
          dinheiro={op.dinheiro}
          comDinheiro={comDinheiro}
        />
      </>
    )
  }

  return (
    <>
      <Topo aba={aba} nome={sessao.nome} />

      {/* ===================================================================
          1. O PROBLEMA DO DIA — antes de qualquer métrica.
          ===================================================================
          Ele é o primeiro conteúdo da tela porque é a única coisa aqui que
          responde "o que eu faço agora". Tudo o mais responde "como estamos",
          que é a pergunta seguinte.

          Quando não há nada gritando, o bloco NÃO APARECE. Um banner verde
          dizendo "tudo certo" ocuparia o lugar mais nobre da tela para não
          informar nada, e treinaria o olho a pular aquela faixa — que é
          exatamente onde o problema vai aparecer amanhã. */}
      {alerta.tipo ? <BannerDoDia alerta={alerta} /> : null}

      {/* ===================================================================
          2. O HERÓI — um por tela, e ele muda conforme quem olha.
          ===================================================================
          O número que responde a pergunta principal em um relance. Para quem
          vê dinheiro é a RECEITA DO MÊS; para quem não vê, é ORDENS ABERTAS.

          A troca não é consolo: é o que mantém a regra de UM herói por tela
          valendo para todo mundo. Deixar o motorista sem herói daria a ele uma
          tela sem entrada — o olho não teria onde pousar primeiro e voltaria a
          varrer tudo, que é o estado que o herói existe para desfazer.

          E o indicador correspondente sai da faixa de baixo, para o mesmo
          número não aparecer duas vezes na mesma tela. */}
      {comDinheiro ? (
        <HeroiDeReceita meses={meses} aReceber={resumo.aReceber ?? 0} />
      ) : (
        <HeroiDeOrdens abertas={resumo.ordensAbertas} atrasadas={resumo.atrasadas} />
      )}

      {/* A ESTEIRA. Cada degrau diz quantos estão parados, há quanto tempo, e
          quanto está represado ali — e um deles diz que é o gargalo. É o que
          faz alguém agir, e é o que o ERP antigo escondia.

          ELA VEM PRIMEIRO, e isto foi corrigido: os contatos do site ficavam
          acima dela, com a mensagem inteira de cada um numa célula de tabela.
          Bastou chegar UMA prospecção em massa — vinte linhas, em inglês, com
          assinatura completa — para a esteira sair do primeiro olhar. Quem
          abria o sistema para saber onde o trabalho está via um e-mail de
          propaganda ocupando a tela.

          O erro não foi o spam ter passado pela armadilha: foi a tela supor que
          texto vindo de fora seria curto. Texto de terceiro não tem tamanho. */}
      <nav className={estilo.esteira} aria-label="Etapas da esteira">
        {degraus.map((d, i) => {
          const ativo = d.chave === degrau
          /* A BARRA É PROPORCIONAL AO MAIOR DEGRAU, e não ao total da esteira.
             Contra o total, oito degraus equilibrados dariam oito barras de
             12% — todas curtas, nenhuma comparável com nenhuma. Contra o
             maior, o maior enche e os outros se leem como fração dele, que é
             a comparação que a pessoa de fato faz ao olhar a régua. */
          const parte = maiorDegrau > 0 ? Math.round((d.total / maiorDegrau) * 100) : 0
          return (
            <Link
              key={d.chave}
              href={`/painel?degrau=${d.chave}`}
              className={[
                estilo.degrau,
                ativo ? estilo.degrauAtivo : '',
                d.travadas > 0 ? estilo.degrauGrita : '',
                d.total === 0 ? estilo.degrauZero : '',
                d.gargalo ? estilo.degrauGargalo : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={ativo ? 'page' : undefined}
              /**
               * A POSIÇÃO NA ESTEIRA E A COR DELA, entregues ao CSS.
               *
               * `--passo` é a posição no percurso, de 0 a 7: é dela que sai a
               * entrada em cascata, da esquerda para a direita — o mesmo
               * sentido em que o trabalho anda.
               *
               * `--sc` é a cor DESTE degrau, tirada da rampa. Todo o CSS
               * interno lê `var(--sc)`, então o nó, a faixa, o número e a barra
               * combinam sem ninguém repetir a cor em quatro regras.
               *
               * A RAMPA VAI DE COBALTO A AZUL-CÉU E PARA ANTES DO TEAL, e as
               * duas pontas são deliberadas. Ela codifica PROXIMIDADE DA
               * ENTREGA, e proximidade não é estado: uma etapa adiantada não é
               * "boa", é adiantada. Antes era um `color-mix` que terminava em
               * VERDE — a cor de estado saudável deste sistema —, e o efeito
               * era a esteira competir com o alerta que precisa ser visto. O
               * teal fica de fora porque é tinta exclusiva de inferência da
               * máquina.
               *
               * Vem daqui e não de oito classes no CSS porque a esteira pode
               * mudar de tamanho: acrescentar um degrau amanhã não deve exigir
               * lembrar de acrescentar uma cor.
               */
              style={{ '--passo': i, '--sc': `var(--e${i + 1})` } as CSSProperties}
            >
              <span className={estilo.degrauNo} aria-hidden="true" />
              <span className={estilo.degrauRot}>{d.rotulo}</span>
              <span className={estilo.degrauNum}>{d.total}</span>
              <span className={estilo.degrauMeta}>{metaDoDegrau(d)}</span>
              {d.gargalo ? <span className={estilo.degrauSelo}>Gargalo</span> : null}
              {/* A barra REPETE em forma o número que está logo acima. É
                  redundância de propósito: quem varre a esteira de longe lê a
                  silhueta antes de ler qualquer dígito. Por ser redundante,
                  fica escondida de quem ouve — o leitor de tela já disse o
                  número, e repeti-lo como "62 por cento" só faria barulho.

                  ELA É O ÚLTIMO FILHO, e isso é requisito: é o que permite ao
                  CSS empurrá-la para o rodapé do cartão e alinhar as oito na
                  mesma linha. Com o selo depois dela, o degrau que tem selo
                  levantaria a barra dele e a régua se perderia. */}
              <span className={estilo.degrauBarra} aria-hidden="true">
                <i style={{ '--parte': `${parte}%` } as CSSProperties} />
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ===================================================================
          4. A FAIXA DE INDICADORES — depois da esteira, e não antes.
          ===================================================================
          Ela abria a tela e foi para baixo. A ordem antiga punha a contagem
          antes do trabalho: primeiro "12 ordens abertas", depois onde elas
          estão. Mas ninguém age sobre doze; age-se sobre "três paradas em
          orçamento há nove dias". A esteira responde isso, então ela vem
          primeiro e a contagem vira o resumo que se lê depois.

          O CARTÃO QUE VIROU HERÓI SAI DAQUI. Para quem vê dinheiro, o
          faturamento já está lá em cima em 56px; repetir em 28 seria o mesmo
          número duas vezes na mesma tela. Para quem não vê, quem subiu foi
          "Ordens abertas", e é ele que sai — sobram DOIS cartões, e a grade
          acompanha.

          DOIS, E NÃO TRÊS COM UM DE ENCHIMENTO. A primeira versão completava a
          faixa do motorista com "Equipamentos na casa", somando os degraus da
          esteira. O número deu 12 — exatamente o mesmo do herói logo acima, com
          outro nome. Grade que fecha bonito não vale um número repetido: quem
          lê duas vezes o mesmo valor com rótulos diferentes passa a duvidar dos
          dois. */}
      <div className={`${estilo.resumo} ${comDinheiro ? estilo.resumo3 : estilo.resumo2}`}>
        {comDinheiro ? (
          <Indicador
            rotulo="Ordens abertas"
            valor={String(resumo.ordensAbertas)}
            nota={resumo.atrasadas > 0 ? `${resumo.atrasadas} com prazo vencido` : 'nenhuma atrasada'}
            alerta={resumo.atrasadas > 0}
          />
        ) : null}
        <Indicador
          rotulo="Estoque baixo"
          valor={String(resumo.pecasAbaixoDoMinimo)}
          nota={resumo.pecasAbaixoDoMinimo > 0 ? 'peças no mínimo ou abaixo' : 'tudo acima do mínimo'}
          alerta={resumo.pecasAbaixoDoMinimo > 0}
        />
        <Indicador
          rotulo="Avisos ao cliente"
          valor={String(resumo.avisosNaFila)}
          nota={
            resumo.avisosFalhados > 0
              ? `${resumo.avisosFalhados} não saíram — verifique o WhatsApp`
              : 'na fila para enviar'
          }
          alerta={resumo.avisosFalhados > 0}
        />
      </div>

      {/* A TIRA DOS CONTATOS DO SITE.
          Depois da esteira, no máximo três, uma linha cada, com a mensagem já
          cortada pelo servidor. É um AVISO de que tem gente esperando, não o
          lugar de ler o que ela escreveu — isso é a tela de Contatos do site,
          que este bloco linka. */}
      {leads.length > 0 ? (
        <section className={estilo.recados} aria-label="Contatos do site aguardando resposta">
          <div className={estilo.recadosCab}>
            <p className={estilo.recadosTitulo}>
              <span className={estilo.recadosPulso} aria-hidden="true" />
              {contatosNovos === 1
                ? '1 pessoa chamou pelo site e ainda não teve resposta'
                : `${contatosNovos} pessoas chamaram pelo site e ainda não tiveram resposta`}
            </p>
            <Link href="/painel/contatos" className={estilo.recadosTodos}>
              Ver todos
            </Link>
          </div>

          <ul className={estilo.recadosLista}>
            {leads.map((l) => (
              <li key={l.id} className={estilo.recado}>
                <span className={estilo.recadoQuando}>{haQuanto(l.criadoEm)}</span>
                <span className={estilo.recadoQuem}>
                  <strong>{l.nome}</strong>
                  {l.cidade ? <span className={estilo.fraco}> · {l.cidade}</span> : null}
                </span>
                {/* Uma linha só, e o que não couber é cortado com reticências.
                    O texto já chega curto do servidor; isto é o cinto do
                    suspensório, para o nome de uma empresa comprida não
                    empurrar a linha. */}
                <span className={estilo.recadoTrecho}>{l.mensagem || 'sem mensagem'}</span>
                <Link href="/painel/contatos" className={estilo.recadoAbrir}>
                  Responder
                </Link>
              </li>
            ))}
          </ul>

          {contatosNovos > leads.length ? (
            <p className={estilo.recadosResto}>
              e mais {contatosNovos - leads.length}{' '}
              {contatosNovos - leads.length === 1 ? 'contato' : 'contatos'} em Contatos do site
            </p>
          ) : null}
        </section>
      ) : null}

      <div className={estilo.filaCab}>
        <h2 className={estilo.filaTitulo}>{selecionado.rotulo}</h2>
        <span className={estilo.grav}>
          {fila.length === 0
            ? 'nada parado aqui'
            : `${fila.length} ${fila.length === 1 ? 'ordem' : 'ordens'} · mais parada primeiro`}
        </span>
      </div>

      {fila.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum equipamento parado nesta etapa. Clique em outro degrau da esteira
          para ver onde o trabalho está.
        </p>
      ) : (
        <ul className={estilo.lista}>
          {fila.map((o) => (
            <li key={o.id}>
              <Link href={`/painel/ordens/${o.id}`} className={estilo.cardOrdem}>
                <div className={estilo.cardTopo}>
                  <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                  <span className={estilo.selo}>{ROTULO_ETAPA[o.etapa]}</span>
                </div>
                <p className={estilo.cardEq}>{o.equipamento}</p>
                <p className={estilo.cardCli}>{o.cliente}</p>
                <div className={estilo.cardRod}>
                  <span>{o.tecnico ? o.tecnico.toUpperCase() : 'SEM TÉCNICO'}</span>
                  <span className={o.atrasada ? estilo.atrasado : undefined}>
                    {o.diasParado === 0 ? 'movida hoje' : `parada há ${o.diasParado}d`}
                    {o.atrasada ? ' · prazo vencido' : ''}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * O CABEÇALHO, que as duas abas dividem.
 *
 * Ele saiu do corpo da tela quando a segunda aba apareceu: duplicá-lo nas duas
 * saídas garantiria que um dia as duas divergissem — e a que divergisse seria a
 * menos usada, que é a que ninguém olha.
 */
function Topo({ aba, nome }: { aba: 'hoje' | 'operacao'; nome: string }) {
  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{saudacao()}, {primeiroNome(nome)}</p>
          <h1 className={estilo.titulo}>
            {aba === 'operacao' ? 'Como a operação está indo' : 'Onde a esteira está agora'}
          </h1>
        </div>
        <Link href="/painel/ordens/nova" className={estilo.btnOS}>
          Abrir O.S.
        </Link>
      </div>

      <div className={estilo.rotaBarra}>
        <nav className={estilo.abas} aria-label="Visões do painel">
          <Link
            href="/painel"
            className={aba === 'hoje' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={aba === 'hoje' ? 'page' : undefined}
          >
            Hoje
          </Link>
          <Link
            href="/painel?ver=operacao"
            className={aba === 'operacao' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
            aria-current={aba === 'operacao' ? 'page' : undefined}
          >
            Operação
          </Link>
        </nav>
      </div>
    </>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

/**
 * O BANNER DO PROBLEMA DO DIA.
 *
 * =============================================================================
 * ÂMBAR, E NÃO VERMELHO
 * =============================================================================
 * Vermelho é para o que já quebrou e não tem volta. Isto aqui tem volta — é
 * justamente por isso que está na tela: alguém pode ligar para o cliente hoje.
 * Âmbar diz "exige ação", que é a mensagem certa; vermelho diria "é tarde", e
 * uma tela que grita todo dia é uma tela que ninguém escuta em duas semanas.
 *
 * OS CHIPS SÃO A PARTE QUE IMPORTA. "3 ordens atrasadas" não é acionável: para
 * fazer alguma coisa é preciso saber QUAIS, e isso custava três cliques. Cada
 * chip carrega o número da O.S., o cliente, o atraso e o valor, e leva direto
 * para a ordem. O título dá o tamanho do problema; os chips dão os nomes.
 *
 * No máximo quatro, e o resto vira "e mais N". Uma parede de vinte chips é a
 * mesma parede de coisas erradas que este bloco veio desfazer.
 */
function BannerDoDia({ alerta }: { alerta: AlertaDoDia }) {
  return (
    <section className={estilo.alertaDia} aria-labelledby="alerta-do-dia">
      <div className={estilo.alertaCorpo}>
        <Term nome="Atenção" estado={alerta.tipo === 'atraso' ? 'prazo' : alerta.tipo === 'aviso' ? 'whatsapp' : 'estoque'} tom="alerta" />
        <h2 id="alerta-do-dia" className={estilo.alertaTitulo}>
          {alerta.titulo}
        </h2>
        <p className={estilo.alertaFrase}>{alerta.consequencia}</p>

        {alerta.ofensores.length > 0 ? (
          <ul className={estilo.alertaChips}>
            {alerta.ofensores.map((o) => (
              <li key={o.id}>
                <Link href={`/painel/ordens/${o.id}`} className={estilo.alertaChip}>
                  <span className={estilo.alertaChipOs}>OS-{String(o.numero).padStart(4, '0')}</span>
                  <span className={estilo.alertaChipQuem}>{o.cliente}</span>
                  <span className={estilo.alertaChipDias}>
                    {o.dias <= 0 ? 'vence hoje' : `${o.dias}d`}
                  </span>
                  {o.valorCentavos != null && o.valorCentavos > 0 ? (
                    <span className={estilo.alertaChipValor}>{formatarBRL(o.valorCentavos)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
            {alerta.total > alerta.ofensores.length ? (
              <li>
                <span className={estilo.alertaChipResto}>
                  e mais {alerta.total - alerta.ofensores.length}
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <Link href={alerta.href} className={estilo.alertaSaida}>
        Ver todas
      </Link>
    </section>
  )
}

/**
 * O HERÓI DE QUEM VÊ DINHEIRO — a receita do mês.
 *
 * =============================================================================
 * O NÚMERO GRANDE É O FATURADO, E A BARRA É O QUE DE FATO ENTROU
 * =============================================================================
 * Faturar e receber são coisas diferentes, e a distância entre as duas é o
 * buraco do caixa: faturar trinta mil e receber dezoito significa doze mil na
 * rua. Um cartão que mostrasse só um dos dois mentiria por omissão — o
 * faturado sozinho parece bom, o recebido sozinho parece ruim.
 *
 * Então o herói é o faturado, e logo abaixo dele a TAXA DE RECEBIMENTO diz que
 * fração daquilo virou dinheiro na conta. É uma barra e um percentual porque
 * a pergunta é de proporção, e proporção se lê melhor em forma que em número.
 *
 * O delta compara com o mês anterior FECHADO, e o tom vem daqui e não do sinal:
 * receita subindo é boa notícia, e por isso `bom`. Não é sempre assim neste
 * sistema — "ordens atrasadas" subindo também é positivo no sinal e péssimo na
 * vida —, e é por isso que o `Delta` exige que quem chama diga o tom.
 */
function HeroiDeReceita({ meses, aReceber }: { meses: MesDeDinheiro[]; aReceber: number }) {
  const atual = meses.at(-1)
  const anterior = meses.at(-2)
  const faturado = atual?.faturadoCentavos ?? 0
  const recebido = atual?.recebidoCentavos ?? 0
  const antes = anterior?.faturadoCentavos ?? 0

  // Sem mês anterior com movimento não há variação a mostrar. Inventar "+100%"
  // contra um mês vazio é o tipo de número que ninguém consegue desmentir e
  // todo mundo repete numa reunião.
  const variacao = antes > 0 ? Math.round(((faturado - antes) / antes) * 100) : null
  const taxa = faturado > 0 ? Math.round((recebido / faturado) * 100) : 0

  return (
    <section className={estilo.heroi} aria-label="Receita do mês">
      <div className={estilo.heroiEsq}>
        <Term nome="Receita" estado="mês corrente" />
        <BigNumber valor={formatarBRL(faturado)} rotulo="Faturado no mês" />
        <p className={estilo.heroiNota}>
          {formatarBRL(recebido)} já recebidos · {formatarBRL(aReceber)} a receber
        </p>

        <div className={estilo.heroiTaxa}>
          <div className={estilo.heroiTaxaCab}>
            <span>Taxa de recebimento</span>
            <strong>{taxa}%</strong>
          </div>
          <div className={estilo.heroiTaxaTrilho}>
            <i style={{ '--parte': `${Math.min(taxa, 100)}%` } as CSSProperties} />
          </div>
        </div>
      </div>

      <div className={estilo.heroiDir}>
        {variacao !== null ? <Delta valor={variacao} tom={variacao >= 0 ? 'bom' : 'ruim'} /> : null}
        <Faisca meses={meses} />
        <Exec href="/painel/financeiro">Financeiro</Exec>
      </div>
    </section>
  )
}

/**
 * O HERÓI DE QUEM NÃO VÊ DINHEIRO — os equipamentos em aberto.
 *
 * O motorista e o técnico abrem esta tela para saber quanto trabalho existe, e
 * não quanto ele vale. O número é o mesmo que o gestor lê no indicador; aqui
 * ele é o herói porque é a resposta principal DESTA pessoa.
 */
function HeroiDeOrdens({ abertas, atrasadas }: { abertas: number; atrasadas: number }) {
  return (
    <section className={estilo.heroi} aria-label="Ordens em aberto">
      <div className={estilo.heroiEsq}>
        <Term nome="Ordens" estado="em aberto" />
        <BigNumber valor={String(abertas)} rotulo="Ordens em aberto" />
        <p className={estilo.heroiNota}>
          {atrasadas > 0
            ? `${atrasadas} ${atrasadas === 1 ? 'passou' : 'passaram'} do prazo prometido`
            : 'nenhuma passou do prazo'}
        </p>
      </div>
      {/* SEM PÍLULA DE DELTA AQUI, e a ausência é deliberada.
          A primeira versão punha `<Delta valor={atrasadas} />` e saía "↗ +3".
          Delta significa VARIAÇÃO — "subiu três desde o mês passado" —, e o que
          este número diz é "são três, no total". A pílula estava afirmando uma
          comparação que ninguém fez. A linha logo abaixo do número já conta a
          mesma coisa em português, e o banner lá em cima nomeia as três. */}
      <div className={estilo.heroiDir}>
        <Exec href="/painel/ordens">Todas as O.S.</Exec>
      </div>
    </section>
  )
}

/**
 * A FAÍSCA — doze meses de faturamento em 132 pixels.
 *
 * Ela não tem eixo, número nem grade, e isso é a definição: faísca responde
 * "está subindo ou descendo", e nada mais. Quem precisa do valor de abril abre
 * o Financeiro — e o botão para lá está a dois centímetros daqui.
 *
 * O último ponto ganha um círculo porque é o mês corrente, o único ainda em
 * movimento. Sem ele, a linha termina no ar e não se sabe onde é "agora".
 */
function Faisca({ meses }: { meses: MesDeDinheiro[] }) {
  const valores = meses.map((m) => m.faturadoCentavos)
  if (valores.length < 2 || valores.every((v) => v === 0)) return null

  const L = 132
  const A = 34
  const teto = Math.max(...valores)
  const passo = L / (valores.length - 1)
  const y = (v: number) => A - 2 - (teto > 0 ? (v / teto) * (A - 4) : 0)
  const pontos = valores.map((v, i) => `${(i * passo).toFixed(1)},${y(v).toFixed(1)}`)

  return (
    <svg
      className={estilo.faisca}
      viewBox={`0 0 ${L} ${A}`}
      width={L}
      height={A}
      role="img"
      aria-label={`Faturamento dos últimos ${valores.length} meses`}
    >
      <polyline className={estilo.faiscaLinha} points={pontos.join(' ')} />
      <circle
        className={estilo.faiscaPonta}
        cx={(valores.length - 1) * passo}
        cy={y(valores.at(-1) ?? 0)}
        r="2.5"
      />
    </svg>
  )
}

/**
 * A linha de meta do degrau — `4 travadas · máx. 11d · R$ 18,4 mil`.
 *
 * =============================================================================
 * A ORDEM É A DA URGÊNCIA, E ELA CORTA EM VEZ DE EMPILHAR
 * =============================================================================
 * Cabem três informações numa caixa de um oitavo de tela, e nem sempre as três
 * merecem estar lá. A regra é: o que exige ação vem primeiro, e o que não muda
 * decisão nenhuma nem entra.
 *
 *   · TRAVADAS abre a linha quando existe. "4 travadas" é a única das três que
 *     diz "vá ali agora"; pôr a idade na frente dela seria enterrar o pedido de
 *     socorro embaixo de uma estatística. É "travadas" e não "4 há mais de 5
 *     dias" porque a caixa tem um oitavo de tela: a frase inteira quebrava em
 *     três linhas e empurrava a barra de todos os outros degraus para baixo,
 *     acabando com a régua. O critério dos cinco dias está no tipo `Degrau`, e
 *     o "máx. 9d" logo ao lado já diz a ordem de grandeza.
 *   · A IDADE só aparece a partir de um dia. "máx. 0d" ocupa espaço para
 *     dizer que está tudo em dia, e para isso já serve o silêncio.
 *   · O DINHEIRO fecha, e some inteiro para quem não pode vê-lo — não porque
 *     esta função esconde, mas porque o campo chega `null` do servidor.
 *
 * Degrau vazio devolve travessão. Ele não é falta de dado: é a resposta, e é
 * uma boa notícia.
 */
function metaDoDegrau(d: Degrau): string {
  if (d.total === 0) return '—'
  const partes: string[] = []
  if (d.travadas > 0) partes.push(`${d.travadas} travadas`)
  if (d.diasDaMaisAntiga != null && d.diasDaMaisAntiga >= 1) partes.push(`máx. ${d.diasDaMaisAntiga}d`)
  if (d.valorEmAberto != null && d.valorEmAberto > 0) partes.push(formatarBRLCurto(d.valorEmAberto))
  return partes.length > 0 ? partes.join(' · ') : 'em dia'
}

function saudacao(): string {
  const h = Number(
    new Date().toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }),
  )
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const primeiroNome = (n: string) => n.split(' ')[0] ?? n

/** "há 2h", "há 3d" — o que importa num contato é quanto tempo ele espera. */
function haQuanto(d: Date): string {
  const min = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
