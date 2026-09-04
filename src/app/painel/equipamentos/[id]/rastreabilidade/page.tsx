import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel } from '@/server/auth/guarda'
import { rastreabilidade } from '@/server/consultas/rastreabilidade'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { PAPEL_ROTULO, rotuloAcao } from '../../../auditoria/rotulos'
import estilo from '../../../painel.module.css'

export const metadata: Metadata = { title: 'Rastreabilidade', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * =============================================================================
 * A FOLHA DE "QUEM MEXEU EM QUÊ"
 * =============================================================================
 * O sistema já guardava tudo isto em três lugares que nunca se encontravam: a
 * trilha de etapas de cada O.S., o log de auditoria do sistema, e as provas
 * (fotos, assinaturas, documentos). Responder "quem mexeu neste aparelho"
 * exigia abrir a ficha, depois cada O.S., depois cada trilha, e cruzar de
 * cabeça com a tela de auditoria. Ninguém faz isso com o cliente no telefone.
 *
 * =============================================================================
 * ELA É FEITA PARA SAIR NO PAPEL
 * =============================================================================
 * Este é um documento que se ENTREGA — para o cliente que perguntou, para o
 * fabricante em pedido de garantia, para a vigilância sanitária. Por isso a
 * página tem regra de impressão própria: some a lateral, some os botões, o
 * fundo vira branco, e a folha começa com quem é o aparelho.
 *
 * NÃO É UM PDF GERADO NO SERVIDOR, e a escolha é consciente. O gerador de
 * documentos deste sistema é amarrado a UMA O.S.; rastreabilidade atravessa
 * todas as O.S. do aparelho. Fazer um caminho novo no gerador para isso seria
 * semanas de trabalho para produzir a mesma folha que o "imprimir → salvar em
 * PDF" do navegador entrega hoje, com a vantagem de o operador ver na tela
 * exatamente o que vai sair.
 *
 * =============================================================================
 * O QUE ESTA TELA NÃO FAZ
 * =============================================================================
 * Ela não aponta culpado. Mostra o que ficou registrado — data, nome, papel — e
 * deixa a leitura para quem sabe do assunto. As tentativas NEGADAS aparecem
 * junto e marcadas: esconder o que o sistema recusou seria contar metade da
 * história, e é justamente a metade que um relatório destes existe para contar.
 */
export default async function FolhaDeRastreabilidade({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  /**
   * `exigirNivel`, E NÃO `exigirPapel` — os dois guardas parecem o mesmo e não
   * são, e eu caí nessa aqui.
   *
   * `exigirPapel(GESTOR)` é lista EXATA: passa quem é gestor, e mais ninguém.
   * O administrador da empresa, que está ACIMA do gestor na hierarquia, batia
   * em "esta parte não é do seu perfil" na própria folha que ele mais precisa.
   * `exigirNivel(GESTOR)` é o piso: gestor para cima entra.
   *
   * O piso é GESTOR porque esta folha NOMEIA PESSOAS e mostra o que cada uma
   * fez — inclusive o que tentaram fazer e o sistema recusou. Isso é
   * informação de gestão, não de bancada.
   */
  const { ctx } = await exigirNivel(Papel.GESTOR)
  const { id } = await params

  const r = await rastreabilidade(ctx, id)
  if (!r) notFound()

  const quando = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(d)

  const totalDePassos = r.ordens.reduce((s, o) => s + o.passos.length, 0)

  return (
    <div className={estilo.folhaRastro}>
      <div className={`${estilo.cab} ${estilo.rastroTopo}`}>
        <div>
          <p className={estilo.grav}>Rastreabilidade</p>
          <h1 className={estilo.titulo}>
            {r.equipamento.marca} {r.equipamento.modelo}
          </h1>
          <p className={estilo.texto}>
            {r.equipamento.numeroSerie ? `Série ${r.equipamento.numeroSerie} · ` : ''}
            {r.equipamento.cliente}
          </p>
        </div>
        {/* Os dois somem no papel: um leva de volta, o outro é o próprio ato
            de imprimir. Botão impresso é tinta gasta. */}
        <div className={estilo.rastroAcoes}>
          <Link href={`/painel/equipamentos/${r.equipamento.id}`} className={estilo.btnSec}>
            Voltar à ficha
          </Link>
        </div>
      </div>

      {/* O RESUMO ANTES DA LISTA.
          Quem abre esta folha quer saber três coisas antes de ler linha por
          linha: quantas vezes o aparelho passou por aqui, quantas pessoas
          tocaram nele, e se alguma coisa foi barrada. */}
      <div className={`${estilo.resumo} ${estilo.resumo3}`}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Passagens</span>
          <span className={estilo.indValor}>{r.ordens.length}</span>
          <span className={estilo.indNota}>
            {r.ordens.length === 1 ? 'ordem de serviço' : 'ordens de serviço'} · {totalDePassos}{' '}
            registros
          </span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Pessoas que tocaram</span>
          <span className={estilo.indValor}>{r.pessoas.length}</span>
          <span className={estilo.indNota}>{r.provas} provas anexadas</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Tentativas barradas</span>
          <span className={r.negadas > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {r.negadas}
          </span>
          <span className={estilo.indNota}>
            {r.negadas === 0 ? 'nenhuma ação foi recusada' : 'ações que o sistema recusou'}
          </span>
        </div>
      </div>

      {/* QUEM TOCOU, ordenado por quem mais mexeu. É a resposta curta da
          pergunta que traz alguém a esta tela. */}
      {r.pessoas.length > 0 ? (
        <section className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Quem mexeu neste aparelho</p>
          <ul className={estilo.rastroPessoas}>
            {r.pessoas.map((p) => (
              <li key={`${p.nome}-${p.papel}`} className={estilo.rastroPessoa}>
                <strong>{p.nome}</strong>
                <span className={estilo.fraco}>
                  {p.papel ? (PAPEL_ROTULO[p.papel] ?? p.papel.toLowerCase()) : 'sistema'}
                </span>
                <span className={estilo.rastroContagem}>
                  {p.passos} {p.passos === 1 ? 'registro' : 'registros'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {r.ordens.length === 0 ? (
        <p className={estilo.vazio}>
          Este equipamento ainda não passou por nenhuma ordem de serviço. A folha
          se preenche sozinha na primeira vez que ele entrar.
        </p>
      ) : (
        r.ordens.map((o) => (
          <section key={o.id} className={estilo.bloco}>
            <div className={estilo.rastroCabOS}>
              <p className={estilo.blocoTitulo}>
                O.S. #{String(o.numero).padStart(4, '0')} · {ROTULO_ETAPA[o.etapa]}
                {o.emGarantia ? ' · em garantia' : ''}
              </p>
              <span className={estilo.grav}>
                aberta em {quando(o.abertaEm)}
                {o.entregueEm ? ` · entregue em ${quando(o.entregueEm)}` : ''}
              </span>
            </div>
            {o.defeito ? <p className={estilo.rastroDefeito}>“{o.defeito}”</p> : null}

            <ol className={estilo.rastroPassos}>
              {o.passos.map((p, i) => (
                <li
                  key={`${o.id}-${i}`}
                  className={p.negado ? `${estilo.rastroPasso} ${estilo.rastroNegado}` : estilo.rastroPasso}
                >
                  <span className={estilo.rastroQuando}>{quando(p.quando)}</span>
                  <span className={estilo.rastroOque}>
                    {/* A trilha de etapas já nasce escrita em português; a
                        auditoria nasce como CHAVE (`portal.documento.errado`),
                        que é curta e estável de propósito para sobreviver a
                        troca de tela. Numa folha que vai para a mão de um
                        cliente, ou de um fiscal, chave crua é ruído de máquina.
                        `rotuloAcao` é o MESMO tradutor da tela de auditoria —
                        traduzir de novo aqui criaria dois vocabulários para os
                        mesmos fatos. */}
                    {p.origem === 'acao' ? rotuloAcao(p.titulo) : p.titulo}
                    {p.negado ? <strong className={estilo.rastroSelo}> recusado pelo sistema</strong> : null}
                  </span>
                  <span className={estilo.rastroQuem}>
                    {p.quem}
                    {p.papel ? (
                      <span className={estilo.fraco}> · {PAPEL_ROTULO[p.papel] ?? p.papel.toLowerCase()}</span>
                    ) : null}
                  </span>
                  {p.provas.length > 0 ? (
                    <span className={estilo.rastroProvas}>{p.provas.join(' · ')}</span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      {/* O RODAPÉ É PARTE DO DOCUMENTO, e não enfeite: uma folha que sai da
          impressora precisa dizer de onde veio e de quando é. Sem a data,
          alguém compara duas versões daqui a um ano sem saber qual é a atual. */}
      <p className={estilo.rastroRodape}>
        Documento gerado pelo DTECH MED em {quando(r.geradoEm)} · A trilha de etapas é encadeada
        por hash e o banco recusa alterá-la.
      </p>
    </div>
  )
}
