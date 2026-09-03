'use client'

import { useActionState, useState } from 'react'
import { lancarMovimento, salvarPeca } from '@/server/acoes/estoque'
import estilo from '../painel.module.css'

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Peca = { id: string; sku: string; nome: string; saldo: number; unidade: string }

/**
 * Cadastro de peça e lançamento de movimento.
 *
 * Os dois formulários ficam fechados por padrão. A tela de estoque é usada
 * muito mais para consultar do que para lançar, e um formulário sempre aberto
 * empurraria a tabela — a informação que a pessoa veio ver — para baixo da
 * dobra.
 */
export default function Painel({ pecas, podeMexer }: { pecas: Peca[]; podeMexer: boolean }) {
  const [aba, setAba] = useState<'nenhuma' | 'peca' | 'movimento'>('nenhuma')
  const [estadoPeca, acaoPeca, salvandoPeca] = useActionState(salvarPeca, inicial)
  const [estadoMov, acaoMov, salvandoMov] = useActionState(lancarMovimento, inicial)
  const [tipo, setTipo] = useState('ENTRADA')
  /**
   * QUE COISA ESTÁ SENDO CADASTRADA — e o formulário muda com a resposta.
   *
   * Ferramenta não tem preço de venda (não se vende) e tem patrimônio (a
   * plaquinha por onde se acha a que sumiu). Peça é o contrário. Mostrar os
   * dois campos sempre faria metade da ficha ser ignorada em cada cadastro, e
   * campo ignorado é campo preenchido errado.
   */
  const [especie, setEspecie] = useState<'PECA' | 'INSUMO' | 'FERRAMENTA'>('PECA')
  const ferramenta = especie === 'FERRAMENTA'

  if (!podeMexer) return null

  return (
    <div style={{ marginBottom: 'var(--s5)' }}>
      <div className={estilo.acoesForm}>
        <button
          type="button"
          className={aba === 'peca' ? estilo.btn : estilo.btnSec}
          onClick={() => setAba(aba === 'peca' ? 'nenhuma' : 'peca')}
        >
          Cadastrar item
        </button>
        <button
          type="button"
          className={aba === 'movimento' ? estilo.btn : estilo.btnSec}
          onClick={() => setAba(aba === 'movimento' ? 'nenhuma' : 'movimento')}
        >
          Lançar entrada, baixa ou inventário
        </button>
      </div>

      {aba === 'peca' ? (
        <form action={acaoPeca} className={`${estilo.bloco} ${estilo.form}`} style={{ marginTop: 'var(--s4)' }}>
          <p className={estilo.blocoTitulo}>Novo item do estoque</p>
          {!estadoPeca.ok && estadoPeca.motivo ? <p className={estilo.erro} role="alert">{estadoPeca.motivo}</p> : null}
          {estadoPeca.ok ? <p className={estilo.sucesso} role="status">Item cadastrado.</p> : null}

          {/* O TIPO VEM PRIMEIRO porque ele muda o resto do formulário — e,
              mais que isso, muda o que o sistema faz com o item. Peça é
              vendida na O.S.; insumo é gasto no trabalho; ferramenta VOLTA, e
              é a única que pode sair emprestada. */}
          <div className={estilo.abasLista} role="radiogroup" aria-label="Que tipo de item">
            {(
              [
                ['PECA', 'Peça', 'Vendida na O.S. e entra no orçamento'],
                ['INSUMO', 'Insumo', 'Gasto no trabalho: solda, álcool, graxa'],
                ['FERRAMENTA', 'Ferramenta', 'Sai com alguém e volta — não se consome'],
              ] as const
            ).map(([v, r, nota]) => (
              <label key={v} className={estilo.abaOpcao}>
                <input
                  type="radio"
                  name="tipo"
                  value={v}
                  checked={especie === v}
                  onChange={() => setEspecie(v)}
                />
                <span>
                  {r}
                  <span className={estilo.dica}>{nota}</span>
                </span>
              </label>
            ))}
          </div>

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Código *
              <input className={estilo.campo} name="sku" required maxLength={40} placeholder="Ex.: FT-2200" />
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Nome *
              <input className={estilo.campo} name="nome" required minLength={2} />
            </label>
            <label className={estilo.rotulo}>
              Categoria
              <input className={estilo.campo} name="categoria" placeholder="Fonte, placa, sensor…" />
            </label>
            <label className={estilo.rotulo}>
              Unidade
              <input className={estilo.campo} name="unidade" defaultValue="UN" maxLength={6} />
            </label>
            <label className={estilo.rotulo}>
              Onde fica
              <input className={estilo.campo} name="localizacao" placeholder="Prateleira B3" />
            </label>
            <label className={estilo.rotulo}>
              Fornecedor
              <input className={estilo.campo} name="fornecedor" />
            </label>
            <label className={estilo.rotulo}>
              Custo de compra (R$)
              <input className={estilo.campo} name="custoMedio" type="number" min="0" step="0.01" defaultValue={0} />
              <span className={estilo.dica}>
                Depois disso, o custo médio passa a ser recalculado a cada entrada.
              </span>
            </label>
            {/* Ferramenta não tem preço de venda: ela não é vendida. No lugar
                dele vem o patrimônio, que é o número da plaquinha — é por ele
                que se acha a ferramenta que sumiu. */}
            {ferramenta ? (
              <label className={estilo.rotulo}>
                Patrimônio
                <input className={estilo.campo} name="patrimonio" placeholder="Nº da plaquinha" />
                <span className={estilo.dica}>É por ele que se acha a ferramenta que sumiu.</span>
              </label>
            ) : (
              <label className={estilo.rotulo}>
                Preço de venda (R$)
                <input className={estilo.campo} name="precoVenda" type="number" min="0" step="0.01" defaultValue={0} />
              </label>
            )}
            <label className={estilo.rotulo}>
              Estoque mínimo
              <input className={estilo.campo} name="estoqueMinimo" type="number" min="0" step="0.001" defaultValue={0} />
              <span className={estilo.dica}>
                {ferramenta
                  ? 'Quantas você precisa ter sempre na parede.'
                  : 'Abaixo disso, a peça grita no Dashboard.'}
              </span>
            </label>
          </div>

          <label className={estilo.rotulo}>
            {ferramenta ? 'Para que serve' : 'Em que equipamentos serve'}
            <input
              className={estilo.campo}
              name="aplicacao"
              placeholder={ferramenta ? 'Onde esta ferramenta é usada' : 'Modelos compatíveis'}
            />
          </label>

          {/* A FOTO ENTRA AQUI, no cadastro, e não num segundo passo.
              Ela existia só depois do item nascer — e "cadastre agora,
              fotografe depois" é um passo que ninguém dá. O resultado era um
              catálogo sem foto, que é o mesmo que catálogo nenhum: a foto é o
              que responde "é esta?" quando o técnico procura a peça na
              prateleira. Se ela falhar, a peça continua cadastrada. */}
          <label className={estilo.rotulo}>
            {ferramenta ? 'Foto da ferramenta' : 'Foto da peça'}
            <input className={estilo.campo} type="file" name="foto" accept="image/*" />
            <span className={estilo.dica}>
              Opcional. É por ela que se acha a certa na prateleira — dá para trocar depois.
            </span>
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={salvandoPeca}>
              {salvandoPeca ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      ) : null}

      {aba === 'movimento' ? (
        <form action={acaoMov} className={`${estilo.bloco} ${estilo.form}`} style={{ marginTop: 'var(--s4)' }}>
          <p className={estilo.blocoTitulo}>Movimento de estoque</p>
          {!estadoMov.ok && estadoMov.motivo ? <p className={estilo.erro} role="alert">{estadoMov.motivo}</p> : null}
          {estadoMov.ok ? <p className={estilo.sucesso} role="status">Movimento lançado.</p> : null}

          <div className={estilo.grade}>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Peça *
              <select className={estilo.selecao} name="pecaId" required style={{ width: '100%' }}>
                <option value="">Escolha…</option>
                {pecas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.nome} (saldo {p.saldo} {p.unidade})
                  </option>
                ))}
              </select>
            </label>
            <label className={estilo.rotulo}>
              Tipo *
              <select
                className={estilo.selecao}
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="ENTRADA">Entrada (compra ou devolução)</option>
                <option value="SAIDA">Baixa avulsa</option>
                <option value="PERDA">Perda ou quebra</option>
                <option value="AJUSTE">Ajuste de inventário</option>
              </select>
            </label>
            <label className={estilo.rotulo}>
              {tipo === 'AJUSTE' ? 'Saldo contado *' : 'Quantidade *'}
              <input className={estilo.campo} name="quantidade" type="number" min="0" step="0.001" required />
              {tipo === 'AJUSTE' ? (
                <span className={estilo.dica}>
                  Informe o que você contou na prateleira. O sistema registra a
                  diferença — é ela que explica o buraco depois.
                </span>
              ) : null}
            </label>
            {tipo === 'ENTRADA' ? (
              <>
                <label className={estilo.rotulo}>
                  Custo unitário (R$)
                  <input className={estilo.campo} name="custoUnit" type="number" min="0" step="0.01" />
                  <span className={estilo.dica}>Entra na média ponderada do custo.</span>
                </label>
                <label className={estilo.rotulo}>
                  Nota fiscal
                  <input className={estilo.campo} name="documentoFiscal" />
                </label>
              </>
            ) : null}
          </div>

          <label className={estilo.rotulo}>
            Motivo {tipo === 'AJUSTE' ? '*' : ''}
            <input
              className={estilo.campo}
              name="motivo"
              required={tipo === 'AJUSTE'}
              placeholder="Fica no histórico, junto do seu nome"
            />
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={salvandoMov}>
              {salvandoMov ? 'Lançando…' : 'Lançar movimento'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
