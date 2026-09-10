import Link from 'next/link'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { ESTEIRA, estadoDaEtapa } from '@/lib/esteira'
import { Bloco, Chip, ChipAutomacao } from './pecas'
import estilo from './pecas.module.css'

/**
 * O PAINEL RICO DA O.S. — `<EntityDrawer>` e as peças dele.
 *
 * =============================================================================
 * ZERO ABAS INTERNAS. É REGRA, E ELA TEM MOTIVO
 * =============================================================================
 * A ficha antiga repartia a O.S. em abas: dados, linha do tempo, fotos,
 * orçamento, financeiro, documentos. Cada aba parecia organização e era
 * esconderijo — quem abre uma O.S. quer saber "em que pé está isso", e a
 * resposta estava espalhada por cinco abas que ninguém abria todas.
 *
 * Aqui tudo desce numa coluna só. É mais rolagem e menos decisão, e essa troca
 * é sempre boa numa tela de consulta: rolar é reflexo, decidir custa.
 *
 * =============================================================================
 * POR QUE É UMA PÁGINA, E NÃO UM MODAL
 * =============================================================================
 * A direção pede "modal/drawer único", e a intenção — tudo à vista, sem abas —
 * está cumprida. O que mudou foi a moldura: um endereço de verdade.
 *
 * Uma O.S. é a coisa que mais se manda para outra pessoa neste negócio: para o
 * técnico que vai continuar, para o gestor que precisa aprovar, para o dono no
 * WhatsApp. Modal não tem endereço — não se cola, não se guarda nos favoritos,
 * não sobrevive a um recarregamento, e o "voltar" do navegador fecha a tela
 * inteira em vez do modal. O ganho de contexto de um modal é menor que isso.
 */

// ===========================================================================
// <Timeline> — as bolinhas de status
// ===========================================================================

export type MarcoDaOrdem = {
  etapa: EtapaOrdem
  titulo: string
  quando: Date
  autor: string
}

const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

function quandoTexto(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * A LINHA DO TEMPO, E O CARIMBO DE CADA FUSÃO.
 *
 * =============================================================================
 * ESTE BLOCO É A PROVA DE QUE A FUSÃO NÃO CUSTOU AUDITORIA
 * =============================================================================
 * A esteira mostra 13 degraus porque é assim que as pessoas pensam o trabalho.
 * O banco guarda 18 etapas porque é assim que a prova precisa existir.
 *
 * Quando um degrau da esteira reúne mais de uma etapa — "Em análise" reúne o
 * laudo e a revisão do orçamento; "Liberado para faturar" reúne a conferência e
 * a liberação —, esta lista mostra os DOIS carimbos, um sob o outro, cada um
 * com seu horário e seu autor. Um clique lá atrás, dois registros aqui.
 *
 * É o que a folha de rastreabilidade promete ao cliente, ao fabricante e à
 * vigilância sanitária: quantas provas existem e de que dia são. Se algum dia
 * alguém quiser conferir se a fusão engoliu um passo, é aqui que se olha.
 */
export function Timeline({
  etapaAtual,
  marcos,
}: {
  etapaAtual: EtapaOrdem
  marcos: MarcoDaOrdem[]
}) {
  const atual = estadoDaEtapa(etapaAtual)
  const passoAtual = atual.passo ?? 99

  // Só o caminho feliz vira degrau. O desvio (recusado, devolvido, cancelado)
  // aparece como um degrau extra no fim, e só quando a ordem realmente foi por
  // ele — desenhar as três saídas laterais sempre transformaria a linha do
  // tempo num mapa de tudo que pode dar errado.
  const degraus = ESTEIRA.filter((e) => !e.desvio)
  const desvio = atual.desvio ? atual : null

  return (
    <div className={estilo.trilha}>
      {degraus.map((degrau) => {
        const feitos = marcos.filter((m) => degrau.etapas.includes(m.etapa))
        const passou = (degrau.passo ?? 0) < passoAtual || feitos.length > 0
        const agora = degrau.chave === atual.chave

        return (
          <div
            key={degrau.chave}
            className={agora || passou ? estilo.marco : `${estilo.marco} ${estilo.marcoFuturo}`}
          >
            <span
              className={
                agora ? estilo.bolinhaAgora : passou ? estilo.bolinhaFeita : estilo.bolinha
              }
              aria-hidden="true"
            >
              {agora ? <i /> : passou ? <Visto /> : null}
            </span>

            <div className={estilo.marcoTxt}>
              <span className={estilo.marcoTitulo}>{degrau.rotulo}</span>

              {/* Um carimbo por etapa REAL. Dois aqui querem dizer que este
                  degrau foi um clique só e dois registros. */}
              {feitos.map((m) => (
                <span key={`${m.etapa}-${m.quando.toISOString()}`} className={estilo.marcoQuando}>
                  {quandoTexto(m.quando)} · {m.titulo} · {m.autor}
                </span>
              ))}

              {feitos.length === 0 && agora ? (
                <span className={estilo.marcoQuando}>{degrau.resumo}</span>
              ) : null}
            </div>
          </div>
        )
      })}

      {desvio ? (
        <div className={estilo.marco}>
          <span className={estilo.bolinhaAgora} aria-hidden="true">
            <i />
          </span>
          <div className={estilo.marcoTxt}>
            <span className={estilo.marcoTitulo}>{desvio.rotulo}</span>
            {marcos
              .filter((m) => desvio.etapas.includes(m.etapa))
              .map((m) => (
                <span key={m.etapa} className={estilo.marcoQuando}>
                  {quandoTexto(m.quando)} · {m.titulo} · {m.autor}
                </span>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ===========================================================================
// <FinanceBlock>
// ===========================================================================

export type Dinheiro = {
  combinadoCentavos: number | null
  condicao: string | null
  orcamentoCentavos: number | null
  faturaCentavos: number | null
  pagoCentavos: number | null
  statusFatura: string | null
}

/**
 * O dinheiro da O.S., ou a ausência dele.
 *
 * `null` neste bloco inteiro significa "esta pessoa não vê dinheiro", e a
 * consulta nem chegou a trazer os valores. É a mesma regra do painel: filtrar
 * na renderização mandaria o valor pelo fio até o navegador de quem não deve
 * vê-lo.
 *
 * Dentro dele, `null` em um campo é diferente de zero. "Nada combinado" e
 * "combinamos que não se cobra" são respostas diferentes, e a diferença aparece
 * no dia em que o cliente ligar cobrando o que foi dito no telefone.
 */
export function FinanceBlock({ dinheiro }: { dinheiro: Dinheiro | null }) {
  if (!dinheiro) {
    return (
      <Bloco titulo="Dinheiro">
        <p className={estilo.vivoVago}>Seu perfil não trabalha com os valores desta O.S.</p>
      </Bloco>
    )
  }

  const falta =
    dinheiro.faturaCentavos !== null && dinheiro.pagoCentavos !== null
      ? dinheiro.faturaCentavos - dinheiro.pagoCentavos
      : null

  return (
    <Bloco titulo="Dinheiro">
      <div className={estilo.dinheiro}>
        <p className={estilo.dinheiroLinha}>
          <span>Combinado no telefone</span>
          <strong>
            {dinheiro.combinadoCentavos === null ? '—' : formatarBRL(dinheiro.combinadoCentavos)}
          </strong>
        </p>
        {dinheiro.condicao ? <p className={estilo.campoDica}>{dinheiro.condicao}</p> : null}

        <p className={estilo.dinheiroLinha}>
          <span>Orçamento técnico</span>
          <strong>
            {dinheiro.orcamentoCentavos === null ? '—' : formatarBRL(dinheiro.orcamentoCentavos)}
          </strong>
        </p>

        {dinheiro.faturaCentavos !== null ? (
          <>
            <p className={estilo.dinheiroLinha}>
              <span>Já pago</span>
              <strong>{formatarBRL(dinheiro.pagoCentavos ?? 0)}</strong>
            </p>
            <p className={`${estilo.dinheiroLinha} ${estilo.dinheiroTotal}`}>
              <span>{falta && falta > 0 ? 'Falta receber' : 'Fatura'}</span>
              <strong>{formatarBRL(falta && falta > 0 ? falta : dinheiro.faturaCentavos)}</strong>
            </p>
          </>
        ) : (
          <p className={estilo.campoDica}>Ainda não há fatura para esta O.S.</p>
        )}
      </div>
    </Bloco>
  )
}

// ===========================================================================
// <PhotosSignatures> — as provas
// ===========================================================================

export type Prova = {
  id: string
  tipo: 'foto' | 'assinatura'
  legenda: string
  quando: Date
}

/**
 * As provas da O.S. — fotos e assinaturas.
 *
 * =============================================================================
 * O QUE NUNCA PODE APARECER AQUI
 * =============================================================================
 * Imagem gerada. Nem uma. Numa ordem de serviço estas imagens não ilustram —
 * elas SÃO a prova de que o aparelho chegou daquele jeito e de que o cliente
 * assinou. A folha de rastreabilidade conta ao cliente, ao fabricante e à
 * vigilância sanitária quantas provas existem e de que dia são.
 *
 * Elas chegam por rota autenticada, que confere a empresa antes de servir o
 * arquivo: o caminho no storage nunca vira URL pública.
 */
export function PhotosSignatures({ provas }: { provas: Prova[] }) {
  if (provas.length === 0) {
    return (
      <Bloco titulo="Provas">
        <p className={estilo.campoDica}>
          Nenhuma foto ou assinatura ainda. Elas entram na captura de cada etapa.
        </p>
      </Bloco>
    )
  }

  return (
    <Bloco titulo={`Provas · ${provas.length}`}>
      <div className={estilo.provas}>
        {provas.map((p) => (
          <a
            key={`${p.tipo}-${p.id}`}
            className={estilo.prova}
            href={p.tipo === 'foto' ? `/api/foto/${p.id}` : `/api/assinatura/${p.id}`}
            target="_blank"
            rel="noreferrer"
            title={`${p.legenda} · ${quandoTexto(p.quando)}`}
          >
            {/* Sem `next/image`: o arquivo vem de rota autenticada e não pode
                ser otimizado por um proxy que não carrega o cookie da sessão. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.tipo === 'foto' ? `/api/foto/${p.id}` : `/api/assinatura/${p.id}`}
              alt={p.legenda}
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </Bloco>
  )
}

// ===========================================================================
// <ContactActions>
// ===========================================================================

/**
 * Falar com o cliente, sem sair da tela.
 *
 * O WhatsApp vem primeiro porque é por ele que este negócio conversa. O número
 * é limpo aqui e não no banco: o banco guarda o que a pessoa digitou.
 */
export function ContactActions({
  whatsapp,
  telefone,
  clienteId,
}: {
  whatsapp: string | null
  telefone: string | null
  clienteId: string
}) {
  const zap = whatsapp?.replace(/\D/g, '')
  return (
    <div className={estilo.contatos}>
      {zap ? (
        <a
          className={estilo.acaoLinha}
          href={`https://wa.me/55${zap}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      ) : null}
      {telefone ? (
        <a className={estilo.acaoLinha} href={`tel:${telefone.replace(/\D/g, '')}`}>
          Ligar
        </a>
      ) : null}
      <Link className={estilo.acaoLinha} href={`/sistema/clientes/${clienteId}`}>
        Ficha do cliente
      </Link>
    </div>
  )
}

// ===========================================================================
// <HealthScore> — o único teal da tela
// ===========================================================================

export type Saude = {
  /** 0 a 100. Quanto maior, mais tranquila é a relação com este cliente. */
  nota: number
  resumo: string
  detalhe: string
}

/**
 * A saúde do cliente.
 *
 * =============================================================================
 * POR QUE ELA É TEAL, E POR QUE SÓ ELA
 * =============================================================================
 * O teal é reservado no sistema inteiro a três coisas: este score, os insights
 * e os selos de automação. É a cor de "quem falou aqui foi o sistema".
 *
 * A reserva é o que dá sentido a ela. Se o teal aparecesse em botão comum, este
 * bloco seria só mais um cartão colorido; sendo raro, ele diz — antes da
 * leitura — que aquele número não foi digitado por ninguém, foi calculado.
 *
 * O número é uma OPINIÃO do sistema, e por isso vem sempre com a conta ao lado.
 * Score sem explicação é superstição: ninguém deveria negar um parcelamento
 * porque uma bolinha ficou laranja.
 */
export function HealthScore({ saude }: { saude: Saude }) {
  return (
    <Bloco titulo="Saúde do cliente">
      <div className={estilo.saude}>
        <span className={estilo.saudeAro} aria-hidden="true">
          {saude.nota}
        </span>
        <div className={estilo.saudeTxt}>
          <strong>{saude.resumo}</strong>
          <span>{saude.detalhe}</span>
        </div>
      </div>
      <ChipAutomacao>Calculado pelo sistema</ChipAutomacao>
    </Bloco>
  )
}

// ===========================================================================
// Cabeçalho da O.S.
// ===========================================================================

export function CabecalhoOS({
  numero,
  equipamento,
  serie,
  cliente,
  etapa,
  urgente,
  atrasada,
}: {
  numero: number
  equipamento: string
  serie: string | null
  cliente: string
  etapa: EtapaOrdem
  urgente: boolean
  atrasada: boolean
}) {
  const estado = estadoDaEtapa(etapa)
  return (
    <div className={estilo.cabecalhoTxt}>
      <p className="mono">O.S. {String(numero).padStart(5, '0')}</p>
      <h1>{equipamento}</h1>
      <div className={estilo.linhaTopo}>
        <Chip tom={estado.tom}>{estado.rotulo}</Chip>
        {urgente ? <Chip tom="danger">Prioridade alta</Chip> : null}
        {atrasada ? <Chip tom="danger">Prazo vencido</Chip> : null}
      </div>
      <p>
        {cliente}
        {serie ? ` · série ${serie}` : ''}
      </p>
    </div>
  )
}
