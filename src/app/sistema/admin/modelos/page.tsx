import Link from 'next/link'
import { comEscopo } from '@/lib/db'
import { ROTULO_TIPO_UM, TIPOS_MODELAVEIS, ehTipoModelavel } from '@/lib/tipos-de-documento'
import { exigirTela } from '@/server/sistema/guarda'
import GeradorDeModelo, { type ModeloEmEdicao } from '@/components/sistema/gerador-modelo'
import {
  CabecalhoTela,
  Chip,
  EmptyState,
  Secao,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * MODELOS — o gerador de documentos, em tela de obra.
 *
 * =============================================================================
 * DUAS TELAS NUM ENDEREÇO SÓ
 * =============================================================================
 * Sem `?editar=`, é a estante: os modelos que existem, qual é o padrão de cada
 * tipo, e o botão de criar.
 *
 * Com `?editar=<id>` ou `?novo=<tipo>`, é o gerador. Mesmo padrão da ficha da
 * O.S., e pelo mesmo motivo: um estado que tem endereço pode ser mandado para
 * outra pessoa terminar.
 *
 * =============================================================================
 * POR QUE ESTA TELA É ESCURA
 * =============================================================================
 * Ela não opera nada — constrói. O `layout.tsx` deste ramo trava o escuro, e o
 * olho aprende em dois dias que claro é onde eu opero, escuro é onde eu
 * configuro.
 */
export default async function Modelos({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; novo?: string }>
}) {
  const { ctx } = await exigirTela('modelos')
  const q = await searchParams

  const modelos = await comEscopo(ctx, (tx) =>
    tx.modeloDocumento.findMany({
      orderBy: [{ tipo: 'asc' }, { padrao: 'desc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        tipo: true,
        descricao: true,
        corpo: true,
        padrao: true,
        ativo: true,
        atualizadoEm: true,
        autorNome: true,
      },
    }),
  )

  // ---------------------------------------------------------------------------
  // O GERADOR
  // ---------------------------------------------------------------------------
  const emEdicao = q.editar ? modelos.find((m) => m.id === q.editar) : null
  const criandoTipo = q.novo && ehTipoModelavel(q.novo) ? q.novo : null

  if (emEdicao || criandoTipo) {
    const modelo: ModeloEmEdicao = emEdicao
      ? {
          id: emEdicao.id,
          nome: emEdicao.nome,
          tipo: emEdicao.tipo,
          descricao: emEdicao.descricao ?? '',
          corpo: emEdicao.corpo,
          padrao: emEdicao.padrao,
        }
      : {
          id: null,
          nome: '',
          tipo: criandoTipo!,
          descricao: '',
          corpo: '',
          padrao: false,
        }

    return (
      <>
        <p className="mono">
          <Link href="/sistema/admin/modelos">← Voltar para os modelos</Link>
        </p>
        <CabecalhoTela
          titulo={emEdicao ? emEdicao.nome : `Novo ${ROTULO_TIPO_UM[criandoTipo!].toLowerCase()}`}
          apoio="Escreva o texto e veja como ele fica preenchido, antes de qualquer cliente receber."
        />
        {/* A simulação com O.S. real ainda não está ligada aqui: ela exige
            escolher uma ordem e montar os valores dela pelo mesmo caminho da
            geração do PDF. Enquanto isso, a pré-visualização usa os exemplos do
            catálogo — que provam o desenho e não provam os dados. Dizer isso na
            tela é melhor que um botão que simula com números inventados. */}
        <GeradorDeModelo modelo={modelo} valoresReais={null} rotuloDaOrdemReal={null} />
      </>
    )
  }

  // ---------------------------------------------------------------------------
  // A ESTANTE
  // ---------------------------------------------------------------------------
  return (
    <>
      <CabecalhoTela
        titulo="Modelos de documento"
        apoio="O texto que a empresa promete e cobra. Trocar uma cláusula deixou de precisar de programador."
      />

      {TIPOS_MODELAVEIS.map((tipo) => {
        const doTipo = modelos.filter((m) => m.tipo === tipo)
        return (
          <Secao key={tipo} titulo={ROTULO_TIPO_UM[tipo]}>
            {doTipo.length === 0 ? (
              <EmptyState
                titulo="Nenhum modelo deste tipo"
                bom={false}
                apoio="Sem modelo próprio, o documento sai com o texto embutido no sistema."
                acao={
                  <Link href={`/sistema/admin/modelos?novo=${tipo}`} className={estilo.acao}>
                    Criar modelo
                  </Link>
                }
              />
            ) : (
              <div className={estilo.radar}>
                {doTipo.map((m) => (
                  <div key={m.id} className={estilo.linha}>
                    <div className={estilo.linhaTxt}>
                      <div className={estilo.linhaTopo}>
                        <span className={estilo.linhaTitulo}>{m.nome}</span>
                        {m.padrao ? <Chip tom="ok">Padrão</Chip> : null}
                        {!m.ativo ? <Chip tom="pending">Desligado</Chip> : null}
                      </div>
                      <div className={estilo.linhaApoio}>
                        {m.descricao ? <span>{m.descricao}</span> : null}
                        <span aria-hidden="true">·</span>
                        <span>
                          atualizado em {m.atualizadoEm.toLocaleDateString('pt-BR')}
                          {m.autorNome ? ` por ${m.autorNome}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className={estilo.linhaAcao}>
                      <Link
                        href={`/sistema/admin/modelos?editar=${m.id}`}
                        className={estilo.acao}
                      >
                        Editar texto
                      </Link>
                    </div>
                  </div>
                ))}
                <div className={estilo.linha}>
                  <div className={estilo.linhaTxt}>
                    <span className={estilo.campoDica}>
                      Mais de um modelo do mesmo tipo? Só o marcado como padrão
                      sai sozinho; os outros ficam à escolha na hora de emitir.
                    </span>
                  </div>
                  <div className={estilo.linhaAcao}>
                    <Link
                      href={`/sistema/admin/modelos?novo=${tipo}`}
                      className={estilo.acaoLinha}
                    >
                      + Outro modelo
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </Secao>
        )
      })}
    </>
  )
}
