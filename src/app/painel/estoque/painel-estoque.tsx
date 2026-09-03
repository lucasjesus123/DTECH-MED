'use client'

import { useActionState, useState } from 'react'
import { lancarMovimento } from '@/server/acoes/estoque'
import FormularioItem from './formulario-item'
import estilo from '../painel.module.css'

type Resposta = { ok: true } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Peca = { id: string; sku: string; nome: string; saldo: number; unidade: string }

/**
 * Cadastro de item e lançamento de movimento.
 *
 * O formulário do item saiu daqui para `formulario-item.tsx` quando a EDIÇÃO
 * apareceu: cadastrar e corrigir pedem exatamente os mesmos campos, e dois
 * formulários gêmeos é a receita conhecida de um ganhar campo e o outro não.
 *
 * Os dois formulários ficam fechados por padrão. A tela de estoque é usada
 * muito mais para consultar do que para lançar, e um formulário sempre aberto
 * empurraria a tabela — a informação que a pessoa veio ver — para baixo da
 * dobra.
 */
export default function Painel({ pecas, podeMexer }: { pecas: Peca[]; podeMexer: boolean }) {
  const [aba, setAba] = useState<'nenhuma' | 'peca' | 'movimento'>('nenhuma')
  const [estadoMov, acaoMov, salvandoMov] = useActionState(lancarMovimento, inicial)
  const [tipo, setTipo] = useState('ENTRADA')
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

      {aba === 'peca' ? <FormularioItem aoFechar={() => setAba('nenhuma')} /> : null}

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
