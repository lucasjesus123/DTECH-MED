'use client'

import { useEffect, useState, useTransition } from 'react'
import { listarVersoes, restaurarVersao } from '@/server/acoes/conteudo'
import estilo from './editor.module.css'

/**
 * O histórico do site, com voltar atrás.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA TELA REVELA
 * ---------------------------------------------------------------------------
 * As versões vinham sendo gravadas desde o primeiro dia, a cada salvamento, e
 * ninguém tinha como vê-las. Um histórico que existe e não é alcançável não é
 * um histórico: é ocupação de disco.
 *
 * ---------------------------------------------------------------------------
 * RESTAURAR NÃO APAGA NADA
 * ---------------------------------------------------------------------------
 * Voltar para a versão 7 não descarta as versões 8, 9 e 10. Ela grava o
 * conteúdo da 7 como uma versão NOVA, a 11. A linha do tempo continua inteira e
 * dá para voltar da volta — que é exatamente o que se quer no minuto seguinte a
 * ter restaurado a versão errada.
 *
 * Isso muda o que a tela precisa perguntar. Como nada se perde, a confirmação
 * não é um aviso de perigo: é só evitar o clique sem querer.
 */

type Versao = {
  id: string
  versao: number
  autorNome: string | null
  nota: string | null
  criadoEm: Date
}

export default function Historico({
  versaoAtual,
  aoRestaurar,
}: {
  versaoAtual: number
  aoRestaurar: (novaVersao: number) => void
}) {
  const [versoes, setVersoes] = useState<Versao[] | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [trabalhando, iniciar] = useTransition()

  // Recarrega quando a versão muda: depois de salvar, o histórico da tela
  // estaria uma gravação atrás do banco, e a pessoa não veria o próprio
  // salvamento na lista.
  useEffect(() => {
    let vivo = true
    listarVersoes().then((v) => {
      if (vivo) setVersoes(v as Versao[])
    })
    return () => {
      vivo = false
    }
  }, [versaoAtual])

  function restaurar(id: string) {
    iniciar(async () => {
      const r = await restaurarVersao(id)
      setConfirmando(null)
      if (r.ok) {
        setAviso({ tipo: 'ok', texto: `${r.mensagem} Recarregue a tela para editar a partir dela.` })
        aoRestaurar(r.versao)
      } else {
        setAviso({ tipo: 'erro', texto: r.motivo })
      }
    })
  }

  if (versoes === null) return <p className={estilo.descricao}>Carregando o histórico…</p>

  if (versoes.length === 0) {
    return (
      <p className={estilo.descricao}>
        Ainda não há versões anteriores. A primeira aparece aqui depois do próximo
        salvamento — a versão que existia antes dele.
      </p>
    )
  }

  return (
    <>
      <p className={estilo.descricao}>
        Cada salvamento guarda o que existia antes. Restaurar <strong>não apaga</strong>{' '}
        as versões mais novas: ela grava a antiga como uma versão nova, então sempre dá
        para voltar da volta.
      </p>
      <p className={estilo.descricao}>
        O histórico guarda os <strong>textos</strong>. As fotos são trocadas na hora, na
        aba Fotos, e não voltam com a restauração.
      </p>

      {aviso ? (
        <p className={aviso.tipo === 'ok' ? estilo.avisoOk : estilo.avisoErro} role="status">
          {aviso.texto}
        </p>
      ) : null}

      <ol className={estilo.versoes}>
        {versoes.map((v) => (
          <li key={v.id} className={estilo.versaoItem}>
            <div>
              <strong>Versão {v.versao}</strong>
              <span className={estilo.versaoQuando}>
                {' · '}
                {new Date(v.criadoEm).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {v.autorNome ? <span className={estilo.versaoQuando}> · {v.autorNome}</span> : null}
              {v.nota ? <p className={estilo.descricao}>{v.nota}</p> : null}
            </div>

            {confirmando === v.id ? (
              <div className={estilo.fotoBotoes}>
                <button
                  type="button"
                  className={estilo.salvar}
                  onClick={() => restaurar(v.id)}
                  disabled={trabalhando}
                >
                  {trabalhando ? 'Voltando…' : `Confirmar volta para a ${v.versao}`}
                </button>
                <button
                  type="button"
                  className={estilo.acrescentar}
                  onClick={() => setConfirmando(null)}
                  disabled={trabalhando}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={estilo.acrescentar}
                onClick={() => {
                  setAviso(null)
                  setConfirmando(v.id)
                }}
                disabled={trabalhando}
              >
                Voltar para esta
              </button>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}
