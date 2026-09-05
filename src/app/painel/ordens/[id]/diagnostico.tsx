'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarDiagnostico } from '@/server/acoes/orcamento'
import estilo from '../../painel.module.css'

/**
 * O LAUDO DO TÉCNICO — UM CAMPO LIVRE, e não quatro caixas.
 *
 * =============================================================================
 * POR QUE ERAM QUATRO, E POR QUE PASSARAM A SER UM
 * =============================================================================
 * A tela pedia, de uma vez: o que você encontrou, o parecer para a gestão, o
 * que foi executado e os testes finais. Quatro caixas na mesma tela, no mesmo
 * momento — e o dono do sistema resumiu bem: *"não quero ficar escrevendo item
 * a item"*.
 *
 * Ele tem razão, e o defeito era de CRONOLOGIA, não de quantidade. Quando o
 * técnico abre o aparelho ele tem uma coisa para contar: o que achou. "O que
 * foi executado" e "testes finais" são de quem JÁ EXECUTOU — pedi-los ali é
 * pedir que ele descreva o que ainda não fez, e é isso que fazia a tela
 * parecer um formulário burocrático.
 *
 * Agora: NA ANÁLISE, um campo livre e grande, onde ele escreve corrido tudo o
 * que precisa ser feito. DEPOIS DA BANCADA (`jaExecutou`), aparecem os dois
 * campos da execução, porque aí existe o que escrever neles.
 *
 * =============================================================================
 * O PARECER CONTINUA SEPARADO — E ISSO NÃO É TEIMOSIA
 * =============================================================================
 * Juntar TUDO num campo só seria mais simples de programar e errado de
 * entregar. O parecer é onde o técnico escreve "vale consertar?", "recomenda
 * trocar a peça inteira ou recuperar?" — raciocínio COMERCIAL, que a gestão lê
 * para formar preço.
 *
 * O laudo vai para o documento que o cliente recebe. Fundir os dois manda a
 * conversa interna sobre margem junto com o orçamento, para o e-mail do
 * cliente. É um campo a mais na tela e uma discussão a menos com o cliente.
 */
export default function Diagnostico({
  ordemId,
  diagnostico,
  parecerTecnico,
  servicoExecutado,
  testesFinais,
  jaExecutou,
  proximoPasso,
}: {
  ordemId: string
  diagnostico: string
  parecerTecnico: string
  servicoExecutado: string
  testesFinais: string
  /** A ordem já passou pela bancada? Só então execução e testes fazem sentido. */
  jaExecutou: boolean
  /** O nome do próximo passo da esteira, para o laudo emendar nele. */
  proximoPasso: string | null
}) {
  const [aberto, setAberto] = useState(!diagnostico)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [salvou, setSalvou] = useState(false)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function salvar(form: FormData) {
    setMsg(null)
    iniciar(async () => {
      const r = await salvarDiagnostico(form)
      if (!r.ok) {
        setMsg({ ok: false, texto: r.motivo })
        return
      }
      setMsg({ ok: true, texto: 'Laudo salvo.' })
      setSalvou(true)
      setAberto(false)
      router.refresh()
      /**
       * SALVAR PRECISA EMENDAR NO PRÓXIMO PASSO.
       *
       * Antes, salvar fechava o formulário e parava ali — e a pessoa ficava
       * numa tela que não dizia o que fazer em seguida, com o botão do próximo
       * passo lá em cima, fora do campo de visão de quem acabou de escrever
       * quinze linhas.
       *
       * O `setTimeout` espera o `refresh` repintar a lista de passos: rolar
       * antes disso leva para um bloco que ainda vai mudar de altura.
       */
      setTimeout(() => {
        document.getElementById('passos')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 350)
    })
  }

  if (!aberto) {
    return (
      <div className={estilo.passos} style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
        {salvou && proximoPasso ? (
          <p className={estilo.sucesso} role="status">
            Laudo salvo. O próximo passo é <strong>{proximoPasso}</strong> — o botão está no
            topo da ficha.
          </p>
        ) : null}
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(true)}>
          Editar o laudo
        </button>
      </div>
    )
  }

  return (
    <form action={salvar} className={estilo.form} style={{ marginTop: 'var(--s4)' }}>
      <input type="hidden" name="ordemId" value={ordemId} />

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <label className={estilo.rotulo}>
        O laudo — escreva livre
        <textarea
          className={estilo.area}
          name="diagnostico"
          rows={9}
          required
          minLength={10}
          defaultValue={diagnostico}
          placeholder={
            'Escreva corrido, do seu jeito: o que você encontrou no aparelho e o que precisa ' +
            'ser feito.\n\nEx.: fonte sem saída nos 24V, capacitor C14 estufado e trilha com ' +
            'sinal de sobreaquecimento. Precisa trocar a fonte inteira e refazer a trilha; o ' +
            'resto da placa está bom.'
          }
        />
        <span className={estilo.dica}>
          É este texto que sustenta o preço do orçamento, e é ele que o cliente lê. Sem ele a
          ordem não sai da análise.
        </span>
      </label>

      <label className={estilo.rotulo}>
        Parecer interno — o cliente não vê
        <textarea
          className={estilo.area}
          name="parecerTecnico"
          rows={3}
          defaultValue={parecerTecnico}
          placeholder="Vale consertar? Recomenda trocar a peça inteira ou recuperar?"
        />
        <span className={estilo.dica}>
          Fica separado de propósito: é o que a gestão lê para formar preço, e não entra no
          documento que vai para o cliente.
        </span>
      </label>

      {/* Execução e testes só quando existe o que escrever neles. */}
      {jaExecutou ? (
        <>
          <label className={estilo.rotulo}>
            O que foi executado
            <textarea
              className={estilo.area}
              name="servicoExecutado"
              rows={3}
              defaultValue={servicoExecutado}
            />
          </label>

          <label className={estilo.rotulo}>
            Testes finais
            <textarea
              className={estilo.area}
              name="testesFinais"
              rows={2}
              defaultValue={testesFinais}
              placeholder="O que foi testado e como o aparelho respondeu."
            />
          </label>
        </>
      ) : (
        /* SEM OS CAMPOS, MAS COM A EXPLICAÇÃO. Sumir com dois campos que a
           pessoa viu ontem, sem dizer nada, faz procurar o que não sumiu. */
        <>
          <input type="hidden" name="servicoExecutado" value={servicoExecutado} />
          <input type="hidden" name="testesFinais" value={testesFinais} />
          <p className={estilo.dica}>
            O que foi executado e os testes finais aparecem aqui quando o aparelho entrar em
            manutenção — é quando existe o que escrever neles.
          </p>
        </>
      )}

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar e seguir'}
        </button>
        {diagnostico ? (
          <button
            type="button"
            className={estilo.btnSec}
            onClick={() => setAberto(false)}
            disabled={pendente}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  )
}
