import { revalidatePath } from 'next/cache'
import { comEscopo, exigirEmpresa, type ContextoAcesso } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { type Sessao } from '@/server/auth/sessao'
import { apagarArquivo, guardarFoto } from '@/server/arquivos/storage'

/**
 * A FOTO DO CARTÃO DO CATÁLOGO — e por que este arquivo existe.
 *
 * =============================================================================
 * ELA MORAVA EM `acoes/estoque.ts`, E ISSO ERA UM BURACO
 * =============================================================================
 * `anexarFotoDeCatalogo` recebe o contexto de acesso e a sessão PRONTOS, no
 * primeiro parâmetro, em vez de derivá-los de `lerSessao()`. Isso é correto e
 * deliberado: ela é uma ajudante chamada por três telas que já conferiram quem
 * está do outro lado, e `cadastros.ts` monta a sessão de um jeito ligeiramente
 * diferente do de `estoque.ts`.
 *
 * O problema não era o formato. Era o ENDEREÇO. Ela vivia exportada de um
 * arquivo `'use server'`, e a documentação do Next que este projeto usa é
 * explícita sobre o que isso significa:
 *
 *     "you should still treat Server Actions as reachable via direct POST
 *      requests and verify authentication and authorization inside each one"
 *     — node_modules/next/dist/docs/01-app/02-guides/data-security.md
 *
 * Toda função exportada de um módulo `'use server'` é uma porta. E esta porta
 * aceitava do outro lado o `ContextoAcesso` inteiro — inclusive `ehSuperAdmin`,
 * que em `lib/db.ts` é o interruptor que desliga o Row Level Security. Quem
 * chamasse escolhia a empresa, escolhia se rodava como super admin, e escolhia
 * o nome que ia para a trilha de auditoria. As outras 113 funções exportadas de
 * módulo `'use server'` deste projeto derivam a identidade da sessão; só esta
 * recebia a dela pronta.
 *
 * A regra que ela violava está escrita no próprio repositório, em
 * `consultas/rastro.ts`: função que RECEBE contexto nunca fica em `acoes/`.
 *
 * =============================================================================
 * POR QUE MUDAR DE ARQUIVO RESOLVE, E TIRAR O `export` NÃO RESOLVERIA
 * =============================================================================
 * É a diretiva `'use server'` no topo do arquivo que transforma export em
 * porta. Num módulo comum de servidor, como este, exportar não cria endereço
 * nenhum — a função só é alcançável por quem a importa, e quem importa é código
 * do servidor que já conferiu papel e sessão.
 *
 * Apagar o `export` da posição antiga teria quebrado o sistema: `cadastros.ts`
 * a importa para anexar a foto do equipamento recém-cadastrado. Os dois
 * chamadores continuam importando normalmente, agora daqui.
 *
 * `src/server/arquivos/` é o vizinho natural porque `guardarFoto`, que faz o
 * trabalho pesado, já mora ao lado.
 */

type Resposta = { ok: true; aviso?: string } | { ok: false; motivo: string }

/**
 * A FOTO DO CARTÃO — a única imagem que o catálogo tem.
 *
 * Uma peça sem foto é uma linha de texto que o técnico não reconhece na
 * prateleira, e um equipamento sem foto não vira cartão de catálogo nenhum: a
 * foto é o que responde "é esta?".
 *
 * Ela precisa do `id` porque a foto pertence a uma linha. Por isso, no cadastro,
 * ela roda DEPOIS do create — e o que acontece se ela falhar está escrito lá.
 *
 * QUEM CHAMA JÁ CONFERIU O PAPEL. Esta função não lê sessão e não decide
 * autorização; ela recebe de quem decidiu. Por isso ela não pode voltar para um
 * arquivo `'use server'`, e por isso todo chamador novo precisa conferir papel
 * antes de chamar, como `salvarFotoDeCatalogo` e `cadastros.ts` fazem.
 */
export async function anexarFotoDeCatalogo(
  // Só o que esta função usa: o escopo da empresa e quem está fazendo. Tipar
  // pelo retorno inteiro de `atorDaSessao` amarrava a função a um formato que
  // as outras telas não têm — e cadastros.ts, que também precisa dela, monta a
  // sessão de um jeito ligeiramente diferente.
  a: { ctx: ContextoAcesso; sessao: Sessao },
  tipo: 'peca' | 'equipamento',
  id: string,
  arquivo: File,
): Promise<Resposta> {
  const tenantId = exigirEmpresa(a.ctx)

  // A LINHA É LIDA ANTES DE GRAVAR O ARQUIVO, e dentro do escopo da empresa.
  // Assim um id de outra franquia para aqui — em vez de gravar o arquivo, não
  // achar a linha para atualizar, e deixar um arquivo órfão no disco de quem
  // nem devia ter conseguido enviar.
  // Os dois ramos selecionam AS MESMAS colunas de propósito: é só o que esta
  // função usa, e assim os dois têm o mesmo formato. Trazer `nome` de um lado e
  // `marca`/`modelo` do outro daria dois tipos diferentes num único `await`, e
  // o TypeScript reprovaria — com razão, porque o código abaixo não saberia
  // qual dos dois recebeu.
  const atual = await comEscopo(a.ctx, (tx) =>
    tipo === 'peca'
      ? tx.peca.findUnique({ where: { id }, select: { fotoCaminho: true, fotoCaminhoThumb: true } })
      : tx.equipamento.findUnique({ where: { id }, select: { fotoCaminho: true, fotoCaminhoThumb: true } }),
  )
  if (!atual) return { ok: false, motivo: 'Item não encontrado.' }

  const r = await guardarFoto({ tenantId, escopo: `cat-${tipo}-${id}`, arquivo })
  if (!r.ok) return r

  // `updateMany` e não `update`: o retorno de `update` é a LINHA INTEIRA, e as
  // duas tabelas têm colunas diferentes — os dois ramos do ternário viram tipos
  // incompatíveis num único `await`. `updateMany` devolve só a contagem nos
  // dois casos, que é o que interessa aqui. E o `where` continua passando pelo
  // escopo da empresa, então ele não alcança linha de outra franquia.
  const dados = { fotoCaminho: r.caminho, fotoCaminhoThumb: r.caminhoThumb, fotoHash: r.hash }
  await comEscopo(a.ctx, (tx) =>
    tipo === 'peca'
      ? tx.peca.updateMany({ where: { id }, data: dados })
      : tx.equipamento.updateMany({ where: { id }, data: dados }),
  )

  // Só depois de a linha apontar para o arquivo novo. Apagar antes deixaria a
  // tela sem foto nenhuma na janela entre as duas operações.
  await apagarAntiga(atual.fotoCaminho, atual.fotoCaminhoThumb, r.caminho, r.caminhoThumb)

  await auditar(a.ctx, a.sessao, {
    acao: 'catalogo.foto',
    entidade: tipo,
    entidadeId: id,
    detalhes: { bytes: r.bytes },
  })
  revalidatePath('/painel/estoque')
  revalidatePath('/painel/equipamentos')
  return { ok: true }
}

/**
 * Apaga o arquivo que saiu de cena — desde que ele não seja o que entrou.
 *
 * Reenviar a MESMA imagem produz o mesmo hash e, portanto, o mesmo caminho.
 * Sem esta comparação, a limpeza da "antiga" apagaria o arquivo que a linha
 * acabou de passar a referenciar, e a peça ficaria com foto quebrada logo
 * depois de alguém reenviar a foto certa.
 */
export async function apagarAntiga(
  caminho: string | null,
  thumb: string | null,
  novoCaminho: string | null,
  novoThumb: string | null,
): Promise<void> {
  if (caminho && caminho !== novoCaminho) await apagarArquivo(caminho)
  if (thumb && thumb !== novoThumb) await apagarArquivo(thumb)
}
