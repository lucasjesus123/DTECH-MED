import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, exigirAba } from '@/server/auth/guarda'
import { fichaDoItem } from '@/server/consultas/estoque'
import FotoCatalogo from '../../foto-catalogo'
import EditarItem from './editar'
import estilo from '../../painel.module.css'

export const metadata: Metadata = { title: 'Ficha do item', robots: { index: false } }
export const dynamic = 'force-dynamic'

const NOME_DO_TIPO: Record<string, string> = {
  PECA: 'Peça',
  INSUMO: 'Insumo',
  FERRAMENTA: 'Ferramenta',
}

/**
 * A FICHA DO ITEM — o prontuário que o estoque não tinha.
 *
 * =============================================================================
 * A PERGUNTA QUE A LISTAGEM NÃO RESPONDE
 * =============================================================================
 * A listagem responde "quanto tem". Ela não responde **por que este saldo é
 * este** — que é exatamente a pergunta de quem está conferindo uma divergência
 * de inventário, ou desconfiando de que alguém levou.
 *
 * O livro-razão do item, com autor, motivo e ordem em cada linha, responde. É o
 * mesmo princípio da linha do tempo da O.S.: o saldo é a soma dos movimentos,
 * nunca um número digitado, e cada movimento tem um dono e uma justificativa.
 *
 * =============================================================================
 * A CONTA DO DISPONÍVEL É ESCRITA, E NÃO SÓ CALCULADA
 * =============================================================================
 * Ver "saldo 4, disponível 1" sem explicação faz a pessoa achar que o sistema
 * errou. A ficha escreve a subtração inteira — 4 na prateleira, 2 reservadas,
 * 1 em campo — porque é a diferença entre confiar no número e conferir a mão.
 */
export default async function FichaDoItem({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string }>
}) {
  const { ctx } = await exigirPapel(Papel.ADMIN_EMPRESA, Papel.GESTOR, Papel.TECNICO)
  await exigirAba('estoque')
  const { id } = await params
  const q = await searchParams

  const item = await fichaDoItem(ctx, id)
  if (!item) notFound()

  const ferramenta = item.tipo === 'FERRAMENTA'
  const abertos = item.emprestimos.filter((e) => !e.devolvidoEm)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>
            Estoque · {NOME_DO_TIPO[item.tipo] ?? item.tipo}
            {item.categoria ? ` · ${item.categoria}` : ''}
          </p>
          <h1 className={estilo.titulo}>{item.nome}</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            {item.sku}
            {item.patrimonio ? ` · patrimônio ${item.patrimonio}` : ''}
            {item.marca ? ` · ${item.marca}` : ''}
            {item.localizacao ? ` · ${item.localizacao}` : ''}
          </p>
        </div>
        <Link className={estilo.btnSec} href="/painel/estoque">
          Voltar ao estoque
        </Link>
      </div>

      <div className={estilo.grade} style={{ alignItems: 'start' }}>
        <div>
          <FotoCatalogo
            tipo="peca"
            id={item.id}
            nome={item.nome}
            tem={item.temFoto}
            podeMexer
            grande
          />
        </div>

        <div style={{ gridColumn: 'span 3' }}>
          {/* A CONTA INTEIRA, ESCRITA. Ver o cabeçalho: "saldo 4, disponível
              1" sem explicação parece defeito do sistema. */}
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>Onde está cada unidade</p>
            <p className={estilo.texto} style={{ fontSize: '1.05rem' }}>
              <strong>{item.saldo}</strong> {item.unidade} no total
              {item.reservado > 0 ? (
                <>
                  {' '}
                  · <strong>{item.reservado}</strong> reservada
                  {item.reservado === 1 ? '' : 's'} para O.S. aprovada
                </>
              ) : null}
              {item.emprestado > 0 ? (
                <>
                  {' '}
                  · <strong>{item.emprestado}</strong> na mão de alguém
                </>
              ) : null}{' '}
              ={' '}
              <strong className={item.livre <= item.minimo ? estilo.atrasado : undefined}>
                {item.livre} {item.livre === 1 ? 'disponível' : 'disponíveis'}
              </strong>
            </p>
            <p className={estilo.dica}>
              É o disponível que decide se a O.S. anda — o saldo cheio inclui o que já tem dono.
              {item.minimo > 0 ? ` O mínimo desta ficha é ${item.minimo}.` : ''}
            </p>
          </div>

          <div className={estilo.resumo} style={{ marginTop: 'var(--s4)' }}>
            <Indicador rotulo="Custo médio" valor={formatarBRL(item.custoMedioCentavos)} nota="média ponderada das entradas" />
            {ferramenta ? (
              <Indicador
                rotulo="Em campo agora"
                valor={String(item.emprestado)}
                nota={abertos.length > 0 ? `com ${abertos.map((e) => e.responsavelNome).join(', ')}` : 'tudo na prateleira'}
                alerta={item.emprestado > 0}
              />
            ) : (
              <Indicador rotulo="Preço de venda" valor={formatarBRL(item.precoVendaCentavos)} nota="o que entra no orçamento" />
            )}
            <Indicador
              rotulo="Parado nesta linha"
              valor={formatarBRL(Math.round(item.saldo * item.custoMedioCentavos))}
              nota="saldo × custo médio"
            />
          </div>
        </div>
      </div>

      {/* A CORREÇÃO DO CADASTRO. Ver `editar.tsx`: ela mora aqui porque é
          olhando para o item que alguém percebe que a prateleira mudou, que o
          fornecedor não é mais aquele, que o mínimo está errado. */}
      <EditarItem
        comecarAberto={q.editar === '1'}
        item={{
          id: item.id,
          sku: item.sku,
          nome: item.nome,
          tipo: item.tipo,
          patrimonio: item.patrimonio,
          categoria: item.categoria,
          aplicacao: item.aplicacao,
          unidade: item.unidade,
          localizacao: item.localizacao,
          fornecedor: item.fornecedor,
          precoVendaCentavos: item.precoVendaCentavos,
          custoMedioCentavos: item.custoMedioCentavos,
          estoqueMinimo: item.minimo,
        }}
      />

      {item.descricao || item.aplicacao || item.fornecedor ? (
        <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
          <p className={estilo.blocoTitulo}>Ficha</p>
          {item.descricao ? <p className={estilo.texto}>{item.descricao}</p> : null}
          {item.aplicacao ? (
            <p className={estilo.texto}>
              <span className={estilo.grav}>{ferramenta ? 'Para que serve' : 'Serve em'}</span>{' '}
              {item.aplicacao}
            </p>
          ) : null}
          {item.fornecedor ? (
            <p className={estilo.texto}>
              <span className={estilo.grav}>Fornecedor</span> {item.fornecedor}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* O histórico de posse só aparece para ferramenta, e só quando existe:
          um bloco vazio "Nenhum empréstimo" em toda peça de consumo seria
          ruído em quatrocentas fichas para informar zero. */}
      {item.emprestimos.length > 0 ? (
        <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
          <p className={estilo.blocoTitulo}>Quem levou, e quando voltou</p>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Quem</th>
                  <th className={estilo.dir}>Qtd.</th>
                  <th>Saiu</th>
                  <th>Voltou</th>
                  <th>O.S.</th>
                  <th>Como voltou</th>
                </tr>
              </thead>
              <tbody>
                {item.emprestimos.map((e) => (
                  <tr key={e.id}>
                    <td className={estilo.forte}>{e.responsavelNome}</td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{e.quantidade}</td>
                    <td className={estilo.num}>{dia(e.retiradoEm)}</td>
                    <td className={estilo.num}>
                      {e.devolvidoEm ? (
                        dia(e.devolvidoEm)
                      ) : (
                        <span className={`${estilo.tag} ${estilo.tagEspera}`}>ainda fora</span>
                      )}
                    </td>
                    <td className={estilo.num}>
                      {e.ordemNumero ? (
                        <Link href={`/painel/ordens/${e.ordemId}`}>
                          #{String(e.ordemNumero).padStart(4, '0')}
                        </Link>
                      ) : (
                        <span className={estilo.fraco}>—</span>
                      )}
                    </td>
                    <td className={estilo.fraco}>{e.condicaoVolta ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className={estilo.bloco} style={{ marginTop: 'var(--s5)' }}>
        <p className={estilo.blocoTitulo}>O livro-razão deste item</p>
        {item.movimentos.length === 0 ? (
          <p className={estilo.texto}>
            Nenhum movimento ainda. O saldo só muda por aqui — nem o administrador digita saldo
            direto.
          </p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Movimento</th>
                  <th className={estilo.dir}>Qtd.</th>
                  <th className={estilo.dir}>De</th>
                  <th className={estilo.dir}>Para</th>
                  <th>O.S.</th>
                  <th>Quem</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {item.movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className={estilo.num}>{dataHora(m.criadoEm)}</td>
                    <td>
                      <span className={`${estilo.tag} ${corDoMovimento(m.tipo)}`}>
                        {rotuloDoMovimento(m.tipo)}
                      </span>
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{m.quantidade}</td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.fraco}`}>
                      {m.saldoAnterior}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {m.saldoPosterior}
                    </td>
                    <td className={estilo.num}>
                      {m.ordemNumero ? (
                        <Link href={`/painel/ordens/${m.ordemId}`}>
                          #{String(m.ordemNumero).padStart(4, '0')}
                        </Link>
                      ) : (
                        <span className={estilo.fraco}>—</span>
                      )}
                    </td>
                    <td>{m.autorNome}</td>
                    <td className={estilo.fraco}>
                      {m.motivo ?? '—'}
                      {m.documentoFiscal ? ` · NF ${m.documentoFiscal}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
          As colunas <strong>De</strong> e <strong>Para</strong> são o saldo antes e depois de cada
          movimento. É por elas que se acha onde a conta se perdeu, sem precisar acreditar em
          ninguém. Empréstimo e devolução aparecem com os dois iguais: a ferramenta muda de lugar,
          não de dono.
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
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

function corDoMovimento(t: string): string {
  if (t === 'ENTRADA' || t === 'DEVOLUCAO') return estilo.tagOk!
  if (t === 'SAIDA' || t === 'PERDA') return estilo.tagAlerta!
  if (t === 'RESERVA' || t === 'EMPRESTIMO') return estilo.tagEspera!
  return estilo.tagNeutra!
}

function rotuloDoMovimento(t: string): string {
  const nomes: Record<string, string> = {
    ENTRADA: 'entrada',
    SAIDA: 'saída',
    AJUSTE: 'ajuste',
    RESERVA: 'reserva',
    LIBERACAO: 'liberação',
    PERDA: 'perda',
    EMPRESTIMO: 'saiu com alguém',
    DEVOLUCAO: 'devolvida',
  }
  return nomes[t] ?? t.toLowerCase()
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dataHora = (d: Date) => fmt.format(d)

const fmtDia = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const dia = (d: Date) => fmtDia.format(d)
