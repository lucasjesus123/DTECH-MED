'use client'

import { useActionState } from 'react'
import { salvarEquipamento } from '@/server/acoes/cadastros'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export default function FormularioEquipamento({ clientes }: { clientes: Array<{ id: string; nome: string }> }) {
  const [estado, acao, pendente] = useActionState(salvarEquipamento, inicial)

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>Novo equipamento</p>

      {!estado.ok && estado.motivo ? <p className={estilo.erro}>{estado.motivo}</p> : null}
      {estado.ok && estado.mensagem ? <p className={estilo.sucesso}>{estado.mensagem}</p> : null}

      {clientes.length === 0 ? (
        <p className={estilo.texto}>
          Cadastre um cliente primeiro — todo equipamento pertence a alguém, e é
          essa ligação que dá sentido ao histórico.
        </p>
      ) : (
        <>
          <div className={estilo.grade}>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Cliente dono *
              <select className={estilo.selecao} name="clienteId" required style={{ width: '100%' }}>
                <option value="">Escolha…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className={estilo.rotulo}>
              Marca *
              <input className={estilo.campo} name="marca" required minLength={2} />
            </label>
            <label className={estilo.rotulo}>
              Modelo *
              <input className={estilo.campo} name="modelo" required />
            </label>
            <label className={estilo.rotulo}>
              Número de série
              <input className={estilo.campo} name="numeroSerie" />
              <span className={estilo.dica}>A identidade física do aparelho.</span>
            </label>
            <label className={estilo.rotulo}>
              Patrimônio
              <input className={estilo.campo} name="patrimonio" />
            </label>
            <label className={estilo.rotulo}>
              Categoria
              <input className={estilo.campo} name="categoria" placeholder="Laser, autoclave, ultrassom…" />
            </label>
            <label className={estilo.rotulo}>
              Voltagem
              <input className={estilo.campo} name="voltagem" placeholder="127V, 220V, bivolt" />
            </label>
            <label className={estilo.rotulo}>
              Ano de fabricação
              <input className={estilo.campo} name="anoFabricacao" type="number" min={1970} max={2100} />
            </label>
          </div>

          <label className={estilo.rotulo}>
            Acessórios
            <input className={estilo.campo} name="acessorios" placeholder="Cabo, pedal, ponteira, maleta…" />
          </label>

          <label className={estilo.rotulo}>
            Observações
            <textarea className={estilo.area} name="observacoes" rows={2} />
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Cadastrar equipamento'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
