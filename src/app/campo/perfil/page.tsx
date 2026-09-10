import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { encerrarSessao, lerSessao } from '@/server/auth/sessao'
import { lerTema } from '@/server/acoes/tema'
import SeletorTema from '@/components/sistema/seletor-tema'
import { Bloco } from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * PERFIL — quem sou eu neste aparelho, e como saio.
 *
 * =============================================================================
 * A QUINTA ABA EXISTE PARA DUAS COISAS
 * =============================================================================
 * Sair, e trocar o tema. Parecem pouco para uma das cinco portas do aplicativo,
 * e não são: sem uma aba, "sair" vira um botão escondido em algum canto — e o
 * celular do trabalho passa de mão em mão.
 *
 * O tema aqui é o mesmo cookie do sistema de mesa. Quem trabalha de dia na rua
 * escolhe claro; quem faz entrega à noite escolhe escuro, e a escolha vale nas
 * duas superfícies porque é uma escolha só.
 */
export default async function Perfil() {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')

  const tema = await lerTema()

  async function sair() {
    'use server'
    await encerrarSessao()
    redirect('/entrar')
  }

  return (
    <>
      <header className={estilo.campoTopo}>
        <div className={estilo.campoTopoTxt}>
          <strong>{sessao.nome}</strong>
          <span>
            {rotuloPapel(sessao.papel)} · {sessao.tenantNome ?? 'Plataforma'}
          </span>
        </div>
      </header>

      <Bloco titulo="Aparência">
        <SeletorTema atual={tema} />
        <p className={estilo.campoDica}>
          A escolha vale também no sistema de mesa — é a mesma preferência.
        </p>
      </Bloco>

      <Bloco titulo="Sua conta">
        <p className={estilo.campoDica}>{sessao.email}</p>
        <Link className={estilo.acaoLinha} href="/painel/trocar-senha">
          Trocar a senha
        </Link>
      </Bloco>

      {sessao.papel !== Papel.MOTORISTA ? (
        <Bloco titulo="Outra superfície">
          <p className={estilo.campoDica}>
            O sistema de mesa tem as listas, os filtros e a esteira inteira.
          </p>
          <Link className={estilo.acaoLinha} href="/sistema">
            Abrir o sistema
          </Link>
        </Bloco>
      ) : null}

      <form action={sair}>
        <button type="submit" className={`${estilo.acaoLarga} ${estilo.acaoDanger}`}>
          Sair deste aparelho
        </button>
      </form>
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
