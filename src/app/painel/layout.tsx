import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { podeVer } from '@/server/auth/guarda'
import { encerrarSessao, lerSessao } from '@/server/auth/sessao'
import { lerTema } from '@/server/acoes/tema'
import estilo from './painel.module.css'
import Navegacao, { type GrupoNav, type ItemNav } from './nav'
import SeletorDeTema from './tema'
import { Credito } from '../credito'
import { Marca } from '../marca'

/**
 * O painel nunca é indexado.
 *
 * O robots.txt já pede isso, e o login já barra o acesso — mas as duas coisas
 * falham de jeitos diferentes: robots.txt é pedido, não ordem, e um dia
 * alguém cola no Twitter um link de tela interna e o buscador vai buscar. O
 * `noindex` no cabeçalho é a única instrução que o buscador obedece mesmo
 * quando chega à página por fora.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

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

  const tema = await lerTema()

  /**
   * A navegação, montada no SERVIDOR e entregue pronta ao componente cliente.
   *
   * Quem decide o que cada papel enxerga continua sendo o servidor — a lista
   * abaixo já sai filtrada. O cliente só sabe destacar onde a pessoa está; ele
   * nunca recebe um item que ela não poderia ver e depois o esconde com CSS.
   * A diferença importa: esconder no navegador é enfeite, não permissão.
   */
  const grupos: GrupoNav[] = [
    {
      titulo: 'A esteira',
      itens: [
        { href: '/painel', rotulo: 'Painel do dia', icone: 'mostrador' },
        { href: '/painel/acompanhar', rotulo: 'Acompanhar', icone: 'trilha' },
        { href: '/painel/ordens', rotulo: 'Ordens', icone: 'ordens' },
        { href: '/painel/agenda', rotulo: 'Agenda de rota', icone: 'rota' },
      ],
    },
    {
      titulo: 'Cadastros',
      itens: [
        { href: '/painel/clientes', rotulo: 'Clientes', icone: 'clientes' },
        { href: '/painel/equipamentos', rotulo: 'Equipamentos', icone: 'equipamento' },
      ],
    },
  ]

  const retaguarda: ItemNav[] = []
  if (podeVer(p, Papel.TECNICO)) retaguarda.push({ href: '/painel/estoque', rotulo: 'Estoque', icone: 'estoque' })
  if (podeVer(p, Papel.FINANCEIRO)) retaguarda.push({ href: '/painel/financeiro', rotulo: 'Financeiro', icone: 'financeiro' })
  if (podeVer(p, Papel.GESTOR)) retaguarda.push({ href: '/painel/whatsapp', rotulo: 'WhatsApp', icone: 'balao' })
  if (retaguarda.length > 0) grupos.push({ titulo: 'Retaguarda', itens: retaguarda })

  if (p === Papel.SUPER_ADMIN) {
    grupos.push({
      titulo: 'Plataforma',
      itens: [
        { href: '/painel/empresas', rotulo: 'Empresas', icone: 'empresas' },
        { href: '/painel/site', rotulo: 'Site', icone: 'site' },
      ],
    })
  }

  return (
    /**
     * O tema vive AQUI, no invólucro do painel, e não no `<html>`.
     *
     * O site institucional é escuro por desenho — a primeira dobra foi
     * composta para o escuro, e não é preferência de quem visita. Só o painel
     * troca. Amarrar o tema ao `<html>` faria a escolha de quem trabalha no
     * sistema vazar para a home que o cliente vê.
     */
    <div className={estilo.app} data-tema={tema}>
      <aside className={estilo.lateral}>
        <div className={estilo.latMarca}>
          <Marca larguraPx={132} />
        </div>

        {/* O crachá. Numa plataforma multiempresa, saber COM QUE PODER você
            está olhando é tão importante quanto saber onde está: as mesmas
            telas mostram coisas diferentes para papéis diferentes. */}
        <div className={estilo.cracha}>
          <span className={estilo.crachaPapel}>{rotuloPapel(p)}</span>
          <strong className={estilo.crachaEmpresa}>
            {sessao.tenantNome ?? 'Plataforma'}
          </strong>
        </div>

        <Navegacao grupos={grupos} />

        <div className={estilo.latPe}>
          <SeletorDeTema atual={tema} />

          <div className={estilo.latUser}>
            <span className={estilo.avatar}>{iniciais}</span>
            <div className={estilo.latUserTxt}>
              <strong>{sessao.nome}</strong>
              <span>{sessao.email}</span>
            </div>
            <form action={sair}>
              <button type="submit" className={estilo.sair} title="Sair do sistema">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className={estilo.principal}>
        <header className={estilo.barra}>
          <span className={estilo.pillEmpresa}>
            <i className={estilo.pulso} aria-hidden="true" />
            {sessao.tenantNome ?? 'Plataforma'}
          </span>
          <span className={estilo.data}>{hoje()}</span>
        </header>
        <div className={estilo.rolagem}>
          {children}
          <footer className={estilo.rodape}>
            <Credito />
          </footer>
        </div>
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
