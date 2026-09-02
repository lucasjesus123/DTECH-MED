'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatarBRL, lerValorBR } from '@/lib/dinheiro'
import { lancarConta } from '@/server/acoes/caixa'
import Janela, { CampoDinheiro } from './janela'
import estilo from '../painel.module.css'

export type ClienteBreve = { id: string; nome: string }

/**
 * NOVA CONTA — uma janela, e o valor primeiro.
 *
 * =============================================================================
 * POR QUE ELA SAIU DE DENTRO DA ABA
 * =============================================================================
 * O formulário de lançar morava dentro da aba "A pagar" e outro igual dentro de
 * "A receber". Quem estava em Relatórios e lembrou de uma conta tinha de trocar
 * de aba, achar o botão, e o tipo já vinha decidido pela aba em que caiu.
 *
 * Agora ela é uma janela chamada do cabeçalho, vale para as duas direções, e o
 * TIPO é um campo — que é como a pessoa pensa: "preciso lançar uma conta", e só
 * depois "a pagar".
 *
 * =============================================================================
 * "VALOR INFORMADO É" — A PERGUNTA QUE EVITA O ERRO SILENCIOSO
 * =============================================================================
 * "12x de 500" e "6.000 em 12x" são digitados exatamente do mesmo jeito: alguém
 * escreve um número e escolhe 12 parcelas. Antes o sistema sempre DIVIDIA, e
 * quem quis dizer a primeira frase recebia doze parcelas de R$ 41,67.
 *
 * Esse erro não grita. Sai uma lista plausível, com o número certo de linhas, e
 * só aparece no mês em que o cliente paga 500 e o sistema acusa pagamento a
 * maior. Por isso a pergunta é feita na tela, com "Total" como padrão — que é o
 * comportamento que já existia, para nenhum lançamento antigo mudar de sentido.
 *
 * A prévia embaixo escreve as duas leituras por extenso antes de salvar. É o
 * lugar barato de descobrir o engano.
 */
export default function NovaConta({
  aberta,
  aoFechar,
  mes,
  tipoInicial,
  categorias,
  clientes,
}: {
  aberta: boolean
  aoFechar: () => void
  mes: string
  tipoInicial: 'PAGAR' | 'RECEBER'
  categorias: string[]
  clientes: ClienteBreve[]
}) {
  const [estado, acao, pendente] = useActionState(lancarConta, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const [tipo, setTipo] = useState<'PAGAR' | 'RECEBER'>(tipoInicial)
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState(1)
  const [modo, setModo] = useState<'total' | 'parcela'>('total')
  const router = useRouter()
  const jaFechou = useRef(false)

  /**
   * O ESTADO DESTA JANELA MORRE COM ELA — por estrutura, não por lembrança.
   *
   * Ela precisa nascer limpa a cada abertura: com o tipo da aba em que a pessoa
   * está, sem o valor que ela digitou e desistiu, sem o parcelamento da conta
   * anterior. A tentação é sincronizar isso num `useEffect` que dispara quando
   * `aberta` vira verdadeiro — e é exatamente o que a regra `set-state-in-effect`
   * proíbe, com razão: cada `setState` ali provoca uma segunda renderização em
   * cascata, e a janela pisca com o estado velho antes de corrigir.
   *
   * `AcoesDoTopo` só a MONTA quando abre (e a desmonta ao fechar), pelos
   * motivos escritos lá. Como consequência, todo `useState` daqui roda o
   * inicializador a cada abertura: zero efeitos, zero cascata, estado limpo de
   * graça.
   */
  useEffect(() => {
    if (estado.ok && estado.mensagem && !jaFechou.current) {
      jaFechou.current = true
      router.refresh()
      aoFechar()
    }
  }, [estado, router, aoFechar])

  // O MESMO leitor de vírgula do servidor. Duas leituras diferentes do mesmo
  // campo é como uma prévia passa a mentir.
  const centavos = Math.round((lerValorBR(valor) ?? 0) * 100)
  const totalCentavos = modo === 'parcela' ? centavos * parcelas : centavos
  const porParcela =
    modo === 'parcela' ? centavos : parcelas > 1 ? Math.floor(centavos / parcelas) : centavos
  const ultima =
    modo === 'parcela' ? centavos : centavos - Math.floor(centavos / parcelas) * (parcelas - 1)

  return (
    <Janela
      titulo={tipo === 'PAGAR' ? 'Nova conta a pagar' : 'Nova conta a receber'}
      aberta={aberta}
      aoFechar={aoFechar}
    >
      <form action={acao} className={estilo.janelaForm}>
        <input type="hidden" name="mes" value={mes} />

        <CampoDinheiro
          nome="valor"
          valor={valor}
          aoMudar={setValor}
          rotulo={parcelas > 1 && modo === 'parcela' ? 'Valor de cada parcela' : 'Valor (total)'}
        />

        <div className={estilo.janelaGrade}>
          <label className={estilo.rotulo}>
            Tipo *
            <select
              className={estilo.selecao}
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'PAGAR' | 'RECEBER')}
            >
              <option value="RECEBER">Conta a receber</option>
              <option value="PAGAR">Conta a pagar</option>
            </select>
          </label>
          <label className={estilo.rotulo}>
            {parcelas > 1 ? '1º vencimento *' : 'Vencimento *'}
            <input
              className={estilo.campo}
              type="date"
              name="vencimento"
              required
              defaultValue={hojeISO()}
            />
          </label>
        </div>

        <label className={estilo.rotulo}>
          Descrição *
          <input
            className={estilo.campo}
            name="descricao"
            required
            maxLength={140}
            placeholder={
              tipo === 'PAGAR'
                ? 'Aluguel da oficina, energia, contador…'
                : 'Contrato mensal, locação, venda de peça…'
            }
          />
        </label>

        <div className={`${estilo.janelaGrade} ${estilo.janelaTracejado}`}>
          <label className={estilo.rotulo}>
            Parcelas
            <select
              className={estilo.selecao}
              name="parcelas"
              value={parcelas}
              onChange={(e) => setParcelas(Number(e.target.value) || 1)}
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>
          <label className={estilo.rotulo}>
            Valor informado é
            <select
              className={estilo.selecao}
              name="modoValor"
              value={modo}
              onChange={(e) => setModo(e.target.value as 'total' | 'parcela')}
              disabled={parcelas === 1}
            >
              <option value="total">Total (dividir)</option>
              <option value="parcela">De cada parcela (multiplicar)</option>
            </select>
            {parcelas === 1 ? (
              <span className={estilo.dica}>Só faz diferença a partir de 2 parcelas.</span>
            ) : null}
          </label>
        </div>

        {/* A PRÉVIA, antes de salvar. Sem ela a pessoa descobre como o sistema
            entendeu depois que as doze linhas já existem — e a diferença entre
            "12x de 500" e "500 divididos em 12" só aparece meses depois. */}
        {parcelas > 1 && centavos > 0 ? (
          <p className={estilo.janelaPrevia} role="status">
            {parcelas} parcelas de <strong>{formatarBRL(porParcela)}</strong>
            {modo === 'total' && ultima !== porParcela ? (
              <> (a última de {formatarBRL(ultima)})</>
            ) : null}{' '}
            — <strong>{formatarBRL(totalCentavos)}</strong> no total, uma por mês.
          </p>
        ) : null}

        {/* Fechado por padrão, como no lançamento rápido: quem está lançando a
            conta de luz não quer atravessar quatro campos que vai deixar em
            branco. O rótulo diz o que tem dentro, para ninguém deixar de
            preencher por não saber que existe. */}
        <details className={estilo.janelaMais}>
          <summary>+ Categoria, cliente e observações (opcional)</summary>
          <div className={estilo.janelaGrade}>
            <label className={estilo.rotulo}>
              Categoria
              <input
                className={estilo.campo}
                name="categoria"
                list="cat-nova-conta"
                maxLength={60}
                placeholder={tipo === 'PAGAR' ? 'Ex.: Instalações' : 'Ex.: Contrato de manutenção'}
              />
              <datalist id="cat-nova-conta">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
                {(tipo === 'PAGAR' ? SUGESTOES.pagar : SUGESTOES.receber).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className={estilo.rotulo}>
              {tipo === 'PAGAR' ? 'É de um cliente da carteira?' : 'De qual cliente'}
              <select className={estilo.selecao} name="clienteId" defaultValue="">
                <option value="">— não está na carteira —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className={estilo.rotulo}>
              {tipo === 'PAGAR' ? 'Para quem se paga' : 'Ou de quem, por escrito'}
              <input
                className={estilo.campo}
                name="contraparte"
                maxLength={140}
                placeholder={tipo === 'PAGAR' ? 'Fornecedor, prefeitura, contador…' : 'Quem paga'}
              />
            </label>
            <label className={estilo.rotulo}>
              Observações
              <input className={estilo.campo} name="observacoes" maxLength={500} />
            </label>
          </div>
        </details>

        {!estado.ok ? (
          <p className={estilo.erro} role="alert">
            {estado.motivo}
          </p>
        ) : null}

        <p className={estilo.dica}>
          Ela nasce esperando aprovação — quem lança não é quem aprova.
        </p>

        <div className={estilo.janelaAcoes}>
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Janela>
  )
}

const SUGESTOES = {
  pagar: [
    'Instalações',
    'Energia e água',
    'Telefonia e internet',
    'Impostos',
    'Salários',
    'Contador',
    'Peças e fornecedores',
    'Combustível',
    'Veículo',
    'Marketing',
    'Software',
    'Manutenção',
  ],
  receber: [
    'Contrato de manutenção',
    'Locação de equipamento',
    'Venda de peça',
    'Treinamento',
    'Instalação',
    'Frete',
    'Outros serviços',
  ],
}

function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
