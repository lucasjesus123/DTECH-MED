import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { agoraNoServidor } from '@/lib/datas'
import { acaoDaVez, estadoDaEtapa } from '@/lib/esteira'
import { podeVer } from '@/server/auth/guarda'
import { enderecoDaColeta, juntarEndereco } from '@/lib/endereco'
import { prontuario } from '@/server/consultas/painel'
import { motoristasDaEmpresa } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import AoVivo from '@/components/sistema/ao-vivo'
import BotaoDaVez from '@/components/sistema/botao-da-vez'
import CaptureFlow from '@/components/sistema/captura'
import {
  FluxoAgendar,
  FluxoLaudo,
  FluxoOrcamento,
  FluxoPagamento,
  FluxoPecas,
} from '@/components/sistema/fluxos'
import {
  CabecalhoOS,
  ContactActions,
  FinanceBlock,
  HealthScore,
  PhotosSignatures,
  Timeline,
  type Dinheiro,
  type MarcoDaOrdem,
  type Prova,
} from '@/components/sistema/painel-os'
import { Bloco } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * A O.S. — tudo numa folha, sem uma única aba.
 *
 * =============================================================================
 * DUAS TELAS NUM ENDEREÇO SÓ
 * =============================================================================
 * Sem `?fluxo=`, esta página é o PAINEL RICO: linha do tempo, dinheiro, provas,
 * contatos, saúde do cliente, e o botão-da-vez no topo.
 *
 * Com `?fluxo=`, ela é a FOLHA daquele passo — a captura guiada, o laudo, o
 * orçamento, o agendamento, o pagamento. É para onde o botão-da-vez leva quando
 * o passo precisa de prova ou de dado.
 *
 * Ser o mesmo endereço não é economia de arquivo: é o que faz o fluxo ter um
 * link. Dá para mandar "termina a captura dessa aqui" no WhatsApp do colega, e
 * ele abre exatamente na folha certa.
 *
 * =============================================================================
 * O FLUXO É CONFERIDO CONTRA A ETAPA, E NÃO ACEITO DE QUEM DIGITOU
 * =============================================================================
 * `?fluxo=` vem da URL, e URL é pedido, nunca permissão. A folha só abre se ela
 * for o fluxo que a etapa ATUAL pede E se o papel alcançar o salto — as duas
 * respostas saem de `acaoDaVez`, a mesma função que desenha o botão. Quem
 * digitar `?fluxo=pagamento` numa O.S. que está na bancada recebe o painel.
 */

export default async function FichaDaOS({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fluxo?: string }>
}) {
  const { ctx, sessao } = await exigirTela('ordens')
  const { id } = await params
  const { fluxo } = await searchParams

  const o = await prontuario(ctx, id)
  if (!o) notFound()

  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)
  // O "agora" é pedido UMA vez, no servidor. Perguntar as horas três vezes no
  // meio do desenho abriria a chance de a linha do tempo e o chip de atraso
  // discordarem sobre que dia é hoje.
  const agora = agoraNoServidor().getTime()
  const estado = estadoDaEtapa(o.etapa)
  const acao = acaoDaVez(o.etapa, sessao.papel)

  const equipamento = `${o.equipamento.marca} ${o.equipamento.modelo}`.trim()

  // ---------------------------------------------------------------------------
  // A FOLHA DO FLUXO
  // ---------------------------------------------------------------------------
  // Só abre o fluxo que a etapa atual pede. Um `?fluxo=` de outra etapa é
  // ignorado em silêncio, e a pessoa cai no painel — que é a resposta honesta:
  // ela pediu uma folha que não existe para esta O.S. agora.
  if (fluxo && acao && acao.fluxo === fluxo) {
    const motoristas = await motoristasDaEmpresa(ctx)
    const orcamentoAtual = o.orcamentos[0] ?? null

    const folha = (() => {
      switch (acao.fluxo) {
        case 'captura-coleta':
          return (
            <CaptureFlow
              ordemId={o.id}
              modo="coleta"
              minimoFotos={1}
              passos={acao.passos}
              titulo="Cheguei para a coleta"
            />
          )
        case 'captura-entrega':
          return (
            <CaptureFlow
              ordemId={o.id}
              modo="entrega"
              minimoFotos={1}
              passos={acao.passos}
              titulo="Cheguei para a entrega"
            />
          )
        case 'captura-bancada':
          return (
            <CaptureFlow
              ordemId={o.id}
              modo="bancada"
              /* Seis não é escolha desta tela: é o que o motor exige
                 (`MIN_6_FOTOS`) para o aparelho entrar na oficina. */
              minimoFotos={6}
              passos={acao.passos}
              titulo="Receber na bancada"
            />
          )
        case 'agendar-coleta':
          return (
            <FluxoAgendar
              ordemId={o.id}
              tipo="RETIRADA"
              passos={acao.passos}
              enderecoPadrao={enderecoDaColeta(o.cliente)}
              contatoPadrao={o.cliente.contatoNome}
              telefonePadrao={o.cliente.whatsapp ?? o.cliente.telefone}
              motoristas={motoristas.map((m) => ({ id: m.id, nome: m.nome }))}
              dataPadrao={amanhaISO(agora)}
            />
          )
        case 'agendar-entrega':
          return (
            <FluxoAgendar
              ordemId={o.id}
              tipo="ENTREGA"
              passos={acao.passos}
              /* A ENTREGA VOLTA PARA O ENDEREÇO DO CLIENTE, e não para o de
                 coleta. São campos diferentes no cadastro justamente porque
                 muita clínica manda buscar num lugar e recebe em outro. */
              enderecoPadrao={juntarEndereco(o.cliente)}
              contatoPadrao={o.cliente.contatoNome}
              telefonePadrao={o.cliente.whatsapp ?? o.cliente.telefone}
              motoristas={motoristas.map((m) => ({ id: m.id, nome: m.nome }))}
              dataPadrao={amanhaISO(agora)}
            />
          )
        case 'laudo':
          return (
            <FluxoLaudo
              ordemId={o.id}
              passos={acao.passos}
              rotulo={acao.rotulo}
              diagnosticoAtual={o.diagnostico}
              parecerAtual={o.parecerTecnico}
              temOrcamento={(orcamentoAtual?.itens.length ?? 0) > 0}
            />
          )
        case 'orcamento':
          return (
            <FluxoOrcamento
              ordemId={o.id}
              passos={acao.passos}
              laudo={o.diagnostico}
              agoraMs={agora}
              itensIniciais={(orcamentoAtual?.itens ?? []).map((i) => ({
                tipo: i.tipo as 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA',
                descricao: i.descricao,
                quantidade: Number(i.quantidade),
                valorUnit: i.valorUnitCentavos / 100,
              }))}
            />
          )
        case 'pecas':
          return (
            <FluxoPecas
              ordemId={o.id}
              passos={acao.passos}
              // Ou existe movimento de saída amarrado a esta ordem, ou alguém
              // declarou expressamente que não usou peça. Não há terceira
              // resposta — é essa a diferença que fazia o estoque derivar.
              jaDeclarou={o.movimentos.length > 0 || o.semPecaDeclaradoEm !== null}
              servicoAtual={o.servicoExecutado}
            />
          )
        case 'pagamento':
          return (
            <FluxoPagamento
              ordemId={o.id}
              faturaId={o.fatura?.id ?? null}
              abertoCentavos={
                o.fatura ? o.fatura.valorTotalCentavos - o.fatura.valorPagoCentavos : 0
              }
            />
          )
        default:
          return null
      }
    })()

    if (folha) {
      return (
        <>
          <p className="mono">
            <Link href={`/sistema/ordens/${o.id}`}>← Voltar para a O.S. {String(o.numero).padStart(5, '0')}</Link>
          </p>
          {folha}
        </>
      )
    }
  }

  // ---------------------------------------------------------------------------
  // O PAINEL RICO
  // ---------------------------------------------------------------------------

  /**
   * OS CARIMBOS DA LINHA DO TEMPO.
   *
   * Um por evento REAL do banco — inclusive os dois que um clique fundido
   * gerou. É aqui que se confere que a esteira enxuta não custou auditoria.
   */
  const marcos: MarcoDaOrdem[] = [...o.eventos]
    .sort((a, b) => a.sequencia - b.sequencia)
    .map((e) => ({
      etapa: e.etapaNova,
      titulo: e.titulo,
      quando: e.criadoEm,
      autor: e.autorNome,
    }))

  const provas: Prova[] = [
    ...o.fotos.map((f) => ({
      id: f.id,
      tipo: 'foto' as const,
      legenda: f.legenda ?? f.categoria,
      quando: f.criadoEm,
    })),
    ...o.assinaturas.map((a) => ({
      id: a.id,
      tipo: 'assinatura' as const,
      legenda: `Assinatura · ${a.assinanteNome}`,
      quando: a.criadoEm,
    })),
  ]

  const orcamento = o.orcamentos[0] ?? null

  const dinheiro: Dinheiro | null = comDinheiro
    ? {
        combinadoCentavos: o.valorPrevioCentavos,
        condicao: o.condicaoCombinada,
        orcamentoCentavos: orcamento?.totalCentavos ?? null,
        faturaCentavos: o.fatura?.valorTotalCentavos ?? null,
        pagoCentavos: o.fatura?.valorPagoCentavos ?? null,
        statusFatura: o.fatura?.status ?? null,
      }
    : null

  const saude = calcularSaude({
    ordensDoCliente: null,
    faturaEmAberto: comDinheiro && o.fatura ? o.fatura.valorTotalCentavos - o.fatura.valorPagoCentavos : 0,
    diasParado: Math.floor((agora - o.atualizadoEm.getTime()) / 86_400_000),
    atrasada: o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false,
  })

  return (
    <>
      <div className={estilo.cabecalho}>
        <CabecalhoOS
          numero={o.numero}
          equipamento={equipamento}
          serie={o.equipamento.numeroSerie}
          cliente={o.cliente.nome}
          etapa={o.etapa}
          urgente={o.prioridade === 'ALTA'}
          atrasada={o.prazoPrometido ? o.prazoPrometido.getTime() < agora : false}
        />
        <div className={estilo.cabecalhoAcao}>
          {/* A FICHA ACOMPANHA A RUA — mas só quando ninguém está preenchendo.
              Quem abre uma folha de captura ou de orçamento está DIGITANDO;
              refazer o componente de servidor por baixo de um formulário meio
              preenchido é o tipo de esperteza que faz a pessoa perder o que
              escreveu e desconfiar da tela para sempre. Sem folha aberta, a
              ficha é leitura, e leitura pode se atualizar sozinha. */}
          {!fluxo ? <AoVivo rotulo="acompanhando" /> : null}
          {acao ? (
            <BotaoDaVez ordemId={o.id} acao={acao} />
          ) : (
            <p className={estilo.campoDica}>
              Agora a bola está com {estado.quemAge.toLowerCase()}.
            </p>
          )}
        </div>
      </div>

      <div className={estilo.split}>
        <div className={estilo.blocos}>
          <Bloco titulo="O que o cliente relatou">
            <p>{o.defeitoRelatado}</p>
          </Bloco>

          {o.diagnostico ? (
            <Bloco titulo="Laudo técnico">
              <p>{o.diagnostico}</p>
              {o.parecerTecnico ? (
                <p className={estilo.campoDica}>Parecer: {o.parecerTecnico}</p>
              ) : null}
            </Bloco>
          ) : null}

          {o.servicoExecutado ? (
            <Bloco titulo="O que foi executado">
              <p>{o.servicoExecutado}</p>
            </Bloco>
          ) : null}

          <Bloco titulo="Linha do tempo">
            <Timeline etapaAtual={o.etapa} marcos={marcos} />
          </Bloco>

          <PhotosSignatures provas={provas} />

          {o.documentos.length > 0 ? (
            <Bloco titulo={`Documentos · ${o.documentos.length}`}>
              <div className={estilo.contatos}>
                {o.documentos.map((d) => (
                  <a
                    key={d.id}
                    className={estilo.acaoLinha}
                    href={`/api/documento/${d.tokenAcesso}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.tipo.replaceAll('_', ' ').toLowerCase()}
                  </a>
                ))}
              </div>
            </Bloco>
          ) : null}
        </div>

        <aside className={estilo.blocos}>
          <FinanceBlock dinheiro={dinheiro} />

          <Bloco titulo="Cliente">
            <p>
              <strong>{o.cliente.nome}</strong>
            </p>
            {juntarEndereco(o.cliente) ? (
              <p className={estilo.campoDica}>{juntarEndereco(o.cliente)}</p>
            ) : null}
            <ContactActions
              whatsapp={o.cliente.whatsapp}
              telefone={o.cliente.telefone}
              clienteId={o.cliente.id}
            />
          </Bloco>

          <HealthScore saude={saude} />

          <Bloco titulo="Quem está com ela">
            <p className={estilo.campoDica}>
              Técnico: {o.tecnico?.nome ?? 'ainda sem responsável'}
            </p>
            <p className={estilo.campoDica}>
              Aberta por: {o.atendente?.nome ?? 'origem automática'}
            </p>
            <p className={estilo.campoDica}>
              Acompanhamento do cliente:{' '}
              <a href={`/os/${o.tokenPublico}`} target="_blank" rel="noreferrer">
                portal público
              </a>
            </p>
          </Bloco>
        </aside>
      </div>
    </>
  )
}

/**
 * O dia seguinte, no formato que o `<input type="date">` espera.
 *
 * Recebe o "agora" em vez de perguntá-lo: assim a sugestão de data e todos os
 * outros cálculos de tempo desta página falam do mesmo instante.
 */
function amanhaISO(agoraMs: number): string {
  return new Date(agoraMs + 86_400_000).toISOString().slice(0, 10)
}

/**
 * A SAÚDE DESTA RELAÇÃO — a opinião do sistema, com a conta ao lado.
 *
 * =============================================================================
 * POR QUE ELA VEM SEMPRE EXPLICADA
 * =============================================================================
 * Um score é um número que ninguém digitou, e é exatamente por isso que ele é
 * perigoso: parece objetivo. Uma bolinha laranja sem explicação vira motivo
 * para negar um parcelamento a um cliente de dez anos.
 *
 * Então o cálculo é simples de propósito, e o detalhe diz o que pesou. Três
 * coisas: dívida em aberto, tempo parado e prazo estourado. Nada de histórico
 * secreto — se um dia o número surpreender, dá para conferir a conta.
 *
 * Quem não vê dinheiro tem a parcela financeira zerada na ENTRADA, não no
 * cálculo: o valor nem chega aqui.
 */
function calcularSaude(dados: {
  ordensDoCliente: number | null
  faturaEmAberto: number
  diasParado: number
  atrasada: boolean
}): { nota: number; resumo: string; detalhe: string } {
  let nota = 100
  const pesos: string[] = []

  if (dados.atrasada) {
    nota -= 30
    pesos.push('prazo prometido vencido')
  }
  if (dados.diasParado >= 10) {
    nota -= 25
    pesos.push(`${dados.diasParado} dias sem andar`)
  } else if (dados.diasParado >= 4) {
    nota -= 10
    pesos.push(`${dados.diasParado} dias sem andar`)
  }
  if (dados.faturaEmAberto > 0) {
    nota -= 15
    pesos.push('fatura em aberto')
  }

  nota = Math.max(nota, 0)

  const resumo = nota >= 80 ? 'Relação tranquila' : nota >= 50 ? 'Merece atenção' : 'Precisa de conversa'
  const detalhe = pesos.length === 0 ? 'Nada pesando contra: em dia e andando.' : `Pesou: ${pesos.join(', ')}.`

  return { nota, resumo, detalhe }
}
