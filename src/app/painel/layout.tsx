import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { telasEfetivas } from '@/server/auth/telas'
import { contextoDe, encerrarSessao, lerSessao } from '@/server/auth/sessao'
import { estadoWhatsapp } from '@/server/consultas/listas'
import { lerTema } from '@/server/acoes/tema'
import estilo from './painel.module.css'
import Navegacao, { type GrupoNav, type ItemNav } from './nav'
import SeletorDeTema from './tema'
import FaixaDaVisita from './faixa-da-visita'
import SeloWhatsapp from './selo-whatsapp'
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

  // O estado do número, para o selo da barra. Uma consulta por índice único, na
  // mesma transação de escopo — e ela responde a pergunta que ninguém pensa em
  // fazer: "os avisos ao cliente ainda estão saindo?".
  const whats = await estadoWhatsapp(contextoDe(sessao))

  /**
   * A navegação, montada no SERVIDOR e entregue pronta ao componente cliente.
   *
   * Quem decide o que cada papel enxerga continua sendo o servidor — a lista
   * abaixo já sai filtrada. O cliente só sabe destacar onde a pessoa está; ele
   * nunca recebe um item que ela não poderia ver e depois o esconde com CSS.
   * A diferença importa: esconder no navegador é enfeite, não permissão.
   */
  const grupos: GrupoNav[] = []

  /**
   * O SUPER ADMIN não opera a esteira — ele cuida da plataforma.
   *
   * -------------------------------------------------------------------------
   * POR QUE ELE DEIXOU DE VER AS TREZE ENTRADAS
   * -------------------------------------------------------------------------
   * Ele via o menu inteiro: painel do dia, ordens, agenda, estoque, financeiro,
   * WhatsApp — treze itens, e nenhum deles é trabalho dele. Quem dá baixa numa
   * ordem é a franquia; quem confere o caixa é a franquia. O dono da plataforma
   * cadastra a franquia, cadastra quem vai trabalhar nela, e olha se ela está
   * de pé.
   *
   * Menu que oferece o que a pessoa não faz não é generosidade: é ruído que ela
   * precisa aprender a ignorar, todo dia, para achar as duas entradas que
   * importam. Trocar treze por duas é o conserto.
   *
   * Isto é ARRUMAÇÃO, não trava. As telas continuam existindo e o guarda de
   * cada uma continua sendo quem decide — o super admin que digitar o endereço
   * de uma ordem chega nela, como sempre chegou. O que muda é o que o menu
   * oferece de saída.
   */
  if (p === Papel.SUPER_ADMIN && !sessao.visitando) {
    // "Administração", e não "Plataforma": o crachá logo acima já diz
    // Plataforma, porque é o lugar do nome da empresa e o super admin não tem
    // uma. A mesma palavra duas vezes, uma embaixo da outra, é metade da
    // sensação de bagunça — parece hierarquia onde não há.
    /**
     * "Empresas e usuários" era um item só, e apontava para as EMPRESAS.
     *
     * O rótulo prometia gente e entregava franquia. A tela das pessoas da rede
     * existia, funcionava, e não tinha como chegar nela sem digitar o endereço —
     * o que é o mesmo que não existir.
     *
     * Agora são dois itens, com o nome do que cada um faz. E a Trilha entra
     * aqui: quem é dono da rede é justamente quem precisa da pergunta "quem fez
     * isso?" respondida sem depender de ninguém.
     */
    grupos.push({
      titulo: 'Administração',
      itens: [
        { href: '/painel/empresas', rotulo: 'Empresas', icone: 'empresas' },
        { href: '/painel/usuarios', rotulo: 'Pessoas da rede', icone: 'clientes' },
        { href: '/painel/auditoria', rotulo: 'Trilha', icone: 'registro' },
        { href: '/painel/plataforma-whatsapp', rotulo: 'WhatsApp da rede', icone: 'balao' },
        { href: '/painel/site', rotulo: 'Site', icone: 'site' },
      ],
    })
  } else {
    /**
     * O menu de quem trabalha numa empresa nasce das ABAS que essa pessoa tem.
     *
     * Antes ele era escrito à mão aqui, e o guarda de cada página era escrito lá
     * na página — duas listas da mesma verdade, em arquivos diferentes, que
     * precisavam ser editadas juntas para sempre. É assim que se ganha um menu
     * que oferece uma tela que recusa.
     *
     * Agora as duas leem `TELAS`, o mesmo catálogo. Aba nova entra num lugar só.
     */
    for (const t of telasEfetivas(p, sessao.telas)) {
      const grupo = grupos.find((g) => g.titulo === t.grupo)
      const item: ItemNav = { href: t.href, rotulo: t.rotulo, icone: t.icone }
      if (grupo) grupo.itens.push(item)
      else grupos.push({ titulo: t.grupo, itens: [item] })
    }
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

          {/* O SELO DO WHATSAPP, e por que ele vive na barra de TODA tela.
              Quando o número cai, nada na tela muda: o orçamento continua
              salvando, a ordem continua andando, e os avisos ao cliente
              simplesmente param de sair. A fila engorda em silêncio e alguém
              descobre dias depois, pelo cliente reclamando que não foi avisado.
              Um selo que só existisse na tela de WhatsApp seria visto por quem
              já foi lá conferir — ou seja, por quem já desconfiava. */}
          <SeloWhatsapp estado={whats} />

          <span className={estilo.data}>{hoje()}</span>
        </header>
        <div className={estilo.rolagem}>
          {/* O `<main>` não é enfeite semântico: sem ele, o leitor de tela não
              tem para onde pular. A varredura de acessibilidade acusava
              `landmark-one-main` e `region` nas 23 telas do painel — todo o
              conteúdo ficava fora de qualquer marco, e quem navega por
              teclado precisava atravessar o menu inteiro a cada tela. */}
          {/* A faixa da visita. Fica ACIMA do conteúdo e em toda tela, porque
              esquecer em que empresa se está é o erro que faz alguém abrir uma
              ordem na franquia errada. */}
          {sessao.visitando ? <FaixaDaVisita empresa={sessao.tenantNome ?? 'empresa'} /> : null}

          <main>{children}</main>
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
