'use client'

import { useState, useTransition } from 'react'
import { alternarAtivo, definirPadrao, excluirModelo } from '@/server/acoes/modelos'
import { useRouter } from 'next/navigation'
import type { Variavel } from '@/lib/variaveis-documento'
import EditorDeModelo from './editor'
import estilo from '../painel.module.css'

/**
 * OS MOLDES DE UM TIPO, EM CARTÕES.
 *
 * =============================================================================
 * O PADRÃO É O QUE PRECISA SER VISTO DE RELANCE
 * =============================================================================
 * Ele é o texto que sai quando ninguém escolhe — ou seja, o que sai na maioria
 * das vezes. Por isso vem primeiro na lista e tem a borda marcada: a pergunta
 * mais frequente nesta tela é "qual está valendo?", e ela tem que ser
 * respondida sem abrir nada.
 *
 * =============================================================================
 * APOSENTAR ≠ EXCLUIR, E OS DOIS EXISTEM
 * =============================================================================
 * Aposentar tira de uso e guarda o texto. É o certo em quase todo caso: um
 * documento já assinado nasceu de um molde, e "com que texto isto foi
 * assinado?" é pergunta que aparece justamente quando dá briga.
 *
 * Excluir é para o molde que nunca serviu para nada — o rascunho, o duplicado.
 * Ele fica atrás de uma confirmação porque é o único caminho sem volta desta
 * tela.
 */

export type ModeloCartao = {
  id: string
  nome: string
  tipo: string
  descricao: string | null
  padrao: boolean
  ativo: boolean
  autorNome: string | null
  tamanho: number
  corpo: string
}

export default function ListaDeModelos({
  tipo,
  rotuloTipo,
  rotuloUm,
  modelos,
  grupos,
  exemplos,
  podeMexer,
}: {
  tipo: string
  rotuloTipo: string
  rotuloUm: string
  modelos: ModeloCartao[]
  grupos: Array<[string, Variavel[]]>
  exemplos: Record<string, string>
  podeMexer: boolean
}) {
  const [editando, setEditando] = useState<ModeloCartao | 'novo' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string; motivo?: string }>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Pronto.') : (r.motivo ?? 'Não deu certo.') })
      router.refresh()
    })
  }

  const temPadrao = modelos.some((m) => m.padrao && m.ativo)

  return (
    <>
      <div className={estilo.cab} style={{ marginTop: 'var(--s4)' }}>
        <div>
          <p className={estilo.grav}>{rotuloTipo}</p>
          <p className={estilo.texto}>
            {modelos.length === 0
              ? 'Nenhum modelo ainda.'
              : `${modelos.length} modelo${modelos.length > 1 ? 's' : ''}${temPadrao ? '' : ' · nenhum marcado como padrão'}`}
          </p>
        </div>
        {podeMexer ? (
          <button type="button" className={estilo.btn} onClick={() => setEditando('novo')}>
            Novo modelo de {rotuloUm.toLowerCase()}
          </button>
        ) : null}
      </div>

      {/* O aviso que evita a surpresa na hora de emitir: sem padrão, a emissão
          cai no texto embutido do sistema — que funciona, mas não é o texto que
          a empresa escreveu, e ninguém descobre isso olhando esta tela. */}
      {modelos.length > 0 && !temPadrao ? (
        <p className={estilo.dica} role="status">
          Nenhum destes está marcado como padrão. Enquanto for assim, a emissão usa o texto embutido
          do sistema.
        </p>
      ) : null}

      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      {editando ? (
        <EditorDeModelo
          tipo={tipo}
          rotuloTipo={rotuloTipo}
          grupos={grupos}
          exemplos={exemplos}
          modelo={editando === 'novo' ? undefined : editando}
          aoFechar={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      ) : null}

      {modelos.length === 0 ? (
        <div className={estilo.vazio}>
          Nenhum modelo de {rotuloUm.toLowerCase()} ainda. Enquanto não houver, a emissão usa o texto
          embutido do sistema — que funciona, mas não tem o seu foro, o seu prazo nem as suas
          cláusulas.
        </div>
      ) : (
        <div className={estilo.modeloCartoes}>
          {modelos.map((m) => (
            <article
              key={m.id}
              className={[
                estilo.modeloCartao,
                m.padrao && m.ativo ? estilo.modeloCartaoPadrao : '',
                !m.ativo ? estilo.modeloCartaoInativo : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={estilo.modeloCartaoTopo}>
                <div>
                  <p className={estilo.modeloCartaoNome}>{m.nome}</p>
                  {m.descricao ? <p className={estilo.dica}>{m.descricao}</p> : null}
                </div>
                {m.padrao && m.ativo ? <span className={estilo.tag}>padrão</span> : null}
                {!m.ativo ? <span className={estilo.tag}>aposentado</span> : null}
              </div>

              <p className={estilo.dica}>
                {m.tamanho.toLocaleString('pt-BR')} caracteres
                {m.autorNome ? ` · escrito por ${m.autorNome}` : ''}
              </p>

              {podeMexer ? (
                <div className={estilo.modeloCartaoAcoes}>
                  <button type="button" className={estilo.btnSec} onClick={() => setEditando(m)}>
                    Abrir
                  </button>
                  {!m.padrao && m.ativo ? (
                    <button
                      type="button"
                      className={estilo.btnSec}
                      disabled={pendente}
                      onClick={() => rodar(() => definirPadrao(m.id))}
                    >
                      Tornar padrão
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={estilo.linkAcao}
                    disabled={pendente}
                    onClick={() => rodar(() => alternarAtivo(m.id))}
                  >
                    {m.ativo ? 'Aposentar' : 'Reativar'}
                  </button>
                  <button
                    type="button"
                    className={estilo.linkPerigo}
                    disabled={pendente}
                    onClick={() => {
                      // A única porta sem volta desta tela.
                      if (!confirm(`Excluir "${m.nome}" de vez? Aposentar guarda o texto; excluir não.`)) return
                      rodar(() => excluirModelo(m.id))
                    }}
                  >
                    Excluir
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  )
}
