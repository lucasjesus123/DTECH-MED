import Link from 'next/link'
import { enderecoDaColeta, juntarEndereco } from '@/lib/endereco'
import { agendaDosMotoristas, semAgendamento } from '@/server/consultas/listas'
import { exigirTela } from '@/server/sistema/guarda'
import { ETAPAS_DE_ROTA, filaDeEtapas } from '@/server/sistema/radar'
import RadarList from '@/components/sistema/radar-lista'
import {
  CabecalhoTela,
  Chip,
  EmptyState,
  Secao,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * ROTAS — coletas e entregas, no mesmo lugar.
 *
 * =============================================================================
 * TRÊS PERGUNTAS, E ELAS SÃO A MESMA
 * =============================================================================
 * "O que precisa ser buscado?", "o que precisa ser entregue?" e "quem vai
 * fazer?" pareciam três telas no sistema antigo. São o mesmo trabalho: alguém
 * pega a estrada.
 *
 * A tela responde na ordem em que a coisa dói:
 *
 *   1. SEM MOTORISTA — o aparelho que já podia estar na rua e não está. É o
 *      buraco que faz o cliente ligar perguntando.
 *   2. NA ESTEIRA — o que está agendado ou já em rota, com o botão-da-vez.
 *   3. A AGENDA — quem tem o quê nos próximos dias.
 *
 * =============================================================================
 * O ENDEREÇO DE COLETA NÃO É O DO CADASTRO
 * =============================================================================
 * Muita clínica manda buscar num lugar e recebe a nota em outro. O sistema
 * guarda os dois, e esta tela mostra o de COLETA — porque é para lá que o
 * motorista vai. Mostrar o do cadastro faria alguém atravessar a cidade e
 * voltar de mãos vazias.
 */
export default async function Rotas() {
  const { ctx, sessao } = await exigirTela('rotas')

  const [linhas, semDono, agenda] = await Promise.all([
    filaDeEtapas(ctx, sessao.papel, ETAPAS_DE_ROTA),
    semAgendamento(ctx),
    agendaDosMotoristas(ctx, 14),
  ])

  const paradasMarcadas = agenda.motoristas.reduce((s, m) => s + m.paradas.length, 0)

  const stats: Stat[] = [
    {
      rotulo: 'Sem motorista',
      valor: semDono.length,
      apoio: semDono.length === 0 ? 'tudo despachado' : 'esperando agendamento',
      tom: semDono.length > 0 ? 'warn' : 'ok',
      icone: 'rotas',
    },
    {
      rotulo: 'Na esteira',
      valor: linhas.length,
      apoio: 'agendadas ou em rota',
      tom: 'info',
      icone: 'ordens',
    },
    {
      rotulo: 'Paradas marcadas',
      valor: paradasMarcadas,
      apoio: 'nos próximos 14 dias',
      icone: 'agenda',
    },
    {
      rotulo: 'Sem dono na agenda',
      valor: agenda.semMotorista.length,
      apoio: agenda.semMotorista.length === 0 ? 'todas atribuídas' : 'parada existe, motorista não',
      tom: agenda.semMotorista.length > 0 ? 'warn' : 'ok',
      icone: 'usuarios',
    },
  ]

  return (
    <>
      <CabecalhoTela titulo="Rotas" apoio="Quem sai para buscar, quem sai para entregar." />

      <StatCardRow stats={stats} />

      {semDono.length > 0 ? (
        <Secao titulo="Esperando agendamento">
          <div className={estilo.radar}>
            {semDono.map((o) => {
              const paraColeta = o.etapa === 'ORDEM_RETIRADA_GERADA'
              return (
                <div key={o.id} className={estilo.linha}>
                  <div className={estilo.linhaTxt}>
                    <div className={estilo.linhaTopo}>
                      <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaNumero}>
                        O.S. {String(o.numero).padStart(5, '0')}
                      </Link>
                      <Chip tom={paraColeta ? 'warn' : 'info'}>
                        {paraColeta ? 'Coletar' : 'Entregar'}
                      </Chip>
                    </div>
                    <Link href={`/sistema/ordens/${o.id}`} className={estilo.linhaTitulo}>
                      {`${o.equipamento.marca} ${o.equipamento.modelo}`.trim()}
                    </Link>
                    <div className={estilo.linhaApoio}>
                      <span>{o.cliente.nome}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {paraColeta ? enderecoDaColeta(o.cliente) : juntarEndereco(o.cliente)}
                      </span>
                    </div>
                  </div>
                  <div className={estilo.linhaAcao}>
                    <Link
                      href={`/sistema/ordens/${o.id}?fluxo=${paraColeta ? 'agendar-coleta' : 'agendar-entrega'}`}
                      className={estilo.acao}
                    >
                      {paraColeta ? 'Agendar coleta' : 'Agendar entrega'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Esteira // rua">
        <RadarList
          titulo="Na rua agora"
          linhas={linhas}
          vazio={
            <EmptyState
              titulo="Ninguém na estrada ✓"
              apoio="Quando uma coleta ou entrega for agendada, ela aparece aqui com o botão do próximo passo."
            />
          }
        />
      </Secao>

      <Secao titulo="Agenda // próximos 14 dias">
        {agenda.motoristas.length === 0 ? (
          <EmptyState
            titulo="Nenhum motorista cadastrado"
            bom={false}
            apoio="Cadastre quem dirige em Usuários & Papéis para poder atribuir paradas."
          />
        ) : (
          <div className={estilo.quadro}>
            {agenda.motoristas.map((m) => (
              <div key={m.id} className={estilo.coluna}>
                <div className={estilo.colunaTopo}>
                  <span className={estilo.colunaTitulo}>{m.nome}</span>
                  <span className={estilo.colunaQuantos}>{m.paradas.length}</span>
                </div>
                {m.paradas.map((p) => (
                  <div key={p.id} className={estilo.ficha}>
                    <span className={estilo.fichaTitulo}>{p.cliente}</span>
                    <span className={estilo.fichaApoio}>
                      {p.dia.split('-').reverse().join('/')}
                      {p.hora ? ` · ${p.hora}` : ''} · O.S.{' '}
                      {String(p.numero).padStart(5, '0')}
                    </span>
                    <span className={estilo.fichaApoio}>
                      <Chip tom={p.tipo === 'RETIRADA' ? 'warn' : 'info'}>
                        {p.tipo === 'RETIRADA' ? 'Coleta' : 'Entrega'}
                      </Chip>
                    </span>
                  </div>
                ))}
                {m.paradas.length === 0 ? <p className={estilo.colunaVazia}>Sem paradas</p> : null}
              </div>
            ))}

            {/* A coluna dos sem dono fica ao lado das outras, e não escondida:
                é a que precisa esvaziar. */}
            {agenda.semMotorista.length > 0 ? (
              <div className={estilo.coluna}>
                <div className={estilo.colunaTopo}>
                  <span className={estilo.colunaTitulo}>Sem motorista</span>
                  <span className={estilo.colunaQuantos}>{agenda.semMotorista.length}</span>
                </div>
                {agenda.semMotorista.map((p) => (
                  <div key={p.id} className={estilo.ficha}>
                    <span className={estilo.fichaTitulo}>{p.cliente}</span>
                    <span className={estilo.fichaApoio}>
                      {p.dia.split('-').reverse().join('/')}
                      {p.hora ? ` · ${p.hora}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </Secao>
    </>
  )
}
