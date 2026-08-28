import Link from 'next/link'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { listarPecas, ultimosMovimentos } from '@/server/consultas/listas'
import FotoCatalogo from '../foto-catalogo'
import Painel from './painel-estoque'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Estoque', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * Estoque.
 *
 * A coluna que decide se a O.S. anda é **livre**, não saldo: o saldo cheio
 * inclui peça já comprometida com uma ordem aprovada. Mostrar só o saldo faria
 * o técnico prometer material que já tem dono, e a descoberta viria na hora de
 * abrir o aparelho.
 */
export default async function Estoque({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; criticas?: string; peca?: string }>
}) {
  const { ctx, sessao } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO)
  // Quem chega aqui já passou pelo guarda acima, e os três papéis que ele
  // aceita são exatamente os que mexem no catálogo. A constante existe para o
  // componente de foto não precisar refazer a conta — e para o dia em que a
  // lista do guarda mudar e alguém precisar ver, aqui, que a decisão está
  // amarrada a ela.
  const podeMexer = true
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('estoque')
  const q = await searchParams

  const [pecas, movimentos] = await Promise.all([
    listarPecas(ctx, q.busca, q.criticas === '1'),
    ultimosMovimentos(ctx, q.peca),
  ])

  const criticas = pecas.filter((p) => p.critica).length
  const valorParado = pecas.reduce((s, p) => s + p.saldo * p.custoMedioCentavos, 0)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Retaguarda</p>
          <h1 className={estilo.titulo}>Estoque</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Itens cadastrados" valor={String(pecas.length)} nota="peças ativas" />
        <Indicador
          rotulo="No mínimo ou abaixo"
          valor={String(criticas)}
          nota={criticas > 0 ? 'reponha antes de travar uma O.S.' : 'tudo acima do mínimo'}
          alerta={criticas > 0}
        />
        <Indicador
          rotulo="Reservado"
          valor={String(pecas.reduce((s, p) => s + p.reservado, 0))}
          nota="unidades com dono, aguardando execução"
        />
        <Indicador
          rotulo="Valor em prateleira"
          valor={formatarBRL(Math.round(valorParado))}
          nota="pelo custo médio de compra"
        />
      </div>

      <Painel pecas={pecas} podeMexer />

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={q.busca ?? ''}
            placeholder="Código, nome, categoria ou aplicação"
            aria-label="Buscar peças"
          />
        </div>
        <label className={estilo.rotulo} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" name="criticas" value="1" defaultChecked={q.criticas === '1'} />
          só as críticas
        </label>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      {pecas.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma peça encontrada. Cadastre as que você mais usa — assim elas
          aparecem no orçamento e a reserva acontece sozinha na aprovação.
        </p>
      ) : (
        <div className={`${estilo.quadro} ${estilo.rolaX}`}>
          <table className={estilo.tabela}>
            <thead>
              <tr>
                {/* A foto abre a linha porque é por ela que o olho encontra.
                    Quem procura a peça na prateleira reconhece a imagem antes
                    de ler o código — e o código existe justamente porque a
                    peça não tinha imagem. */}
                <th>
                  <span className={estilo.soLeitor}>Foto</span>
                </th>
                <th>Código</th>
                <th>Peça</th>
                <th>Onde está</th>
                <th className={estilo.dir}>Saldo</th>
                <th className={estilo.dir}>Reservado</th>
                <th className={estilo.dir}>Livre</th>
                <th className={estilo.dir}>Mínimo</th>
                <th className={estilo.dir}>Venda</th>
                {/* A coluna dos botões: rótulo invisível na tela, presente para
                    quem navega a tabela por leitor de tela. Um `<th>` vazio faz a
                    tabela inteira perder o cabeçalho. */}
                <th>
                  <span className={estilo.soLeitor}>Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pecas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <FotoCatalogo tipo="peca" id={p.id} nome={p.nome} tem={p.temFoto} podeMexer={podeMexer} />
                  </td>
                  <td className={estilo.num}>{p.sku}</td>
                  <td>
                    <span className={estilo.forte}>{p.nome}</span>
                    {p.categoria ? <div className={estilo.fraco}>{p.categoria}</div> : null}
                  </td>
                  <td>{p.localizacao ?? <span className={estilo.fraco}>—</span>}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>
                    {p.saldo} {p.unidade}
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{p.reservado || '—'}</td>
                  <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                    <span className={p.critica ? estilo.atrasado : undefined}>{p.livre}</span>
                  </td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{p.minimo}</td>
                  <td className={`${estilo.num} ${estilo.dir}`}>{formatarBRL(p.precoVendaCentavos)}</td>
                  <td>
                    <Link href={`/painel/estoque?peca=${p.id}`} className={estilo.fraco}>
                      histórico
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <p className={estilo.blocoTitulo}>
          <span>Últimos movimentos{q.peca ? ' desta peça' : ''}</span>
          {q.peca ? (
            <Link href="/painel/estoque" className={estilo.fraco}>
              ver de todas
            </Link>
          ) : null}
        </p>
        {movimentos.length === 0 ? (
          <p className={estilo.texto}>Nenhum movimento registrado ainda.</p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Peça</th>
                  <th>Movimento</th>
                  <th className={estilo.dir}>Qtd.</th>
                  <th className={estilo.dir}>Saldo depois</th>
                  <th>Ordem</th>
                  <th>Quem</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className={estilo.num}>{dataHora(m.criadoEm)}</td>
                    <td>{m.peca.nome}</td>
                    <td>
                      <span className={`${estilo.tag} ${corDoMovimento(m.tipo)}`}>{m.tipo.toLowerCase()}</span>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.quantidade)}</td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{Number(m.saldoPosterior)}</td>
                    <td className={estilo.num}>
                      {m.ordem ? (
                        <Link href={`/painel/ordens/${m.ordem.id}`}>#{String(m.ordem.numero).padStart(4, '0')}</Link>
                      ) : (
                        <span className={estilo.fraco}>—</span>
                      )}
                    </td>
                    <td>{m.autorNome}</td>
                    <td className={estilo.fraco}>{m.motivo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
          Este é o livro-razão do estoque: o saldo de cada peça é a soma destes
          movimentos, nunca um número digitado. {sessao.papel === Papel.TECNICO ? '' : 'Nem o administrador edita saldo direto.'}
        </p>
      </div>
    </>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

function corDoMovimento(t: string): string {
  if (t === 'ENTRADA') return estilo.tagOk!
  if (t === 'SAIDA' || t === 'PERDA') return estilo.tagAlerta!
  if (t === 'RESERVA') return estilo.tagEspera!
  return estilo.tagNeutra!
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dataHora = (d: Date) => fmt.format(d)
