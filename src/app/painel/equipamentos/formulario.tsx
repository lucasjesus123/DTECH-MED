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

      {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
      {estado.ok && estado.mensagem ? <p className={estilo.sucesso} role="status">{estado.mensagem}</p> : null}

      <>
          <div className={estilo.grade}>
            {/* O DONO É OPCIONAL, e isso é o que faz esta tela ser um catálogo.
                Ver o cabeçalho de `salvarEquipamento`: obrigar o dono aqui
                obrigava a inventar um cliente para cadastrar um aparelho que
                ainda estava chegando. */}
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Cliente dono
              <select className={estilo.selecao} name="clienteId" defaultValue="" style={{ width: '100%' }}>
                <option value="">Sem dono ainda — só catálogo</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <span className={estilo.dica}>
                Pode ficar em branco. O aparelho se amarra ao cliente quando você o puxar numa O.S.
              </span>
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

          {/* A FOTO DO APARELHO, no cadastro.
              Marca e modelo não bastam para reconhecer um aparelho na bancada:
              o mesmo modelo muda de cara entre gerações, e o cliente descreve o
              dele pela aparência, não pelo número de série. */}
          <label className={estilo.rotulo}>
            Foto do aparelho
            <input className={estilo.campo} type="file" name="foto" accept="image/*" />
            <span className={estilo.dica}>
              Opcional. É ela que identifica o aparelho de relance — dá para trocar depois.
            </span>
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Cadastrar equipamento'}
            </button>
          </div>
        </>
    </form>
  )
}
