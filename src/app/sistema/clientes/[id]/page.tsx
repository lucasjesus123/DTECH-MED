import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Papel } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { podeVer } from '@/server/auth/guarda'
import { fichaDoCliente } from '@/server/consultas/ficha-do-cliente'
import { exigirTela } from '@/server/sistema/guarda'
import { ContactActions, HealthScore } from '@/components/sistema/painel-os'
import {
  Bloco,
  CabecalhoTela,
  Chip,
  EmptyState,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * A FICHA DO CLIENTE — painel rico, sem abas, como a da O.S.
 *
 * =============================================================================
 * O DOCUMENTO VEM MASCARADO, E ISSO É DE PROPÓSITO
 * =============================================================================
 * A ficha responde "é ele mesmo?", e para isso os últimos dígitos bastam. Ela
 * não serve de cópia do CPF: uma tela que qualquer atendente abre não precisa
 * carregar o documento inteiro de ninguém pelo fio.
 *
 * =============================================================================
 * O DINHEIRO É CORTADO NA CONSULTA
 * =============================================================================
 * `financeiro: null` significa "esta pessoa não vê dinheiro", e o bloco desenha
 * isso em vez de um zero — que mentiria. A consulta nem chega a fazer a junção
 * que traz os valores.
 */
export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, sessao } = await exigirTela('clientes')
  const { id } = await params

  const comDinheiro = podeVer(sessao.papel, Papel.FINANCEIRO)
  const c = await fichaDoCliente(ctx, id, { ordemAtual: '', podeVerDinheiro: comDinheiro })
  if (!c) notFound()

  const abertas = c.outrasOrdens.filter((o) => !o.encerrada)

  const stats: Stat[] = [
    { rotulo: 'O.S. no total', valor: c.outrasOrdens.length, icone: 'ordens' },
    {
      rotulo: 'Abertas agora',
      valor: abertas.length,
      apoio: abertas.length === 0 ? 'nada em andamento' : 'na esteira',
      tom: abertas.length > 0 ? 'info' : 'ok',
      icone: 'painel',
    },
    { rotulo: 'Aparelhos', valor: c.aparelhos.length, apoio: 'no cadastro', icone: 'equipamentos' },
    comDinheiro && c.financeiro
      ? {
          rotulo: 'Em aberto',
          valor: formatarBRL(c.financeiro.emAbertoCentavos),
          apoio:
            c.financeiro.diasDeAtrasoMaior > 0
              ? `${c.financeiro.diasDeAtrasoMaior} dias de atraso`
              : 'nada vencido',
          tom: c.financeiro.diasDeAtrasoMaior > 0 ? 'danger' : 'ok',
          icone: 'financeiro',
        }
      : {
          rotulo: 'Cliente desde',
          valor: c.clienteDesde,
          icone: 'agenda',
        },
  ]

  return (
    <>
      <CabecalhoTela
        titulo={c.nome}
        apoio={`${c.tipo === 'PJ' ? 'Empresa' : 'Pessoa física'} · ${c.documento} · cliente desde ${c.clienteDesde}`}
        acao={
          <Link href={`/sistema/ordens/nova?cliente=${c.id}`} className={estilo.acao}>
            Abrir O.S.
          </Link>
        }
      />

      <StatCardRow stats={stats} />

      <div className={estilo.split}>
        <div className={estilo.blocos}>
          <Bloco titulo={`Ordens · ${c.outrasOrdens.length}`}>
            {c.outrasOrdens.length === 0 ? (
              <EmptyState
                titulo="Nenhuma O.S. ainda"
                bom={false}
                apoio="Este cliente está cadastrado e ainda não mandou nenhum aparelho."
              />
            ) : (
              <div className={estilo.resto}>
                {c.outrasOrdens.map((o) => (
                  <Link key={o.id} href={`/sistema/ordens/${o.id}`} className={estilo.restoItem}>
                    <span className={estilo.restoHora}>
                      {String(o.numero).padStart(5, '0')}
                    </span>
                    <span className={estilo.restoTxt}>
                      <strong>{o.equipamento}</strong>
                      <span>
                        {o.etapa} · aberta em {o.abertaEm}
                      </span>
                    </span>
                    <span className={estilo.aDireita}>
                      <Chip tom={o.encerrada ? 'pending' : 'info'}>
                        {o.encerrada ? 'Encerrada' : 'Em andamento'}
                      </Chip>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Bloco>

          <Bloco titulo={`Aparelhos · ${c.aparelhos.length}`}>
            {c.aparelhos.length === 0 ? (
              <p className={estilo.campoDica}>Nenhum aparelho cadastrado para este cliente.</p>
            ) : (
              <div className={estilo.resto}>
                {c.aparelhos.map((a) => (
                  <div key={a.id} className={estilo.restoItem}>
                    <span className={estilo.restoTxt}>
                      <strong>{`${a.marca} ${a.modelo}`.trim()}</strong>
                      <span>
                        {a.numeroSerie ?? 'sem série'} · {a.ordens}{' '}
                        {a.ordens === 1 ? 'passagem' : 'passagens'}
                      </span>
                    </span>
                    <Link
                      href={`/sistema/ordens/nova?cliente=${c.id}&equipamento=${a.id}`}
                      className={`${estilo.acaoLinha} ${estilo.aDireita}`}
                    >
                      Abrir O.S.
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Bloco>

          {c.contratos.length > 0 ? (
            <Bloco titulo={`Contratos de manutenção · ${c.contratos.length}`}>
              <div className={estilo.dinheiro}>
                {c.contratos.map((k) => (
                  <p key={k.numero} className={estilo.dinheiroLinha}>
                    <span>
                      {k.equipamento} · {k.periodicidade}
                    </span>
                    <strong>
                      <Chip tom={k.ativo ? 'ok' : 'pending'}>
                        {k.ativo ? 'ativo' : 'encerrado'}
                      </Chip>
                    </strong>
                  </p>
                ))}
              </div>
            </Bloco>
          ) : null}
        </div>

        <aside className={estilo.blocos}>
          <Bloco titulo="Contato">
            {c.contatoNome ? (
              <p className={estilo.campoDica}>Fala com {c.contatoNome}</p>
            ) : null}
            {c.endereco ? <p className={estilo.campoDica}>{c.endereco}</p> : null}
            {c.enderecoDeColeta ? (
              <p className={estilo.campoDica}>
                <strong>Coleta em:</strong> {c.enderecoDeColeta}
              </p>
            ) : null}
            {c.pontoReferencia ? (
              <p className={estilo.campoDica}>Referência: {c.pontoReferencia}</p>
            ) : null}
            <ContactActions whatsapp={c.whatsapp} telefone={c.telefone} clienteId={c.id} />
          </Bloco>

          <HealthScore saude={saudeDoCliente(c)} />

          {c.observacoes ? (
            <Bloco titulo="Observações">
              <p>{c.observacoes}</p>
            </Bloco>
          ) : null}
        </aside>
      </div>
    </>
  )
}

/**
 * A SAÚDE DA RELAÇÃO — a opinião do sistema, com a conta ao lado.
 *
 * Três coisas pesam: dívida vencida, volume de trabalho já feito (que conta a
 * favor) e nada mais. O cálculo é simples de propósito e vem sempre explicado —
 * um score sem explicação vira motivo para negar um parcelamento a um cliente
 * de dez anos.
 */
function saudeDoCliente(c: {
  outrasOrdens: Array<{ encerrada: boolean }>
  financeiro: { emAbertoCentavos: number; diasDeAtrasoMaior: number } | null
}): { nota: number; resumo: string; detalhe: string } {
  let nota = 70
  const pesos: string[] = []

  const total = c.outrasOrdens.length
  if (total >= 5) {
    nota += 20
    pesos.push(`${total} serviços no histórico`)
  } else if (total >= 1) {
    nota += 10
    pesos.push(`${total} ${total === 1 ? 'serviço' : 'serviços'} no histórico`)
  }

  if (c.financeiro) {
    if (c.financeiro.diasDeAtrasoMaior > 60) {
      nota -= 40
      pesos.push(`${c.financeiro.diasDeAtrasoMaior} dias de atraso`)
    } else if (c.financeiro.diasDeAtrasoMaior > 0) {
      nota -= 20
      pesos.push(`${c.financeiro.diasDeAtrasoMaior} dias de atraso`)
    } else if (c.financeiro.emAbertoCentavos > 0) {
      nota -= 5
      pesos.push('valor em aberto dentro do prazo')
    }
  }

  nota = Math.max(0, Math.min(100, nota))
  const resumo =
    nota >= 80 ? 'Relação tranquila' : nota >= 50 ? 'Merece atenção' : 'Precisa de conversa'
  const detalhe =
    pesos.length === 0
      ? 'Cliente novo — ainda não há histórico para pesar.'
      : `Pesou: ${pesos.join(', ')}.`

  return { nota, resumo, detalhe }
}
