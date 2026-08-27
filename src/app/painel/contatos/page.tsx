import type { Metadata } from 'next'
import { Papel } from '@/generated/prisma/enums'
import { exigirNivel, exigirAba } from '@/server/auth/guarda'
import { listarContatos } from '@/server/consultas/listas'
import Lista from './lista'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Contatos do site', robots: { index: false } }
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
export default async function Contatos({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; busca?: string }>
}) {
  const { ctx, sessao } = await exigirNivel(Papel.ATENDENTE)
  await exigirAba('contatos')
  const q = await searchParams

  const r = await listarContatos(ctx, { situacao: q.situacao, busca: q.busca })

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>{sessao.tenantNome ?? 'Empresa'}</p>
          <h1 className={estilo.titulo}>Contatos do site</h1>
        </div>
      </div>

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
