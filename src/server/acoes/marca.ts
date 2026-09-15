'use server'

import { revalidatePath } from 'next/cache'
import { Papel } from '@/generated/prisma/enums'
import { comEscopo, exigirEmpresa } from '@/lib/db'
import { apagarArquivo, guardarLogo } from '@/server/arquivos/storage'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao } from '@/server/auth/sessao'

/**
 * O PAPEL TIMBRADO DA EMPRESA.
 *
 * =============================================================================
 * A COLUNA EXISTIA E NINGUÉM ESCREVIA NELA
 * =============================================================================
 * `tenant.logoUrl` está no banco desde o primeiro dia, com o comentário
 * "identidade visual da franquia nos documentos e no portal do cliente". Uma
 * varredura no código inteiro encontrou ZERO leituras e ZERO escritas: nenhuma
 * tela oferecia onde enviar a logo, e o gerador de PDF nunca a procurou.
 *
 * O resultado é o que saía na prática: todo contrato, toda O.S. e toda nota
 * promissória de toda franquia sob o mesmo cabeçalho de texto puro, com a mesma
 * régua roxa. Para uma rede que vai virar franquia, o documento é o único lugar
 * onde a marca do franqueado chega ao cliente final — e era justamente ali que
 * ela não chegava.
 *
 * =============================================================================
 * POR QUE A MARCA NÃO VOLTOU PARA `tenants`
 * =============================================================================
 * A primeira versão desta ação escrevia em `tenants."logoUrl"`, e o banco a
 * recusou com P2025 — "nenhum registro encontrado para atualizar". Não era
 * erro de código: a política da tabela `tenants` é
 *
 *     tenant_admin_write  FOR ALL  USING app.is_super_admin()
 *     tenant_self_read    FOR SELECT  (id = current_tenant OR ...)
 *
 * ou seja, só o dono da plataforma escreve ali. E está certo que seja assim:
 * aquela linha guarda `plano`, `ativo` e `bloqueado`. RLS é por LINHA, não por
 * coluna — liberar UPDATE lá para o administrador da franquia daria a ele o
 * poder de se desbloquear e de trocar o próprio plano, para pôr uma logo.
 *
 * A marca ganhou tabela própria, `marca_empresa`, com a política de sempre. O
 * franqueado manda na identidade visual dele sem encostar no contrato
 * comercial dele.
 *
 * =============================================================================
 * QUEM MEXE, E POR QUE É MAIS RESTRITO QUE EMITIR
 * =============================================================================
 * Do GESTOR para cima, a mesma porta dos modelos de documento. Trocar a logo
 * muda o cabeçalho de TODO papel que a empresa emite daqui para a frente,
 * inclusive contrato assinado e nota promissória. Não é decisão de balcão.
 *
 * =============================================================================
 * O QUE ACONTECE COM OS DOCUMENTOS JÁ EMITIDOS
 * =============================================================================
 * Nada. O PDF é um arquivo gravado com o SHA-256 do conteúdo no instante em que
 * nasceu — trocar a logo hoje não reescreve o contrato que o cliente assinou
 * mês passado, e é assim que tem de ser: o hash guardado é o que prova que
 * aquele papel não foi trocado depois.
 */

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }

/**
 * A cor que pode entrar no PDF, e nada mais.
 *
 * Seis dígitos com a cerquilha, ou nada. O banco confere de novo, por CHECK —
 * esta é a porta, aquela é a tranca, e a tranca existe porque uma segunda
 * porta pode nascer amanhã.
 */
function corSegura(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null
}

const PODE_MEXER: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR]

async function ator() {
  const sessao = await lerSessao()
  if (!sessao) return null
  if (!PODE_MEXER.includes(sessao.papel)) return 'sem-permissao' as const
  return { sessao, ctx: contextoDe(sessao) }
}

export async function salvarLogoDaEmpresa(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a === 'sem-permissao') return { ok: false, motivo: 'Seu perfil não troca o papel timbrado da empresa.' }

  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, motivo: 'Escolha um arquivo de imagem.' }

  const tenantId = exigirEmpresa(a.ctx)

  // A logo ANTIGA é lida antes, para poder apagar o arquivo depois que a linha
  // já apontar para o novo. Apagar antes deixaria a empresa sem marca nenhuma
  // na janela entre as duas operações — curta, mas real.
  const antes = await comEscopo(a.ctx, (tx) =>
    tx.marcaEmpresa.findUnique({ where: { tenantId }, select: { logoCaminho: true } }),
  )

  const r = await guardarLogo({ tenantId, arquivo })
  if (!r.ok) return r

  const dados = {
    logoCaminho: r.caminho,
    logoHash: r.hash,
    logoLargura: r.largura,
    logoAltura: r.altura,
    autorId: a.sessao.userId,
    autorNome: a.sessao.nome,
  }
  // `upsert` porque a primeira troca de logo de uma empresa não tem linha para
  // atualizar — e criar a linha vazia no cadastro da franquia obrigaria a
  // lembrar disso em todo caminho que cria empresa, inclusive nos que já
  // existem.
  await comEscopo(a.ctx, (tx) =>
    tx.marcaEmpresa.upsert({
      where: { tenantId },
      create: { tenantId, ...dados },
      update: dados,
    }),
  )

  // Reenviar a MESMA imagem produz o mesmo hash e o mesmo caminho: sem esta
  // comparação, a limpeza apagaria o arquivo que a linha acabou de passar a
  // referenciar, e a empresa ficaria com a marca quebrada logo depois de
  // reenviar a marca certa.
  if (antes?.logoCaminho && antes.logoCaminho !== r.caminho) await apagarArquivo(antes.logoCaminho)

  await auditar(a.ctx, a.sessao, {
    acao: 'marca.logo_trocada',
    entidade: 'tenant',
    entidadeId: tenantId,
    detalhes: { largura: r.largura, altura: r.altura, bytes: r.bytes },
  })
  revalidatePath('/painel/documentos')
  return { ok: true, mensagem: 'Papel timbrado atualizado. Os próximos documentos já saem com a sua marca.' }
}

/**
 * A COR DO TIMBRE — a régua do papel e os rótulos dos blocos.
 *
 * Separada do envio da logo de propósito: trocar a cor é um clique e não
 * carrega arquivo nenhum. Amarrar as duas num formulário só obrigaria a
 * reenviar a imagem para corrigir um tom.
 */
export async function definirCorDoTimbre(_anterior: Resposta, form: FormData): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a === 'sem-permissao') return { ok: false, motivo: 'Seu perfil não troca o papel timbrado da empresa.' }

  const cor = corSegura(form.get('cor'))
  if (!cor) return { ok: false, motivo: 'Cor fora do formato. Use seis dígitos, como #2b5be0.' }

  const tenantId = exigirEmpresa(a.ctx)
  const dados = { corPrimaria: cor, autorId: a.sessao.userId, autorNome: a.sessao.nome }
  await comEscopo(a.ctx, (tx) =>
    tx.marcaEmpresa.upsert({ where: { tenantId }, create: { tenantId, ...dados }, update: dados }),
  )

  await auditar(a.ctx, a.sessao, {
    acao: 'marca.cor_trocada',
    entidade: 'tenant',
    entidadeId: tenantId,
    detalhes: { cor },
  })
  revalidatePath('/painel/documentos')
  return { ok: true, mensagem: 'Cor do timbre trocada. Vale a partir do próximo documento emitido.' }
}

export async function removerLogoDaEmpresa(): Promise<Resposta> {
  const a = await ator()
  if (!a) return { ok: false, motivo: 'Sessão expirada. Entre de novo.' }
  if (a === 'sem-permissao') return { ok: false, motivo: 'Seu perfil não troca o papel timbrado da empresa.' }

  const tenantId = exigirEmpresa(a.ctx)
  const antes = await comEscopo(a.ctx, (tx) =>
    tx.marcaEmpresa.findUnique({ where: { tenantId }, select: { logoCaminho: true } }),
  )
  if (!antes?.logoCaminho) return { ok: true }

  await comEscopo(a.ctx, (tx) =>
    tx.marcaEmpresa.update({
      where: { tenantId },
      // A linha FICA, zerada: ela guarda quem mexeu e quando, e apagá-la
      // apagaria junto o registro de que existiu uma marca ali.
      data: { logoCaminho: null, logoHash: null, logoLargura: null, logoAltura: null,
              autorId: a.sessao.userId, autorNome: a.sessao.nome },
    }),
  )
  await apagarArquivo(antes.logoCaminho)

  await auditar(a.ctx, a.sessao, { acao: 'marca.logo_removida', entidade: 'tenant', entidadeId: tenantId })
  revalidatePath('/painel/documentos')
  return { ok: true, mensagem: 'Logo retirada. O cabeçalho volta a sair só com o nome da empresa.' }
}
