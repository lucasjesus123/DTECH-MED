'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { editarEmpresa } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export type EmpresaFicha = {
  id: string
  nome: string
  slug: string
  razaoSocial: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  plano: string
}

/**
 * O cadastro da empresa, aberto por cima da lista da rede.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O ENDEREÇO É O BLOCO MAIS IMPORTANTE DAQUI
 * ---------------------------------------------------------------------------
 * Ele não é ficha administrativa: **sai impresso no cabeçalho das ordens de
 * serviço e dos orçamentos** que o cliente recebe. Um CEP errado aqui vira PDF
 * errado na mão de quem contratou o conserto — e até hoje só se corrigia
 * mexendo direto no banco.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O IDENTIFICADOR APARECE E NÃO SE EDITA
 * ---------------------------------------------------------------------------
 * Ele é o nome curto da empresa dentro do sistema e encosta em coisa que já
 * saiu de casa. Trocar depois funciona em toda tela que alguém lembrou de
 * testar e quebra na que ninguém lembrou. Mostrar sem deixar editar responde a
 * pergunta ("qual é o identificador dela?") sem abrir a porta.
 */
export default function FichaEmpresa({
  empresa,
  aoFechar,
}: {
  empresa: EmpresaFicha
  aoFechar: () => void
}) {
  const [estado, acao, salvando] = useActionState(editarEmpresa, inicial)
  const router = useRouter()

  useEffect(() => {
    if (estado.ok) {
      router.refresh()
      aoFechar()
    }
  }, [estado, router, aoFechar])

  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', ouvir)
    return () => document.removeEventListener('keydown', ouvir)
  }, [aoFechar])

  return (
    <div className={estilo.folhaFundo} onClick={aoFechar} role="presentation">
      <div
        className={estilo.folha}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Cadastro de ${empresa.nome}`}
      >
        <div className={estilo.folhaTopo}>
          <div>
            <p className={estilo.grav}>Cadastro da empresa</p>
            <strong className={estilo.folhaNome}>{empresa.nome}</strong>
          </div>
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            Fechar
          </button>
        </div>

        <form action={acao} className={estilo.folhaCorpo}>
          <input type="hidden" name="id" value={empresa.id} />

          {!estado.ok && estado.motivo ? (
            <p className={estilo.erro} role="alert">
              {estado.motivo}
            </p>
          ) : null}

          <p className={estilo.blocoTitulo}>Identificação</p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Nome da empresa *
              <input className={estilo.campo} name="nome" required minLength={3} defaultValue={empresa.nome} />
              <span className={estilo.dica}>É o nome que aparece no crachá e nos documentos.</span>
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Razão social
              <input className={estilo.campo} name="razaoSocial" defaultValue={empresa.razaoSocial ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              CNPJ
              <input
                className={estilo.campo}
                name="cnpj"
                inputMode="numeric"
                defaultValue={empresa.cnpj ?? ''}
              />
            </label>
            <label className={estilo.rotulo}>
              Identificador
              <input className={estilo.campo} value={empresa.slug} readOnly disabled />
              <span className={estilo.dica}>Não muda depois que a empresa nasce.</span>
            </label>
            <label className={estilo.rotulo}>
              Plano
              <input className={estilo.campo} name="plano" defaultValue={empresa.plano} />
            </label>
          </div>

          <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
            Como falam com ela
          </p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              E-mail
              <input className={estilo.campo} name="email" type="email" defaultValue={empresa.email ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Telefone
              <input
                className={estilo.campo}
                name="telefone"
                inputMode="tel"
                defaultValue={empresa.telefone ?? ''}
              />
            </label>
            <label className={estilo.rotulo}>
              WhatsApp
              <input
                className={estilo.campo}
                name="whatsapp"
                inputMode="tel"
                defaultValue={empresa.whatsapp ?? ''}
              />
            </label>
          </div>

          <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
            Endereço da matriz
          </p>
          <p className={estilo.dica} style={{ marginTop: '-8px' }}>
            Sai impresso no cabeçalho das ordens de serviço e dos orçamentos que o
            cliente recebe.
          </p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              CEP
              <input className={estilo.campo} name="cep" inputMode="numeric" defaultValue={empresa.cep ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Cidade
              <input className={estilo.campo} name="cidade" defaultValue={empresa.cidade ?? ''} />
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Logradouro
              <input className={estilo.campo} name="logradouro" defaultValue={empresa.logradouro ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Número
              <input className={estilo.campo} name="numero" defaultValue={empresa.numero ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Complemento
              <input className={estilo.campo} name="complemento" defaultValue={empresa.complemento ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Bairro
              <input className={estilo.campo} name="bairro" defaultValue={empresa.bairro ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              UF
              <input className={estilo.campo} name="uf" maxLength={2} defaultValue={empresa.uf ?? ''} />
            </label>
          </div>

          <div className={estilo.acoesForm} style={{ marginTop: 'var(--s5)' }}>
            <button type="submit" className={estilo.btn} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar cadastro'}
            </button>
            <button type="button" className={estilo.btnSec} onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
