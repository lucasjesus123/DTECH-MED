'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirOrdem } from '@/server/acoes/ordem'
import { ligarPropostaNaOrdem } from '@/server/acoes/proposta'
import QuemEOCliente from './quem-e-o-cliente'
import QualEOAparelho from './qual-e-o-aparelho'
import estilo from '../../painel.module.css'

type Resposta = { ok: true; dados?: { id: string } } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Lead = {
  id: string
  nome: string
  contato: string
  telefone: string
  cidade: string
  equipamento: string
  mensagem: string
}

/**
 * OS QUATRO PASSOS, na ordem da ligação.
 *
 * O ORÇAMENTO ENTROU NA FRENTE porque é onde a conversa começa: o cliente
 * pergunta quanto custa antes de dizer o nome dele. Registrar isso depois, ou
 * não registrar, é como a frase "mas você me falou 250" chega três semanas
 * depois sem nada escrito de nenhum lado.
 *
 * Ele é o único passo que se pode pular inteiro — e o botão de pular está lá,
 * dito com todas as letras. Um campo de dinheiro obrigatório na primeira tela
 * de toda O.S. faria alguém digitar zero para passar, e zero é uma afirmação:
 * "combinamos que não se cobra".
 */
const PASSOS = [
  { n: 1, nome: 'O combinado', ajuda: 'O que já foi acertado no telefone. Dá para pular.' },
  { n: 2, nome: 'O cliente', ajuda: 'De quem é o aparelho e para onde o motorista vai.' },
  { n: 3, nome: 'O aparelho', ajuda: 'Qual máquina vai entrar na esteira.' },
  { n: 4, nome: 'A ordem', ajuda: 'O que está acontecendo, e com que urgência.' },
] as const

const ULTIMO = PASSOS.length

/**
 * ABRIR A O.S. EM TRÊS PASSOS.
 *
 * =============================================================================
 * POR QUE DEIXOU DE SER UMA TELA SÓ
 * =============================================================================
 * Era uma tela só de propósito — para não repetir o ERP antigo, onde abrir uma
 * O.S. custava passar por Pessoas, depois Produtos, depois O.S. O problema é que
 * "uma tela" virou catorze campos de uma vez, e o dono do sistema disse o que
 * isso provoca em quem abre:
 *
 *   "TO ACHANDO SO AINDA UM POUCO CONFUSO AO ABRIR O.S EU GOSTARIA QUE FOSSE
 *    MAIS FLUIDO TIPO PASSO A PASSO FACIL AINDA PRA MIM TA MUITO CONFUSO TUDO"
 *
 * Ele tem razão, e a correção não é voltar a três telas: é uma pergunta de cada
 * vez, na ordem em que o telefonema acontece — de quem é, qual máquina é, o que
 * está acontecendo.
 *
 * =============================================================================
 * OS PASSOS SÃO MOSTRADOS E ESCONDIDOS, NUNCA DESMONTADOS
 * =============================================================================
 * Este é o detalhe que decide se o assistente funciona ou destrói trabalho. Um
 * `passo === 1 && <Cliente/>` tira os campos do formulário: no passo 3 o
 * `FormData` sairia sem nome, sem CPF e sem endereço, e a ordem nasceria
 * quebrada — ou o servidor recusaria uma tela cheia de campos preenchidos que a
 * pessoa não consegue mais ver.
 *
 * Com `hidden`, os campos continuam no formulário e continuam sendo enviados.
 * O preço é que um campo obrigatório vazio dentro de um passo escondido trava o
 * envio sem mensagem nenhuma — o navegador não consegue focar o que não
 * aparece. Por isso ninguém avança de passo sem ele estar válido: `Continuar`
 * confere os campos DAQUELE passo e faz o próprio navegador apontar o que
 * falta, com o campo à vista.
 */
export default function Formulario({
  lead,
  proposta,
  aoAbrir,
}: {
  lead: Lead | null
  /**
   * O ORÇAMENTO DO PASSO 1 QUE ESTÁ VIRANDO ESTA ORDEM.
   *
   * Quando ele existe, o passo "o combinado" chega preenchido com o que o
   * cliente ACABOU DE APROVAR — valor, condição e o relato que ele contou.
   * Redigitar isso seria pedir de novo o que ele já assinou, e é exatamente
   * onde nasce a divergência entre o que foi orçado e o que foi aberto.
   */
  proposta: {
    id: string
    valor: string
    condicao: string
    equipamento: string
    necessidade: string
  } | null
  /**
   * Chamado com o id da ordem recém-aberta, quando o assistente está DENTRO de
   * uma janela. Sem ele, a página troca para a ficha — que é o certo quando o
   * assistente é a página inteira, em `/painel/ordens/nova`.
   */
  aoAbrir?: (id: string) => void
}) {
  const [estado, acao, pendente] = useActionState(abrirOrdem, inicial)
  const [passo, setPasso] = useState(1)
  const [maisLonge, setMaisLonge] = useState(1)
  const caixas = useRef<Array<HTMLDivElement | null>>([])
  const router = useRouter()

  /**
   * QUEM É O CLIENTE ESCOLHIDO — o único estado que os dois blocos dividem.
   *
   * O bloco do aparelho precisa dele para avisar, na hora da escolha, que a
   * máquina puxada está no nome de outra clínica. É a única coisa que sobe até
   * aqui; o resto de cada bloco continua sendo assunto dele.
   */
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null)

  // A marca costuma vir como "Ibramed Neurodyn": a primeira palavra é a marca,
  // o resto é o modelo. Chute útil, e a pessoa corrige em um clique se errar.
  const [marca = '', ...resto] = (lead?.equipamento ?? '').split(' ')

  /**
   * EMITIDA A ORDEM, A PRÓXIMA COISA É O DESPACHO.
   *
   * `?despachar=1` faz a ficha abrir já com a janela de marcar a parada — o dia
   * e o motorista. É o passo que vem depois de emitir, e mandar a pessoa
   * procurá-lo sozinha na tela nova seria devolver a confusão pela porta dos
   * fundos.
   */
  useEffect(() => {
    if (!estado.ok || !estado.dados?.id) return
    // Dentro da janela, quem assume é ela: a O.S. recém-aberta vira a janela do
    // passo a passo, já no passo 3, que é o "quem vai buscar". Trocar de página
    // aqui jogaria fora a lista e o filtro que a pessoa tinha atrás.
    /**
     * A PONTE FECHA AQUI: a ordem existe, então a proposta passa a apontar
     * para ela.
     *
     * Depois de criar, e não antes: ligar uma proposta a uma ordem que a
     * validação ainda pode recusar deixaria a proposta marcada como "virou
     * O.S." sem O.S. nenhuma. O `void` é deliberado — se a ligação falhar, a
     * ordem já está criada e certa, e o vínculo é dado de relatório, não de
     * operação. A tela não pode travar por causa dele.
     */
    if (proposta) void ligarPropostaNaOrdem(proposta.id, estado.dados.id)

    if (aoAbrir) aoAbrir(estado.dados.id)
    else router.push(`/painel/ordens/${estado.dados.id}?despachar=1`)
  }, [estado, router, aoAbrir, proposta])

  function irPara(n: number) {
    setPasso(n)
    setMaisLonge((m) => Math.max(m, n))
    // A pessoa acabou de trocar o conteúdo inteiro da tela; sem isto ela
    // continua olhando o meio do passo anterior.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function adiante() {
    const caixa = caixas.current[passo - 1]
    if (caixa) {
      const ruim = caixa.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:invalid, textarea:invalid, select:invalid',
      )
      if (ruim) {
        ruim.reportValidity()
        return
      }
    }
    irPara(passo + 1)
  }

  return (
    <form
      action={acao}
      className={`${estilo.bloco} ${estilo.form}`}
      style={{ maxWidth: 900 }}
      /* Enter num campo do passo 1 enviaria o formulário inteiro com metade das
         respostas. Aqui ele faz o que a pessoa quis dizer: seguir. */
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const alvo = e.target as HTMLElement
        if (alvo.tagName === 'TEXTAREA') return
        if (passo < ULTIMO) {
          e.preventDefault()
          adiante()
        }
      }}
    >
      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
      {lead ? <input type="hidden" name="leadId" value={lead.id} /> : null}

      {/* ---- A TRILHA: onde estou, quanto falta ------------------------- */}
      <ol className={estilo.assistTrilho}>
        {PASSOS.map((p) => {
          const estadoDoPasso =
            p.n === passo ? estilo.assistAtual : p.n <= maisLonge ? estilo.assistFeito : ''
          return (
            <li key={p.n} className={`${estilo.assistPasso} ${estadoDoPasso}`}>
              <button
                type="button"
                className={estilo.assistBotao}
                /* Só dá para voltar ao que já se viu. Pular para o passo 3 sem
                   ter dito quem é o cliente deixaria campos obrigatórios vazios
                   e escondidos — que é exatamente o travamento mudo que o
                   cabeçalho deste arquivo descreve. */
                disabled={p.n > maisLonge}
                aria-current={p.n === passo ? 'step' : undefined}
                onClick={() => irPara(p.n)}
              >
                <span className={estilo.assistNumero}>{p.n}</span>
                <span className={estilo.assistNome}>{p.nome}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className={estilo.dica} style={{ marginTop: 0 }}>
        Passo {passo} de {ULTIMO} · {PASSOS[passo - 1]!.ajuda}
      </p>

      {/* ---- 1 · O COMBINADO -------------------------------------------- */}
      {/* A caixa de fora só ESCONDE; a de dentro arruma os campos. `[hidden]`
          vem da folha do navegador e perde de qualquer classe com `display` —
          foi assim que, numa versão anterior, o passo 3 aparecia junto com o 1. */}
      <div ref={(el) => { caixas.current[0] = el }} hidden={passo !== 1}>
        <div className={estilo.form}>
          <p className={estilo.blocoTitulo}>O que já foi combinado</p>

          {proposta ? (
            <p className={estilo.sucesso} role="status" style={{ marginTop: 0 }}>
              Vindo do orçamento que o cliente aprovou. O valor já está preenchido — confira e
              siga.
            </p>
          ) : (
            <p className={estilo.dica} style={{ marginTop: 0 }}>
              O valor acertado nesta ligação — retirada, avaliação, deslocamento. Não é o
              orçamento do conserto: esse nasce depois do laudo, com o aparelho na bancada.
            </p>
          )}

          <div className={estilo.janelaGrade}>
            <label className={estilo.rotulo}>
              Valor combinado
              <input
                className={estilo.campo}
                name="valorCombinado"
                inputMode="decimal"
                autoComplete="off"
                placeholder="250,00"
                defaultValue={proposta?.valor ?? ''}
              />
            </label>
            <label className={estilo.rotulo}>
              O que está incluso
              <input
                className={estilo.campo}
                name="condicaoCombinada"
                maxLength={200}
                placeholder="Retirada e avaliação, abatidos no conserto"
                defaultValue={proposta?.condicao ?? ''}
              />
            </label>
          </div>

          <div className={estilo.acoesForm}>
            <button type="button" className={estilo.btnSec} onClick={() => irPara(2)}>
              {proposta ? 'Seguir' : 'Não combinei nada ainda — seguir'}
            </button>
          </div>
        </div>
      </div>

      {/* ---- 2 · O CLIENTE ---------------------------------------------- */}
      <div ref={(el) => { caixas.current[1] = el }} hidden={passo !== 2}>
        <QuemEOCliente
          nomeInicial={lead?.nome ?? ''}
          telefoneInicial={lead?.telefone ?? ''}
          contatoInicial={lead?.contato ?? ''}
          cidadeInicial={lead?.cidade ?? ''}
          aoMudarEscolha={setCliente}
        />
      </div>

      {/* ---- 3 · O APARELHO --------------------------------------------- */}
      <div ref={(el) => { caixas.current[2] = el }} hidden={passo !== 3}>
        <QualEOAparelho
          marcaInicial={marca}
          modeloInicial={resto.join(' ')}
          clienteId={cliente?.id ?? null}
          clienteNome={cliente?.nome ?? null}
        />
      </div>

      {/* ---- 4 · A ORDEM ------------------------------------------------ */}
      {/**
       * O `hidden` FICA NUMA CAIXA SEM CLASSE, e isto não é preciosismo.
       *
       * A primeira versão era `<div hidden className={estilo.form}>`, e o passo
       * 3 aparecia junto com o passo 1. `[hidden]` esconde por `display: none`
       * vindo da folha do NAVEGADOR, e qualquer classe do sistema com `display`
       * ganha dela por especificidade — `.form` é `display: grid`. O atributo
       * continuava lá, certinho, e não escondia nada.
       *
       * O roteiro pegou: "o campo do defeito aparece já no passo do cliente".
       * A correção é separar os papéis — a caixa de fora esconde, a de dentro
       * arruma os campos.
       */}
      <div ref={(el) => { caixas.current[3] = el }} hidden={passo !== 4}>
        <div className={estilo.form}>
        <p className={estilo.blocoTitulo}>O que o cliente contou</p>

        {/* O resumo do que já foi respondido. Emitir é irreversível na prática
            — o PDF sai e o cliente recebe — e ninguém deve precisar voltar dois
            passos só para conferir se escolheu o cliente certo. */}
        {cliente ? (
          <p className={estilo.avisoCaixa} role="status">
            <strong>{cliente.nome}</strong> · da carteira.{' '}
            <button type="button" className={estilo.linkAcao} onClick={() => irPara(2)}>
              Conferir os dados
            </button>
          </p>
        ) : null}

        <label className={estilo.rotulo}>
          O que está acontecendo *
          <textarea
            className={estilo.area}
            name="defeito"
            required
            minLength={10}
            rows={4}
            placeholder="Do jeito que o cliente contou. Ex.: liga, mas desliga sozinho depois de uns dez minutos."
            defaultValue={lead?.mensagem ?? ''}
          />
        </label>

        <label className={estilo.rotulo} style={{ maxWidth: 280 }}>
          Prioridade
          <select className={estilo.selecao} name="prioridade" defaultValue="NORMAL" style={{ width: '100%' }}>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta — clínica parada faturando</option>
          </select>
        </label>

        <p className={estilo.dica}>
          Ao emitir, o PDF da Ordem de Serviço sai na hora e a próxima tela já abre o despacho —
          o dia e o motorista que vai buscar.
        </p>
        </div>
      </div>

      {/* ---- O RODAPÉ DO ASSISTENTE ------------------------------------- */}
      <div className={estilo.acoesForm}>
        {passo > 1 ? (
          <button type="button" className={estilo.btnSec} onClick={() => irPara(passo - 1)} disabled={pendente}>
            Voltar
          </button>
        ) : null}

        {/**
         * AS DUAS `key` SÃO O CONSERTO DE UM DEFEITO DE VERDADE.
         *
         * Sem elas, o React vê um `<button>` na mesma posição da árvore nos dois
         * ramos e REAPROVEITA o mesmo elemento do DOM, trocando só o `type` e o
         * texto. O estrago acontece dentro de um clique só:
         *
         *   1. clico em "Continuar" (`type="button"`);
         *   2. o `onClick` roda e o React repinta na hora — o MESMO botão vira
         *      `type="submit"`;
         *   3. o navegador só então executa a ação padrão do clique, e a lê do
         *      elemento COMO ELE ESTÁ AGORA: submit. O formulário é enviado.
         *
         * Aqui isso ficou invisível por sorte: `defeito` é obrigatório e vazio,
         * então o navegador barra o envio e mostra o balão "preencha este
         * campo" — que foi o rastro que denunciou tudo numa foto de tela. Mas
         * quando a O.S. vem de um contato do site, `defeito` JÁ NASCE
         * PREENCHIDO com o que a pessoa escreveu: nada barraria, e clicar
         * "Continuar" no passo 2 abriria a ordem sem ninguém ter visto o passo
         * 3, com PDF emitido e cliente avisado.
         *
         * Com `key` diferente, são dois elementos distintos: o clicado continua
         * sendo `type="button"` até o fim do seu próprio evento.
         */}
        {passo < ULTIMO ? (
          <button key="continuar" type="button" className={estilo.btn} onClick={adiante}>
            Continuar
          </button>
        ) : (
          <button key="emitir" type="submit" className={estilo.btn} disabled={pendente}>
            {pendente ? 'Emitindo…' : 'Emitir Ordem de Serviço'}
          </button>
        )}
      </div>
    </form>
  )
}
