import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL, formatarBRLCurto } from '@/lib/dinheiro'
import { exigirSessao, podeVer } from '@/server/auth/guarda'
import { esteira, filaDoDegrau, resumoDoDia, type Degrau } from '@/server/consultas/painel'
import {
  dinheiroMensal,
  movimentoMensal,
  ondeEstaParado,
  oQueMaisQuebra,
  prazoMensal,
  quemTrazTrabalho,
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
  const [degraus, resumo, fila, leads, contatosNovos] = await Promise.all([
    esteira(ctx, { comDinheiro }),
    resumoDoDia(ctx, { comDinheiro }),
    filaDoDegrau(ctx, degrau),
    // A tira traz três; a contagem diz quantos são de verdade. Sem ela, "3
    // pessoas chamaram" seria mentira num dia de trinta.
    leadsNovos(ctx),
    contatosNovosContagem(ctx),
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

      {/* Os números que mudam a decisão do dia. Nada de contar por contar.

          O CARTÃO DO DINHEIRO SÓ EXISTE PARA QUEM PODE VER DINHEIRO. Ele
          mostrava "A receber" para todo mundo, motorista incluído — a única
          tela do sistema em que essa trava faltava, e logo a primeira que
          qualquer pessoa abre. O valor não é escondido aqui: ele não é
          consultado. Sem ele são três cartões, e a grade acompanha. */}
      <div
        className={
          resumo.aReceber === null ? `${estilo.resumo} ${estilo.resumo3}` : estilo.resumo
        }
      >
        {resumo.aReceber === null ? null : (
          <Indicador
            rotulo="A receber"
            valor={formatarBRL(resumo.aReceber)}
            nota={`${formatarBRL(resumo.recebidoNoMes ?? 0)} recebidos no mês`}
          />
        )}
        <Indicador
          rotulo="Ordens abertas"
          valor={String(resumo.ordensAbertas)}
          nota={resumo.atrasadas > 0 ? `${resumo.atrasadas} com prazo vencido` : 'nenhuma atrasada'}
          alerta={resumo.atrasadas > 0}
        />
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
