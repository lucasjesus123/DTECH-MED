import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatarBRL } from '@/lib/dinheiro'
import { carregarPropostaPublica } from '@/server/acoes/portal'
import { Resposta } from './resposta'
import estilo from '../../os/[token]/portal.module.css'
import { Credito } from '@/app/credito'
import { Simbolo } from '@/app/marca'

export const metadata: Metadata = {
  title: 'Seu orçamento',
  // Página com preço e nome de cliente não entra em buscador, mesmo com link
  // opaco. É a mesma regra do portal da ordem.
  robots: { index: false, follow: false, nocache: true },
}
export const dynamic = 'force-dynamic'

/**
 * O ORÇAMENTO DO PASSO 1, DO LADO DO CLIENTE.
 *
 * =============================================================================
 * POR QUE NÃO É UM PDF
 * =============================================================================
 * PDF de orçamento é o que a maioria manda, e é o que a maioria não consegue
 * responder: o cliente abre no celular, dá pinça para ler o total, e depois
 * digita "pode fazer" numa conversa — que é onde a aprovação se perde, porque
 * ninguém sabe depois QUEM aprovou e QUANDO.
 *
 * Esta página é o orçamento E o lugar de responder. O que ele aprova é
 * exatamente o que ele está lendo, com carimbo de tempo e o documento
 * conferido. E ela imprime: quem precisar de papel usa "Salvar como PDF" do
 * próprio navegador e recebe o mesmo conteúdo, sem os botões.
 *
 * =============================================================================
 * ELA REUSA O CSS DO PORTAL DA ORDEM
 * =============================================================================
 * De propósito. É o mesmo cliente, no mesmo celular, vindo do mesmo WhatsApp —
 * duas folhas de estilo dariam duas caras para a mesma empresa, e a segunda
 * envelheceria sozinha.
 */
/**
 * A data no fuso da CASA, e não no do celular de quem abre.
 *
 * Fora do componente porque o formatador é o mesmo em toda chamada — declarar
 * dentro faria a regra de pureza do React acusar, com razão: uma função nova a
 * cada render que não depende de nada do render.
 */
const DATA_BR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })
const data = (d: Date) => DATA_BR.format(d)

/** Fora do componente: `Date.now()` no render é chamada impura. */
function vencida(ate: Date | null): boolean {
  return !!ate && ate.getTime() < Date.now()
}

export default async function PortalDaProposta({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const p = await carregarPropostaPublica(token)
  if (!p) notFound()

  /**
   * A validade é resolvida NA CONSULTA, e não no render.
   *
   * `Date.now()` dentro do componente é chamada impura — a regra do React
   * acusa, e ela tem razão: o mesmo render podendo dar respostas diferentes é
   * exatamente o tipo de coisa que produz uma tela que diz "válido" e um
   * servidor que recusa. O servidor confere de novo na hora de aprovar, que é
   * onde a decisão vale.
   */
  const venceu = vencida(p.validoAte)
  const aguardando = p.status === 'ENVIADA' && !venceu

  return (
    <div className={estilo.palco}>
      <header className={estilo.topo}>
        <span className={estilo.marcaD}>
          <Simbolo larguraPx={16} />
        </span>
        <span className={estilo.marcaTxt}>{p.tenant.nome}</span>
      </header>

      <div className={estilo.miolo}>
        <p className={estilo.grav}>Orçamento #{String(p.numero).padStart(4, '0')}</p>
        <h1 className={estilo.titulo}>{p.equipamentoDescricao}</h1>
        <p className={estilo.sub}>
          Para {p.cliente.nome}
          {p.validoAte ? ` · válido até ${data(p.validoAte)}` : ''}
        </p>

        {/* A SITUAÇÃO VEM ANTES DO PREÇO quando ela não é "aguardando".
            Quem abre um link já respondido precisa saber disso na primeira
            linha, e não descobrir rolando até o fim que o botão sumiu. */}
        {!aguardando ? (
          <div className={estilo.etapaAtual}>
            <span className={estilo.pulso} aria-hidden="true" />
            <span>
              <span className={estilo.gravClara}>Situação</span>
              <strong>
                {p.status === 'APROVADA'
                  ? 'Você aprovou este orçamento'
                  : p.status === 'RECUSADA'
                    ? 'Este orçamento foi recusado'
                    : venceu || p.status === 'EXPIRADA'
                      ? 'Este orçamento passou da validade'
                      : p.status === 'CANCELADA'
                        ? 'Este orçamento foi cancelado'
                        : 'Ainda estamos montando este orçamento'}
              </strong>
            </span>
          </div>
        ) : null}

        {p.necessidade ? (
          <div className={estilo.laudo}>
            <span className={estilo.gravClara}>O que você nos contou</span>
            <p>{p.necessidade}</p>
          </div>
        ) : null}

        <div className={estilo.caixaOrcamento}>
          <span className={estilo.gravClara}>Total</span>
          <p className={estilo.total}>{formatarBRL(p.totalCentavos)}</p>
          <p className={estilo.condicoes}>
            {[
              p.condicoesPagamento,
              p.prazoExecucaoDias > 0 ? `Execução em até ${p.prazoExecucaoDias} dias` : null,
              p.garantiaDias > 0 ? `Garantia de ${p.garantiaDias} dias` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <table className={estilo.tabela}>
          <caption className={estilo.grav} style={{ textAlign: 'left' }}>
            O que está incluído
          </caption>
          <thead>
            <tr>
              <th>Item</th>
              <th className={estilo.num}>Qtd.</th>
              <th className={estilo.num}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {p.itens.map((i) => (
              <tr key={i.id}>
                <td>{i.descricao}</td>
                <td className={estilo.num}>{Number(i.quantidade)}</td>
                <td className={estilo.num}>{formatarBRL(i.valorTotalCentavos)}</td>
              </tr>
            ))}
            {p.descontoCentavos > 0 ? (
              <tr>
                <td>Desconto</td>
                <td className={estilo.num}>—</td>
                <td className={estilo.num}>− {formatarBRL(p.descontoCentavos)}</td>
              </tr>
            ) : null}
            {p.acrescimoCentavos > 0 ? (
              <tr>
                <td>Acréscimo</td>
                <td className={estilo.num}>—</td>
                <td className={estilo.num}>{formatarBRL(p.acrescimoCentavos)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {p.observacoes ? (
          <div className={estilo.laudo}>
            <span className={estilo.gravClara}>Observações</span>
            <p>{p.observacoes}</p>
          </div>
        ) : null}

        {aguardando ? (
          <Resposta token={token} total={formatarBRL(p.totalCentavos)} />
        ) : p.status === 'APROVADA' ? (
          <p className={estilo.avisoOk}>
            Aprovado por {p.aprovadaPorNome}
            {p.respondidaEm ? ` em ${data(p.respondidaEm)}` : ''}. Vamos entrar em contato para
            combinar a retirada do aparelho.
          </p>
        ) : null}

        <div className={estilo.secao}>
          <p className={estilo.grav}>Dúvida sobre algum item?</p>
          <p className={estilo.sub}>
            Fale com a {p.tenant.nome}
            {p.tenant.telefone ? ` pelo ${p.tenant.telefone}` : ''} ou responda a mesma conversa do
            WhatsApp em que este link chegou.
          </p>
        </div>
      </div>

      <footer className={estilo.rodape}>
        <Credito />
      </footer>
    </div>
  )
}
