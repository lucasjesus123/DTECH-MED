'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarPecaRetirada } from '@/server/acoes/preventiva'
import { DESTINOS, ROTULO_DESTINO } from '@/lib/peca-retirada'
import estilo from '../../painel.module.css'

export type PecaRetiradaVista = {
  id: string
  descricao: string
  destino: string
  identificacao: string | null
  observacao: string | null
  registradoPorNome: string
  criadoEm: string
}

const rotulo = (d: string) => ROTULO_DESTINO[d as keyof typeof ROTULO_DESTINO] ?? d

/**
 * O que saiu de dentro do aparelho, e para onde foi.
 *
 * ---------------------------------------------------------------------------
 * A PERGUNTA QUE APARECE TARDE DEMAIS
 * ---------------------------------------------------------------------------
 * "Cadê a placa velha?" é sempre feita semanas depois, e até agora não havia
 * como responder. Ou o cliente queria a peça de volta e ninguém avisou que foi
 * para o lixo, ou desconfia que trocaram por uma usada e não há como mostrar
 * que não. Nos dois casos a briga é sobre uma coisa física que já não existe.
 *
 * Em autoclave e equipamento odontológico há componente contaminado, e aí o
 * destino não é preferência: descarte controlado é obrigação sanitária, e esta
 * linha é a comprovação dele.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO EXISTE BOTÃO DE APAGAR
 * ---------------------------------------------------------------------------
 * O mesmo motivo das assinaturas e dos eventos da esteira: isto é PROVA. Uma
 * prova que se apaga não prova nada. Errou? Registra outra linha dizendo o que
 * aconteceu — o banco nem concede DELETE aqui.
 */
export default function PecasRetiradas({
  ordemId,
  pecas,
  podeRegistrar,
}: {
  ordemId: string
  pecas: PecaRetiradaVista[]
  podeRegistrar: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function salvar(form: FormData) {
    setMsg(null)
    iniciar(async () => {
      const r = await registrarPecaRetirada(form)
      if (r.ok) {
        setAberto(false)
        setMsg({ ok: true, texto: 'Peça registrada.' })
        router.refresh()
      } else setMsg({ ok: false, texto: r.motivo })
    })
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>Peças retiradas do aparelho</span>
        <span className={estilo.fraco}>{pecas.length}</span>
      </p>

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>{msg.texto}</p> : null}

      {pecas.length === 0 ? (
        <p className={estilo.texto}>
          Nada registrado ainda. Toda peça que sai do aparelho deveria estar aqui — é o que responde
          &ldquo;cadê a placa velha?&rdquo; três semanas depois.
        </p>
      ) : (
        <ul className={estilo.linha}>
          {pecas.map((p) => (
            <li key={p.id} className={estilo.evento}>
              <div className={estilo.eventoTop}>
                <span className={estilo.eventoTitulo}>{p.descricao}</span>
                <span className={estilo.eventoQuando}>{p.criadoEm}</span>
              </div>
              <div className={estilo.eventoQuem}>
                {rotulo(p.destino)}
                {p.identificacao ? ` · nº ${p.identificacao}` : ''} · registrado por{' '}
                {p.registradoPorNome}
              </div>
              {p.observacao ? <div className={estilo.fraco}>{p.observacao}</div> : null}
            </li>
          ))}
        </ul>
      )}

      {!podeRegistrar ? null : !aberto ? (
        <div className={estilo.acoesForm}>
          <button type="button" className={estilo.btnSec} onClick={() => setAberto(true)}>
            Registrar peça retirada
          </button>
        </div>
      ) : (
        <form action={salvar} className={estilo.form} style={{ marginTop: 'var(--s4)' }}>
          <input type="hidden" name="ordemId" value={ordemId} />

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Que peça saiu *
              <input
                className={estilo.campo}
                name="descricao"
                required
                minLength={3}
                autoComplete="off"
                placeholder="Ex.: placa de potência, resistência da câmara, fonte 24V"
              />
              <span className={estilo.dica}>
                Como o técnico chama. Nem toda peça que sai tem SKU no catálogo.
              </span>
            </label>

            <label className={estilo.rotulo}>
              Para onde foi *
              <select className={estilo.selecao} name="destino" required defaultValue="">
                <option value="" disabled>
                  Escolha o destino
                </option>
                {DESTINOS.map((d) => (
                  <option key={d.valor} value={d.valor}>
                    {d.rotulo}
                    {d.nota ? ` — ${d.nota}` : ''}
                  </option>
                ))}
              </select>
              <span className={estilo.dica}>
                Peça de autoclave ou odontológica com contaminação vai em descarte controlado — e
                esta linha é a comprovação.
              </span>
            </label>

            <label className={estilo.rotulo}>
              Número de série ou lote
              <input className={estilo.campo} name="identificacao" autoComplete="off" />
            </label>
          </div>

          <label className={estilo.rotulo}>
            Observação
            <textarea
              className={estilo.area}
              name="observacao"
              rows={2}
              placeholder="Quem levou, quando, onde ficou guardada."
            />
          </label>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={pendente}>
              {pendente ? 'Registrando…' : 'Registrar'}
            </button>
            <button
              type="button"
              className={estilo.btnSec}
              onClick={() => setAberto(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
          <p className={estilo.dica}>
            Depois de gravado não se apaga — é prova, e prova que se apaga não prova nada.
          </p>
        </form>
      )}
    </div>
  )
}
