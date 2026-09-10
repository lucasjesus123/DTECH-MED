'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { EtapaOrdem } from '@/generated/prisma/enums'
import { formatarBRL } from '@/lib/dinheiro'
import { agendar } from '@/server/acoes/agenda'
import { salvarDiagnostico, salvarOrcamento } from '@/server/acoes/orcamento'
import { declararSemPeca } from '@/server/acoes/assistente'
import { emitir, receber } from '@/server/acoes/financeiro'
import { avancarNaEsteira } from '@/server/acoes/sistema'
import estilo from './pecas.module.css'

/**
 * AS FOLHAS DE FLUXO — o que o botão-da-vez abre quando o passo precisa de algo.
 *
 * =============================================================================
 * TODAS SEGUEM O MESMO DESENHO
 * =============================================================================
 * Blocos numerados à esquerda, painel-vivo à direita, e no fim UM botão com o
 * verbo do passo. O painel da direita atualiza enquanto se digita — total,
 * validade, o que vai acontecer — porque um formulário que mostra o resultado
 * se formando não precisa ser explicado.
 *
 * =============================================================================
 * O SALTO É SEMPRE O ÚLTIMO ATO
 * =============================================================================
 * Primeiro grava o dado (laudo, orçamento, parada, pagamento); só então dispara
 * a transição. Se a gravação falhar, nada andou e a pessoa tenta de novo; se o
 * salto viesse antes, a O.S. mudaria de mão sem o dado que a etapa promete.
 *
 * A recusa do motor aparece inteira. Ele responde com frases escritas para o
 * operador — "a fatura ainda não está quitada", "faltam 4 fotos" —, e é
 * exatamente essa frase que diz o que fazer.
 */

// ===========================================================================
// AGENDAR — coleta ou entrega
// ===========================================================================

export function FluxoAgendar({
  ordemId,
  tipo,
  passos,
  enderecoPadrao,
  contatoPadrao,
  telefonePadrao,
  motoristas,
  dataPadrao,
}: {
  ordemId: string
  tipo: 'RETIRADA' | 'ENTREGA'
  /** Vazio na entrega: quem move a O.S. de lá é o motorista, ao sair. */
  passos: EtapaOrdem[]
  enderecoPadrao: string
  contatoPadrao: string | null
  telefonePadrao: string | null
  motoristas: Array<{ id: string; nome: string }>
  /**
   * O dia sugerido — amanhã —, calculado NO SERVIDOR.
   *
   * Perguntar as horas dentro de um componente de cliente cria dois problemas
   * de uma vez: o valor muda a cada renderização, e o HTML do servidor sai com
   * uma data e o do navegador com outra, o que quebra a hidratação numa
   * virada de meia-noite ou num celular com o relógio adiantado.
   */
  dataPadrao: string
}) {
  const router = useRouter()
  const [data, setData] = useState(dataPadrao)
  const [hora, setHora] = useState('09:00')
  const [motoristaId, setMotoristaId] = useState('')
  const [endereco, setEndereco] = useState(enderecoPadrao)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, iniciar] = useTransition()

  const escolhido = motoristas.find((m) => m.id === motoristaId)

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('ordemId', ordemId)
      form.set('tipo', tipo)
      form.set('motoristaId', motoristaId)
      form.set('data', data)
      form.set('hora', hora)
      form.set('endereco', endereco)
      if (contatoPadrao) form.set('contatoNome', contatoPadrao)
      if (telefonePadrao) form.set('contatoTelefone', telefonePadrao)
      form.set('observacoes', obs)

      const r = await agendar({ ok: true }, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }

      // A parada existe; agora a O.S. pode andar. A ordem importa: a transição
      // EXIGE a parada, e disparar antes levaria uma recusa do próprio motor.
      if (passos.length > 0) {
        const t = await avancarNaEsteira({ ordemId, passos })
        if (!t.ok) {
          setErro(t.motivo)
          return
        }
      }
      router.push(`/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  return (
    <Folha
      titulo={tipo === 'RETIRADA' ? 'Agendar a coleta' : 'Agendar a entrega'}
      vivo={
        <>
          <p className={estilo.vivoTitulo}>O que vai acontecer</p>
          <p className={estilo.vivoLinha}>
            <span>Quando</span>
            <strong>
              {porExtenso(data)} às {hora}
            </strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>Motorista</span>
            <strong className={escolhido ? undefined : estilo.vivoVago}>
              {escolhido?.nome ?? 'a definir'}
            </strong>
          </p>
          <p className={estilo.campoDica}>
            {tipo === 'RETIRADA'
              ? 'O cliente recebe no WhatsApp o aviso da coleta agendada, com a ordem de retirada anexada.'
              : 'A parada entra na rota do motorista. A O.S. só sai daqui quando ele marcar que saiu.'}
          </p>
        </>
      }
      botao={tipo === 'RETIRADA' ? 'Agendar coleta' : 'Agendar entrega'}
      indo={indo}
      erro={erro}
      onEnviar={enviar}
    >
      <div className={estilo.campos}>
        <label className={estilo.campo}>
          <span>Dia</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className={estilo.campo}>
          <span>Hora</span>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>Motorista</span>
          <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
            <option value="">Deixar para definir depois</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <span className={estilo.campoDica}>
            Sem motorista a parada existe e fica na fila de quem despacha — o que
            não pode é a O.S. andar sem parada nenhuma.
          </span>
        </label>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>Endereço da parada</span>
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </label>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>Recado para o motorista (opcional)</span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Portaria, andar, com quem falar, horário que a clínica abre…"
          />
        </label>
      </div>
    </Folha>
  )
}

// ===========================================================================
// LAUDO — e, para quem alcança, o orçamento junto
// ===========================================================================

export function FluxoLaudo({
  ordemId,
  passos,
  rotulo,
  diagnosticoAtual,
  parecerAtual,
  temOrcamento,
}: {
  ordemId: string
  passos: EtapaOrdem[]
  rotulo: string
  diagnosticoAtual: string | null
  parecerAtual: string | null
  /** Já existe orçamento montado? Sem ele, o envio ao cliente é recusado. */
  temOrcamento: boolean
}) {
  const router = useRouter()
  const [diagnostico, setDiagnostico] = useState(diagnosticoAtual ?? '')
  const [parecer, setParecer] = useState(parecerAtual ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, iniciar] = useTransition()

  const enviaAoCliente = passos.length > 1

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('ordemId', ordemId)
      form.set('diagnostico', diagnostico)
      form.set('parecerTecnico', parecer)

      const r = await salvarDiagnostico(form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }

      const t = await avancarNaEsteira({ ordemId, passos })
      if (!t.ok) {
        setErro(t.motivo)
        return
      }
      router.push(`/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  return (
    <Folha
      titulo={rotulo}
      vivo={
        <>
          <p className={estilo.vivoTitulo}>O que vai acontecer</p>
          <p className={estilo.vivoLinha}>
            <span>Laudo técnico</span>
            <strong>{diagnostico.trim().length >= 10 ? 'pronto' : 'incompleto'}</strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>PDF do laudo</span>
            <strong>gerado no salto</strong>
          </p>
          {enviaAoCliente ? (
            <>
              <p className={estilo.vivoLinha}>
                <span>Orçamento</span>
                <strong className={temOrcamento ? undefined : estilo.vivoVago}>
                  {temOrcamento ? 'pronto para enviar' : 'ainda não montado'}
                </strong>
              </p>
              <p className={estilo.campoDica}>
                {temOrcamento
                  ? 'O cliente recebe o link do portal no WhatsApp e aprova por lá, com CPF ou CNPJ.'
                  : 'Sem valores montados o envio é recusado — anunciar um orçamento que não existe é pior que não anunciar: o cliente abre o portal e não acha valor nenhum.'}
              </p>
            </>
          ) : (
            <p className={estilo.campoDica}>
              Este passo fecha o laudo. Quem envia o orçamento ao cliente é a
              gestão — a O.S. vai para a fila dela.
            </p>
          )}
        </>
      }
      botao={rotulo}
      indo={indo}
      erro={erro}
      onEnviar={enviar}
      travado={diagnostico.trim().length < 10}
    >
      <div className={estilo.campos}>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>O que foi encontrado no aparelho</span>
          <textarea
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            placeholder="Placa de potência com trilha rompida, fonte oscilando em carga…"
          />
          <span className={estilo.campoDica}>
            Este texto vai para o laudo em PDF e o cliente lê. Escreva o que você
            diria a ele no telefone.
          </span>
        </label>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>Parecer para a gestão (opcional)</span>
          <textarea
            value={parecer}
            onChange={(e) => setParecer(e.target.value)}
            placeholder="Vale a pena consertar? Tem risco de voltar? Peça é difícil de achar?"
          />
        </label>
      </div>
    </Folha>
  )
}

// ===========================================================================
// ORÇAMENTO — o split-view com painel-vivo
// ===========================================================================

type ItemOrcamento = {
  tipo: 'PECA' | 'SERVICO' | 'DESLOCAMENTO' | 'TAXA'
  descricao: string
  quantidade: number
  valorUnit: number
}

const ITEM_VAZIO: ItemOrcamento = { tipo: 'SERVICO', descricao: '', quantidade: 1, valorUnit: 0 }

/**
 * O ORÇAMENTO, com o total se formando enquanto se digita.
 *
 * =============================================================================
 * O PAINEL DA DIREITA NÃO É ENFEITE
 * =============================================================================
 * Ele responde as três perguntas que fazem alguém parar no meio de um
 * orçamento: quanto deu, até quando vale, e o que o cliente vai receber. Sem
 * ele a pessoa preenche no escuro e descobre o total depois de salvar — e
 * quando o número surpreende, ela volta e refaz.
 *
 * O TOTAL DAQUI É INFORMATIVO. Quem calcula de verdade é o servidor, a partir
 * dos itens: *"o número que vem da tela é ignorado, para qualquer papel"*. As
 * duas contas usam a mesma fórmula, mas se um dia divergirem, quem manda é o
 * servidor — e é assim que tem de ser.
 */
export function FluxoOrcamento({
  ordemId,
  passos,
  itensIniciais,
  laudo,
  agoraMs,
}: {
  ordemId: string
  passos: EtapaOrdem[]
  itensIniciais: ItemOrcamento[]
  laudo: string | null
  /**
   * O instante em que a página foi servida — pelo mesmo motivo do `dataPadrao`
   * acima. Com `Date.now()` aqui, a validade do orçamento seria recalculada a
   * cada tecla digitada no formulário.
   */
  agoraMs: number
}) {
  const router = useRouter()
  const [itens, setItens] = useState<ItemOrcamento[]>(
    itensIniciais.length > 0 ? itensIniciais : [{ ...ITEM_VAZIO }],
  )
  const [desconto, setDesconto] = useState(0)
  const [validadeDias, setValidadeDias] = useState(15)
  const [garantiaDias, setGarantiaDias] = useState(90)
  const [prazoDias, setPrazoDias] = useState(7)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, iniciar] = useTransition()

  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnit, 0)
  const total = Math.max(subtotal - desconto, 0)
  const validade = new Date(agoraMs + validadeDias * 86_400_000)

  function mudar(i: number, campo: keyof ItemOrcamento, valor: string) {
    setItens((lista) =>
      lista.map((item, j) => {
        if (j !== i) return item
        if (campo === 'quantidade' || campo === 'valorUnit') {
          return { ...item, [campo]: Number(valor.replace(',', '.')) || 0 }
        }
        return { ...item, [campo]: valor } as ItemOrcamento
      }),
    )
  }

  function enviar() {
    setErro(null)
    iniciar(async () => {
      const validos = itens.filter((i) => i.descricao.trim().length >= 2)
      if (validos.length === 0) {
        setErro('Inclua ao menos um item com descrição.')
        return
      }

      const form = new FormData()
      form.set('ordemId', ordemId)
      form.set('itensJson', JSON.stringify(validos))
      form.set('desconto', String(desconto))
      form.set('validadeDias', String(validadeDias))
      form.set('garantiaDias', String(garantiaDias))
      form.set('prazoExecucaoDias', String(prazoDias))
      form.set('observacoes', obs)
      if (laudo) form.set('laudoTecnico', laudo)

      const r = await salvarOrcamento({ ok: true }, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }

      if (passos.length > 0) {
        const t = await avancarNaEsteira({ ordemId, passos })
        if (!t.ok) {
          setErro(t.motivo)
          return
        }
      }
      router.push(`/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  return (
    <Folha
      titulo="Montar e enviar o orçamento"
      vivo={
        <>
          <p className={estilo.vivoTitulo}>O orçamento, agora</p>
          <p className={estilo.vivoLinha}>
            <span>Itens</span>
            <strong>{itens.filter((i) => i.descricao.trim()).length}</strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>Subtotal</span>
            <strong>{formatarBRL(Math.round(subtotal * 100))}</strong>
          </p>
          {desconto > 0 ? (
            <p className={estilo.vivoLinha}>
              <span>Desconto</span>
              <strong>− {formatarBRL(Math.round(desconto * 100))}</strong>
            </p>
          ) : null}
          <p className={`${estilo.vivoLinha} ${estilo.vivoTotal}`}>
            <span>Total</span>
            <strong>{formatarBRL(Math.round(total * 100))}</strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>Vale até</span>
            <strong>{validade.toLocaleDateString('pt-BR')}</strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>Garantia</span>
            <strong>{garantiaDias} dias</strong>
          </p>
          <p className={estilo.campoDica}>
            O cliente recebe o link do portal no WhatsApp e aprova com CPF ou CNPJ.
            A aprovação dele é o que libera a manutenção.
          </p>
        </>
      }
      botao={passos.length > 0 ? 'Enviar ao cliente' : 'Salvar orçamento'}
      indo={indo}
      erro={erro}
      onEnviar={enviar}
      travado={subtotal <= 0}
    >
      <div className={estilo.campos}>
        {itens.map((item, i) => (
          <div key={i} className={estilo.largo}>
            <div className={estilo.campos}>
              <label className={estilo.campo}>
                <span>Tipo</span>
                <select value={item.tipo} onChange={(e) => mudar(i, 'tipo', e.target.value)}>
                  <option value="SERVICO">Serviço</option>
                  <option value="PECA">Peça</option>
                  <option value="DESLOCAMENTO">Deslocamento</option>
                  <option value="TAXA">Taxa</option>
                </select>
              </label>
              <label className={estilo.campo}>
                <span>Descrição</span>
                <input
                  value={item.descricao}
                  onChange={(e) => mudar(i, 'descricao', e.target.value)}
                  placeholder="Troca da placa de potência"
                />
              </label>
              <label className={estilo.campo}>
                <span>Quantidade</span>
                <input
                  inputMode="decimal"
                  value={String(item.quantidade)}
                  onChange={(e) => mudar(i, 'quantidade', e.target.value)}
                />
              </label>
              <label className={estilo.campo}>
                <span>Valor unitário (R$)</span>
                <input
                  inputMode="decimal"
                  value={String(item.valorUnit)}
                  onChange={(e) => mudar(i, 'valorUnit', e.target.value)}
                />
              </label>
            </div>
          </div>
        ))}

        <div className={estilo.largo}>
          <button
            type="button"
            className={estilo.acaoLinha}
            onClick={() => setItens((l) => [...l, { ...ITEM_VAZIO }])}
          >
            + Outro item
          </button>
        </div>

        <label className={estilo.campo}>
          <span>Desconto (R$)</span>
          <input
            inputMode="decimal"
            value={String(desconto)}
            onChange={(e) => setDesconto(Number(e.target.value.replace(',', '.')) || 0)}
          />
        </label>
        <label className={estilo.campo}>
          <span>Vale por (dias)</span>
          <input
            inputMode="numeric"
            value={String(validadeDias)}
            onChange={(e) => setValidadeDias(Number(e.target.value) || 15)}
          />
        </label>
        <label className={estilo.campo}>
          <span>Garantia (dias)</span>
          <input
            inputMode="numeric"
            value={String(garantiaDias)}
            onChange={(e) => setGarantiaDias(Number(e.target.value) || 90)}
          />
        </label>
        <label className={estilo.campo}>
          <span>Prazo de execução (dias)</span>
          <input
            inputMode="numeric"
            value={String(prazoDias)}
            onChange={(e) => setPrazoDias(Number(e.target.value) || 7)}
          />
        </label>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>Observações que o cliente vai ler (opcional)</span>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
      </div>
    </Folha>
  )
}

// ===========================================================================
// PEÇAS — o que saiu da prateleira
// ===========================================================================

/**
 * A declaração de peças, na SAÍDA da manutenção.
 *
 * O motor exige `PECAS_DECLARADAS` para concluir o serviço, e o comentário dele
 * explica por que aqui e não na entrada: *"ninguém sabe qual peça vai precisar
 * ANTES de abrir o aparelho"*. Na saída a exigência é honesta — quem acabou de
 * consertar sabe o que usou, e é o último instante em que ainda lembra.
 *
 * "Não usei peça" é uma resposta legítima e precisa ser dita em voz alta: sem
 * ela, "não usei" e "esqueci de lançar" são o mesmo silêncio, e é assim que o
 * estoque deriva.
 */
export function FluxoPecas({
  ordemId,
  passos,
  jaDeclarou,
  servicoAtual,
}: {
  ordemId: string
  passos: EtapaOrdem[]
  jaDeclarou: boolean
  servicoAtual: string | null
}) {
  const router = useRouter()
  const [servico, setServico] = useState(servicoAtual ?? '')
  const [semPeca, setSemPeca] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [indo, iniciar] = useTransition()

  function enviar() {
    setErro(null)
    iniciar(async () => {
      if (servico.trim().length >= 10) {
        const form = new FormData()
        form.set('ordemId', ordemId)
        // O diagnóstico é obrigatório no esquema desta ação e já existe nesta
        // altura da esteira: reenviá-lo mantém o que está gravado.
        form.set('diagnostico', servico.trim())
        form.set('servicoExecutado', servico.trim())
        await salvarDiagnostico(form)
      }

      if (semPeca && !jaDeclarou) {
        const d = await declararSemPeca(ordemId)
        if (!d.ok) {
          setErro(d.motivo)
          return
        }
      }

      const t = await avancarNaEsteira({ ordemId, passos })
      if (!t.ok) {
        setErro(t.motivo)
        return
      }
      router.push(`/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  return (
    <Folha
      titulo="Concluir a manutenção"
      vivo={
        <>
          <p className={estilo.vivoTitulo}>Antes de fechar</p>
          <p className={estilo.vivoLinha}>
            <span>Peças</span>
            <strong className={jaDeclarou || semPeca ? undefined : estilo.vivoVago}>
              {jaDeclarou ? 'lançadas' : semPeca ? 'nenhuma usada' : 'falta declarar'}
            </strong>
          </p>
          <p className={estilo.campoDica}>
            Depois daqui a O.S. vai para a gestão, para o financeiro e para a rua.
            A peça que não for lançada agora não vai ser lançada nunca.
          </p>
        </>
      }
      botao="Concluir manutenção"
      indo={indo}
      erro={erro}
      onEnviar={enviar}
      travado={!jaDeclarou && !semPeca}
    >
      <div className={estilo.campos}>
        <label className={`${estilo.campo} ${estilo.largo}`}>
          <span>O que foi executado</span>
          <textarea
            value={servico}
            onChange={(e) => setServico(e.target.value)}
            placeholder="Substituída a placa de potência, refeita a solda do conector, testado por 2h em carga…"
          />
        </label>

        {!jaDeclarou ? (
          <label className={`${estilo.campo} ${estilo.largo}`}>
            <span>Peças do estoque</span>
            <span className={estilo.campoDica}>
              Se usou peça, lance no estoque antes de concluir. Se não usou,
              marque abaixo — o silêncio não serve como resposta.
            </span>
            <label className={estilo.assinaturaPe}>
              <input
                type="checkbox"
                checked={semPeca}
                onChange={(e) => setSemPeca(e.target.checked)}
              />
              <span>Não usei nenhuma peça neste serviço</span>
            </label>
          </label>
        ) : null}
      </div>
    </Folha>
  )
}

// ===========================================================================
// PAGAMENTO
// ===========================================================================

const FORMAS = [
  { valor: 'PIX', rotulo: 'PIX' },
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'CARTAO_DEBITO', rotulo: 'Cartão de débito' },
  { valor: 'CARTAO_CREDITO', rotulo: 'Cartão de crédito' },
  { valor: 'BOLETO', rotulo: 'Boleto' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferência' },
]

export function FluxoPagamento({
  ordemId,
  faturaId,
  abertoCentavos,
}: {
  ordemId: string
  /** `null` quando a fatura ainda nem foi emitida. */
  faturaId: string | null
  abertoCentavos: number
}) {
  const router = useRouter()
  const [forma, setForma] = useState('PIX')
  const [valor, setValor] = useState((abertoCentavos / 100).toFixed(2))
  const [erro, setErro] = useState<string | null>(null)
  const [indo, iniciar] = useTransition()

  const informado = Math.round((Number(valor.replace(',', '.')) || 0) * 100)
  const resto = abertoCentavos - informado

  function emitirFatura() {
    setErro(null)
    iniciar(async () => {
      const r = await emitir(ordemId)
      if (!r.ok) setErro(r.motivo)
      else router.refresh()
    })
  }

  function enviar() {
    if (!faturaId) return
    setErro(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('faturaId', faturaId)
      form.set('ordemId', ordemId)
      form.set('pagamentosJson', JSON.stringify([{ forma, valor: informado / 100, parcelas: 1 }]))

      // A ação de receber JÁ avança a ordem quando a fatura fecha — e ela
      // confirma isso lendo o banco, não confiando na conta desta tela. Por
      // isso não há um `avancarNaEsteira` aqui: seria um segundo salto para a
      // mesma etapa, e o motor recusaria com razão.
      const r = await receber({ ok: true }, form)
      if (!r.ok) {
        setErro(r.motivo)
        return
      }
      router.push(`/sistema/ordens/${ordemId}`)
      router.refresh()
    })
  }

  if (!faturaId) {
    return (
      <Folha
        titulo="Confirmar o pagamento"
        vivo={
          <>
            <p className={estilo.vivoTitulo}>Falta um passo antes</p>
            <p className={estilo.campoDica}>
              Esta O.S. ainda não tem fatura. A cobrança nasce do orçamento
              aprovado — emitir aqui monta a fatura com esses valores.
            </p>
          </>
        }
        botao="Emitir a fatura"
        indo={indo}
        erro={erro}
        onEnviar={emitirFatura}
      >
        <p className={estilo.campoDica}>
          Sem fatura não há o que dar baixa. Emitida, ela aparece aqui para
          receber.
        </p>
      </Folha>
    )
  }

  return (
    <Folha
      titulo="Confirmar o pagamento"
      vivo={
        <>
          <p className={estilo.vivoTitulo}>A cobrança</p>
          <p className={estilo.vivoLinha}>
            <span>Em aberto</span>
            <strong>{formatarBRL(abertoCentavos)}</strong>
          </p>
          <p className={estilo.vivoLinha}>
            <span>Recebendo agora</span>
            <strong>{formatarBRL(informado)}</strong>
          </p>
          <p className={`${estilo.vivoLinha} ${estilo.vivoTotal}`}>
            <span>{resto > 0 ? 'Ainda faltará' : 'Fatura'}</span>
            <strong>{resto > 0 ? formatarBRL(resto) : 'quitada'}</strong>
          </p>
          <p className={estilo.campoDica}>
            {resto > 0
              ? 'Recebimento parcial fica registrado, mas a O.S. só é liberada para entrega quando a fatura fechar.'
              : 'Com a fatura quitada, a O.S. é liberada para a entrega e o recibo é gerado.'}
          </p>
        </>
      }
      botao="Confirmar pagamento"
      indo={indo}
      erro={erro}
      onEnviar={enviar}
      travado={informado <= 0}
    >
      <div className={estilo.campos}>
        <label className={estilo.campo}>
          <span>Forma</span>
          <select value={forma} onChange={(e) => setForma(e.target.value)}>
            {FORMAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className={estilo.campo}>
          <span>Valor recebido (R$)</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
    </Folha>
  )
}

// ===========================================================================
// A MOLDURA COMUM
// ===========================================================================

/**
 * `<SplitForm>` — blocos à esquerda, painel-vivo à direita.
 *
 * Uma moldura só para as cinco folhas. É o que faz a terceira folha parecer a
 * primeira: quem aprendeu a agendar uma coleta já sabe montar um orçamento,
 * porque a forma da tela e o lugar do botão são os mesmos.
 */
function Folha({
  titulo,
  children,
  vivo,
  botao,
  onEnviar,
  indo,
  erro,
  travado = false,
}: {
  titulo: string
  children: React.ReactNode
  vivo: React.ReactNode
  botao: string
  onEnviar: () => void
  indo: boolean
  erro: string | null
  travado?: boolean
}) {
  return (
    <div className={estilo.split}>
      <div className={estilo.blocos}>
        <section className={estilo.blocoForm}>
          <div className={estilo.blocoNum}>
            <span className={estilo.blocoNumSelo} aria-hidden="true">
              1
            </span>
            <h2 className={estilo.blocoNomeForm}>{titulo}</h2>
          </div>
          {children}
        </section>
      </div>

      <aside className={estilo.vivo}>
        {vivo}
        <button
          type="button"
          className={estilo.acaoLarga}
          onClick={onEnviar}
          disabled={indo || travado}
        >
          {indo ? 'Um instante…' : botao}
        </button>
        {erro ? (
          <p className={estilo.acaoErro} role="alert">
            {erro}
          </p>
        ) : null}
      </aside>
    </div>
  )
}

function porExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
