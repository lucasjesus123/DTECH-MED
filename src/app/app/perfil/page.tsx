import { exigirSessao } from '@/server/auth/guarda'
import { comEscopo } from '@/lib/db'
import { PAPEL_ROTULO } from '@/app/painel/auditoria/rotulos'
import { lerTema } from '@/server/acoes/tema'
import TemaDoCampo from '../tema-campo'
import Formulario from './formulario'
import estilo from '../app.module.css'

export const dynamic = 'force-dynamic'

/**
 * O PRÓPRIO CADASTRO, editável por quem trabalha.
 *
 * Antes, um motorista que trocou de número dependia do admin para atualizar —
 * e enquanto o admin não mexia, a central ligava para um telefone que não
 * atende mais. Nome, telefone e CPF são de quem trabalha, e o próprio dono é a
 * fonte certa deles.
 *
 * Os três entram em documento assinado: o termo de retirada leva o nome e o
 * documento de quem pegou o equipamento. É por isso que a tela avisa disso, e
 * que a alteração é auditada com o antes e o depois — ver `atualizarPerfil`.
 *
 * E-mail e papel NÃO estão aqui: um é a chave de entrada, o outro é o que a
 * pessoa pode fazer. Ninguém troca a própria fechadura nem se promove.
 */
export default async function Perfil() {
  const { sessao, ctx } = await exigirSessao()
  const tema = await lerTema('campo')

  const eu = await comEscopo(ctx, (tx) =>
    tx.user.findUnique({
      where: { id: sessao.userId },
      select: { nome: true, email: true, telefone: true, documento: true, papel: true },
    }),
  )

  return (
    <>
      <header className={estilo.cabecalho}>
        <span className={estilo.grav}>Meu cadastro</span>
        <h1>{eu?.nome ?? sessao.nome}</h1>
        <div className={estilo.cabLinha}>
          <span>{PAPEL_ROTULO[sessao.papel] ?? sessao.papel}</span>
          <span className={estilo.mono}>{sessao.tenantNome ?? ''}</span>
        </div>
      </header>

      <main className={estilo.corpo}>
        <Formulario
          nome={eu?.nome ?? ''}
          telefone={eu?.telefone ?? ''}
          documento={eu?.documento ?? ''}
          email={eu?.email ?? ''}
        />

        {/* A ESCOLHA DA TELA vem DEPOIS do cadastro, e não antes: quem abre o
            perfil vem quase sempre corrigir um telefone. A aparência é o
            segundo motivo — mas é o motivo que muda no meio do dia, quando o
            sol bate, e por isso mora aqui e não num menu. */}
        <TemaDoCampo atual={tema} />
      </main>
    </>
  )
}
