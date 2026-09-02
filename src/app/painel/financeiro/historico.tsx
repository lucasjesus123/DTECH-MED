import { formatarBRL } from '@/lib/dinheiro'
import { PAPEL_ROTULO, quando, rotuloAcao } from '../auditoria/rotulos'
import estilo from '../painel.module.css'

export type LinhaDoHistorico = {
  id: string
  acao: string
  entidadeId: string | null
  detalhes: unknown
  userNome: string | null
  userPapel: string | null
  negado: boolean
  criadoEm: string
}

/**
 * O HISTÓRICO DO DINHEIRO — a trilha, recortada onde interessa.
 *
 * =============================================================================
 * POR QUE ELE EXISTE SE JÁ EXISTE A TRILHA
 * =============================================================================
 * A Trilha inteira ("Quem fez o quê") mostra tudo: entrada em empresa, troca de
 * senha, etapa de ordem, foto do site. Quem está no Financeiro tentando
 * descobrir quem baixou uma conta de oito mil não quer navegar por aquilo —
 * quer as linhas de dinheiro, aqui, sem trocar de tela e sem montar filtro.
 *
 * O recorte é por PREFIXO da ação, e não por uma lista escrita à mão. Ação nova
 * de dinheiro aparece aqui no dia em que é escrita; o contrário disso é um
 * histórico com buracos, e buraco em histórico de dinheiro é o mesmo que não
 * ter histórico.
 *
 * =============================================================================
 * O "ANTES" É O QUE FAZ A LINHA VALER
 * =============================================================================
 * "Fulano editou o lançamento" responde quem mexeu e não responde no quê — que
 * é a pergunta seguinte e a única que resolve uma discussão sobre dinheiro. Por
 * isso a edição grava os dois lados, e a linha os escreve: *de R$ 1.200,00 para
 * R$ 12.000,00*. É exatamente aí que um erro de digitação ou uma alteração
 * indevida ficam visíveis sem ninguém abrir o banco.
 */
export default function Historico({ linhas }: { linhas: LinhaDoHistorico[] }) {
  if (linhas.length === 0) {
    return (
      <div className={estilo.vazio}>
        Nada ainda. Toda conta lançada, aprovada, editada, baixada ou apagada aparece aqui, com o
        nome de quem fez.
      </div>
    )
  }

  const agora = new Date()

  return (
    <>
      <p className={estilo.texto} style={{ marginBottom: 'var(--s3)' }}>
        Os últimos {linhas.length} movimentos de dinheiro, do mais recente para o mais antigo. Sem
        recorte de mês: uma conta editada em julho continua sendo o que explica o número de setembro.
      </p>

      <div className={estilo.rolaX}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">O que aconteceu</th>
              <th scope="col">Quem</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className={estilo.fraco} style={{ whiteSpace: 'nowrap' }}>
                  {quando(new Date(l.criadoEm), agora)}
                </td>
                <td>
                  <strong className={l.negado ? estilo.indAlerta : undefined}>
                    {l.negado ? 'NEGADO · ' : ''}
                    {rotuloAcao(l.acao)}
                  </strong>
                  {detalhar(l.detalhes) ? (
                    <span className={estilo.caixaRef}>{detalhar(l.detalhes)}</span>
                  ) : null}
                </td>
                <td>
                  {l.userNome ?? 'sistema'}
                  {l.userPapel ? (
                    <span className={estilo.caixaRef}>
                      {PAPEL_ROTULO[l.userPapel] ?? l.userPapel}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * A frase que sai dos `detalhes` gravados, quando ela é dizível.
 *
 * O JSON da trilha é livre de propósito — cada ação grava o que faz sentido
 * para ela, e uma ação nova não pode ser obrigada a caber num formato antigo.
 * Por isso aqui só se lê o que se reconhece, com verificação de tipo campo a
 * campo. O que não se reconhece não vira "[object Object]" na tela: some, e a
 * linha continua dizendo quem fez o quê e quando.
 */
function detalhar(bruto: unknown): string {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return ''
  const d = bruto as Record<string, unknown>

  const antes = d.antes as Record<string, unknown> | undefined
  const depois = d.depois as Record<string, unknown> | undefined
  if (antes && depois && typeof antes === 'object' && typeof depois === 'object') {
    const partes: string[] = []
    if (typeof antes.valorCentavos === 'number' && typeof depois.valorCentavos === 'number' && antes.valorCentavos !== depois.valorCentavos) {
      partes.push(`de ${formatarBRL(antes.valorCentavos)} para ${formatarBRL(depois.valorCentavos)}`)
    }
    if (d.mudouVencimento === true) partes.push('vencimento alterado')
    if (d.aprovacaoDerrubada === true) partes.push('a aprovação caiu')
    if (typeof depois.descricao === 'string') partes.push(`“${depois.descricao}”`)
    return partes.join(' · ')
  }

  const partes: string[] = []
  if (typeof d.descricao === 'string') partes.push(`“${d.descricao}”`)
  const valor =
    typeof d.valorCentavos === 'number'
      ? d.valorCentavos
      : typeof d.totalCentavos === 'number'
        ? d.totalCentavos
        : typeof d.valorPagoCentavos === 'number'
          ? d.valorPagoCentavos
          : null
  if (valor !== null) partes.push(formatarBRL(valor))
  if (typeof d.parcelas === 'number' && d.parcelas > 1) partes.push(`${d.parcelas} parcelas`)
  if (typeof d.contas === 'number') partes.push(`${d.contas} contas`)
  // "Quem lançou e quem aprovou eram a mesma pessoa?" é a primeira pergunta de
  // qualquer auditoria de caixa. Ela fica escrita na linha, não escondida no
  // JSON.
  if (d.mesmaPessoa === true) partes.push('lançou e aprovou a mesma pessoa')
  return partes.join(' · ')
}
