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
        <div className={estilo.catalogoGrade}>
          {/* =====================================================================
            O CATÁLOGO, e não a tabela
            =====================================================================
            A tabela punha a foto numa coluna de 52 px, ao lado de marca, série,
            cliente e contagem de visitas. Ou seja: tratava a imagem como mais
            um campo.

            Só que reconhecer aparelho não é ler campo. O mesmo modelo muda de
            cara entre gerações, o cliente descreve o dele pela aparência, e
            quem procura na tela está tentando responder UMA pergunta: "é este?".
            Numa tabela essa resposta chega em sexto lugar.

            Aqui a foto é o assunto do cartão, grande o bastante para valer. O
            resto do dado continua todo lá — o que mudou foi a ordem de leitura,
            e ela agora é a ordem em que a pessoa realmente procura.
            ===================================================================== */}
          {equipamentos.map((e) => {
            const ultima = e.ordens[0]
            return (
              <article key={e.id} className={estilo.catalogoCartao}>
                <FotoCatalogo
                  tipo="equipamento"
                  id={e.id}
                  nome={`${e.marca} ${e.modelo}`}
                  tem={Boolean(e.fotoCaminho)}
                  podeMexer={podeMexer}
                  grande
                />

                <div className={estilo.catalogoCorpo}>
                  {/* O nome abre o PRONTUÁRIO do aparelho — toda a vida da
                      máquina, e não a última ordem. É a máquina que carrega o
                      histórico: o cliente troca de dono, a autoclave continua a
                      mesma. */}
                  <Link href={`/painel/equipamentos/${e.id}`} className={estilo.catalogoNome}>
                    {e.marca} {e.modelo}
                  </Link>

                  <p className={estilo.dica}>
                    {e.numeroSerie ? `nº ${e.numeroSerie}` : 'sem número de série'}
                    {e.categoria ? ` · ${e.categoria}` : ''}
                  </p>

                  <p className={estilo.catalogoDono}>{e.cliente.nome}</p>

                  <p className={estilo.dica}>
                    {ultima ? (
                      <>
                        última:{' '}
                        <Link href={`/painel/ordens/${ultima.id}`}>
                          #{String(ultima.numero).padStart(4, '0')}
                        </Link>{' '}
                        · {ROTULO_ETAPA[ultima.etapa]}
                      </>
                    ) : (
                      'nunca veio para conserto'
                    )}
                  </p>

                  {/* O número de passagens é o que separa o aparelho problema do
                      aparelho normal — e era uma coluna que ninguém somava. */}
                  <p className={estilo.dica}>
                    {e._count.ordens === 0
                      ? 'nenhuma passagem'
                      : e._count.ordens === 1
                        ? '1 passagem pela oficina'
                        : `${e._count.ordens} passagens pela oficina`}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
