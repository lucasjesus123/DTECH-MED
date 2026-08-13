'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarStatusWhatsapp, conectarWhatsapp } from '@/server/acoes/whatsapp'
import estilo from '../painel.module.css'

/**
 * Conexão do número.
 *
 * O QR Code fica só na memória desta tela. Ele é, na prática, uma chave de
 * sessão do WhatsApp — guardá-lo no banco ou num arquivo seria deixar uma chave
 * viva parada em disco, sem ganho nenhum: ele expira em segundos e é gerado de
 * novo ao clicar.
 */
export default function Conexao({
  status,
  numero,
  profileName,
  ultimoStatusEm,
}: {
  status: string | null
  numero: string | null
  profileName: string | null
  ultimoStatusEm: string | null
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [paircode, setPaircode] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const conectada = status === 'CONECTADA'

  function conectar() {
    setMsg(null)
    iniciar(async () => {
      const r = await conectarWhatsapp()
      if (!r.ok) {
        setMsg({ ok: false, texto: r.motivo })
        return
      }
      setQr(r.dados?.qrcode ?? null)
      setPaircode(r.dados?.paircode ?? null)
      setMsg({ ok: true, texto: r.mensagem ?? 'Código gerado.' })
    })
  }

  function atualizar() {
    setMsg(null)
    iniciar(async () => {
      const r = await atualizarStatusWhatsapp()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Atualizado.') : r.motivo })
      if (r.ok && r.dados?.conectado) setQr(null)
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className={estilo.bloco}>
      <p className={estilo.blocoTitulo}>
        <span>O número da empresa</span>
        <span className={`${estilo.tag} ${conectada ? estilo.tagOk : status === 'ERRO' ? estilo.tagAlerta : estilo.tagEspera}`}>
          {rotulo(status)}
        </span>
      </p>

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

      <div className={estilo.pares}>
        <div className={estilo.par}>
          <span className={estilo.parRot}>Número</span>
          <span className={estilo.parVal}>{numero ?? 'ainda não conectado'}</span>
        </div>
        <div className={estilo.par}>
          <span className={estilo.parRot}>Perfil</span>
          <span className={estilo.parVal}>{profileName ?? '—'}</span>
        </div>
        <div className={estilo.par}>
          <span className={estilo.parRot}>Última checagem</span>
          <span className={estilo.parVal}>
            {ultimoStatusEm ? new Date(ultimoStatusEm).toLocaleString('pt-BR') : 'nunca'}
          </span>
        </div>
      </div>

      {qr ? (
        <div style={{ marginTop: 'var(--s5)', display: 'grid', gap: 'var(--s3)', justifyItems: 'start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR Code para conectar o WhatsApp"
            width={240}
            height={240}
            style={{ background: '#fff', padding: 10, borderRadius: 'var(--r)' }}
          />
          {paircode ? (
            <p className={estilo.texto}>
              Ou use o código de pareamento: <strong>{paircode}</strong>
            </p>
          ) : null}
          <p className={estilo.fraco}>
            No celular da empresa: WhatsApp → Aparelhos conectados → Conectar
            aparelho. O código expira em poucos segundos; se passar, gere outro.
          </p>
        </div>
      ) : null}

      <div className={estilo.passos}>
        <button type="button" className={estilo.btn} onClick={conectar} disabled={pendente}>
          {pendente ? 'Falando com o serviço…' : conectada ? 'Reconectar outro número' : 'Conectar o WhatsApp'}
        </button>
        <button type="button" className={estilo.btnSec} onClick={atualizar} disabled={pendente}>
          Atualizar status
        </button>
      </div>

      {!conectada ? (
        <p className={estilo.fraco} style={{ marginTop: 'var(--s3)' }}>
          Enquanto o número não conecta, os avisos continuam sendo enfileirados —
          nada se perde. Eles saem assim que a conexão subir.
        </p>
      ) : null}
    </div>
  )
}

function rotulo(s: string | null): string {
  const m: Record<string, string> = {
    CONECTADA: 'conectado',
    CONECTANDO: 'conectando',
    DESCONECTADA: 'desconectado',
    ERRO: 'com erro',
  }
  return s ? (m[s] ?? s.toLowerCase()) : 'sem instância'
}
