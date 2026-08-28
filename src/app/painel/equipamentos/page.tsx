import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirSessao, exigirAba, podeVer } from '@/server/auth/guarda'
import { listarClientes, listarEquipamentos } from '@/server/consultas/listas'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import FotoCatalogo from '../foto-catalogo'
import FormularioEquipamento from './formulario'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Equipamentos', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O parque de equipamentos atendidos.
 *
 * A coluna que importa é a última visita: é ela que transforma a lista num
 * histórico. Saber que a autoclave da clínica X já passou aqui três vezes em um
 * ano muda a conversa sobre o quarto orçamento.
 */
export default async function Equipamentos({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; novo?: string }>
}) {
  const { ctx, sessao } = await exigirSessao()
  // Esta tela é aberta a qualquer papel, inclusive ao motorista — ele precisa
  // reconhecer o aparelho que vai buscar. Mas CADASTRAR foto é do técnico para
  // cima: é a mesma linha que `PODE_MEXER` do estoque desenha, e a foto do
  // catálogo é cadastro como qualquer outro.
  const podeMexer = podeVer(sessao.papel, Papel.TECNICO)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('equipamentos')
  const q = await searchParams

  const [equipamentos, clientes] = await Promise.all([
    listarEquipamentos(ctx, q.busca),
    q.novo ? listarClientes(ctx) : Promise.resolve([]),
  ])

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Cadastros</p>
          <h1 className={estilo.titulo}>Equipamentos</h1>
        </div>
        <Link href={q.novo ? '/painel/equipamentos' : '/painel/equipamentos?novo=1'} className={estilo.btnPrimario}>
          {q.novo ? 'Fechar formulário' : 'Cadastrar equipamento'}
        </Link>
      </div>

      {q.novo ? (
        <FormularioEquipamento clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
      ) : null}

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={q.busca ?? ''}
            placeholder="Marca, modelo, série, categoria ou cliente"
            aria-label="Buscar equipamentos"
          />
        </div>
        <button type="submit" className={estilo.btn}>
          Buscar
        </button>
      </form>

      {equipamentos.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhum equipamento com esses critérios. Eles também entram sozinhos
          quando uma ordem de retirada é aberta.
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                {/* A foto abre a linha: quem confere o aparelho que o cliente
                    descreve por telefone reconhece a imagem antes de ler a
                    marca. */}
                <th>
                  <span className={estilo.soLeitor}>Foto</span>
                </th>
                <th>Equipamento</th>
                <th>Série</th>
                <th>Cliente</th>
                <th>Última passagem</th>
                <th className={estilo.dir}>Visitas</th>
              </tr>
            </thead>
            <tbody>
              {equipamentos.map((e) => {
                const ultima = e.ordens[0]
                return (
                  <tr key={e.id}>
                    <td>
                      <FotoCatalogo
                        tipo="equipamento"
                        id={e.id}
                        nome={`${e.marca} ${e.modelo}`}
                        tem={Boolean(e.fotoCaminho)}
                        podeMexer={podeMexer}
                      />
                    </td>
                    <td>
                      {/* O nome do aparelho abre o PRONTUÁRIO dele — toda a
                          vida da máquina, e não a última ordem. É a máquina que
                          carrega o histórico: o cliente troca de dono, a
                          autoclave continua a mesma. */}
                      <Link href={`/painel/equipamentos/${e.id}`} className={estilo.forte}>
                        {e.marca} {e.modelo}
                      </Link>
                      {e.categoria ? <div className={estilo.fraco}>{e.categoria}</div> : null}
                    </td>
                    <td className={estilo.num}>{e.numeroSerie ?? <span className={estilo.fraco}>sem série</span>}</td>
                    <td>{e.cliente.nome}</td>
                    <td>
                      {ultima ? (
                        <>
                          <Link href={`/painel/ordens/${ultima.id}`}>#{String(ultima.numero).padStart(4, '0')}</Link>
                          <div className={estilo.fraco}>{ROTULO_ETAPA[ultima.etapa]}</div>
                        </>
                      ) : (
                        <span className={estilo.fraco}>nunca veio</span>
                      )}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{e._count.ordens}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
