import type { Metadata } from 'next'
import { CONTEUDO_PADRAO, interpretarConteudo } from '@/lib/conteudo'
import { comEscopo } from '@/lib/db'
import { exigirSuperAdmin } from '@/server/auth/guarda'
import EditorDoSite from './editor'

export const metadata: Metadata = { title: 'Site', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A tela de edição do site.
 *
 * Só o Super Admin chega aqui — `exigirSuperAdmin` barra antes de qualquer
 * consulta, e a política do banco barra de novo se algo escapar. As duas
 * travas são de propósito: esta tela reescreve o que TODO visitante lê.
 *
 * Ela lê o conteúdo cru da tabela, e não pela função pública. A diferença
 * importa: a função pública devolve o publicado; aqui queremos também a
 * VERSÃO, que é o número que a tela devolve ao salvar para o servidor perceber
 * se alguém gravou no meio.
 */
export default async function PaginaSite() {
  const { ctx } = await exigirSuperAdmin()

  const linha = await comEscopo(ctx, (tx) =>
    tx.conteudoSite.findUnique({
      where: { id: 'site' },
      select: { dados: true, versao: true, atualizadoEm: true },
    }),
  )

  // Sem linha, a tela abre com o texto de fábrica e versão zero. A primeira
  // gravação cria a linha — não é preciso "inicializar" nada à mão.
  const { conteudo } = linha
    ? interpretarConteudo(linha.dados)
    : { conteudo: CONTEUDO_PADRAO }

  return (
    <EditorDoSite
      inicial={conteudo}
      versao={linha?.versao ?? 0}
      atualizadoEm={linha?.atualizadoEm?.toISOString() ?? null}
    />
  )
}
