import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba } from '@/server/auth/guarda'
import { FAMILIAS, PERIODOS, lerTrilha } from '@/server/consultas/auditoria'
import { PAPEL_ROTULO, quando, rotuloAcao } from './rotulos'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Trilha', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A TRILHA — quem fez o quê, quando, de onde.
 *
 * =============================================================================
 * PARA QUE SERVE UMA TELA DESTAS
 * =============================================================================
 * Para três perguntas que só ela responde:
 *
 *   • "Quem mexeu nisso?" — o dia em que um valor está errado e ninguém assume.
 *   • "Isso foi feito quando?" — o dia em que um cliente cobra um prazo.
 *   • "Alguém andou tentando o que não devia?" — as linhas BARRADAS, que são o
 *     alarme de verdade: CPF chutado no portal, entrada negada em empresa,
 *     troca de senha recusada.
 *
 * O terceiro é o motivo de as barradas terem número próprio no topo. Elas somem
 * no meio de centenas de linhas normais, e são exatamente as que não podem
 * sumir.
 *
 * =============================================================================
 * POR QUE SÓ DAQUI PARA CIMA
 * =============================================================================
 * O piso é ADMIN_EMPRESA. A trilha diz onde cada pessoa da equipe estava e o
 * que fez — é informação de responsável, não de colega. Um técnico com acesso a
 * ela consegue mapear a rotina de todo mundo, e isso não é função dele.
 *
 * =============================================================================
 * ESTA TELA NÃO ESCREVE NADA
 * =============================================================================
 * Não há botão de apagar, de editar, de "limpar trilha antiga". Não é esquecimento:
 * o banco recusaria — `REVOKE UPDATE, DELETE` está na migração de RLS. Uma
 * trilha que a própria tela consegue mexer não serve para provar coisa alguma.
 */
export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; familia?: string; so?: string; busca?: string }>
}) {
  const { ctx, sessao } = await exigirNivel(Papel.ADMIN_EMPRESA)
  await exigirAba('auditoria')
  const q = await searchParams

  const trilha = await lerTrilha(ctx, {
    dias: q.dias ? Number(q.dias) : undefined,
    familia: q.familia,
    so: q.so,
    busca: q.busca,
  })

  const { aplicado } = trilha
  // O dono da plataforma, fora de uma visita, enxerga a rede toda: sem a coluna
  // da empresa a lista viraria um amontoado sem dono.
  const mostrarEmpresa = sessao.papel === Papel.SUPER_ADMIN && !sessao.visitando
  const agora = new Date()

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{mostrarEmpresa ? 'Plataforma' : (sessao.tenantNome ?? 'Empresa')}</p>
          <h1 className={estilo.titulo}>Trilha</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador
          rotulo="Ações no período"
          valor={String(trilha.total)}
          nota={`nos últimos ${aplicado.dias === 1 ? '24 horas' : `${aplicado.dias} dias`}`}
        />
        <Indicador
          rotulo="Tentativas barradas"
          valor={String(trilha.negadas)}
          nota={
            trilha.negadas > 0
              ? 'alguém tentou o que não podia — vale olhar'
              : 'ninguém esbarrou em porta trancada'
          }
          alerta={trilha.negadas > 0}
        />
        <Indicador
          rotulo="Ação mais comum"
          valor={
            trilha.maisFrequentes[0]
              ? String(trilha.maisFrequentes[0].quantidade)
              : '—'
          }
          nota={
            trilha.maisFrequentes[0]
              ? rotuloAcao(trilha.maisFrequentes[0].acao)
              : 'nada registrado no período'
          }
        />
        <Indicador
          rotulo="Nesta lista"
          valor={String(trilha.linhas.length)}
          nota={
            trilha.total > trilha.linhas.length
              ? `de ${trilha.total} — estreite o filtro para ver o resto`
              : 'tudo que o filtro encontrou'
          }
          alerta={trilha.total > trilha.linhas.length}
        />
      </div>

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={aplicado.busca}
            placeholder="Nome de quem fez, nome da ação, ou o código do registro"
            aria-label="Buscar na trilha"
          />
        </div>
        <select className={estilo.selecao} name="familia" defaultValue={aplicado.familia} aria-label="Assunto">
          <option value="">Todos os assuntos</option>
          {FAMILIAS.map((f) => (
            <option key={f.chave} value={f.chave}>
              {f.rotulo}
            </option>
          ))}
        </select>
        <select className={estilo.selecao} name="dias" defaultValue={String(aplicado.dias)} aria-label="Período">
          {PERIODOS.map((d) => (
            <option key={d} value={String(d)}>
              {d === 1 ? 'Últimas 24 horas' : `Últimos ${d} dias`}
            </option>
          ))}
        </select>
        <select className={estilo.selecao} name="so" defaultValue={aplicado.so} aria-label="O que mostrar">
          <option value="tudo">Tudo</option>
          <option value="negadas">Só o que foi barrado</option>
        </select>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      {trilha.linhas.length === 0 ? (
        <p className={estilo.vazio}>
          Nada registrado com esse filtro. Trilha vazia num período curto é normal — aumente o
          período antes de concluir que não houve movimento.
        </p>
      ) : (
        <ol className={estilo.audLista}>
          {trilha.linhas.map((l) => (
            <li key={l.id} className={l.negado ? `${estilo.audItem} ${estilo.audBarrado}` : estilo.audItem}>
              <span className={estilo.audNo} aria-hidden="true" />

              <div className={estilo.audCorpo}>
                <div className={estilo.audTopo}>
                  <strong className={estilo.audAcao}>{rotuloAcao(l.acao)}</strong>
                  {l.negado ? <span className={estilo.audSelo}>barrado</span> : null}
                  <time className={estilo.audQuando} dateTime={l.criadoEm.toISOString()}>
                    {quando(l.criadoEm, agora)}
                  </time>
                </div>

                <p className={estilo.audQuem}>
                  {l.userNome ?? 'Sem autor registrado'}
                  {l.userPapel ? (
                    <span className={estilo.audPapel}>{PAPEL_ROTULO[l.userPapel] ?? l.userPapel}</span>
                  ) : null}
                  {mostrarEmpresa ? (
                    <span className={estilo.audPapel}>{l.empresa ?? 'Plataforma'}</span>
                  ) : null}
                </p>

                <details className={estilo.audMais}>
                  <summary>Detalhes técnicos</summary>
                  <dl className={estilo.audPares}>
                    <Par rotulo="Ação" valor={l.acao} />
                    {l.entidade ? <Par rotulo="Registro" valor={l.entidade} /> : null}
                    {l.entidadeId ? <Par rotulo="Código" valor={l.entidadeId} /> : null}
                    <Par rotulo="Endereço de rede" valor={l.ip ?? 'não registrado'} />
                    <Par
                      rotulo="Data e hora"
                      valor={l.criadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
                    />
                  </dl>
                  {temConteudo(l.detalhes) ? (
                    <pre className={estilo.audJson}>{JSON.stringify(l.detalhes, null, 2)}</pre>
                  ) : null}
                </details>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className={estilo.dica}>
        Esta tela só lê. A trilha é gravada uma vez e não pode ser alterada nem apagada por
        ninguém — nem por aqui, nem pelo administrador da empresa. É o que a torna útil no dia em
        que alguém disser &ldquo;não fui eu&rdquo;.
      </p>
    </>
  )
}

/** `detalhes` é `{}` na maioria das linhas — bloco vazio só ocupa espaço. */
function temConteudo(d: unknown): boolean {
  return !!d && typeof d === 'object' && Object.keys(d as object).length > 0
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className={estilo.grav}>{rotulo}</dt>
      <dd className={estilo.audValor}>{valor}</dd>
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
    <div className={alerta ? `${estilo.indicador} ${estilo.indAlerta}` : estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={estilo.indValor}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
