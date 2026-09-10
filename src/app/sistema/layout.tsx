import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { contextoDe, encerrarSessao, lerSessao } from '@/server/auth/sessao'
import { estadoWhatsapp } from '@/server/consultas/listas'
import { lerTema } from '@/server/acoes/tema'
import { whatsappNoAr } from '@/lib/whatsapp-estado'
import { menuDaSessao, telasDaSessao } from '@/server/sistema/navegacao'
import { contagensDoRadar } from '@/server/sistema/radar'
import Lateral, { type GrupoLateral } from '@/components/sistema/lateral'
import Busca from '@/components/sistema/busca'
import SeletorTema from '@/components/sistema/seletor-tema'
import Migalha from '@/components/sistema/migalha'
import { Marca } from '../marca'
import estilo from '@/components/sistema/shell.module.css'
import './tokens.css'

/**
 * O APPSHELL DO SISTEMA NOVO.
 *
 * =============================================================================
 * O QUE ESTA MOLDURA GARANTE
 * =============================================================================
 * Toda tela do sistema é composição dentro dela, e é ela que sustenta as três
 * promessas do redesenho:
 *
 *   · O menu é agrupado por INTENÇÃO e sai FILTRADO do servidor. Um motorista
 *     não recebe — nem escondido — uma linha de Financeiro.
 *   · O tema vale para a área de trabalho e NÃO para a moldura. A lateral é
 *     escura sempre; o porquê está em tokens.css.
 *   · A migalha em mono no topo de cada tela diz onde a pessoa está e se a
 *     máquina está de pé.
 *
 * =============================================================================
 * A FLAG DECIDE QUEM ENTRA AQUI
 * =============================================================================
 * `uiV2` é por empresa. Quem trabalha numa empresa com a flag desligada e
 * digitar `/sistema` é devolvido ao painel de sempre — não é erro, é a empresa
 * dela ainda não ter sido migrada, e um "sem permissão" mentiria sobre o
 * motivo.
 *
 * O DONO DA PLATAFORMA, fora de uma visita, não tem empresa e portanto não tem
 * flag: ele cai no painel da rede, que é o trabalho dele. Dentro de uma visita
 * ele segue a flag DA EMPRESA VISITADA, porque visita existe para ver o que a
 * empresa vê.
 */

export const metadata: Metadata = {
  // O sistema nunca é indexado. O robots.txt já pede e o login já barra, mas as
  // duas coisas falham de jeitos diferentes — e `noindex` é a única instrução
  // que o buscador obedece mesmo quando chega à página por fora.
  robots: { index: false, follow: false, nocache: true },
}

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/entrar')
  if (sessao.trocarSenha) redirect('/painel/trocar-senha')
  if (!sessao.uiV2) redirect('/painel')

  const ctx = contextoDe(sessao)
  const tema = await lerTema()

  // O estado do número, para o selo da barra e para o ponto da migalha. Uma
  // consulta por índice único, na mesma transação de escopo — e ela responde a
  // pergunta que ninguém pensa em fazer: "os avisos ao cliente ainda saem?".
  const whats = await estadoWhatsapp(ctx)
  const whatsOk = whatsappNoAr(whats?.status)

  const menu = menuDaSessao(sessao)
  const minhas = telasDaSessao(sessao)

  /**
   * OS CONTADORES DO MENU — o Radar chegando à lateral.
   *
   * A pessoa vê que tem coisa esperando na Conferência sem abrir a Conferência.
   * É uma consulta agregada só, e ela já é feita com o recorte do papel: o
   * número que aparece ao lado de "Ordens" para um técnico não é o mesmo que
   * aparece para a gestão, porque não é a mesma pergunta.
   */
  const pendentes = await contagensDoRadar(ctx, sessao.papel)

  const grupos: GrupoLateral[] = menu.map((g) => ({
    titulo: g.titulo,
    itens: g.itens.map((t) => ({
      chave: t.chave,
      rotulo: t.rotulo,
      href: t.href,
      icone: t.icone,
      pendentes: pendentes[t.chave],
    })),
  }))

  async function sair() {
    'use server'
    await encerrarSessao()
    redirect('/entrar')
  }

  const iniciais = sessao.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    /**
     * `data-ui="v2"` é o que liga a paleta Azul Máquina, e ela vive AQUI e não
     * no `<html>`. O site institucional é violeta por desenho, e não é
     * preferência de quem visita: amarrar a paleta ao documento faria a escolha
     * de quem trabalha no sistema vazar para a home que o cliente vê.
     *
     * Pelo mesmo motivo o tema fica aqui: só a área de trabalho troca.
     */
    <div className={estilo.shell} data-ui="v2" data-tema={tema}>
      <aside className={estilo.lateral}>
        <div className={estilo.latMarca}>
          <Link href="/sistema" aria-label="Ir para o painel">
            <Marca larguraPx={132} />
          </Link>
        </div>

        <div className={estilo.cracha}>
          <span className={estilo.crachaPapel}>{rotuloPapel(sessao.papel)}</span>
          <strong className={estilo.crachaEmpresa}>{sessao.tenantNome ?? 'Plataforma'}</strong>
        </div>

        <Lateral grupos={grupos} />

        <div className={estilo.latPe}>
          <SeletorTema atual={tema} />
          <div className={estilo.usuario}>
            <span className={estilo.avatar} aria-hidden="true">
              {iniciais}
            </span>
            <div className={estilo.usuarioTxt}>
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
          <div className={estilo.buscaVaga}>
            <Busca />
          </div>

          <div className={estilo.pilhaDireita}>
            {/* O SELO DO WHATSAPP vive na barra de TODA tela. Quando o número
                cai, nada mais na tela muda: o orçamento salva, a ordem anda, e
                os avisos ao cliente param de sair em silêncio. Um selo que só
                existisse na tela de WhatsApp seria visto por quem já
                desconfiava. */}
            {whats && !whatsOk ? (
              <Link href="/sistema/admin/integracoes" className={`${estilo.whats} ${estilo.whatsRuim}`}>
                WhatsApp fora do ar
              </Link>
            ) : whats ? (
              <span className={estilo.whats}>
                <i className={estilo.whatsPonto} aria-hidden="true" />
                {whats.numero ?? 'conectado'}
              </span>
            ) : null}

            <span className={estilo.data}>{hoje()}</span>
          </div>
        </header>

        {/* A faixa da visita, acima do conteúdo e em toda tela: esquecer em que
            empresa se está é o erro que faz alguém abrir uma ordem na franquia
            errada. */}
        {sessao.visitando ? (
          <p className={estilo.visita}>
            Você está dentro de {sessao.tenantNome ?? 'uma empresa'} — tudo que fizer fica no nome dela
          </p>
        ) : null}

        <main className={estilo.conteudo}>
          <Migalha
            telas={minhas.map((t) => ({ href: t.href, grupo: t.grupo, rotulo: t.rotulo }))}
            saudavel={whatsOk}
            motivo={whats ? 'O WhatsApp da empresa está fora do ar — os avisos ao cliente não estão saindo.' : undefined}
          />
          {children}
        </main>
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
