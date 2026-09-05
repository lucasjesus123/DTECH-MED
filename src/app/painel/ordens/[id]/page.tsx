import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { formatarBRL } from '@/lib/dinheiro'
import { EtapaOrdem, Papel } from '@/generated/prisma/enums'
import { exigirSessao, podeVer } from '@/server/auth/guarda'
import { prontuario } from '@/server/consultas/painel'
import { listarPecas, motoristasDaEmpresa, tecnicosDaEmpresa } from '@/server/consultas/listas'
import { proximosPassos, ROTULO_ETAPA, TERMINAIS } from '@/server/ordem/maquina-estados'
import { verificarIntegridade } from '@/server/ordem/motor'
import { env } from '@/lib/env'
import BotoesEtapa from './botoes-etapa'
import Cancelar from './cancelar'
import Diagnostico from './diagnostico'
import Responsavel from './responsavel'
import Orcamento from './orcamento'
import PecasRetiradas from './pecas-retiradas'
import estilo from '../../painel.module.css'
import { diaLocal } from '@/lib/datas'
import { montarTrilha } from '@/server/ordem/trilha'
import { TrilhaDoEquipamento } from './trilha'
import { coberturaDe, frasedaCobertura } from '@/server/ordem/garantia'
import { pendenciaDe } from '@/server/estoque/pendencia'
import DocumentosDaOrdem from './documentos'

export const metadata: Metadata = { title: 'Prontuário da ordem', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * AS ETAPAS EM QUE JÁ HOUVE BANCADA.
 *
 * "O que foi executado" e "testes finais" são campos de QUEM JÁ EXECUTOU. No
 * momento do laudo o técnico acabou de abrir o aparelho: pedir ali que ele
 * descreva o serviço e os testes é pedir que invente, e é o que fazia a tela
 * parecer um formulário de quatro caixas para preencher item a item.
 *
 * A partir da manutenção eles aparecem, porque aí existe o que escrever.
 */
const DEPOIS_DA_BANCADA: EtapaOrdem[] = [
  EtapaOrdem.EM_MANUTENCAO,
  EtapaOrdem.MANUTENCAO_CONCLUIDA,
  EtapaOrdem.APROVACAO_GESTAO,
  EtapaOrdem.FATURAMENTO,
  EtapaOrdem.FATURADO,
  EtapaOrdem.EM_ROTA_ENTREGA,
  EtapaOrdem.ENTREGUE,
  EtapaOrdem.FINALIZADO,
]

/**
 * O prontuário do equipamento.
 *
 * É a tela que justifica o sistema inteiro. No ERP antigo, para responder
 * "o que está acontecendo com o aparelho da clínica tal", alguém precisava
 * abrir O.S., depois Financeiro, depois Produtos, depois procurar a foto no
 * WhatsApp de quem retirou. Aqui é uma página: a história do aparelho, quem
 * encostou nele, quanto custou, o que já saiu do estoque e o que o cliente viu.
 *
 * A linha do tempo mostra o hash de cada evento e verifica a corrente inteira
 * ao abrir. Se alguém tiver mexido no banco por fora, aparece aqui — e é isso
 * que faz o histórico ter valor de prova, e não só de anotação.
 */
/**
 * AS DUAS ABAS DESTA TELA, E POR QUE A SEGUNDA PRECISOU EXISTIR
 * ---------------------------------------------------------------------------
 * A emissão de contrato e de nota promissória era um bloco na COLUNA LATERAL,
 * abaixo de Assinaturas — um `<p>Documentos</p>` com dois botões debaixo, na
 * terceira dobra da direita. O dono do sistema foi procurar como emitir
 * contrato e não achou; a queixa foi "acrescentar a aba de emissão de
 * contrato".
 *
 * Ela está certa. Emitir documento não é informação sobre a ordem, é TRABALHO
 * sobre a ordem: a pessoa vem à tela para fazer isso, e coisa que se vem fazer
 * não mora numa coluna de leitura. Vira aba.
 *
 * `ver=documentos` na URL, e não estado de componente, por três motivos:
 * a página inteira é servidor (o bloco lê os documentos do banco); o endereço
 * fica compartilhável — dá para mandar "abre a aba de documentos desta O.S."; e
 * o botão de voltar do navegador faz o que a pessoa espera.
 *
 * A ABA PADRÃO É A FICHA, e nada dela mudou de lugar. Isso não é conservadorismo:
 * a jornada das 18 etapas percorre esta tela com 42 conferências, e mover para
 * trás de aba qualquer coisa que ela usa transformaria uma reorganização de
 * layout numa regressão da esteira.
 */
type Ver = 'ficha' | 'documentos'

export default async function Prontuario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ver?: string }>
}) {
  const { ctx, sessao } = await exigirSessao()
  const { id } = await params
  const { ver: verBruto } = await searchParams
  const ver: Ver = verBruto === 'documentos' ? 'documentos' : 'ficha'

  const o = await prontuario(ctx, id)
  // Ordem de outra franquia não devolve linha nenhuma pelo RLS. Para quem
  // tentar o id por sorte, a resposta é indistinguível de "não existe" — e é
  // exatamente essa indistinção que evita confirmar a existência do registro.
  if (!o) notFound()

  // Contrato e nota promissória obrigam o cliente — um em contrato, outro em
  // título. Assinar em nome da empresa não é trabalho de bancada nem de balcão,
  // e a mesma linha é desenhada na ação do servidor: a tela esconder não basta.
  const podeEmitir = podeVer(sessao.papel, Papel.FINANCEIRO)

  const [integridade, tecnicos, motoristas, pecas] = await Promise.all([
    verificarIntegridade(ctx, id),
    tecnicosDaEmpresa(ctx),
    motoristasDaEmpresa(ctx),
    listarPecas(ctx),
  ])

  const passos = proximosPassos(o.etapa, sessao.papel)

  /**
   * O cancelamento fica fora da tabela de transições — parte de quase qualquer
   * lugar — e por isso não aparece em `proximosPassos`. Quem decide de verdade
   * é a máquina de estados; aqui só se resolve se vale desenhar o bloco.
   */
  const podeCancelar =
    (sessao.papel === Papel.SUPER_ADMIN ||
      sessao.papel === Papel.ADMIN_EMPRESA ||
      sessao.papel === Papel.GESTOR) &&
    !TERMINAIS.includes(o.etapa)
  const linkPortal = `${env.APP_URL}/os/${o.tokenPublico}`

  const fotosPorCategoria = o.fotos.reduce<Record<string, typeof o.fotos>>((acc, f) => {
    ;(acc[f.categoria] ??= []).push(f)
    return acc
  }, {})

  /* A trilha lê a etapa atual e os eventos: onde a peça está, e quando ela
     passou por cada ponto. O cálculo mora em `@/server/ordem/trilha` porque a
     mesma régua aparece no portal do cliente. */
  /* A garantia do aparelho, ignorando a própria ordem: o que interessa é se
     ALGUM serviço anterior ainda cobre. */
  const cobertura = frasedaCobertura(
    await coberturaDe(ctx, o.equipamentoId, o.id),
  )

  const pendencia = await pendenciaDe(ctx, o.id)

  const trilha = montarTrilha(
    o.etapa,
    o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
  )

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>
            O.S. #{String(o.numero).padStart(4, '0')} · aberta em {dataCurta(o.abertaEm)}
          </p>
          <h1 className={estilo.titulo}>
            {o.equipamento.marca} {o.equipamento.modelo}
          </h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            {o.cliente.nome}
            {o.cliente.cidade ? ` · ${o.cliente.cidade}${o.cliente.uf ? `/${o.cliente.uf}` : ''}` : ''}
          </p>
        </div>
        <div className={estilo.selosCab}>
          <span className={estilo.tag}>
            {ROTULO_ETAPA[o.etapa]}
          </span>
          {/* A garantia aparece ANTES de qualquer preço. Quem abre a ficha para
              montar orçamento precisa ver que o aparelho voltou coberto — e não
              descobrir isso no fim, com o valor já digitado. */}
          {o.emGarantia ? (
            <span className={`${estilo.tag} ${estilo.tagEspera}`}>
              retorno em garantia
              {o.ordemOrigem ? ` · O.S. #${String(o.ordemOrigem.numero).padStart(4, '0')}` : ''}
            </span>
          ) : cobertura ? (
            <span className={`${estilo.tag} ${estilo.tagOk}`}>
              {cobertura}
            </span>
          ) : null}
          {o.prazoPrometido ? (
            <span
              className={estilo.fraco}
              style={o.prazoPrometido < new Date() ? { color: 'var(--alerta)' } : undefined}
            >
              prazo {dataCurta(o.prazoPrometido)}
            </span>
          ) : null}
        </div>
      </div>

      {/* --- A TRILHA, largura inteira, antes de tudo -------------------
          A primeira pergunta de quem abre uma ficha é sempre a mesma: onde
          está o aparelho. Ela vem antes das ações porque responder é mais
          rápido que decidir. */}
      <TrilhaDoEquipamento trilha={trilha} />

      {/* A barra de abas vem DEPOIS da trilha, e não antes. A trilha responde
          "onde está o aparelho", que é a primeira pergunta de quem abre a
          ficha — e ela vale para as duas abas. Pôr a barra acima dela faria
          escolher a aba antes de saber o que se está olhando. */}
      <nav className={estilo.abas} aria-label="Visões desta O.S.">
        <Link
          href={`/painel/ordens/${o.id}`}
          className={ver === 'ficha' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
          aria-current={ver === 'ficha' ? 'page' : undefined}
        >
          Ficha
        </Link>
        <Link
          href={`/painel/ordens/${o.id}?ver=documentos`}
          className={ver === 'documentos' ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
          aria-current={ver === 'documentos' ? 'page' : undefined}
        >
          {/* A contagem no rótulo poupa a ida: quem quer saber se já existe
              contrato não precisa trocar de aba para descobrir que não. */}
          Contrato e documentos
          {o.documentos.length > 0 ? (
            <span className={estilo.abaConta}>{o.documentos.length}</span>
          ) : null}
        </Link>
      </nav>

      {ver === 'documentos' ? (
        <DocumentosDaOrdem
          ordemId={o.id}
          documentos={o.documentos.map((d) => ({
            id: d.id,
            tipo: d.tipo,
            numero: d.numero,
            tokenAcesso: d.tokenAcesso,
            geradoEm: dataCurta(d.geradoEm),
          }))}
          podeEmitir={podeEmitir}
          cliente={o.cliente.nome}
          numeroOS={`#${String(o.numero).padStart(4, '0')}`}
        />
      ) : (
      <>


      {/* A pendência de peça vem logo abaixo da trilha, porque ela é a
          explicação do "por que essa ordem está parada". O código antigo
          prometia que isso "aparece no painel como pendência" — e não aparecia
          em canto nenhum: ficava num aviso de log que ninguém lê. */}
      {pendencia.falta ? (
        <p className={estilo.erro} role="status" style={{ marginBottom: 'var(--s5)' }}>
          {pendencia.aviso}{' '}
          <Link href="/painel/estoque">Ver no estoque</Link>
        </p>
      ) : null}

      <div className={estilo.duasColunas}>
        {/* ===== Coluna principal ========================================== */}
        <div>
          {/* --- Os próximos passos, no topo: é o que a pessoa veio fazer ---
                 `id="passos"` é o destino de quem acabou de salvar o laudo: o
                 formulário fica no meio da ficha, e o botão do próximo passo
                 mora aqui em cima, fora do campo de visão de quem escreveu
                 quinze linhas. Ver o `scrollIntoView` em `diagnostico.tsx`. */}
          <div className={estilo.bloco} id="passos">
            <p className={estilo.blocoTitulo}>
              <span>O que dá para fazer agora</span>
              {integridade.integra ? (
                <span className={`${estilo.tag} ${estilo.tagOk}`}>histórico íntegro</span>
              ) : (
                <span className={`${estilo.tag} ${estilo.tagAlerta}`}>
                  histórico alterado na sequência {integridade.quebrouNaSequencia}
                </span>
              )}
            </p>

            {passos.length === 0 ? (
              <p className={estilo.texto}>
                {o.etapa === 'ORCAMENTO_ENVIADO'
                  ? 'A bola está com o cliente. Ele responde pelo link que recebeu no WhatsApp — ninguém aqui dentro aprova no lugar dele.'
                  : 'Nenhum passo disponível para o seu perfil nesta etapa.'}
              </p>
            ) : (
              <BotoesEtapa ordemId={o.id} passos={passos.map((p) => ({ para: p.para, titulo: p.titulo, avisaCliente: p.avisaCliente }))} />
            )}

            {podeCancelar ? <Cancelar ordemId={o.id} /> : null}

            <div className={estilo.passos}>
              <a href={linkPortal} target="_blank" rel="noreferrer" className={estilo.btnSec}>
                Abrir o portal como o cliente vê
              </a>
            </div>
          </div>

          {/* --- Relato, diagnóstico, execução ---------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>O aparelho</p>
            <div className={estilo.pares}>
              <Par rot="Marca e modelo" val={`${o.equipamento.marca} ${o.equipamento.modelo}`} />
              <Par rot="Número de série" val={o.equipamento.numeroSerie ?? '—'} />
              <Par rot="Categoria" val={o.equipamento.categoria ?? '—'} />
              <Par rot="Acessórios que vieram" val={o.equipamento.acessorios ?? 'nenhum registrado'} />
            </div>

            <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
              O que o cliente relatou
            </p>
            <p className={estilo.texto}>{o.defeitoRelatado}</p>

            {o.diagnostico ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  O que o técnico encontrou
                </p>
                <p className={estilo.texto}>{o.diagnostico}</p>
              </>
            ) : null}

            {o.parecerTecnico ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  Parecer para a gestão
                </p>
                <p className={estilo.texto}>{o.parecerTecnico}</p>
              </>
            ) : null}

            {o.servicoExecutado ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  O que foi executado
                </p>
                <p className={estilo.texto}>{o.servicoExecutado}</p>
              </>
            ) : null}

            {o.testesFinais ? (
              <>
                <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
                  Testes finais
                </p>
                <p className={estilo.texto}>{o.testesFinais}</p>
              </>
            ) : null}

            {podeVer(sessao.papel, Papel.TECNICO) ? (
              <div style={{ marginTop: 'var(--s5)' }}>
                <Diagnostico
                  ordemId={o.id}
                  diagnostico={o.diagnostico ?? ''}
                  parecerTecnico={o.parecerTecnico ?? ''}
                  servicoExecutado={o.servicoExecutado ?? ''}
                  testesFinais={o.testesFinais ?? ''}
                  /* Execução e testes só existem DEPOIS que houve execução.
                     Ver a nota no componente: pedi-los no momento do laudo é
                     pedir ao técnico que descreva o que ainda não fez. */
                  jaExecutou={DEPOIS_DA_BANCADA.includes(o.etapa)}
                  /* O nome do próximo passo, para o laudo emendar nele em vez
                     de fechar e deixar a pessoa procurando onde clicar. */
                  proximoPasso={passos[0]?.titulo ?? null}
                />
              </div>
            ) : null}
          </div>

          {/* --- Peças retiradas ------------------------------------------ */}
          <PecasRetiradas
            ordemId={o.id}
            podeRegistrar={podeVer(sessao.papel, Papel.TECNICO)}
            pecas={o.pecasRetiradas.map((p) => ({
              id: p.id,
              descricao: p.descricao,
              destino: p.destino,
              identificacao: p.identificacao,
              observacao: p.observacao,
              registradoPorNome: p.registradoPorNome,
              criadoEm: p.criadoEm.toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            }))}
          />

          {/* --- Orçamento ------------------------------------------------ */}
          {/* A ÂNCORA existe para o funil do Comercial cair AQUI, e não no topo
              da ficha. Sem ela, "editar orçamento" abria uma página longa e
              deixava a pessoa rolando à procura do bloco — que é o mesmo que
              não ter o atalho. */}
          <div id="orcamento" style={{ scrollMarginTop: 'var(--s5)' }} />
          <Orcamento
            ordemId={o.id}
            etapa={o.etapa}
            papel={sessao.papel}
            pecas={pecas.map((p) => ({
              id: p.id,
              sku: p.sku,
              nome: p.nome,
              precoVendaCentavos: p.precoVendaCentavos,
              livre: p.livre,
            }))}
            orcamentos={o.orcamentos.map((orc) => ({
              id: orc.id,
              numero: orc.numero,
              versao: orc.versao,
              status: orc.status,
              totalCentavos: orc.totalCentavos,
              subtotalPecas: orc.subtotalPecas,
              subtotalServicos: orc.subtotalServicos,
              descontoCentavos: orc.descontoCentavos,
              acrescimoCentavos: orc.acrescimoCentavos,
              garantiaDias: orc.garantiaDias,
              prazoExecucaoDias: orc.prazoExecucaoDias,
              validoAte: orc.validoAte?.toISOString() ?? null,
              enviadoEm: orc.enviadoEm?.toISOString() ?? null,
              respondidoEm: orc.respondidoEm?.toISOString() ?? null,
              aprovadoPorNome: orc.aprovadoPorNome,
              motivoReprovacao: orc.motivoReprovacao,
              itens: orc.itens.map((i) => ({
                id: i.id,
                tipo: i.tipo,
                descricao: i.descricao,
                quantidade: Number(i.quantidade),
                valorUnitCentavos: i.valorUnitCentavos,
                valorTotalCentavos: i.valorTotalCentavos,
              })),
            }))}
          />

          {/* --- Fotos ---------------------------------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Fotos</span>
              <span className={estilo.fraco}>{o.fotos.length} no total</span>
            </p>
            {o.fotos.length === 0 ? (
              <p className={estilo.texto}>
                Nenhuma foto ainda. O recebimento na oficina exige no mínimo seis —
                é o que registra o estado em que o aparelho chegou.
              </p>
            ) : (
              Object.entries(fotosPorCategoria).map(([categoria, fotos]) => (
                <div key={categoria} style={{ marginBottom: 'var(--s4)' }}>
                  <p className={estilo.parRot} style={{ marginBottom: 'var(--s2)' }}>
                    {rotuloCategoria(categoria)} · {fotos.length}
                  </p>
                  <div className={estilo.galeria}>
                    {fotos.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/foto/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={estilo.foto}
                        title={`Enviada por ${f.autorNome} em ${dataHora(f.criadoEm)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/foto/${f.id}?t=1`} alt={f.legenda ?? 'Foto do equipamento'} loading="lazy" />
                        <span className={estilo.fotoRot}>{primeiroNome(f.autorNome)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* --- Peças e estoque ------------------------------------------ */}
          {o.movimentos.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Peças desta ordem</p>
              <div className={estilo.rolaX}>
                <table className={estilo.tabela}>
                  <thead>
                    <tr>
                      <th>Peça</th>
                      <th>Movimento</th>
                      <th className={estilo.dir}>Qtd.</th>
                      <th>Quem</th>
                      <th>Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.movimentos.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className={estilo.forte}>{m.peca.nome}</span>
                          <div className={estilo.fraco}>{m.peca.sku}</div>
                        </td>
                        <td>
                          <span className={estilo.tag}>{m.tipo.toLowerCase()}</span>
                        </td>
                        <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.quantidade)}</td>
                        <td>{m.autorNome}</td>
                        <td className={estilo.num}>{dataCurta(m.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        {/* ===== Coluna lateral ============================================ */}
        <div>
          <Responsavel
            ordemId={o.id}
            tecnicoAtualId={o.tecnicoId}
            prazoPrometido={o.prazoPrometido ? diaLocal(o.prazoPrometido) : ''}
            prioridade={o.prioridade === 'ALTA' ? 'ALTA' : 'NORMAL'}
            tecnicos={tecnicos}
          />

          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>Cliente</p>
            <div className={estilo.pares}>
              <Par rot="Nome" val={o.cliente.nome} />
              <Par rot="Documento" val={mascarar(o.cliente.documento)} />
              <Par rot="Contato" val={o.cliente.contatoNome ?? '—'} />
              <Par rot="WhatsApp" val={o.cliente.whatsapp ? telefone(o.cliente.whatsapp) : '—'} />
              <Par
                rot="Endereço"
                val={
                  [o.cliente.logradouro, o.cliente.numero, o.cliente.bairro, o.cliente.cidade]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
            </div>
          </div>

          {o.fatura ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>
                <span>Fatura #{o.fatura.numero}</span>
                <span
                  className={`${estilo.tag} ${o.fatura.status === 'QUITADA' ? estilo.tagOk : estilo.tagEspera}`}
                >
                  {o.fatura.status.toLowerCase()}
                </span>
              </p>
              <div className={estilo.pares}>
                <Par rot="Total" val={formatarBRL(o.fatura.valorTotalCentavos)} />
                <Par rot="Recebido" val={formatarBRL(o.fatura.valorPagoCentavos)} />
                <Par
                  rot="Em aberto"
                  val={formatarBRL(
                    Math.max(
                      0,
                      o.fatura.valorTotalCentavos +
                        o.fatura.multaCentavos +
                        o.fatura.jurosCentavos -
                        o.fatura.valorPagoCentavos,
                    ),
                  )}
                />
                <Par rot="Conferida" val={o.fatura.conferido ? `sim, por ${o.fatura.conferidoPorNome}` : 'ainda não'} />
              </div>
              {o.fatura.pagamentos.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--s4) 0 0' }}>
                  {o.fatura.pagamentos.map((p) => (
                    <li key={p.id} className={estilo.fraco} style={{ marginBottom: 4 }}>
                      {formatarBRL(p.valorCentavos)} em {p.forma.toLowerCase().replace('_', ' ')}
                      {p.parcelas > 1 ? ` em ${p.parcelas}x` : ''} · {dataCurta(p.recebidoEm)}
                      {p.estornadoEm ? ' · ESTORNADO' : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={estilo.passos}>
                <Link href="/painel/financeiro" className={estilo.btnSec}>
                  Ir para o financeiro
                </Link>
              </div>
            </div>
          ) : null}

          {o.assinaturas.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Assinaturas</p>
              {/* O TRAÇO, e não só o nome de quem assinou.
                  A assinatura era coletada, guardada com hash e coordenada, e
                  nunca aparecia: o painel mostrava o nome e a data, e o rabisco
                  só existia dentro do PDF. Isso esvazia a prova exatamente onde
                  ela é usada — "o cliente diz que não recebeu" se resolve
                  mostrando o traço, o nome e o documento na tela, com a pessoa
                  ao telefone. */}
              {o.assinaturas.map((s) => (
                <div key={s.id} className={estilo.assinatura}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- estas
                      imagens vêm de rota NOSSA que confere a sessão antes de
                      devolver o byte. Passá-las pelo otimizador do next/image
                      colocaria conteúdo autenticado num cache compartilhado e
                      sem dono. O peso já é pequeno e o `loading="lazy"` resolve
                      o resto. */}
                  <img
                    className={estilo.assinaturaTraco}
                    src={`/api/assinatura/${s.id}`}
                    alt={`Assinatura de ${s.assinanteNome}`}
                    loading="lazy"
                  />
                  <p className={estilo.parVal}>
                    <strong>{rotuloAssinatura(s.tipo)}</strong> — {s.assinanteNome}
                  </p>
                  {s.assinanteDocumento ? (
                    <p className={estilo.fraco}>CPF {s.assinanteDocumento}</p>
                  ) : null}
                  <p className={estilo.fraco}>
                    {dataHora(s.criadoEm)}
                    {s.latitude != null ? ` · ${s.latitude.toFixed(5)}, ${s.longitude?.toFixed(5)}` : ' · sem coordenada'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {/* O bloco de documentos SAIU DAQUI e virou a aba "Contrato e
              documentos", logo acima. Ele era um `<p>Documentos</p>` com dois
              botões debaixo, na terceira dobra desta coluna — e o dono do
              sistema foi procurar como emitir contrato e não achou.

              Emitir documento não é informação SOBRE a ordem, é trabalho SOBRE
              a ordem: coisa que se vem fazer não mora numa coluna de leitura.
              Aqui fica só o atalho, para quem está lendo a ficha e lembrou. */}
          {o.documentos.length > 0 || podeEmitir ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Documentos</p>
              <p className={estilo.fraco}>
                {o.documentos.length === 0
                  ? 'Nenhum ainda.'
                  : `${o.documentos.length} ${o.documentos.length === 1 ? 'documento' : 'documentos'} nesta ordem.`}
              </p>
              <div className={estilo.modeloCartaoAcoes}>
                <Link className={estilo.btnSec} href={`/painel/ordens/${o.id}?ver=documentos`}>
                  {podeEmitir ? 'Abrir contrato e documentos' : 'Ver os documentos'}
                </Link>
              </div>
            </div>
          ) : null}

          {o.agendamentos.length > 0 ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Rota</p>
              {o.agendamentos.map((ag) => (
                <div key={ag.id} style={{ marginBottom: 'var(--s3)' }}>
                  <p className={estilo.parVal}>
                    <strong>{ag.tipo === 'RETIRADA' ? 'Retirada' : 'Entrega'}</strong> ·{' '}
                    {dataHora(ag.previstoPara)}
                  </p>
                  <p className={estilo.fraco}>
                    {ag.motorista?.nome ?? 'sem motorista'} · {ag.status.toLowerCase()}
                  </p>
                  <p className={estilo.fraco}>{ag.enderecoSnapshot}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* --- A linha do tempo ----------------------------------------- */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Linha do tempo</span>
              <span className={estilo.fraco}>{integridade.total} eventos</span>
            </p>
            <ul className={estilo.linha}>
              {o.eventos.map((e, i) => (
                <li key={e.id} className={`${estilo.evento} ${i === 0 ? estilo.eventoAtual : ''}`}>
                  <div className={estilo.eventoTop}>
                    <span className={estilo.eventoTitulo}>{e.titulo}</span>
                    <span className={estilo.eventoQuando}>{dataHora(e.criadoEm)}</span>
                  </div>
                  <p className={estilo.eventoQuem}>
                    {e.autorNome ?? 'sistema'}
                    {e.autorPapel ? ` · ${e.autorPapel.toLowerCase().replace('_', ' ')}` : ''}
                    {e.visivelCliente ? ' · o cliente viu' : ''}
                  </p>
                  {e.descricao ? <p className={estilo.fraco}>{e.descricao}</p> : null}
                  {/* O hash não é enfeite: é o que permite conferir, meses
                      depois, que este evento não foi reescrito. */}
                  <p className={estilo.eventoHash}>#{e.sequencia} · {e.hash.slice(0, 16)}…</p>
                </li>
              ))}
            </ul>
          </div>

          {motoristas.length === 0 ? (
            <p className={estilo.fraco}>
              Nenhum motorista cadastrado ainda — sem ele a retirada não pode ser
              atribuída.
            </p>
          ) : null}
        </div>
      </div>
      </>
      )}
    </>
  )
}

function Par({ rot, val }: { rot: string; val: string }) {
  return (
    <div className={estilo.par}>
      <span className={estilo.parRot}>{rot}</span>
      <span className={estilo.parVal}>{val}</span>
    </div>
  )
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

const dataCurta = (d: Date) => fmtData.format(d)
const dataHora = (d: Date) => fmtDataHora.format(d)
const primeiroNome = (n: string) => n.split(' ')[0] ?? n

/** Mostra só os últimos dígitos: a tela não precisa exibir o documento inteiro. */
function mascarar(d: string): string {
  if (d.length === 11) return `•••.•••.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `••.•••.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

function telefone(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

function rotuloCategoria(c: string): string {
  const m: Record<string, string> = {
    RECEBIMENTO: 'Como chegou',
    ANALISE: 'Análise',
    EXECUCAO: 'Durante o conserto',
    PECA_SUBSTITUIDA: 'Peça substituída',
    TESTE_FINAL: 'Teste final',
    ENTREGA: 'Entrega',
  }
  return m[c] ?? c
}

function rotuloAssinatura(t: string): string {
  const m: Record<string, string> = {
    RETIRADA: 'Retirada',
    APROVACAO_ORCAMENTO: 'Aprovação do orçamento',
    ENTREGA: 'Entrega',
  }
  return m[t] ?? t
}

