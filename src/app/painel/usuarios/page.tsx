import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba } from '@/server/auth/guarda'
import { listarEmpresas, listarUsuarios } from '@/server/consultas/listas'
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
 * A MESMA TELA, DOIS ALCANCES
 * ---------------------------------------------------------------------------
 * Para quem administra uma empresa: a equipe DELA, e mais ninguém. A consulta
 * corre sob o contexto da sessão e o isolamento é feito pelo Postgres — não por
 * um `where` que alguém pode esquecer de escrever amanhã.
 *
 * Para o dono da plataforma, fora de uma visita: a rede inteira. E aí a tela
 * muda o que precisa mudar para não mentir — o título vira "Pessoas da rede",
 * a lista ganha a coluna da EMPRESA, a busca passa a achar por franquia, e o
 * cadastro pede em qual delas a pessoa nasce. Sem isso, uma lista com sete
 * nomes de três franquias diferentes não responde a pergunta mais óbvia que
 * alguém faz olhando para ela.
 *
 * Em nenhum dos dois casos o dono da plataforma aparece na lista: `listarUsuarios`
 * o exclui na consulta. Ele não é funcionário de empresa nenhuma.
 */
export default async function PaginaEquipe() {
  const { ctx, sessao } = await exigirNivel(Papel.ADMIN_EMPRESA)
  // A aba também: o papel diz o que ela pode fazer, a marcação diz o que ela vê.
  await exigirAba('usuarios')
  const usuarios = await listarUsuarios(ctx)

  /**
   * O DONO DA PLATAFORMA VÊ A REDE, NÃO UMA EMPRESA.
   *
   * Fora de uma visita, esta lista traz gente de todas as franquias. A tela
   * dizia "cadastradas nesta empresa" e não mostrava a empresa de ninguém — o
   * que deixava a pergunta mais óbvia sem resposta: "esta atendente é de qual
   * franquia?". Dentro de uma visita ele está numa empresa só, e aí o texto de
   * empresa vale de novo.
   */
  const naRede = sessao.papel === Papel.SUPER_ADMIN && !sessao.visitando
  const onde = naRede ? 'na rede inteira' : 'nesta empresa'

  // As franquias onde ele pode cadastrar alguém. Só faz sentido pedir quando a
  // escolha existe — o administrador de uma empresa cadastra na dele e ponto.
  const empresas = naRede
    ? (await listarEmpresas()).filter((e) => e.ativo && !e.bloqueado).map((e) => ({ id: e.id, nome: e.nome }))
    : []

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{naRede ? 'Plataforma' : (sessao.tenantNome ?? 'Empresa')}</p>
          <h1 className={estilo.titulo}>{naRede ? 'Pessoas da rede' : 'Equipe'}</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Pessoas" valor={String(usuarios.length)} nota={`cadastradas ${onde}`} />
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
        mostrarEmpresa={naRede}
        empresas={empresas}
        usuarios={usuarios.map((u) => ({
          empresa: u.tenant?.nome ?? null,
          id: u.id,
          nome: u.nome,
          email: u.email,
          papel: u.papel,
          ativo: u.ativo,
          ultimoLogin: u.ultimoLogin?.toISOString() ?? null,
          trocarSenha: u.trocarSenha,
          telas: u.telas,
          telefone: u.telefone,
          documento: u.documento,
          cep: u.cep,
          logradouro: u.logradouro,
          numero: u.numero,
          complemento: u.complemento,
          bairro: u.bairro,
          cidade: u.cidade,
          uf: u.uf,
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
