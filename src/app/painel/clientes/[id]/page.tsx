import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { formatarDocumento, formatarTelefone } from '@/lib/documentos'
import { formatarBRL } from '@/lib/dinheiro'
import { exigirPapel, exigirAba, podeVer } from '@/server/auth/guarda'
import { fichaDoCliente } from '@/server/consultas/cliente'
import { ROTULO_ETAPA } from '@/server/ordem/maquina-estados'
import FotoCatalogo from '../../foto-catalogo'
import estilo from '../../painel.module.css'

export const metadata: Metadata = { title: 'Cliente', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A FICHA DO CLIENTE.
 *
 * =============================================================================
 * A PERGUNTA
 * =============================================================================
 * "Quem é este cliente para nós?"
 *
 * Ela não tinha resposta em lugar nenhum. O cadastro estava na lista, os
 * aparelhos na tela de equipamentos, as ordens na de ordens, e a dívida
 * repartida entre faturas de serviço e lançamentos avulsos. Para decidir se
 * atendia com urgência, alguém abria quatro telas e somava de cabeça.
 *
 * O sintoma apareceu no Financeiro: "quem está segurando o caixa" ganhou um
 * link para a ficha do cliente, e o link não levava a lugar nenhum.
 *
 * =============================================================================
 * A ORDEM DA TELA É A ORDEM DA DECISÃO
 * =============================================================================
 * Primeiro o DINHEIRO, porque é o que muda o tom da conversa antes de ela
 * começar. Depois o TRABALHO em aberto, que é o que o cliente vai perguntar.
 * Depois os APARELHOS, o histórico e o cadastro — que são consulta, não
 * decisão.
 *
 * Ler o telefone antes do saldo faria alguém ligar para cobrar sem saber que a
 * pessoa já pagou.
 */
export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, sessao } = await exigirPapel(
    Papel.ADMIN_EMPRESA,
    Papel.GESTOR,
    Papel.ATENDENTE,
    Papel.FINANCEIRO,
  )
  await exigirAba('clientes')

  const { id } = await params
  const f = await fichaDoCliente(ctx, id)
  // 404 cobre os dois casos — não existe, e é de outra franquia. Para quem
  // pergunta eles são o mesmo, e é assim que a resposta não revela nada.
  if (!f) notFound()

  const c = f.cliente
  const podeMexer = podeVer(sessao.papel, Papel.ATENDENTE)
  const endereco = [
    [c.logradouro, c.numero].filter(Boolean).join(', '),
    c.complemento,
    c.bairro,
    [c.cidade, c.uf].filter(Boolean).join('/'),
    c.cep,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>
            <Link href="/painel/clientes">Clientes</Link> · {c.tipo === 'PJ' ? 'Empresa' : 'Pessoa'}
          </p>
          <h1 className={estilo.titulo}>{c.nome}</h1>
          {c.razaoSocial && c.razaoSocial !== c.nome ? (
            <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
              {c.razaoSocial}
            </p>
          ) : null}
        </div>
        <div className={estilo.acoesForm}>
          {c.whatsapp ? (
            <a
              className={estilo.btn}
              href={`https://wa.me/55${c.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              Chamar no WhatsApp
            </a>
          ) : null}
          <Link className={estilo.btnSec} href={`/painel/ordens/nova?cliente=${c.id}`}>
            Abrir ordem
          </Link>
        </div>
      </div>

      {!c.ativo ? (
        <p className={estilo.aviso} role="status">
          Este cliente está marcado como inativo. O histórico continua aqui — inativo não apaga
          nada, só tira da lista de quem se atende hoje.
        </p>
      ) : null}

      {/* ----- O dinheiro, primeiro ---------------------------------------- */}
      <div className={`${estilo.resumo} ${estilo.resumo5}`}>
        <Indicador
          rotulo="Deve agora"
          valor={formatarBRL(f.deveCentavos)}
          nota={
            f.avulsoAbertoCentavos > 0
              ? `${formatarBRL(f.deveCentavos - f.avulsoAbertoCentavos)} de serviço · ${formatarBRL(f.avulsoAbertoCentavos)} avulso`
              : 'faturas de serviço e avulsos'
          }
          alerta={f.deveCentavos > 0}
        />
        <Indicador
          rotulo="Vencido"
          valor={formatarBRL(f.vencidoCentavos)}
          nota={f.vencidoCentavos > 0 ? 'passou da data' : 'nada em atraso'}
          alerta={f.vencidoCentavos > 0}
        />
        {/* O número que muda a conversa: um atraso de mil reais de quem já
            pagou cem mil não é o mesmo atraso de quem nunca pagou nada. */}
        <Indicador
          rotulo="Já pagou"
          valor={formatarBRL(f.pagouTotalCentavos)}
          nota="desde o começo"
        />
        <Indicador
          rotulo="Ordens"
          valor={String(f.ordensTotal)}
          nota={f.ordensAbertas > 0 ? `${f.ordensAbertas} em andamento` : 'nenhuma em andamento'}
        />
        <Indicador
          rotulo="Aparelhos"
          valor={String(f.equipamentos.length)}
          nota="cadastrados neste cliente"
        />
      </div>

      {/* ----- O que está em aberto ---------------------------------------- */}
      {f.faturas.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Faturas em aberto</p>
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th scope="col">Fatura</th>
                  <th scope="col">O.S.</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className={estilo.dir}>
                    Em aberto
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.faturas.map((x) => (
                  <tr key={x.id}>
                    <td className={estilo.num}>#{String(x.numero).padStart(4, '0')}</td>
                    <td className={estilo.num}>
                      <Link href={`/painel/ordens/${x.ordemId}`}>
                        #{String(x.ordemNumero).padStart(4, '0')}
                      </Link>
                    </td>
                    <td>
                      {x.vencimento ? (
                        <span className={x.vencida ? estilo.atrasado : undefined}>
                          {dia(x.vencimento)}
                          {x.vencida ? ' · vencida' : ''}
                        </span>
                      ) : (
                        <span className={estilo.fraco}>sem data</span>
                      )}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir} ${estilo.forte}`}>
                      {formatarBRL(x.abertoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={estilo.dica}>
            Os valores avulsos deste cliente ficam no{' '}
            <Link href="/painel/financeiro?aba=receber">Financeiro, aba A receber</Link> — e já estão
            somados no &ldquo;Deve agora&rdquo; lá em cima.
          </p>
        </div>
      ) : null}

      <div className={estilo.duasColunas}>
        {/* ----- Os aparelhos ---------------------------------------------- */}
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Aparelhos deste cliente</p>
          {f.equipamentos.length === 0 ? (
            <p className={estilo.vazio}>
              Nenhum aparelho cadastrado. Ele nasce junto com a primeira ordem.
            </p>
          ) : (
            <ul className={estilo.caixaLista}>
              {f.equipamentos.map((e) => (
                <li key={e.id} className={estilo.caixaItem}>
                  <FotoCatalogo
                    tipo="equipamento"
                    id={e.id}
                    nome={`${e.marca} ${e.modelo}`}
                    tem={e.temFoto}
                    podeMexer={podeMexer}
                  />
                  <div className={estilo.caixaMeio}>
                    <strong className={estilo.caixaDesc}>
                      {e.marca} {e.modelo}
                    </strong>
                    <p className={estilo.caixaDetalhe}>
                      {e.numeroSerie ? <span>série {e.numeroSerie}</span> : null}
                      {e.categoria ? <span className={estilo.caixaCat}>{e.categoria}</span> : null}
                    </p>
                  </div>
                  <div className={estilo.caixaValor}>
                    <strong>{e.passagens}</strong>
                    <span className={estilo.fraco}>
                      {e.passagens === 1 ? 'passagem' : 'passagens'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ----- Os contratos ---------------------------------------------- */}
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Contratos de manutenção</p>
          {f.contratos.length === 0 ? (
            <p className={estilo.vazio}>Nenhum contrato.</p>
          ) : (
            <ul className={estilo.caixaLista}>
              {f.contratos.map((k) => (
                <li
                  key={k.id}
                  className={k.ativo ? estilo.caixaItem : `${estilo.caixaItem} ${estilo.caixaItemFrio}`}
                >
                  <div className={estilo.caixaMeio}>
                    <strong className={estilo.caixaDesc}>
                      #{String(k.numero).padStart(4, '0')} · {k.equipamento.marca}{' '}
                      {k.equipamento.modelo}
                    </strong>
                    <p className={estilo.caixaDetalhe}>
                      <span className={estilo.caixaCat}>
                        {k.periodicidade.toLowerCase().replace(/_/g, ' ')}
                      </span>
                      <span>
                        desde {dia(k.inicio)}
                        {k.fim ? ` até ${dia(k.fim)}` : ''}
                      </span>
                    </p>
                  </div>
                  <div className={estilo.caixaValor}>
                    <strong>{formatarBRL(k.valorVisitaCentavos)}</strong>
                    <span className={estilo.fraco}>por visita</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ----- O histórico ------------------------------------------------- */}
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Últimas ordens</p>
        {f.ordens.length === 0 ? (
          <p className={estilo.vazio}>Nenhuma ordem ainda.</p>
        ) : (
          <div className={estilo.rolaX}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th scope="col">O.S.</th>
                  <th scope="col">Equipamento</th>
                  <th scope="col">Em que ponto</th>
                  <th scope="col">Aberta</th>
                </tr>
              </thead>
              <tbody>
                {f.ordens.map((o) => (
                  <tr key={o.id}>
                    <td className={estilo.num}>
                      <Link href={`/painel/ordens/${o.id}`}>
                        #{String(o.numero).padStart(4, '0')}
                      </Link>
                    </td>
                    <td>{o.equipamento}</td>
                    <td>
                      <span
                        className={
                          o.aberta ? `${estilo.tag} ${estilo.tagEspera}` : `${estilo.tag} ${estilo.tagNeutra}`
                        }
                      >
                        {ROTULO_ETAPA[o.etapa] ?? o.etapa}
                      </span>
                    </td>
                    <td className={estilo.num}>{dia(o.abertaEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ----- O cadastro, por último -------------------------------------- */}
      <div className={estilo.bloco}>
        <p className={estilo.blocoTitulo}>Cadastro</p>
        <div className={estilo.pares}>
          <Par rotulo={c.tipo === 'PJ' ? 'CNPJ' : 'CPF'} valor={formatarDocumento(c.documento)} />
          {c.inscricaoEstadual ? <Par rotulo="Inscrição estadual" valor={c.inscricaoEstadual} /> : null}
          {c.telefone ? <Par rotulo="Telefone" valor={formatarTelefone(c.telefone)} /> : null}
          {c.whatsapp ? <Par rotulo="WhatsApp" valor={formatarTelefone(c.whatsapp)} /> : null}
          {c.email ? <Par rotulo="E-mail" valor={c.email} /> : null}
          {c.contatoNome ? (
            <Par
              rotulo="Quem atende"
              valor={[c.contatoNome, c.contatoTelefone ? formatarTelefone(c.contatoTelefone) : null].filter(Boolean).join(' · ')}
            />
          ) : null}
          {endereco ? <Par rotulo="Endereço" valor={endereco} /> : null}
          {c.pontoReferencia ? <Par rotulo="Referência" valor={c.pontoReferencia} /> : null}
          <Par rotulo="Cliente desde" valor={dia(c.criadoEm)} />
        </div>
        {c.observacoes ? (
          <p className={estilo.texto} style={{ marginTop: 'var(--s4)' }}>
            {c.observacoes}
          </p>
        ) : null}
      </div>
    </>
  )
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className={estilo.par}>
      <span className={estilo.parRot}>{rotulo}</span>
      <span className={estilo.parVal}>{valor}</span>
    </div>
  )
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  alerta?: boolean
}) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={[estilo.indValor, alerta ? estilo.indAlerta : ''].filter(Boolean).join(' ')}>
        {valor}
      </strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}

function dia(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
