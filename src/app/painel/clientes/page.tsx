import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba } from '@/server/auth/guarda'
import { listarClientes } from '@/server/consultas/listas'
import FormularioCliente from './formulario'
import AcoesDoCliente from './acoes'
import Planilha from './planilha'
import { formatarDocumento, formatarTelefone } from '@/lib/documentos'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Clientes', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; novo?: string; arquivados?: string }>
}) {
  /**
   * A carteira inteira é o dado mais sensível do sistema: nome, CPF/CNPJ,
   * telefone e endereço de todos os clientes numa tela só. A rota que exporta
   * isso em CSV já dizia, no próprio comentário, que "nem técnico nem
   * motorista" — mas a TELA pedia só sessão, e o menu a oferecia a eles.
   *
   * Agora a régua é a mesma nos dois lugares. Quem trabalha numa ordem
   * específica continua vendo o cliente daquela ordem, na ficha dela; o que
   * some é a lista de todo mundo.
   */
  const { ctx, sessao } = await exigirNivel(Papel.ATENDENTE)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('clientes')
  // A mesma lista da rota `/painel/clientes/exportar`. Repetida de propósito:
  // se um dia divergirem, o pior que acontece é o botão sumir para quem podia,
  // nunca aparecer para quem não pode.
  const PODE_EXPORTAR: Papel[] = [Papel.SUPER_ADMIN, Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.ATENDENTE]
  const podeExportar = PODE_EXPORTAR.includes(sessao.papel)
  const q = await searchParams
  /**
   * Os ARQUIVADOS só aparecem quando alguém pede.
   *
   * Eles não somem do banco — some da vista. Mas a carteira do dia a dia é a
   * dos clientes ativos, e misturar os dois faria a lista crescer com nomes que
   * ninguém vai atender. A caixa existe para o dia em que alguém precisa achar
   * um arquivado para reativar.
   */
  const verArquivados = q.arquivados === '1'
  const clientes = await listarClientes(ctx, q.busca, verArquivados)

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
      <Planilha podeExportar={podeExportar} />

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
        <label className={estilo.rotulo} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" name="arquivados" value="1" defaultChecked={verArquivados} />
          mostrar arquivados
        </label>
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
                {/* A coluna dos botões: rótulo invisível na tela, presente para
                    quem navega a tabela por leitor de tela. Um `<th>` vazio faz
                    a tabela inteira perder o cabeçalho. */}
                <th>
                  <span className={estilo.soLeitor}>Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className={c.ativo ? undefined : estilo.linhaArquivada}>
                  <td>
                    {/* O nome leva à FICHA. Até agora a lista era um beco: dava
                        para ver que o cliente existe e não dava para abrir o
                        que se sabe sobre ele. Quem procura um cliente numa
                        lista está indo para algum lugar. */}
                    <Link href={`/painel/clientes/${c.id}`} className={estilo.forte}>
                      {c.nome}
                    </Link>
                    {c.ativo ? null : (
                      <span className={`${estilo.tag} ${estilo.tagNeutra}`}> arquivado</span>
                    )}
                    {c.contatoNome ? <div className={estilo.fraco}>contato: {c.contatoNome}</div> : null}
                  </td>
                  <td className={estilo.num}>{formatarDocumento(c.documento)}</td>
                  <td className={estilo.num}>{c.whatsapp ? formatarTelefone(c.whatsapp) : '—'}</td>
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
                  <td>
                    <AcoesDoCliente id={c.id} nome={c.nome} whatsapp={c.whatsapp} ativo={c.ativo} />
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

