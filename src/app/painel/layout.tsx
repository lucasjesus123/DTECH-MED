import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { podeVer } from '@/server/auth/guarda'
import { encerrarSessao, lerSessao } from '@/server/auth/sessao'
import estilo from './painel.module.css'

/**
 * Moldura do painel.
 *
 * A lateral é organizada pela ESTEIRA, não por módulos. O sistema antigo tinha
 * Pessoas, Cadastros, Financeiro, Produtos, Vendas, Caixa e OS lado a lado —
 * sete assuntos paralelos onde o equipamento não tinha história. Aqui o
 * primeiro grupo é o trabalho de hoje; cadastro e retaguarda vêm depois,
 * porque é essa a ordem em que alguém realmente usa.
 *
 * Cada item aparece conforme o papel. Isso é conforto visual, não segurança:
 * quem autoriza de verdade é o guarda na página e na ação.
 */
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const p = sessao.papel
  const iniciais = sessao.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  async function sair() {
    'use server'
    await encerrarSessao()
    redirect('/entrar')
  }

  return (
    <div className={estilo.app}>
      <aside className={estilo.lateral}>
        <div className={estilo.latMarca}>
          <span className={estilo.latD}>D</span>
          <span className={estilo.latTxt}>
            TECH<b>MED</b>
          </span>
        </div>

        <p className={estilo.latGrupo}>A esteira</p>
        <Link href="/painel" className={estilo.latItem}>
          <span aria-hidden="true">◉</span> Painel do dia
        </Link>
        <Link href="/painel/ordens" className={estilo.latItem}>
          <span aria-hidden="true">▤</span> Ordens
        </Link>
        <Link href="/painel/agenda" className={estilo.latItem}>
          <span aria-hidden="true">◷</span> Agenda de rota
        </Link>

        <p className={estilo.latGrupo}>Cadastros</p>
        <Link href="/painel/clientes" className={estilo.latItem}>
          <span aria-hidden="true">☰</span> Clientes
        </Link>
        <Link href="/painel/equipamentos" className={estilo.latItem}>
          <span aria-hidden="true">⬒</span> Equipamentos
        </Link>

        {podeVer(p, Papel.TECNICO) ? (
          <>
            <p className={estilo.latGrupo}>Retaguarda</p>
            <Link href="/painel/estoque" className={estilo.latItem}>
              <span aria-hidden="true">▣</span> Estoque
            </Link>
          </>
        ) : null}

        {podeVer(p, Papel.FINANCEIRO) ? (
          <Link href="/painel/financeiro" className={estilo.latItem}>
            <span aria-hidden="true">$</span> Financeiro
          </Link>
        ) : null}

        {podeVer(p, Papel.GESTOR) ? (
          <Link href="/painel/whatsapp" className={estilo.latItem}>
            <span aria-hidden="true">✆</span> WhatsApp
          </Link>
        ) : null}

        {p === Papel.SUPER_ADMIN ? (
          <>
            <p className={estilo.latGrupo}>Plataforma</p>
            <Link href="/painel/empresas" className={estilo.latItem}>
              <span aria-hidden="true">⬢</span> Empresas
            </Link>
          </>
        ) : null}

        <div className={estilo.latUser}>
          <span className={estilo.avatar}>{iniciais}</span>
          <div className={estilo.latUserTxt}>
            <strong>{sessao.nome}</strong>
            <span>{rotuloPapel(p)}</span>
          </div>
          <form action={sair}>
            <button type="submit" className={estilo.sair} title="Sair do sistema">
              sair
            </button>
          </form>
        </div>
      </aside>

      <div className={estilo.principal}>
        <header className={estilo.barra}>
          <span className={estilo.pillEmpresa}>
            ◉ {sessao.tenantNome ?? 'Plataforma'}
          </span>
          <span className={estilo.data}>{hoje()}</span>
        </header>
        <div className={estilo.rolagem}>{children}</div>
      </div>
    </div>
  )
}

function rotuloPapel(p: Papel): string {
  const m: Record<Papel, string> = {
    SUPER_ADMIN: 'SUPER ADMIN',
    ADMIN_EMPRESA: 'ADMINISTRADOR',
    GESTOR: 'GESTOR',
    FINANCEIRO: 'FINANCEIRO',
    ATENDENTE: 'ATENDENTE',
    TECNICO: 'TÉCNICO',
    MOTORISTA: 'MOTORISTA',
  }
  return m[p]
}

function hoje(): string {
  return new Date()
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    })
    .replace('.', '')
    .toUpperCase()
}
