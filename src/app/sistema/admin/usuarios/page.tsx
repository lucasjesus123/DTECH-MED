import Link from 'next/link'
import { Papel } from '@/generated/prisma/enums'
import { agoraNoServidor } from '@/lib/datas'
import { listarUsuarios } from '@/server/consultas/listas'
import { telasDoPapel } from '@/server/auth/telas'
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
 * USUÁRIOS & PAPÉIS — quem entra, e com que poder.
 *
 * =============================================================================
 * O QUE ESTA TELA MOSTRA QUE A LISTA ANTIGA NÃO MOSTRAVA
 * =============================================================================
 * Não é só quem existe: é quem está TRANCADO e quem nunca entrou. As duas
 * situações são invisíveis numa lista comum e as duas custam caro — a pessoa
 * bloqueada por tentativas erradas liga achando que o sistema quebrou, e a
 * pessoa que nunca entrou é um acesso criado que ninguém usou e ninguém
 * cancelou.
 *
 * =============================================================================
 * A EDIÇÃO CONTINUA NA TELA ANTIGA, E É DE PROPÓSITO
 * =============================================================================
 * Criar acesso é a ação mais perigosa deste sistema: ela decide quem enxerga o
 * quê, e a regra de "a marcação subtrai, nunca soma" mora inteira naquela tela,
 * com o motivo escrito ao lado de cada caixa desligada.
 *
 * Reescrever aquilo aqui seria produzir uma segunda versão da tela mais
 * sensível do sistema, para ganhar consistência visual. É a troca errada — e
 * quando esta tela ganhar edição própria, ela precisa ganhar junto os avisos
 * que a outra já tem.
 */
export default async function Usuarios() {
  const { ctx } = await exigirTela('usuarios')

  const pessoas = await listarUsuarios(ctx)

  const agora = agoraNoServidor().getTime()
  const ativos = pessoas.filter((p) => p.ativo).length
  const trancados = pessoas.filter(
    (p) => p.bloqueadoAte !== null && p.bloqueadoAte.getTime() > agora,
  ).length
  const nuncaEntraram = pessoas.filter((p) => p.ativo && p.ultimoLogin === null).length

  const stats: Stat[] = [
    { rotulo: 'Pessoas ativas', valor: ativos, apoio: 'podem entrar hoje', icone: 'usuarios' },
    {
      rotulo: 'Desligadas',
      valor: pessoas.length - ativos,
      apoio: 'acesso encerrado',
      icone: 'config',
    },
    {
      rotulo: 'Trancadas agora',
      valor: trancados,
      apoio: trancados === 0 ? 'nenhuma' : 'por tentativas erradas',
      tom: trancados > 0 ? 'warn' : 'ok',
      icone: 'conferencia',
    },
    {
      rotulo: 'Nunca entraram',
      valor: nuncaEntraram,
      apoio: nuncaEntraram === 0 ? 'todo mundo já usou' : 'acesso criado e não usado',
      tom: nuncaEntraram > 0 ? 'warn' : 'ok',
      icone: 'painel',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Usuários & Papéis"
        apoio="Quem entra, com que poder, e o que cada um enxerga."
        acao={
          <Link href="/painel/usuarios" className={estilo.acao}>
            Criar ou editar acesso
          </Link>
        }
      />

      <StatCardRow stats={stats} />

      {pessoas.length === 0 ? (
        <EmptyState
          titulo="Ninguém cadastrado ainda"
          bom={false}
          apoio="Crie o primeiro acesso para a sua equipe começar a usar o sistema."
        />
      ) : (
        <div className={estilo.radar}>
          {pessoas.map((p) => {
            const trancado = p.bloqueadoAte !== null && p.bloqueadoAte.getTime() > agora
            // Marcação vazia significa "o padrão do papel" — e o padrão nem
            // sempre é tudo. Contar as telas efetivas evita a tela dizer
            // "todas" para um motorista, que nasce com uma só.
            const quantasTelas =
              p.telas.length > 0 ? p.telas.length : telasDoPapel(p.papel).length
            return (
              <div key={p.id} className={estilo.linha}>
                <div className={estilo.linhaTxt}>
                  <div className={estilo.linhaTopo}>
                    <span className={estilo.linhaTitulo}>{p.nome}</span>
                    <Chip tom={p.ativo ? 'info' : 'pending'}>{rotuloPapel(p.papel)}</Chip>
                    {!p.ativo ? <Chip tom="pending">Desligada</Chip> : null}
                    {trancado ? <Chip tom="danger">Trancada</Chip> : null}
                    {p.trocarSenha ? <Chip tom="warn">Vai trocar a senha</Chip> : null}
                  </div>
                  <div className={estilo.linhaApoio}>
                    <span>{p.email}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {p.telas.length > 0 ? `${quantasTelas} telas marcadas` : `padrão do papel (${quantasTelas} telas)`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {p.ultimoLogin
                        ? `entrou em ${p.ultimoLogin.toLocaleDateString('pt-BR')}`
                        : 'nunca entrou'}
                    </span>
                  </div>
                </div>
                <div className={estilo.linhaAcao}>
                  <Link href="/painel/usuarios" className={estilo.acaoLinha}>
                    Editar acesso
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function rotuloPapel(p: Papel): string {
  const m: Record<Papel, string> = {
    SUPER_ADMIN: 'Super admin',
    ADMIN_EMPRESA: 'Administrador',
    GESTOR: 'Gestor',
    FINANCEIRO: 'Financeiro',
    ATENDENTE: 'Atendente',
    TECNICO: 'Técnico',
    MOTORISTA: 'Motorista',
  }
  return m[p]
}
