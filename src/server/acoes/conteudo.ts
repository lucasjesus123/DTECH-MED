'use server'

import { revalidatePath } from 'next/cache'
import { Papel } from '@/generated/prisma/enums'
import { esquemaConteudo, type Conteudo } from '@/lib/conteudo'
import { comEscopo, type ContextoAcesso } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { contextoDe, lerSessao, type Sessao } from '@/server/auth/sessao'

/**
 * Gravar o conteúdo do site.
 *
 * ---------------------------------------------------------------------------
 * TRÊS TRAVAS, E CADA UMA PEGA UMA COISA DIFERENTE
 * ---------------------------------------------------------------------------
 *  1. **Quem.** Só Super Admin. Conferido aqui, e conferido de novo pelo banco:
 *     a política de RLS da tabela exige a marca na conexão. Um erro nesta
 *     função não abre a porta sozinho.
 *  2. **O quê.** O conteúdo passa pelo mesmo esquema que a leitura usa. Sem
 *     isso, dava para gravar uma chamada de dez mil caracteres pelo navegador
 *     e derrubar o layout da home para todo mundo.
 *  3. **Em cima de quê.** A tela manda a versão que ela carregou. Se o banco
 *     estiver noutra, alguém salvou no meio — e a gravação para, em vez de
 *     apagar o trabalho do outro sem ninguém perceber.
 *
 * ---------------------------------------------------------------------------
 * O HISTÓRICO É GRAVADO ANTES
 * ---------------------------------------------------------------------------
 * A versão anterior vai para o histórico na MESMA transação, antes de o
 * conteúdo novo entrar. Se a gravação falhar no meio, as duas coisas voltam
 * atrás juntas — nunca fica um histórico sem o conteúdo que ele deveria
 * acompanhar, nem conteúdo novo sem o registro do que havia antes.
 */

type Resposta =
  | { ok: true; versao: number; mensagem: string }
  | { ok: false; motivo: string; conflito?: boolean }

type Dono =
  | { erro: string; sessao?: undefined; ctx?: undefined }
  | { erro?: undefined; sessao: Sessao; ctx: ContextoAcesso }

async function exigirDono(): Promise<Dono> {
  const sessao = await lerSessao()
  if (!sessao) return { erro: 'Sessão expirada. Entre de novo.' }
  if (sessao.papel !== Papel.SUPER_ADMIN) {
    return { erro: 'Só o administrador da plataforma edita o site.' }
  }
  return { sessao, ctx: contextoDe(sessao) }
}

export async function salvarConteudo(
  entrada: { conteudo: unknown; versaoBase: number; nota?: string },
): Promise<Resposta> {
  const a = await exigirDono()
  if (a.erro !== undefined) return { ok: false, motivo: a.erro }

  const conferido = esquemaConteudo.safeParse(entrada.conteudo)
  if (!conferido.success) {
    const i = conferido.error.issues[0]
    return {
      ok: false,
      motivo: i ? `${caminhoLegivel(i.path)}: ${i.message}` : 'Conteúdo em formato inesperado.',
    }
  }
  const novo: Conteudo = conferido.data

  const r = await comEscopo(a.ctx, async (tx) => {
    const atual = await tx.conteudoSite.findUnique({ where: { id: 'site' } })

    // Primeira gravação de todas: não há o que conferir nem o que arquivar.
    if (!atual) {
      const criado = await tx.conteudoSite.create({
        data: { id: 'site', dados: novo, versao: 1, atualizadoPorId: a.sessao.userId },
      })
      return { ok: true as const, versao: criado.versao }
    }

    if (atual.versao !== entrada.versaoBase) {
      return {
        ok: false as const,
        conflito: true,
        motivo:
          `Alguém salvou o site enquanto esta tela estava aberta (versão ${atual.versao}, ` +
          `esta é a ${entrada.versaoBase}). Recarregue para não apagar o trabalho da outra pessoa.`,
      }
    }

    await tx.conteudoSiteVersao.create({
      data: {
        siteId: 'site',
        versao: atual.versao,
        dados: atual.dados as object,
        autorId: atual.atualizadoPorId,
        autorNome: a.sessao.nome,
        nota: entrada.nota?.slice(0, 200) || null,
      },
    })

    const salvo = await tx.conteudoSite.update({
      where: { id: 'site' },
      data: { dados: novo, versao: { increment: 1 }, atualizadoPorId: a.sessao.userId },
    })
    return { ok: true as const, versao: salvo.versao }
  })

  if (!r.ok) return { ok: false, motivo: r.motivo, conflito: r.conflito }

  await auditar(a.ctx, a.sessao, {
    acao: 'site.conteudo.salvo',
    entidade: 'conteudo_site',
    entidadeId: 'site',
    detalhes: { versao: r.versao },
  })

  // O site é renderizado a cada requisição, mas a raiz é revalidada por
  // garantia: se um dia ela ganhar cache, a edição continua aparecendo na hora.
  revalidatePath('/')
  return { ok: true, versao: r.versao, mensagem: `Site salvo. Versão ${r.versao}.` }
}

/** As últimas gravações, para a tela de "voltar para uma versão anterior". */
export async function listarVersoes() {
  const a = await exigirDono()
  if (a.erro !== undefined) return []

  return comEscopo(a.ctx, (tx) =>
    tx.conteudoSiteVersao.findMany({
      where: { siteId: 'site' },
      orderBy: { versao: 'desc' },
      take: 20,
      select: { id: true, versao: true, autorNome: true, nota: true, criadoEm: true },
    }),
  )
}

/**
 * Volta o site para uma versão anterior.
 *
 * Restaurar NÃO apaga o histórico nem "desfaz" as gravações que vieram depois:
 * ela grava o conteúdo antigo como uma versão NOVA. Assim a linha do tempo
 * continua inteira e dá para voltar da volta — que é exatamente o que alguém
 * quer no minuto seguinte a ter restaurado a versão errada.
 */
export async function restaurarVersao(id: string): Promise<Resposta> {
  const a = await exigirDono()
  if (a.erro !== undefined) return { ok: false, motivo: a.erro }

  const r = await comEscopo(a.ctx, async (tx) => {
    const alvo = await tx.conteudoSiteVersao.findUnique({ where: { id } })
    if (!alvo || alvo.siteId !== 'site') {
      return { ok: false as const, motivo: 'Versão não encontrada.' }
    }

    const atual = await tx.conteudoSite.findUnique({ where: { id: 'site' } })
    if (!atual) return { ok: false as const, motivo: 'Não há conteúdo publicado para substituir.' }

    await tx.conteudoSiteVersao.create({
      data: {
        siteId: 'site',
        versao: atual.versao,
        dados: atual.dados as object,
        autorId: atual.atualizadoPorId,
        autorNome: a.sessao.nome,
        nota: `substituída ao restaurar a versão ${alvo.versao}`,
      },
    })

    const salvo = await tx.conteudoSite.update({
      where: { id: 'site' },
      data: {
        dados: alvo.dados as object,
        versao: { increment: 1 },
        atualizadoPorId: a.sessao.userId,
      },
    })
    return { ok: true as const, versao: salvo.versao, de: alvo.versao }
  })

  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: 'site.conteudo.restaurado',
    entidade: 'conteudo_site',
    entidadeId: 'site',
    detalhes: { de: r.de, virou: r.versao },
  })
  revalidatePath('/')
  return { ok: true, versao: r.versao, mensagem: `Site voltou para a versão ${r.de}.` }
}

/**
 * "dobra.provas.2.rotulo" é onde o erro está, mas não é o que a pessoa lê na
 * tela. Traduz o caminho técnico para o nome da aba e do campo.
 */
function caminhoLegivel(caminho: ReadonlyArray<PropertyKey>): string {
  const nomes: Record<string, string> = {
    identidade: 'Identidade',
    contato: 'Contato',
    endereco: 'Endereço',
    redes: 'Redes',
    dobra: 'Primeira dobra',
    marcas: 'Marcas',
    servicos: 'Serviços',
    especialidades: 'Especialidades',
    prontuario: 'Prontuário',
    sobre: 'A empresa',
    google: 'Google',
    bastidores: 'Bastidores',
    formulario: 'Formulário',
    onde: 'Onde estamos',
    seo: 'Busca',
  }
  const [secao, ...resto] = caminho.map(String)
  return [nomes[secao ?? ''] ?? secao, ...resto].filter(Boolean).join(' → ')
}
