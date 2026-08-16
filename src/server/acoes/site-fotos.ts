'use server'

import { revalidatePath } from 'next/cache'
import { Papel } from '@/generated/prisma/enums'
import { type ContextoAcesso } from '@/lib/db'
import { auditar } from '@/server/auth/guarda'
import { apagarFotoDoSite, guardarFotoDoSite, versaoFotoDoSite } from '@/server/arquivos/storage'
import { contextoDe, lerSessao, type Sessao } from '@/server/auth/sessao'
import { FOTOS } from '@/app/foto'

/**
 * As fotos do site, enviadas pelo painel.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO ENTRA NO CONTEÚDO NEM NO HISTÓRICO
 * ---------------------------------------------------------------------------
 * O texto do site é gravado num campo JSON, versionado, e dá para voltar
 * atrás. A foto não segue esse caminho, e a escolha é deliberada.
 *
 * Guardar cada versão de cada foto significaria acumular arquivos de 2 MB
 * indefinidamente num volume que também guarda as fotos de todas as ordens de
 * serviço. E o "voltar atrás" que interessa aqui já existe de outro jeito, mais
 * simples de entender: **tirar a foto enviada faz o site voltar sozinho para a
 * que veio de fábrica.**
 *
 * O que isso custa está dito na tela, e não escondido: restaurar uma versão
 * antiga do texto não traz as fotos antigas de volta.
 *
 * ---------------------------------------------------------------------------
 * O SLOT NÃO É UM NOME DE ARQUIVO
 * ---------------------------------------------------------------------------
 * Quem envia escolhe um LUGAR na página — a foto da primeira dobra, a da
 * bancada — e o servidor decide o arquivo. O nome que chega do navegador é
 * conferido contra a lista declarada no código antes de qualquer coisa; não é
 * higienizado, é comparado. Nome que não está na lista não vira caminho
 * nenhum, porque não vira caminho.
 */

type Resposta = { ok: true; mensagem: string } | { ok: false; motivo: string }

type Dono =
  | { erro: string; sessao?: undefined; ctx?: undefined }
  | { erro?: undefined; sessao: Sessao; ctx: ContextoAcesso }

async function exigirDono(): Promise<Dono> {
  const sessao = await lerSessao()
  if (!sessao) return { erro: 'Sessão expirada. Entre de novo.' }
  if (sessao.papel !== Papel.SUPER_ADMIN) {
    return { erro: 'Só o administrador da plataforma troca as fotos do site.' }
  }
  return { sessao, ctx: contextoDe(sessao) }
}

/** Os lugares de foto que a tela oferece, com o nome que o dono lê. */
export type SlotFoto = { slot: string; rotulo: string; ajuda: string; enviada: boolean }

export async function listarFotosDoSite(): Promise<SlotFoto[]> {
  const a = await exigirDono()
  if (a.erro !== undefined) return []
  return LUGARES.map((l) => ({ ...l, enviada: versaoFotoDoSite(l.slot) !== null }))
}

const LUGARES: ReadonlyArray<{ slot: string; rotulo: string; ajuda: string }> = [
  {
    slot: 'oficina',
    rotulo: 'Primeira dobra',
    ajuda:
      'A foto que ocupa a tela inteira quando alguém abre o site. É a mais importante de todas. Horizontal, com a assistência trabalhando.',
  },
  {
    slot: 'bancada',
    rotulo: 'Bancada (prontuário)',
    ajuda: 'Mão de técnico com ferramenta dentro do aparelho. Aparece ao lado da explicação do prontuário.',
  },
  { slot: 'estetica', rotulo: 'Equipamento estético', ajuda: 'Um aparelho de estética em atendimento.' },
  { slot: 'medico', rotulo: 'Equipamento médico', ajuda: 'Placa, circuito ou aparelho médico aberto na bancada.' },
  {
    slot: 'odontologico',
    rotulo: 'Equipamento odontológico',
    ajuda: 'Cadeira, autoclave ou caneta de alta rotação. Este ainda não tem foto.',
  },
  { slot: 'hospitalar', rotulo: 'Equipamento hospitalar', ajuda: 'Aparelho de grande porte, de preferência aberto.' },
  {
    slot: 'logistica',
    rotulo: 'Transporte',
    ajuda: 'A van, ou a caixa lacrada saindo. Mostra que vocês buscam e entregam.',
  },
  {
    slot: 'bancada2',
    rotulo: 'Bancada (segunda)',
    ajuda: 'Outra cena de bancada, para o carrossel dos bastidores não repetir tão cedo.',
  },
  { slot: 'detalhe', rotulo: 'Trabalho de precisão', ajuda: 'Um close do serviço fino: solda, composto, peça pequena.' },
]

export async function enviarFotoDoSite(dados: FormData): Promise<Resposta> {
  const a = await exigirDono()
  if (a.erro !== undefined) return { ok: false, motivo: a.erro }

  const slot = String(dados.get('slot') ?? '')
  // Comparada com a lista do código, não higienizada. Ver o cabeçalho.
  if (!(slot in FOTOS)) return { ok: false, motivo: 'Lugar de foto desconhecido.' }

  const arquivo = dados.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, motivo: 'Escolha um arquivo de imagem.' }

  const r = await guardarFotoDoSite({ slot, arquivo })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  await auditar(a.ctx, a.sessao, {
    acao: 'site.foto.enviada',
    entidade: 'conteudo_site',
    entidadeId: slot,
    detalhes: { largura: r.largura, altura: r.altura, bytes: r.bytes },
  })

  revalidatePath('/')
  return {
    ok: true,
    mensagem: `Foto trocada (${r.largura}×${r.altura}). Recarregue a prévia para ver.`,
  }
}

export async function removerFotoDoSite(slot: string): Promise<Resposta> {
  const a = await exigirDono()
  if (a.erro !== undefined) return { ok: false, motivo: a.erro }
  if (!(slot in FOTOS)) return { ok: false, motivo: 'Lugar de foto desconhecido.' }

  if (versaoFotoDoSite(slot) === null) {
    return { ok: false, motivo: 'Não há foto enviada neste lugar.' }
  }

  await apagarFotoDoSite(slot)

  await auditar(a.ctx, a.sessao, {
    acao: 'site.foto.removida',
    entidade: 'conteudo_site',
    entidadeId: slot,
  })

  revalidatePath('/')
  return { ok: true, mensagem: 'Foto removida. O site voltou para a que veio de fábrica.' }
}
