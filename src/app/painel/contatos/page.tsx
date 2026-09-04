import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba } from '@/server/auth/guarda'
import { formatarBRL } from '@/lib/dinheiro'
import {
  listarFunil,
  motivosDeRecusa,
  ordensEsperandoOrcamento,
  resumoDoFunil,
} from '@/server/consultas/comercial'
import { listarContatos } from '@/server/consultas/listas'
import AbasComercial, { type AbaComercial } from './abas'
import RegistrarContato from './registrar'
import MontarOrcamento from './montar'
import Funil from './funil'
import Lista from './lista'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Comercial', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * CONTATOS DO SITE — quem chamou e ainda não virou ordem.
 *
 * =============================================================================
 * POR QUE ESTA TELA NASCEU
 * =============================================================================
 * Isto era um bloco no painel do dia, acima da esteira, com a mensagem inteira
 * de cada contato numa célula de tabela.
 *
 * Funcionava enquanto as mensagens fossem o que se esperava: "minha Lavieen não
 * liga". No dia em que chegou uma prospecção em massa — vinte linhas, em
 * inglês, com endereço em Lagos e assinatura completa —, aquele único contato
 * ocupou a tela inteira e empurrou a esteira para fora do primeiro olhar. Quem
 * abria o sistema para saber onde o trabalho está via um e-mail de propaganda.
 *
 * O erro não foi o spam ter passado. Foi a tela ter sido desenhada supondo que
 * o texto de terceiro seria curto. **Texto que vem de fora não tem tamanho.**
 *
 * Agora são duas coisas separadas, e cada uma faz o que sabe:
 *
 *   • O painel do dia mostra uma TIRA de no máximo três, com uma linha cada,
 *     e a esteira vem antes.
 *   • Esta tela é onde se lê o que a pessoa escreveu, por inteiro, quando se
 *     decidiu que vale ler.
 *
 * =============================================================================
 * TRÊS SITUAÇÕES, E POR QUE DESCARTADO NÃO É APAGADO
 * =============================================================================
 * `novo` é quem aguarda resposta. `convertido` já virou ordem — fecha o ciclo
 * site → sistema. `descartado` é o que não era serviço.
 *
 * Descartar só muda a situação: o contato continua aqui, na sua aba, e volta
 * com um clique. Quem descarta está com pressa, olhando uma lista, e vai errar
 * em algum momento — e o telefone de quem procurou a empresa não é nosso para
 * jogar fora.
 */
export default async function Comercial({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string
    situacao?: string
    busca?: string
    fase?: string
    dias?: string
  }>
}) {
  const { ctx, sessao } = await exigirNivel(Papel.ATENDENTE)
  await exigirAba('contatos')
  const q = await searchParams
  const aba: AbaComercial = q.aba === 'orcamentos' ? 'orcamentos' : 'contatos'

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{sessao.tenantNome ?? 'Empresa'}</p>
          <h1 className={estilo.titulo}>Comercial</h1>
          <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
            O que ainda não virou serviço: quem chamou pelo site, e o que já foi orçado e espera
            resposta.
          </p>
        </div>
      </div>

      <AbasComercial atual={aba} />

      {/* CADA ABA TEM O SEU BOTÃO DE CRIAR, e são botões diferentes porque as
          duas criam coisas diferentes.

          Anotar contato na aba de orçamentos seria um botão fora de assunto, e
          botão fora de assunto é o que faz a pessoa parar de ler os botões. O
          contrário também: "montar orçamento" na aba de contatos pediria uma
          O.S. que ainda não existe — o contato do site é anterior a ela. */}
      {aba === 'contatos' ? <RegistrarContato /> : null}
      {aba === 'orcamentos' ? <AbrirOrcamento ctx={ctx} /> : null}

      {aba === 'orcamentos' ? (
        <PainelOrcamentos ctx={ctx} fase={q.fase ?? ''} busca={q.busca ?? ''} dias={q.dias} />
      ) : (
        <PainelContatos ctx={ctx} situacao={q.situacao} busca={q.busca} />
      )}
    </>
  )
}

type Ctx = Awaited<ReturnType<typeof exigirNivel>>['ctx']

/**
 * O botão de MONTAR ORÇAMENTO, com a lista de quem está esperando preço.
 *
 * A consulta roda aqui e não dentro do componente de cliente: `comEscopo` é de
 * servidor, e é ele que garante que a lista traz só ordens DESTA empresa.
 */
async function AbrirOrcamento({ ctx }: { ctx: Ctx }) {
  const ordens = await ordensEsperandoOrcamento(ctx)
  return <MontarOrcamento ordens={ordens} />
}

async function PainelContatos({
  ctx,
  situacao,
  busca,
}: {
  ctx: Ctx
  situacao?: string
  busca?: string
}) {
  const r = await listarContatos(ctx, { situacao, busca })

  return (
    <>

      <div className={estilo.resumo}>
        <Indicador
          rotulo="Aguardando resposta"
          valor={String(r.novos)}
          nota={
            r.novos > 0
              ? 'gente esperando — é aqui que se perde serviço'
              : 'ninguém esperando no momento'
          }
          alerta={r.novos > 0}
        />
        <Indicador
          rotulo="Viraram ordem"
          valor={String(r.convertidos)}
          nota="chegaram pelo site e entraram na esteira"
        />
        <Indicador
          rotulo="Descartados"
          valor={String(r.descartados)}
          nota="não eram serviço; continuam guardados"
        />
      </div>

      <form method="get" className={estilo.filtros}>
        <div className={estilo.busca}>
          <input
            className={estilo.campo}
            type="search"
            name="busca"
            defaultValue={r.busca}
            placeholder="Nome, empresa, cidade, equipamento ou telefone"
            aria-label="Buscar contato"
          />
        </div>
        <select className={estilo.selecao} name="situacao" defaultValue={r.situacao} aria-label="Situação">
          <option value="novos">Aguardando resposta</option>
          <option value="convertidos">Viraram ordem</option>
          <option value="descartados">Descartados</option>
          <option value="todos">Todos</option>
        </select>
        <button type="submit" className={estilo.btn}>
          Filtrar
        </button>
      </form>

      <Lista
        situacao={r.situacao}
        contatos={r.linhas.map((l) => ({
          id: l.id,
          nome: l.nome,
          telefone: l.telefone,
          email: l.email,
          empresa: l.empresa,
          cidade: l.cidade,
          equipamento: l.equipamento,
          mensagem: l.mensagem ?? '',
          status: l.status,
          criadoEm: l.criadoEm.toISOString(),
          virouOrdem: Boolean(l.ordemGeradaId),
        }))}
      />
    </>
  )
}

/**
 * O FUNIL DE ORÇAMENTOS.
 *
 * Cinco números que respondem, juntos, se o comercial está indo bem: quanto
 * espera um sim, quanto virou serviço, quanto foi recusado, quantos de cada
 * cem viram sim, e em quantos dias o cliente costuma responder.
 *
 * A TAXA só conta o que foi RESPONDIDO. Incluir os que ainda esperam faria a
 * taxa cair toda vez que a empresa mandasse mais orçamentos — o oposto do que
 * ela deveria medir.
 */
async function PainelOrcamentos({
  ctx,
  fase,
  busca,
  dias,
}: {
  ctx: Ctx
  fase: string
  busca: string
  dias?: string
}) {
  const janela = Number(dias) > 0 ? Number(dias) : 90
  const [linhas, resumo, motivos] = await Promise.all([
    listarFunil(ctx, { fase, busca, dias: janela }),
    resumoDoFunil(ctx, janela),
    motivosDeRecusa(ctx, janela),
  ])

  return (
    <>
      <div className={`${estilo.resumo} ${estilo.resumo5}`}>
        <Indicador
          rotulo="Esperando um sim"
          valor={formatarBRL(resumo.esperandoCentavos)}
          nota={
            resumo.esperandoQuantos > 0
              ? `${resumo.esperandoQuantos} ${resumo.esperandoQuantos === 1 ? 'proposta' : 'propostas'}`
              : 'nenhuma proposta em aberto'
          }
          alerta={resumo.vencidosQuantos > 0}
        />
        <Indicador
          rotulo="Passou da validade"
          valor={String(resumo.vencidosQuantos)}
          nota={
            resumo.vencidosQuantos > 0
              ? 'ainda em aberto, mas o prazo venceu'
              : 'nenhuma proposta vencida'
          }
          alerta={resumo.vencidosQuantos > 0}
        />
        <Indicador
          rotulo="Virou serviço"
          valor={formatarBRL(resumo.aprovadoCentavos)}
          nota={`${resumo.aprovadoQuantos} ${resumo.aprovadoQuantos === 1 ? 'aprovada' : 'aprovadas'}`}
        />
        <Indicador
          rotulo="De cada 100, viram sim"
          // Nulo e não zero quando ninguém respondeu: "0%" diria que a empresa
          // não vende nada, quando a verdade é que não há o que medir ainda.
          valor={resumo.taxaAprovacao != null ? `${resumo.taxaAprovacao}` : '—'}
          nota={
            resumo.taxaAprovacao != null
              ? `${resumo.aprovadoQuantos} sim para ${resumo.reprovadoQuantos} não`
              : 'nenhuma resposta ainda'
          }
        />
        <Indicador
          rotulo="O cliente responde em"
          valor={
            resumo.diasParaResposta != null
              ? `${resumo.diasParaResposta} ${resumo.diasParaResposta === 1 ? 'dia' : 'dias'}`
              : '—'
          }
          nota="mediana, não média"
        />
      </div>

      {/* O motivo da recusa estava gravado em `motivoReprovacao` e NENHUMA tela
          lia. É a informação que muda o negócio: "achou caro" dez vezes no mês
          é recado sobre a tabela de preço; "demora" dez vezes é recado sobre a
          oficina. */}
      {motivos.length > 0 ? (
        <div className={estilo.bloco}>
          <p className={estilo.blocoTitulo}>Por que recusaram</p>
          <div className={estilo.pares}>
            {motivos.map((m) => (
              <div key={m.motivo} className={estilo.par}>
                <span className={estilo.parRot}>{m.motivo}</span>
                <span className={estilo.parVal} style={{ fontWeight: 600 }}>
                  {m.quantidade} {m.quantidade === 1 ? 'vez' : 'vezes'}
                </span>
                <span className={estilo.fraco}>{formatarBRL(m.totalCentavos)} que não vieram</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Funil linhas={linhas} fase={fase} busca={busca} dias={janela} />
    </>
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
