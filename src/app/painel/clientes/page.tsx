import Link from 'next/link'
import type { Metadata } from 'next'
import { exigirSessao } from '@/server/auth/guarda'
import { listarClientes } from '@/server/consultas/listas'
import FormularioCliente from './formulario'
import Planilha from './planilha'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Clientes', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; novo?: string }>
}) {
  const { ctx } = await exigirSessao()
  const q = await searchParams
  const clientes = await listarClientes(ctx, q.busca)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Cadastros</p>
          <h1 className={estilo.titulo}>Clientes</h1>
        </div>
        <Link href={q.novo ? '/painel/clientes' : '/painel/clientes?novo=1'} className={estilo.btnPrimario}>
          {q.novo ? 'Fechar formulário' : 'Cadastrar cliente'}
        </Link>
      </div>

      {q.novo ? <FormularioCliente /> : null}

      {/* Exportar e importar. Fica acima da busca porque é operação sobre a
          carteira INTEIRA, e não sobre o que o filtro mostra — colocá-la depois
          da busca sugeriria que exporta só o resultado filtrado. */}
      <Planilha />

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={q.busca ?? ''}
            placeholder="Nome, CNPJ ou cidade"
            aria-label="Buscar clientes"
          />
        </div>
        <button type="submit" className={estilo.btn}>
          Buscar
        </button>
      </form>

      {clientes.length === 0 ? (
        <p className={estilo.vazio}>
          {q.busca
            ? 'Nenhum cliente com esse nome ou documento.'
            : 'Nenhum cliente cadastrado ainda. O primeiro costuma entrar sozinho, junto com a primeira ordem de retirada.'}
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>WhatsApp</th>
                <th>Cidade</th>
                <th className={estilo.dir}>Equipamentos</th>
                <th className={estilo.dir}>Ordens</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={estilo.forte}>{c.nome}</span>
                    {c.contatoNome ? <div className={estilo.fraco}>contato: {c.contatoNome}</div> : null}
                  </td>
                  <td className={estilo.num}>{formatarDoc(c.documento)}</td>
                  <td className={estilo.num}>{c.whatsapp ? telefone(c.whatsapp) : '—'}</td>
                  <td>
                    {c.cidade ?? '—'}
                    {c.uf ? `/${c.uf}` : ''}
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{c._count.equipamentos}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>
                    <Link href={`/painel/ordens?busca=${encodeURIComponent(c.nome)}&situacao=todas`}>
                      {c._count.ordens}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** Documento formatado por extenso: aqui é tela de cadastro, e o operador
 *  precisa conferir o número inteiro contra o contrato que tem na mão. */
function formatarDoc(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

function telefone(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}
