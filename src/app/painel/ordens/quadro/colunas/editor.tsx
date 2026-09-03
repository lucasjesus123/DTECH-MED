'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { excluirColuna, moverColuna, salvarColuna } from '@/server/acoes/quadro'
import estilo from '../../../painel.module.css'

type Etapa = { chave: string; rotulo: string }
type ColunaEditavel = { id: string; nome: string; cor: string | null; etapas: string[] }

const CORES: Array<[string, string]> = [
  ['', 'Sem cor'],
  ['violeta', 'Violeta'],
  ['acao', 'Azul'],
  ['sinal', 'Verde'],
  ['espera', 'Âmbar'],
  ['alerta', 'Vermelho'],
]

/**
 * O EDITOR DAS COLUNAS.
 *
 * =============================================================================
 * AS ÓRFÃS VÊM PRIMEIRO, E NÃO NO FIM
 * =============================================================================
 * A informação mais importante desta tela não é a lista de colunas — é a lista
 * de etapas que ficaram FORA de todas elas. Ordem numa etapa órfã só aparece na
 * coluna de resgate do quadro; nada some, mas ninguém arruma o que não vê.
 *
 * Por isso ela abre a tela, com o nome de cada etapa escrito. Pôr no rodapé
 * seria escondê-la de quem rola até a metade e acha que terminou.
 *
 * =============================================================================
 * MARCAR UMA ETAPA AQUI A TIRA DE ONDE ELA ESTAVA
 * =============================================================================
 * Uma etapa em duas colunas duplicaria o cartão: a mesma O.S. em dois lugares
 * do quadro, e mover uma cópia deixaria a outra desatualizada até recarregar —
 * a pessoa veria a mesma ordem em dois estados na mesma tela.
 *
 * Então a ação do servidor TIRA a etapa das outras colunas ao salvar. É o que
 * quem arrasta espera: pôr "Em análise" aqui significa que ela sai de onde
 * estava. Recusar seria pior — obrigaria a desmarcar antes, adivinhando onde.
 * A tela avisa quando isso vai acontecer, para não ser surpresa.
 */
export default function Editor({
  colunas,
  etapas,
  orfas,
}: {
  colunas: ColunaEditavel[]
  etapas: Etapa[]
  orfas: Etapa[]
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  // De qual coluna é cada etapa — para o formulário avisar "vai sair de X".
  const dona = new Map<string, string>()
  for (const c of colunas) for (const e of c.etapas) dona.set(e, c.nome)

  function agir(fn: () => Promise<{ ok: true; mensagem?: string } | { ok: false; motivo: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <>
      {orfas.length > 0 ? (
        <p className={estilo.avisoCaixaForte} role="alert" style={{ marginBottom: 'var(--s4)' }}>
          <strong>
            {orfas.length} {orfas.length === 1 ? 'etapa está' : 'etapas estão'} fora do quadro.
          </strong>{' '}
          Ordens nestas etapas aparecem na coluna &ldquo;Fora do quadro&rdquo; até você encaixá-las:{' '}
          {orfas.map((e) => e.rotulo).join(' · ')}.
        </p>
      ) : (
        <p className={estilo.sucesso} role="status" style={{ marginBottom: 'var(--s4)' }}>
          Todas as 21 etapas têm coluna. Nenhuma ordem fica fora do quadro.
        </p>
      )}

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <ul className={estilo.colunaLista}>
        {colunas.map((c, i) => (
          <li key={c.id} className={estilo.bloco}>
            {editando === c.id ? (
              <Formulario
                coluna={c}
                etapas={etapas}
                dona={dona}
                aoFechar={() => setEditando(null)}
              />
            ) : (
              <>
                <div className={estilo.modeloCartaoTopo}>
                  <div>
                    <p className={estilo.modeloCartaoNome}>{c.nome}</p>
                    <p className={estilo.dica}>
                      {c.etapas.length === 0
                        ? 'Nenhuma etapa — esta coluna vai aparecer sempre vazia.'
                        : c.etapas
                            .map((e) => etapas.find((x) => x.chave === e)?.rotulo ?? e)
                            .join(' · ')}
                    </p>
                  </div>
                </div>
                <div className={estilo.modeloCartaoAcoes}>
                  <button
                    type="button"
                    className={estilo.btnSec}
                    onClick={() => setEditando(c.id)}
                  >
                    Editar
                  </button>
                  {/* Trocar de lugar é seta, e não arrastar: são cinco ou seis
                      colunas, o gesto acontece uma vez por mês, e seta funciona
                      no teclado e no leitor de tela sem nenhum trabalho a mais. */}
                  <button
                    type="button"
                    className={estilo.iconeAcao}
                    disabled={pendente || i === 0}
                    aria-label={`Mover ${c.nome} para a esquerda`}
                    onClick={() => agir(() => moverColuna(c.id, 'esquerda'))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className={estilo.iconeAcao}
                    disabled={pendente || i === colunas.length - 1}
                    aria-label={`Mover ${c.nome} para a direita`}
                    onClick={() => agir(() => moverColuna(c.id, 'direita'))}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className={estilo.acaoRara}
                    disabled={pendente}
                    onClick={() => {
                      if (
                        confirm(
                          `Apagar a coluna "${c.nome}"? Nenhuma ordem muda — as que estavam nela aparecem em "Fora do quadro" até você encaixá-las noutra.`,
                        )
                      ) {
                        agir(() => excluirColuna(c.id))
                      }
                    }}
                  >
                    Apagar
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {criando ? (
        <div className={estilo.bloco}>
          <Formulario coluna={null} etapas={etapas} dona={dona} aoFechar={() => setCriando(false)} />
        </div>
      ) : (
        <button
          type="button"
          className={estilo.btnPrimario}
          style={{ marginTop: 'var(--s4)' }}
          onClick={() => setCriando(true)}
        >
          + Nova coluna
        </button>
      )}
    </>
  )
}

function Formulario({
  coluna,
  etapas,
  dona,
  aoFechar,
}: {
  coluna: ColunaEditavel | null
  etapas: Etapa[]
  dona: Map<string, string>
  aoFechar: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarColuna, { ok: true } as
    | { ok: true; mensagem?: string }
    | { ok: false; motivo: string })
  const router = useRouter()

  useEffect(() => {
    if (estado.ok && estado.mensagem) {
      router.refresh()
      aoFechar()
    }
  }, [estado, router, aoFechar])

  const minhas = new Set(coluna?.etapas ?? [])

  return (
    <form action={acao} className={estilo.form}>
      {coluna ? <input type="hidden" name="id" value={coluna.id} /> : null}

      <div className={estilo.formLinha}>
        <label className={estilo.rotulo}>
          Nome da coluna *
          <input
            className={estilo.campo}
            name="nome"
            required
            maxLength={40}
            defaultValue={coluna?.nome ?? ''}
            placeholder="Comp. peças, Aprovação, S/ reparo…"
          />
        </label>
        <label className={estilo.rotulo}>
          Cor da faixa
          <select className={estilo.selecao} name="cor" defaultValue={coluna?.cor ?? ''}>
            {CORES.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s3)' }}>
        Quais etapas caem nesta coluna
      </p>
      <div className={estilo.abasLista}>
        {etapas.map((e) => {
          const daOutra = dona.get(e.chave)
          const minha = minhas.has(e.chave)
          return (
            <label key={e.chave} className={estilo.abaOpcao}>
              <input type="checkbox" name="etapas" value={e.chave} defaultChecked={minha} />
              <span>
                {e.rotulo}
                {/* Avisa que marcar aqui TIRA de lá. Sem isso a etapa some da
                    outra coluna sem explicação, e parece defeito. */}
                {daOutra && !minha ? (
                  <span className={estilo.dica}>hoje em &ldquo;{daOutra}&rdquo; — sai de lá</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>

      {!estado.ok ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}

      <div className={estilo.acoesForm}>
        <button type="button" className={estilo.btnSec} onClick={aoFechar}>
          Cancelar
        </button>
        <button type="submit" className={estilo.btnPrimario} disabled={pendente}>
          {pendente ? 'Salvando…' : coluna ? 'Salvar coluna' : 'Criar coluna'}
        </button>
      </div>
    </form>
  )
}
