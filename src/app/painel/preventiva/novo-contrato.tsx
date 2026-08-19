'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirContratoPreventiva } from '@/server/acoes/preventiva'
import estilo from '../painel.module.css'

type Resposta =
  | { ok: true; dados?: { id: string; numero: number; visitas: number } }
  | { ok: false; motivo: string }

const inicial: Resposta = { ok: false, motivo: '' }

export type EquipamentoOpcao = {
  id: string
  rotulo: string
  cliente: string
  jaTemContrato: boolean
}

/**
 * Abertura do contrato de preventiva.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O FORMULÁRIO COMEÇA FECHADO
 * ---------------------------------------------------------------------------
 * Esta tela é para OLHAR — o que vence, o que atrasou, o que está travado. Um
 * formulário de seis campos aberto no topo empurraria a lista para baixo da
 * dobra todo dia, para uma ação que acontece uma vez por mês.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O EQUIPAMENTO ESCOLHE O CLIENTE, E NÃO O CONTRÁRIO
 * ---------------------------------------------------------------------------
 * O contrato cobre um aparelho. Pedir cliente e depois equipamento seria uma
 * escolha a mais para chegar ao mesmo lugar — e abriria a chance de casar o
 * aparelho de uma clínica com o nome de outra. Aqui a lista já vem com o nome
 * do dono ao lado, e o servidor descobre o cliente pelo equipamento; o que a
 * tela mandar sobre isso é ignorado.
 */
export default function NovoContrato({ equipamentos }: { equipamentos: EquipamentoOpcao[] }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(abrirContratoPreventiva, inicial)
  const router = useRouter()

  useEffect(() => {
    if (estado.ok) {
      setAberto(false)
      router.refresh()
    }
  }, [estado, router])

  const livres = equipamentos.filter((e) => !e.jaTemContrato)

  if (!aberto) {
    return (
      <button type="button" className={estilo.btn} onClick={() => setAberto(true)}>
        Novo contrato
      </button>
    )
  }

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`} style={{ marginTop: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>
        <span>Novo contrato de preventiva</span>
      </p>

      {!estado.ok && estado.motivo ? <p className={estilo.erro}>{estado.motivo}</p> : null}

      {livres.length === 0 ? (
        <p className={estilo.texto}>
          Todo equipamento cadastrado já tem contrato ativo. Cadastre o aparelho em Equipamentos
          antes de abrir o contrato dele.
        </p>
      ) : (
        <>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Equipamento *
              <select className={estilo.selecao} name="equipamentoId" required defaultValue="">
                <option value="" disabled>
                  Escolha o aparelho
                </option>
                {livres.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.rotulo} — {e.cliente}
                  </option>
                ))}
              </select>
              <span className={estilo.dica}>
                O cliente vem do cadastro do aparelho. Só aparecem os que ainda não têm contrato
                ativo.
              </span>
            </label>

            <label className={estilo.rotulo}>
              De quanto em quanto tempo *
              <select className={estilo.selecao} name="periodicidade" required defaultValue="SEMESTRAL">
                <option value="MENSAL">Todo mês</option>
                <option value="BIMESTRAL">A cada 2 meses</option>
                <option value="TRIMESTRAL">A cada 3 meses</option>
                <option value="SEMESTRAL">A cada 6 meses</option>
                <option value="ANUAL">Uma vez por ano</option>
              </select>
            </label>

            <label className={estilo.rotulo}>
              Primeira visita *
              <input className={estilo.campo} type="date" name="inicio" required />
              <span className={estilo.dica}>
                É o dia do mês que se repete. Começando dia 10, toda visita cai no dia 10.
              </span>
            </label>

            <label className={estilo.rotulo}>
              Até quando
              <input className={estilo.campo} type="date" name="fim" />
              <span className={estilo.dica}>Em branco, o contrato corre até alguém encerrar.</span>
            </label>

            <label className={estilo.rotulo}>
              Valor de cada visita (R$)
              <input
                className={estilo.campo}
                type="number"
                name="valorVisita"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue="0"
              />
              <span className={estilo.dica}>
                O valor de UMA visita, não o total do contrato — é assim que a renovação continua
                fazendo sentido.
              </span>
            </label>
          </div>

          <label className={estilo.rotulo}>
            Observações
            <textarea
              className={estilo.area}
              name="observacoes"
              rows={2}
              placeholder="O que está combinado: peças inclusas ou não, quem acompanha, horário de acesso à clínica."
            />
          </label>
        </>
      )}

      <div className={estilo.acoesForm}>
        {livres.length > 0 ? (
          <button type="submit" className={estilo.btn} disabled={pendente}>
            {pendente ? 'Abrindo…' : 'Abrir contrato'}
          </button>
        ) : null}
        <button type="button" className={estilo.btnSec} onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
