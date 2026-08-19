import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirPapel } from '@/server/auth/guarda'
import { comEscopo } from '@/lib/db'
import { formatarBRL } from '@/lib/dinheiro'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import { montarTrilha } from '@/server/ordem/trilha'
import { coberturaDoEquipamento, frasedaCobertura } from '@/server/ordem/garantia'
import { ROTULO_PERIODICIDADE } from '@/server/preventiva/servico'
import { ROTULO_DESTINO } from '@/lib/peca-retirada'
import estilo from '../../painel.module.css'

export const metadata: Metadata = { title: 'Prontuário do equipamento', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * O PRONTUÁRIO DO EQUIPAMENTO.
 *
 * ---------------------------------------------------------------------------
 * POR QUE DA MÁQUINA, E NÃO DO CLIENTE
 * ---------------------------------------------------------------------------
 * O sistema já sabia tudo sobre cada ORDEM. O que não existia era a visão de
 * cima: este aparelho, desde que existe, o que já aconteceu com ele.
 *
 * E ela é do EQUIPAMENTO, não do cliente, porque é a máquina que carrega o
 * histórico. A clínica troca de dono, o técnico responsável muda, o contato
 * sai da empresa — a autoclave continua a mesma, com a mesma resistência
 * trocada duas vezes em dezoito meses. É esse padrão que decide se vale
 * consertar de novo ou dizer ao cliente que a hora é de trocar.
 *
 * É a ideia do Serial No do ERPNext, onde toda a vida do item pendura no número
 * de série. Aqui o número de série já existia no cadastro e servia só de
 * etiqueta.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE RESPONDE, NESTA ORDEM
 * ---------------------------------------------------------------------------
 *  1. Está na garantia? — decide se cobra
 *  2. Tem contrato de preventiva? — decide se é para agendar
 *  3. Quanto esta máquina já rendeu, e quantas vezes voltou
 *  4. Todas as ordens, com a trilha de cada uma
 *  5. Que peças já saíram dela
 */
export default async function Prontuario({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.TECNICO,
    Papel.FINANCEIRO,
  )
  const { id } = await params

  const eq = await comEscopo(ctx, (tx) =>
    tx.equipamento.findUnique({
      where: { id },
      select: {
        id: true,
        marca: true,
        modelo: true,
        numeroSerie: true,
        categoria: true,
        voltagem: true,
        acessorios: true,
        criadoEm: true,
        cliente: { select: { id: true, nome: true, cidade: true, uf: true, whatsapp: true } },
        ordens: {
          orderBy: { numero: 'desc' },
          select: {
            id: true,
            numero: true,
            etapa: true,
            abertaEm: true,
            entregueEm: true,
            emGarantia: true,
            garantiaAte: true,
            defeitoRelatado: true,
            eventos: { select: { etapaNova: true, criadoEm: true, autorNome: true } },
            fatura: { select: { valorPagoCentavos: true, status: true } },
            pecasRetiradas: { select: { id: true, descricao: true, destino: true, criadoEm: true } },
          },
        },
        contratos: {
          where: { ativo: true },
          select: { id: true, numero: true, periodicidade: true, inicio: true, fim: true, valorVisitaCentavos: true },
        },
      },
    }),
  )
  if (!eq) notFound()

  const cobertura = frasedaCobertura(
    await comEscopo(ctx, (tx) => coberturaDoEquipamento(tx, eq.id)),
  )

  const faturado = eq.ordens.reduce((s, o) => s + (o.fatura?.valorPagoCentavos ?? 0), 0)
  const retornos = eq.ordens.filter((o) => o.emGarantia).length
  const contrato = eq.contratos[0]
  const retiradas = eq.ordens.flatMap((o) =>
    o.pecasRetiradas.map((p) => ({ ...p, ordem: o.numero })),
  )

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Prontuário do equipamento</p>
          <h1 className={estilo.titulo}>
            {eq.marca} {eq.modelo}
          </h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            <Link href={`/painel/clientes?q=${encodeURIComponent(eq.cliente.nome)}`}>
              {eq.cliente.nome}
            </Link>
            {eq.cliente.cidade ? ` · ${eq.cliente.cidade}${eq.cliente.uf ? `/${eq.cliente.uf}` : ''}` : ''}
            {eq.numeroSerie ? ` · série ${eq.numeroSerie}` : ''}
          </p>
        </div>
        <div className={estilo.selosCab}>
          {cobertura ? (
            <span className={`${estilo.tag} ${estilo.tagOk}`}>
              {cobertura}
            </span>
          ) : (
            <span className={`${estilo.tag} ${estilo.tagNeutra}`}>
              fora da garantia
            </span>
          )}
          {contrato ? (
            <span className={`${estilo.tag} ${estilo.tagOk}`}>
              contrato #{String(contrato.numero).padStart(4, '0')} · {ROTULO_PERIODICIDADE[contrato.periodicidade]}
            </span>
          ) : (
            <span className={estilo.fraco}>sem contrato de preventiva</span>
          )}
        </div>
      </div>

      <div className={estilo.resumo}>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Passagens pela assistência</span>
          <span className={estilo.indValor}>{eq.ordens.length}</span>
          <span className={estilo.indNota}>
            desde {eq.criadoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Voltou em garantia</span>
          <span className={retornos > 0 ? `${estilo.indValor} ${estilo.indAlerta}` : estilo.indValor}>
            {retornos}
          </span>
          <span className={estilo.indNota}>
            {retornos > 0 ? 'reincidência — olhe a causa raiz' : 'nenhum retorno'}
          </span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Já rendeu</span>
          <span className={estilo.indValor}>{formatarBRL(faturado)}</span>
          <span className={estilo.indNota}>recebido nesta máquina</span>
        </div>
        <div className={estilo.indicador}>
          <span className={estilo.indNota}>Peças trocadas</span>
          <span className={estilo.indValor}>{retiradas.length}</span>
          <span className={estilo.indNota}>saíram deste aparelho</span>
        </div>
      </div>

      <div className={estilo.duasColunas}>
        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Todas as passagens</span>
              <span className={estilo.fraco}>mais recente primeiro</span>
            </p>

            {eq.ordens.length === 0 ? (
              <p className={estilo.texto}>
                Este aparelho está cadastrado mas nunca passou por uma ordem de serviço.
              </p>
            ) : (
              <div className={estilo.lista}>
                {eq.ordens.map((o) => {
                  const t = montarTrilha(
                    o.etapa,
                    o.eventos.map((e) => ({ para: e.etapaNova, criadoEm: e.criadoEm, autorNome: e.autorNome })),
                  )
                  return (
                    <Link key={o.id} href={`/painel/ordens/${o.id}`} className={estilo.cardOrdem}>
                      <div className={estilo.cardTopo}>
                        <span className={estilo.cardOs}>#{String(o.numero).padStart(4, '0')}</span>
                        <span className={o.emGarantia ? `${estilo.selo} ${estilo.tagEspera}` : estilo.selo}>
                          {o.emGarantia ? 'em garantia' : ROTULO_ETAPA[o.etapa]}
                        </span>
                      </div>
                      <div className={estilo.cardCli} style={{ marginTop: 'var(--s2)' }}>
                        {o.defeitoRelatado}
                      </div>
                      <div className={estilo.trilhaMini}>
                        <div className={estilo.trilhaMiniFio}>
                          <span
                            className={t.desvio ? estilo.trilhaMiniParado : estilo.trilhaMiniCheio}
                            style={{ width: `${t.porcento}%` }}
                          />
                        </div>
                        <div className={estilo.trilhaMiniTxt}>
                          <span>{t.agora}</span>
                          <span>
                            {t.cumpridos}/{t.total}
                          </span>
                        </div>
                      </div>
                      <div className={estilo.cardRod}>
                        <span>
                          aberta {o.abertaEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                        <span>
                          {o.fatura ? formatarBRL(o.fatura.valorPagoCentavos) : 'sem cobrança'}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>A máquina</p>
            <div className={estilo.pares}>
              <Par rot="Marca e modelo" val={`${eq.marca} ${eq.modelo}`} />
              <Par rot="Número de série" val={eq.numeroSerie ?? '—'} />
              <Par rot="Categoria" val={eq.categoria ?? '—'} />
              <Par rot="Voltagem" val={eq.voltagem ?? '—'} />
              <Par rot="Acessórios" val={eq.acessorios ?? 'nenhum registrado'} />
            </div>
          </div>

          {contrato ? (
            <div className={estilo.bloco}>
              <p className={estilo.blocoTitulo}>Contrato de preventiva</p>
              <div className={estilo.pares}>
                <Par rot="Número" val={`#${String(contrato.numero).padStart(4, '0')}`} />
                <Par rot="Periodicidade" val={ROTULO_PERIODICIDADE[contrato.periodicidade]} />
                <Par rot="Valor por visita" val={formatarBRL(contrato.valorVisitaCentavos)} />
                <Par
                  rot="Vigência"
                  val={`${contrato.inicio.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} → ${
                    contrato.fim
                      ? contrato.fim.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                      : 'sem prazo'
                  }`}
                />
              </div>
            </div>
          ) : null}

          <div className={estilo.bloco}>
            <p className={estilo.blocoTitulo}>
              <span>Peças que saíram daqui</span>
              <span className={estilo.fraco}>{retiradas.length}</span>
            </p>
            {retiradas.length === 0 ? (
              <p className={estilo.texto}>
                Nenhuma peça registrada como retirada deste aparelho.
              </p>
            ) : (
              <ul className={estilo.linha}>
                {retiradas.map((p) => (
                  <li key={p.id} className={estilo.evento}>
                    <div className={estilo.eventoTop}>
                      <span className={estilo.eventoTitulo}>{p.descricao}</span>
                      <span className={estilo.eventoQuando}>O.S. #{String(p.ordem).padStart(4, '0')}</span>
                    </div>
                    <div className={estilo.eventoQuem}>
                      {ROTULO_DESTINO[p.destino]} ·{' '}
                      {p.criadoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Par({ rot, val }: { rot: string; val: string }) {
  return (
    <div className={estilo.par}>
      <span className={estilo.parRot}>{rot}</span>
      <span className={estilo.parVal}>{val}</span>
    </div>
  )
}
