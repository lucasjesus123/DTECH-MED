import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { redirect } from 'next/navigation'
import { juntarEndereco } from '@/lib/endereco'
import { comEscopo } from '@/lib/db'
import { exigirTela } from '@/server/sistema/guarda'
import type { ClienteAchado } from '@/server/acoes/achar-cliente'
import type { EquipamentoAchado } from '@/server/acoes/achar-equipamento'
import NovaOS from '@/components/sistema/nova-os'
import { CabecalhoTela } from '@/components/sistema/pecas'

/**
 * ABRIR O.S. — a ação-estrela de quem atende.
 *
 * =============================================================================
 * ELA ACEITA CHEGAR JÁ COM CLIENTE OU APARELHO
 * =============================================================================
 * `?cliente=` vem da tela de Clientes; `?equipamento=` vem da de Equipamentos.
 * É o caminho curto de quem já estava olhando a ficha quando o telefone tocou —
 * e sem ele essa pessoa redigita um nome que o sistema já sabe.
 *
 * O id vem da URL, e URL é pedido, nunca permissão: a leitura passa pelo escopo
 * da empresa, e um id de outra franquia simplesmente não é encontrado.
 *
 * =============================================================================
 * QUEM ABRE
 * =============================================================================
 * A central. Técnico e motorista não abrem ordem — e a recusa não é desta tela:
 * as próprias buscas de cliente e de aparelho devolvem vazio para eles, o que é
 * indistinguível de "não achei" e não confirma a existência de ninguém.
 */
export default async function AbrirOS({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; equipamento?: string }>
}) {
  const { ctx, sessao } = await exigirTela('ordens')
  const q = await searchParams

  const podeAbrir =
    sessao.papel === Papel.SUPER_ADMIN ||
    sessao.papel === Papel.ADMIN_EMPRESA ||
    sessao.papel === Papel.GESTOR ||
    sessao.papel === Papel.ATENDENTE
  if (!podeAbrir) redirect('/sistema/sem-permissao')

  let clienteInicial: ClienteAchado | null = null
  if (q.cliente) {
    const c = await comEscopo(ctx, (tx) =>
      tx.cliente.findUnique({
        where: { id: q.cliente },
        select: {
          id: true, nome: true, documento: true, whatsapp: true, telefone: true,
          contatoNome: true, cidade: true, uf: true,
          logradouro: true, numero: true, complemento: true, bairro: true,
          coletaMesmoEndereco: true, coletaLogradouro: true, coletaNumero: true,
          coletaComplemento: true, coletaBairro: true, coletaCidade: true, coletaUf: true,
          _count: { select: { ordens: true } },
        },
      }),
    )
    if (c) {
      clienteInicial = {
        id: c.id,
        nome: c.nome,
        documento: c.documento,
        whatsapp: c.whatsapp ?? c.telefone ?? '',
        contatoNome: c.contatoNome,
        endereco: juntarEndereco(c),
        cidade: c.cidade ?? '',
        ordens: c._count.ordens,
      }
    }
  }

  let equipamentoInicial: EquipamentoAchado | null = null
  if (q.equipamento) {
    const e = await comEscopo(ctx, (tx) =>
      tx.equipamento.findUnique({
        where: { id: q.equipamento },
        select: {
          id: true, marca: true, modelo: true, numeroSerie: true,
          categoria: true, acessorios: true,
          cliente: { select: { id: true, nome: true } },
          _count: { select: { ordens: true } },
        },
      }),
    )
    if (e) {
      equipamentoInicial = {
        id: e.id,
        marca: e.marca,
        modelo: e.modelo,
        numeroSerie: e.numeroSerie,
        categoria: e.categoria,
        acessorios: e.acessorios,
        donoId: e.cliente?.id ?? null,
        donoNome: e.cliente?.nome ?? null,
        ordens: e._count.ordens,
      }
    }
  }

  return (
    <>
      <CabecalhoTela
        titulo="Abrir O.S."
        apoio="Cliente, aparelho, defeito. O resto o sistema faz."
        acao={
          <Link href="/sistema/ordens" className="mono">
            ← Voltar para as ordens
          </Link>
        }
      />
      <NovaOS clienteInicial={clienteInicial} equipamentoInicial={equipamentoInicial} />
    </>
  )
}
