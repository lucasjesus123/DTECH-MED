'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { Papel, TipoMovimentoEstoque } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa, type ContextoAcesso } from '@/lib/db'
import { aCentavos } from '@/lib/dinheiro'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao, type Sessao } from '@/server/auth/sessao'
import { apagarArquivo, guardarFoto } from '@/server/arquivos/storage'
import { movimentar } from '@/server/estoque/servico'

/**
 * Cadastro e movimentação de peças, pela tela.
 *
 * O saldo nunca é digitado. Mesmo o inventário entra como movimento de AJUSTE,
 * que registra o delta e quem o fez. Um campo "saldo" editável parece prático
 * até a primeira divergência, quando ninguém consegue dizer se faltou peça, se
 * alguém levou, ou se foi erro de digitação.
 */

/**
 * `aviso` é o meio-termo que faltava: DEU CERTO, com uma ressalva.
 *
 * Ele existe por causa da foto no cadastro. Sem ele só havia "salvou" e "não
 * salvou", e uma foto que falha teria de virar erro — o que faria a tela dizer
 * que nada foi salvo numa peça que está cadastrada, e a pessoa cadastraria de
 * novo.
 */
type Resposta = { ok: true; aviso?: string } | { ok: false; motivo: string }

const PODE_MEXER: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO]

async function atorDaSessao() {
  const sessao = await lerSessao()
  if (!sessao) return null
  return { sessao, ctx: contextoDe(sessao), ator: { id: sessao.userId, nome: sessao.nome } }
}

const schemaPeca = z.object({
  id: z.string().nullish(),
  sku: z.string().trim().min(1, 'Informe o código da peça.').max(40),
  nome: z.string().trim().min(2, 'Informe o nome da peça.'),
  /**
   * Peça, insumo ou ferramenta.
   *
   * O padrão é PECA porque é o que todo item era antes desta divisão existir —
   * um formulário antigo que não mande o campo continua criando exatamente o
   * que criava.
   */
  tipo: z.enum(['PECA', 'INSUMO', 'FERRAMENTA']).default('PECA'),
  patrimonio: z.string().trim().nullish(),
  categoria: z.string().trim().nullish(),
  aplicacao: z.string().trim().nullish(),
  unidade: z.string().trim().default('UN'),
  localizacao: z.string().trim().nullish(),
  fornecedor: z.string().trim().nullish(),
  custoMedio: z.coerce.number().min(0).default(0),
  precoVenda: z.coerce.number().min(0).default(0),
  estoqueMinimo: z.coerce.number().min(0).default(0),
})

export async function salvarPeca(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não cadastra peça.' }
  }

  const d = schemaPeca.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const jaExiste = await tx.peca.findFirst({
      where: { sku: v.sku, ...(v.id ? { NOT: { id: v.id } } : {}) },
      select: { id: true },
    })
    if (jaExiste) return { ok: false as const, motivo: `Já existe uma peça com o código ${v.sku}.` }

    const dados = {
      sku: v.sku,
      nome: v.nome,
      tipo: v.tipo,
      patrimonio: v.patrimonio || null,
      categoria: v.categoria || null,
      aplicacao: v.aplicacao || null,
      unidade: v.unidade || 'UN',
      localizacao: v.localizacao || null,
      fornecedor: v.fornecedor || null,
      precoVendaCentavos: aCentavos(v.precoVenda),
      estoqueMinimo: new Prisma.Decimal(v.estoqueMinimo),
    }

    if (v.id) {
      // O custo médio é consequência das entradas — editá-lo pela tela faria o
      // relatório de margem mentir. Só entra no cadastro inicial.
      await tx.peca.update({ where: { id: v.id }, data: dados })
      return { ok: true as const, id: v.id }
    }
    const criada = await tx.peca.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        ...dados,
        custoMedioCentavos: aCentavos(v.custoMedio),
      },
      select: { id: true },
    })
    return { ok: true as const, id: criada.id }
  })
  if (!r.ok) return r

  /**
   * A FOTO ENTRA NO CADASTRO, E NÃO NUM SEGUNDO PASSO.
   *
   * Ela precisa do id, então só pode rodar depois do create. E aqui está a
   * regra que importa: SE A FOTO FALHAR, A PEÇA CONTINUA CADASTRADA.
   *
   * Devolver erro faria a tela parecer que nada foi salvo, e a pessoa
   * cadastraria de novo — dois códigos iguais, ou o aviso de código repetido
   * num item que ela acabou de criar sem saber. O trabalho de digitar a ficha
   * inteira não pode ser perdido por causa de uma imagem tremida ou de um 4G
   * que caiu no meio do envio.
   *
   * Então o retorno é `ok` com um aviso: a peça está lá, só a foto não subiu —
   * e trocá-la depois é um clique no cartão.
   */
  const foto = form.get('foto')
  if (foto instanceof File && foto.size > 0) {
    const f = await anexarFotoDeCatalogo(a, 'peca', r.id, foto)
    if (!f.ok) {
      await auditar(a.ctx, a.sessao, {
        acao: v.id ? 'peca.editada' : 'peca.criada',
        entidade: 'peca',
        entidadeId: r.id,
      })
      revalidatePath('/painel/estoque')
      return { ok: true, aviso: `A peça foi cadastrada, mas a foto não subiu: ${f.motivo}` }
    }
  }

  await auditar(a.ctx, a.sessao, { acao: v.id ? 'peca.editada' : 'peca.criada', entidade: 'peca', entidadeId: r.id })
  revalidatePath('/painel/estoque')
  return { ok: true }
}

const schemaMovimento = z.object({
  pecaId: z.string().min(1),
  tipo: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA']),
  quantidade: z.coerce.number().min(0),
  custoUnit: z.coerce.number().min(0).nullish(),
  motivo: z.string().trim().nullish(),
  documentoFiscal: z.string().trim().nullish(),
})

export async function lancarMovimento(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não movimenta estoque.' }
  }

  const d = schemaMovimento.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  // No AJUSTE a quantidade é o saldo contado no inventário, e zero é resposta
  // legítima. Nos demais, movimento de zero não é movimento.
  if (v.tipo !== 'AJUSTE' && v.quantidade <= 0) {
    return { ok: false, motivo: 'A quantidade precisa ser maior que zero.' }
  }
  if (v.tipo === 'AJUSTE' && !v.motivo) {
    return { ok: false, motivo: 'Ajuste de inventário exige o motivo — é o que explica a diferença depois.' }
  }

  const r = await comEscopo(a.ctx, (tx) =>
    movimentar(tx, exigirEmpresa(a.ctx), a.ator, {
      pecaId: v.pecaId,
      tipo: v.tipo as TipoMovimentoEstoque,
      quantidade: v.quantidade,
      motivo: v.motivo || undefined,
      custoUnitCentavos: v.custoUnit != null ? aCentavos(v.custoUnit) : undefined,
      documentoFiscal: v.documentoFiscal || undefined,
    }),
  )
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: `estoque.${v.tipo.toLowerCase()}`,
    entidade: 'peca',
    entidadeId: v.pecaId,
    detalhes: { quantidade: v.quantidade },
  })
  revalidatePath('/painel/estoque')
  revalidatePath('/painel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// A foto do catálogo
// ---------------------------------------------------------------------------

/**
 * Põe (ou troca) a foto de identificação de uma peça ou de um equipamento.
 *
 * =============================================================================
 * ELA IDENTIFICA, NÃO PROVA
 * =============================================================================
 * As fotos de ordem provam o estado de um aparelho num momento: são muitas, têm
 * categoria, autor e hash, e nenhuma pode ser trocada depois — é isso que faz
 * delas prova. Esta responde outra pergunta, uma só: **"é esta?"**.
 *
 * Por isso ela pode ser substituída à vontade e não vira evento na linha do
 * tempo. Trocar a foto de uma peça porque a antiga estava tremida não é fato do
 * negócio; é conserto de cadastro.
 *
 * A troca APAGA o arquivo anterior. Sem isso, cada correção deixaria um órfão no
 * disco que nada mais referencia — e ninguém percebe até o disco encher.
 */
/**
 * GRAVA A FOTO DE UM ITEM QUE JÁ EXISTE.
 *
 * Extraída para ser chamada de DOIS lugares: a troca posterior, pelo cartão do
 * catálogo, e o próprio CADASTRO — porque a foto tinha de esperar o item nascer
 * para poder entrar, e "cadastre agora, fotografe depois" é um segundo passo que
 * ninguém dá. O resultado era um catálogo de itens sem foto, que é o mesmo que
 * catálogo nenhum: a foto é o que responde "é esta?".
 *
 * Ela precisa do `id` porque a foto pertence a uma linha. Por isso, no cadastro,
 * ela roda DEPOIS do create — e o que acontece se ela falhar está escrito lá.
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

/** A troca da foto pelo cartão do catálogo. Só confere e delega. */
export async function salvarFotoDeCatalogo(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera o catálogo.' }
  }
  const tipo = String(form.get('tipo') ?? '')
  const id = String(form.get('id') ?? '')
  const arquivo = form.get('arquivo')
  if (tipo !== 'peca' && tipo !== 'equipamento') return { ok: false, motivo: 'Tipo desconhecido.' }
  if (!id) return { ok: false, motivo: 'Escolha o item antes de enviar a foto.' }
  if (!(arquivo instanceof File)) return { ok: false, motivo: 'Escolha uma imagem.' }
  return anexarFotoDeCatalogo(a, tipo, id, arquivo)
}

/** Tira a foto do catálogo, e o arquivo junto. */
export async function removerFotoDeCatalogo(tipo: string, id: string): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não altera o catálogo.' }
  }
  if (tipo !== 'peca' && tipo !== 'equipamento') return { ok: false, motivo: 'Tipo desconhecido.' }

  const atual = await comEscopo(a.ctx, (tx) =>
    tipo === 'peca'
      ? tx.peca.findUnique({ where: { id }, select: { fotoCaminho: true, fotoCaminhoThumb: true } })
      : tx.equipamento.findUnique({ where: { id }, select: { fotoCaminho: true, fotoCaminhoThumb: true } }),
  )
  if (!atual) return { ok: false, motivo: 'Item não encontrado.' }
  if (!atual.fotoCaminho) return { ok: true }

  const zerar = { fotoCaminho: null, fotoCaminhoThumb: null, fotoHash: null }
  await comEscopo(a.ctx, (tx) =>
    tipo === 'peca'
      ? tx.peca.updateMany({ where: { id }, data: zerar })
      : tx.equipamento.updateMany({ where: { id }, data: zerar }),
  )
  await apagarAntiga(atual.fotoCaminho, atual.fotoCaminhoThumb, null, null)

  await auditar(a.ctx, a.sessao, { acao: 'catalogo.foto_removida', entidade: tipo, entidadeId: id })
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
async function apagarAntiga(
  caminho: string | null,
  thumb: string | null,
  novoCaminho: string | null,
  novoThumb: string | null,
): Promise<void> {
  if (caminho && caminho !== novoCaminho) await apagarArquivo(caminho)
  if (thumb && thumb !== novoThumb) await apagarArquivo(thumb)
}

// ---------------------------------------------------------------------------
// FERRAMENTA: sai com alguém, e volta
// ---------------------------------------------------------------------------

/**
 * O EMPRÉSTIMO DE FERRAMENTA — a custódia que o estoque não tinha.
 *
 * =============================================================================
 * POR QUE ISTO NÃO É UMA "SAÍDA"
 * =============================================================================
 * Uma chave de fenda que sai com o técnico não foi consumida. Registrá-la como
 * saída baixa o saldo e faz a ferramenta desaparecer do sistema no dia em que
 * alguém a levou — e é assim que se perde ferramenta: não por roubo, por não
 * saber com quem está.
 *
 * O movimento EMPRESTIMO não mexe no saldo; ele move a unidade para
 * `saldoEmprestado`, que é irmão do reservado. A ferramenta continua sendo da
 * empresa, só não está na prateleira. Ver `movimentar`.
 *
 * =============================================================================
 * O REGISTRO DA POSSE É UMA LINHA PRÓPRIA, E NÃO SÓ O MOVIMENTO
 * =============================================================================
 * O livro-razão diz que saiu. Ele não diz COM QUEM ESTÁ AGORA sem parear cada
 * saída com a devolução correspondente — e o pareamento não existe, porque duas
 * unidades do mesmo multímetro podem estar com duas pessoas. Por isso a linha
 * em `emprestimos_ferramenta`, onde `devolvidoEm` nulo é a pergunta inteira.
 *
 * As duas coisas entram na MESMA transação: um movimento sem a linha de posse
 * seria um saldo que ninguém sabe explicar, e uma linha de posse sem movimento
 * seria uma ferramenta que a conta do estoque não vê sair.
 */
const schemaEmprestimo = z.object({
  pecaId: z.string().min(1, 'Escolha a ferramenta.'),
  quantidade: z.coerce.number().positive('A quantidade precisa ser maior que zero.').default(1),
  responsavelId: z.string().trim().min(1, 'Escolha quem está levando a ferramenta.'),
  ordemId: z.string().trim().nullish(),
  previstoPara: z.string().trim().nullish(),
  observacao: z.string().trim().nullish(),
})

export async function emprestarFerramenta(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não movimenta ferramenta.' }
  }

  const d = schemaEmprestimo.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const peca = await tx.peca.findUnique({
      where: { id: v.pecaId },
      select: { id: true, nome: true, tipo: true },
    })
    if (!peca) return { ok: false as const, motivo: 'Item não encontrado nesta empresa.' }
    /**
     * Só FERRAMENTA se empresta, e a recusa é explicada.
     *
     * Emprestar uma peça de consumo é um pedido que parece razoável e não é:
     * a peça sairia do disponível para sempre, esperando uma devolução que
     * nunca vem, e a O.S. que precisasse dela veria falta de estoque sem
     * nenhuma pista do motivo.
     */
    if (peca.tipo !== 'FERRAMENTA') {
      return {
        ok: false as const,
        motivo: `"${peca.nome}" está cadastrado como ${peca.tipo === 'PECA' ? 'peça' : 'insumo'}, e peça não volta. Empréstimo é só de ferramenta — mude o tipo no cadastro se for o caso.`,
      }
    }

    // O responsável vem da equipe da própria empresa: o `findUnique` roda
    // dentro do escopo, então um id de outra franquia não é achado aqui.
    const quem = await tx.user.findUnique({
      where: { id: v.responsavelId },
      select: { id: true, nome: true, ativo: true },
    })
    if (!quem || !quem.ativo) {
      return { ok: false as const, motivo: 'Pessoa não encontrada na equipe desta empresa.' }
    }

    const mov = await movimentar(tx, exigirEmpresa(a.ctx), a.ator, {
      pecaId: v.pecaId,
      tipo: TipoMovimentoEstoque.EMPRESTIMO,
      quantidade: v.quantidade,
      ordemId: v.ordemId || null,
      motivo: `Saiu com ${quem.nome}${v.observacao ? ` — ${v.observacao}` : ''}`,
    })
    if (!mov.ok) return { ok: false as const, motivo: mov.motivo }

    const emprestimo = await tx.emprestimoFerramenta.create({
      data: {
        tenantId: exigirEmpresa(a.ctx),
        pecaId: v.pecaId,
        quantidade: new Prisma.Decimal(v.quantidade),
        responsavelId: quem.id,
        responsavelNome: quem.nome,
        ordemId: v.ordemId || null,
        // A data vem como 'aaaa-mm-dd' do campo de data; `new Date` sobre ela
        // resolve em UTC, e é o que o resto do sistema já faz com prazo.
        previstoPara: v.previstoPara ? new Date(`${v.previstoPara}T12:00:00`) : null,
        observacao: v.observacao || null,
        registradoPorId: a.ator.id,
        registradoPorNome: a.ator.nome,
      },
      select: { id: true },
    })

    return { ok: true as const, id: emprestimo.id, nome: peca.nome, quem: quem.nome }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'ferramenta.emprestada',
    entidade: 'emprestimo_ferramenta',
    entidadeId: r.id,
    detalhes: { peca: r.nome, responsavel: r.quem, quantidade: v.quantidade },
  })
  revalidatePath('/painel/estoque')
  return { ok: true }
}

const schemaDevolucao = z.object({
  emprestimoId: z.string().min(1),
  condicaoVolta: z.string().trim().nullish(),
})

/**
 * A DEVOLUÇÃO — e a condição em que a ferramenta voltou.
 *
 * O campo da condição é opcional e existe por um motivo só: é aqui que "voltou
 * sem a ponteira" fica escrito no dia em que aconteceu, e não na discussão de
 * três meses depois, quando ninguém lembra quem foi o último a levar.
 */
export async function devolverFerramenta(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await atorDaSessao()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (!PODE_MEXER.includes(a.sessao.papel)) {
    return { ok: false, motivo: 'Seu perfil não movimenta ferramenta.' }
  }

  const d = schemaDevolucao.safeParse(Object.fromEntries(form))
  if (!d.success) return { ok: false, motivo: d.error.issues[0]!.message }
  const v = d.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const emp = await tx.emprestimoFerramenta.findUnique({
      where: { id: v.emprestimoId },
      select: {
        id: true,
        pecaId: true,
        quantidade: true,
        devolvidoEm: true,
        responsavelNome: true,
        peca: { select: { nome: true } },
      },
    })
    if (!emp) return { ok: false as const, motivo: 'Empréstimo não encontrado nesta empresa.' }
    // Devolver duas vezes somaria a ferramenta de volta duas vezes e o
    // disponível passaria do patrimônio. A recusa diz o que já aconteceu.
    if (emp.devolvidoEm) {
      return { ok: false as const, motivo: 'Esta ferramenta já foi devolvida.' }
    }

    const mov = await movimentar(tx, exigirEmpresa(a.ctx), a.ator, {
      pecaId: emp.pecaId,
      tipo: TipoMovimentoEstoque.DEVOLUCAO,
      quantidade: Number(emp.quantidade),
      motivo: `Devolvida por ${emp.responsavelNome}${v.condicaoVolta ? ` — ${v.condicaoVolta}` : ''}`,
    })
    if (!mov.ok) return { ok: false as const, motivo: mov.motivo }

    await tx.emprestimoFerramenta.update({
      where: { id: emp.id },
      data: { devolvidoEm: new Date(), condicaoVolta: v.condicaoVolta || null },
    })

    return { ok: true as const, id: emp.id, nome: emp.peca.nome, quem: emp.responsavelNome }
  })
  if (!r.ok) return r

  await auditar(a.ctx, a.sessao, {
    acao: 'ferramenta.devolvida',
    entidade: 'emprestimo_ferramenta',
    entidadeId: r.id,
    detalhes: { peca: r.nome, responsavel: r.quem, condicao: v.condicaoVolta ?? null },
  })
  revalidatePath('/painel/estoque')
  return { ok: true }
}
