import type { Metadata } from 'next'
import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel, exigirAba, podeVer } from '@/server/auth/guarda'
import {
  LIMITE_POR_TIPO,
  ROTULO_TIPO,
  ROTULO_TIPO_UM,
  TIPOS_MODELAVEIS,
  contarPorTipo,
  ehTipoModelavel,
  listarModelos,
  type TipoModelavel,
  ETAPAS_DE_DISPARO,
} from '@/server/consultas/modelos'
import { ROTULO_DOCUMENTO, ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { valoresDeExemplo, variaveisPorGrupo } from '@/lib/variaveis-documento'
import { comEscopo } from '@/lib/db'
import ListaDeModelos from './lista'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Modelos de documento', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * OS GERADORES DE DOCUMENTO.
 *
 * =============================================================================
 * POR QUE ESTA TELA EXISTE
 * =============================================================================
 * Contrato de prestação e nota promissória nasceram com o texto escrito DENTRO
 * do código. Funciona para um molde e só um: a cláusula de foro é a de Lajeado,
 * o prazo é o que ficou escrito, e mudar uma vírgula é mexer no sistema.
 *
 * Uma assistência que atende hospital, clínica e órgão público não tem UM
 * contrato — tem o do particular, o do convênio, o que o setor de compras
 * exige. E uma franquia nova terá os dela, com outro foro.
 *
 * =============================================================================
 * TRÊS ABAS, PORQUE SÃO TRÊS DOCUMENTOS QUE SE ESCREVEM
 * =============================================================================
 * O sistema emite dez tipos, mas oito NASCEM DA ESTEIRA: o comprovante de
 * retirada sai quando o motorista colhe a assinatura, o recibo sai quando a
 * fatura é quitada. Ninguém escreve o texto deles.
 *
 * Estes três se escrevem — e por responderem à mesma pergunta ("qual texto sai
 * quando eu emitir?") são abas, não três itens de menu.
 *
 * =============================================================================
 * ONDE ELA MORA
 * =============================================================================
 * Retaguarda, ao lado de Preventiva e WhatsApp. Não é trabalho do dia: é
 * ajuste que se faz uma vez e se revisita quando a regra do negócio muda.
 */
export default async function Documentos({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>
}) {
  // Ver os moldes vai até o FINANCEIRO — quem emite precisa poder conferir com
  // que texto vai sair. Editar é mais restrito, e quem decide é `podeMexer`
  // abaixo: o molde de contrato é o que a empresa promete e cobra.
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.FINANCEIRO,
  )
  await exigirAba('documentos')

  const q = await searchParams
  const aba: TipoModelavel = ehTipoModelavel(q.aba ?? '') ? (q.aba as TipoModelavel) : 'CONTRATO_PRESTACAO'
  const podeMexer = podeVer(sessao.papel, Papel.GESTOR)

  const [modelos, contagem, emitidos] = await Promise.all([
    listarModelos(ctx, aba),
    contarPorTipo(ctx),
    // Os documentos JÁ EMITIDOS, para a tela não ser só configuração: quem abre
    // aqui muitas vezes quer conferir o que saiu, não mudar o molde.
    comEscopo(ctx, (tx) =>
      tx.documento.findMany({
        orderBy: { geradoEm: 'desc' },
        take: 20,
        select: {
          id: true,
          tipo: true,
          numero: true,
          geradoEm: true,
          ordem: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
          /**
           * O ESTADO DO ENVIO, quando este documento foi mandado ao cliente.
           *
           * A mais recente: quando a primeira falha e o envio é repetido, o que
           * interessa é como está AGORA, não como estava na tentativa que deu
           * errado. A ligação é por chave estrangeira — antes dela, casar
           * mensagem com documento seria adivinhar pelo relógio.
           */
          mensagens: {
            orderBy: { criadoEm: 'desc' },
            take: 1,
            select: { status: true, erro: true, enviadaEm: true, criadoEm: true },
          },
        },
      }),
    ),
  ])

  // O corpo inteiro só do tipo aberto: a lista mostra o tamanho, e o editor
  // precisa do texto. Carregar o corpo dos três tipos encheria a resposta com
  // texto que ninguém vai abrir.
  const comCorpo = await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.findMany({ where: { tipo: aba }, select: { id: true, corpo: true } }),
  )
  const corpoDe = new Map(comCorpo.map((m) => [m.id, m.corpo]))

  const grupos = variaveisPorGrupo()
  const exemplos = valoresDeExemplo()

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Modelos de documento</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O texto que sai quando você emite um contrato, uma promissória ou uma O.S. São até{' '}
            <strong>{LIMITE_POR_TIPO} modelos por tipo</strong> — um deles é o padrão, e a ordem de
            serviço pode <strong>sair sozinha para o cliente</strong> na etapa que você escolher.
          </p>
        </div>
      </div>

      <div className={estilo.rotaBarra}>
        <nav className={estilo.abas} aria-label="Tipos de documento">
          {TIPOS_MODELAVEIS.map((t) => (
            <Link
              key={t}
              href={`/painel/documentos?aba=${t}`}
              className={aba === t ? `${estilo.aba} ${estilo.abaAtiva}` : estilo.aba}
              aria-current={aba === t ? 'page' : undefined}
            >
              {/* O contador é "usados/teto", e não só o total. Um teto que só
                  aparece quando é atingido vira erro surpresa no meio do
                  trabalho — e quem está escrevendo o quinto modelo precisa
                  saber que é o último antes de escrever. */}
              {ROTULO_TIPO[t]} ({contagem[t] ?? 0}/{LIMITE_POR_TIPO})
            </Link>
          ))}
        </nav>
      </div>

      <ListaDeModelos
        tipo={aba}
        rotuloTipo={ROTULO_TIPO[aba]}
        rotuloUm={ROTULO_TIPO_UM[aba]}
        modelos={modelos.map((m) => ({ ...m, corpo: corpoDe.get(m.id) ?? '' }))}
        grupos={grupos}
        exemplos={exemplos}
        podeMexer={podeMexer}
        limite={LIMITE_POR_TIPO}
        // Só a ordem de serviço sai sozinha. Contrato e promissória obrigam o
        // cliente, e a decisão de obrigar alguém não pode ser efeito colateral
        // de arrastar um cartão no quadro. A lista vazia é o que faz o campo
        // do disparo nem aparecer nos outros dois tipos.
        etapas={
          aba === 'ORDEM_SERVICO'
            ? ETAPAS_DE_DISPARO.map((e) => ({ chave: e, rotulo: ROTULO_ETAPA[e] ?? e }))
            : []
        }
      />

      {/* =====================================================================
          DOCUMENTOS ATIVOS — o que de fato saiu
          =====================================================================
          A tela era só configuração, e configuração sozinha não responde a
          pergunta que traz alguém aqui na segunda-feira: "o papel do cliente
          saiu?".

          A COLUNA DO WHATSAPP É A QUE IMPORTA. Um documento gerado e não
          entregue parece pronto em qualquer lista que só mostre "gerado em" —
          e é exatamente o caso em que o cliente liga reclamando que não
          recebeu nada. Falha aparece com o motivo escrito, porque quase sempre
          o motivo é cadastro sem WhatsApp, que se resolve em dez segundos. */}
      <div className={estilo.bloco} style={{ marginTop: 'var(--s6)' }}>
        <p className={estilo.blocoTitulo}>
          <span>Documentos ativos</span>
          <span className={estilo.dica}>
            {emitidos.length === 0
              ? 'nada emitido ainda'
              : `${emitidos.length} mais recentes`}
          </span>
        </p>
        {emitidos.length === 0 ? (
          <p className={estilo.dica}>
            Nada emitido ainda. O que for gerado — à mão ou pelo disparo automático — aparece aqui
            com o estado do envio.
          </p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>O.S.</th>
                  <th>Cliente</th>
                  <th>WhatsApp</th>
                  <th>Gerado</th>
                </tr>
              </thead>
              <tbody>
                {emitidos.map((d) => {
                  const m = d.mensagens[0]
                  return (
                    <tr key={d.id}>
                      <td>
                        {/* O rótulo do sistema, e não a chave desmontada:
                            trocar `_` por espaço produzia "ordem servico" e
                            "laudo tecnico", sem acento, na tela de quem
                            confere documento com o cliente na frente. */}
                        <span className={estilo.forte}>
                          {ROTULO_DOCUMENTO[d.tipo] ?? d.tipo.replaceAll('_', ' ')}
                        </span>
                        <div className={estilo.fraco}>{d.numero}</div>
                      </td>
                      <td className={estilo.num}>
                        <Link href={`/painel/ordens/${d.ordem.id}`}>
                          #{String(d.ordem.numero).padStart(4, '0')}
                        </Link>
                      </td>
                      <td>{d.ordem.cliente.nome}</td>
                      <td>
                        {!m ? (
                          // Sem mensagem NÃO é falha: a maioria dos documentos
                          // é emitida à mão e entregue no balcão. Dizer
                          // "pendente" aqui inventaria uma fila que não existe.
                          <span className={estilo.fraco}>não enviado</span>
                        ) : m.status === 'ENVIADA' ? (
                          <>
                            <span className={`${estilo.tag} ${estilo.tagOk}`}>enviado</span>
                            <div className={estilo.fraco}>
                              {(m.enviadaEm ?? m.criadoEm).toLocaleString('pt-BR', {
                                timeZone: 'America/Sao_Paulo',
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </div>
                          </>
                        ) : m.status === 'FALHOU' ? (
                          <>
                            <span className={`${estilo.tag} ${estilo.tagAlerta}`}>falhou</span>
                            <div className={estilo.fraco}>{m.erro ?? 'sem motivo registrado'}</div>
                          </>
                        ) : (
                          <span className={`${estilo.tag} ${estilo.tagNeutra}`}>na fila</span>
                        )}
                      </td>
                      <td className={estilo.fraco}>
                        {d.geradoEm.toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
