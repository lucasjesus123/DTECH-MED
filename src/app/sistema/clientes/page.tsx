import Link from 'next/link'
import { listarClientes } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import {
  CabecalhoTela,
  Chip,
  EmptyState,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * CLIENTES — o mesmo esqueleto de tela-lista.
 *
 * Quatro números, busca, e as linhas com a ação-da-vez. Aqui a ação-da-vez não
 * é um passo da esteira: é ABRIR UMA O.S. para aquele cliente, que é o que
 * alguém quase sempre vem fazer nesta tela. Quem entra em Clientes raramente
 * quer ler um cadastro — quer atender um telefonema.
 */
export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; arquivados?: string }>
}) {
  const { ctx } = await exigirTela('clientes')
  const q = await searchParams
  const comArquivados = q.arquivados === 'sim'

  const clientes = await listarClientes(ctx, q.busca, comArquivados)

  const pj = clientes.filter((c) => c.tipo === 'PJ').length
  const comOrdem = clientes.filter((c) => c._count.ordens > 0).length
  const aparelhos = clientes.reduce((s, c) => s + c._count.equipamentos, 0)

  const stats: Stat[] = [
    { rotulo: 'Nesta lista', valor: clientes.length, apoio: comArquivados ? 'com arquivados' : 'ativos', icone: 'clientes' },
    { rotulo: 'Clínicas e empresas', valor: pj, apoio: 'pessoa jurídica', icone: 'usuarios' },
    { rotulo: 'Já atendidos', valor: comOrdem, apoio: 'com ao menos uma O.S.', tom: 'info', icone: 'ordens' },
    { rotulo: 'Aparelhos', valor: aparelhos, apoio: 'no cadastro deles', icone: 'equipamentos' },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Clientes"
        apoio="Quem manda o aparelho — e o histórico de cada um."
        acao={
          <Link href="/sistema/ordens/nova" className={estilo.acao}>
            Abrir O.S.
          </Link>
        }
      />

      <StatCardRow stats={stats} />

      <form className={estilo.barraLista} method="get">
        <input
          className={estilo.campoBusca}
          type="search"
          name="busca"
          defaultValue={q.busca ?? ''}
          placeholder="Nome, CNPJ, CPF ou cidade"
          aria-label="Buscar clientes"
        />
        <select className={estilo.filtro} name="arquivados" defaultValue={q.arquivados ?? 'nao'}>
          <option value="nao">Só ativos</option>
          <option value="sim">Incluir arquivados</option>
        </select>
        <button type="submit" className={estilo.acaoLinha}>
          Filtrar
        </button>
      </form>

      {clientes.length === 0 ? (
        <EmptyState
          titulo={q.busca ? 'Nada com esse termo' : 'Nenhum cliente ainda'}
          bom={!q.busca}
          apoio={
            q.busca
              ? 'Tente o nome, o CNPJ ou a cidade.'
              : 'O primeiro cliente nasce junto com a primeira O.S. — não precisa cadastrar antes.'
          }
        />
      ) : (
        <div className={estilo.radar}>
          {clientes.map((c) => (
            <div key={c.id} className={estilo.linha}>
              <div className={estilo.linhaTxt}>
                <div className={estilo.linhaTopo}>
                  <Link href={`/sistema/clientes/${c.id}`} className={estilo.linhaTitulo}>
                    {c.nome}
                  </Link>
                  <Chip tom="pending">{c.tipo === 'PJ' ? 'Empresa' : 'Pessoa'}</Chip>
                  {!c.ativo ? <Chip tom="warn">Arquivado</Chip> : null}
                </div>
                <div className={estilo.linhaApoio}>
                  <span>
                    {[c.cidade, c.uf].filter(Boolean).join('/') || 'sem cidade'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {c._count.ordens} {c._count.ordens === 1 ? 'O.S.' : 'O.S.'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {c._count.equipamentos}{' '}
                    {c._count.equipamentos === 1 ? 'aparelho' : 'aparelhos'}
                  </span>
                  {c.contatoNome ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>fala com {c.contatoNome}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className={estilo.linhaAcao}>
                <Link
                  href={`/sistema/ordens/nova?cliente=${c.id}`}
                  className={estilo.acao}
                >
                  Abrir O.S.
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
