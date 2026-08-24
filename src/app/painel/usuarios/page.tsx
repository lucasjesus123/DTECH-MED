import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel } from '@/server/auth/guarda'
import { listarUsuarios } from '@/server/consultas/listas'
import Equipe from './equipe'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Equipe', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A equipe da empresa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA PRECISAVA EXISTIR
 * ---------------------------------------------------------------------------
 * O servidor já sabia fazer tudo isto: `salvarUsuario` aceita o administrador
 * da empresa desde o primeiro dia, recusa quem tenta criar alguém do próprio
 * nível ou acima, e cria sempre dentro da empresa de quem está pedindo. O que
 * faltava era a TELA — e sem ela, quem contratava um técnico precisava pedir
 * ao dono da plataforma para cadastrá-lo.
 *
 * Numa franquia isso não é inconveniente, é impedimento: o franqueado não
 * consegue montar a própria equipe sem depender do franqueador. E é a diferença
 * entre um sistema multiempresa de verdade e um sistema de uma empresa só com
 * várias pastas dentro.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA TELA NÃO MOSTRA
 * ---------------------------------------------------------------------------
 * Ninguém de outra empresa. A consulta corre sob o contexto da sessão, e o
 * isolamento é feito pelo Postgres — não por um `where` que alguém pode
 * esquecer de escrever amanhã.
 */
export default async function PaginaEquipe() {
  const { ctx, sessao } = await exigirNivel(Papel.ADMIN_EMPRESA)
  const usuarios = await listarUsuarios(ctx)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{sessao.tenantNome ?? 'Empresa'}</p>
          <h1 className={estilo.titulo}>Equipe</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Pessoas" valor={String(usuarios.length)} nota="cadastradas nesta empresa" />
        <Indicador
          rotulo="Ativas"
          valor={String(usuarios.filter((u) => u.ativo).length)}
          nota="podem entrar no sistema"
        />
        <Indicador
          rotulo="Senha provisória"
          valor={String(usuarios.filter((u) => u.trocarSenha).length)}
          nota="ainda vão trocar no primeiro acesso"
        />
        <Indicador
          rotulo="Nunca entraram"
          valor={String(usuarios.filter((u) => !u.ultimoLogin).length)}
          nota="acesso criado e não usado"
        />
      </div>

      <Equipe
        papelDeQuemOlha={sessao.papel}
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          papel: u.papel,
          ativo: u.ativo,
          ultimoLogin: u.ultimoLogin?.toISOString() ?? null,
          trocarSenha: u.trocarSenha,
        }))}
      />
    </>
  )
}

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={estilo.indValor}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
