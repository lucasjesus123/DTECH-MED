'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { salvarUsuario } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export type Pessoa = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  ultimoLogin: string | null
  trocarSenha: boolean
  telefone: string | null
  documento: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

/**
 * A ficha da pessoa, aberta por cima da lista.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA FOLHA POR CIMA, E NÃO UMA PÁGINA NOVA
 * ---------------------------------------------------------------------------
 * Quem abre a ficha de alguém quase sempre vai abrir a de outro em seguida —
 * está conferindo a equipe, não visitando uma pessoa. Página nova obriga a
 * voltar, esperar a lista carregar de novo e reencontrar onde estava; a folha
 * fecha e a lista continua exatamente como estava, com a busca digitada e a
 * rolagem no lugar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A SENHA FICA NUM BLOCO SEPARADO, E VAZIA
 * ---------------------------------------------------------------------------
 * Porque trocar a senha de alguém não é editar um dado: é DERRUBAR as sessões
 * abertas dessa pessoa e obrigá-la a entrar de novo. Isso é o que faz a troca
 * servir para conter um acesso indevido — e é exatamente o que não pode
 * acontecer por acidente enquanto alguém só queria corrigir o número do
 * telefone.
 *
 * Campo em branco significa "não mexi na senha". Só quem digitar algo troca.
 */
export default function Ficha({
  pessoa,
  perfis,
  podeTrocarPerfil,
  aoFechar,
}: {
  pessoa: Pessoa
  perfis: ReadonlyArray<{ valor: string; rotulo: string; faz: string }>
  podeTrocarPerfil: boolean
  aoFechar: () => void
}) {
  const [estado, acao, salvando] = useActionState(salvarUsuario, inicial)
  const router = useRouter()

  // Salvou: atualiza a lista por baixo e fecha. Sem isto, a folha ficaria
  // aberta mostrando o que a pessoa acabou de digitar, e a lista atrás
  // continuaria com o dado velho — dois valores na tela ao mesmo tempo, e
  // nenhum sinal de qual venceu.
  useEffect(() => {
    if (estado.ok) {
      router.refresh()
      aoFechar()
    }
  }, [estado, router, aoFechar])

  // Esc fecha. É o que a mão faz sozinha diante de qualquer folha aberta.
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
        aria-label={`Ficha de ${pessoa.nome}`}
      >
        <div className={estilo.folhaTopo}>
          <div>
            <p className={estilo.grav}>Ficha da pessoa</p>
            <strong className={estilo.folhaNome}>{pessoa.nome}</strong>
          </div>
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            Fechar
          </button>
        </div>

        <form action={acao} className={estilo.folhaCorpo}>
          <input type="hidden" name="id" value={pessoa.id} />

          {!estado.ok && estado.motivo ? (
            <p className={estilo.erro} role="alert">
              {estado.motivo}
            </p>
          ) : null}

          <p className={estilo.blocoTitulo}>Quem é</p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Nome completo *
              <input className={estilo.campo} name="nome" required minLength={3} defaultValue={pessoa.nome} />
            </label>
            <label className={estilo.rotulo}>
              E-mail *
              <input
                className={estilo.campo}
                name="email"
                type="email"
                required
                defaultValue={pessoa.email}
                autoComplete="off"
              />
              <span className={estilo.dica}>É por ele que a pessoa entra no sistema.</span>
            </label>
            <label className={estilo.rotulo}>
              Telefone
              <input
                className={estilo.campo}
                name="telefone"
                inputMode="tel"
                defaultValue={pessoa.telefone ?? ''}
              />
            </label>
            <label className={estilo.rotulo}>
              CPF
              <input
                className={estilo.campo}
                name="documento"
                inputMode="numeric"
                defaultValue={pessoa.documento ?? ''}
              />
              <span className={estilo.dica}>Vai no termo de entrega, ao lado do nome.</span>
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Perfil *
              <select
                className={estilo.selecao}
                name="papel"
                required
                defaultValue={pessoa.papel}
                disabled={!podeTrocarPerfil}
                style={{ width: '100%' }}
              >
                {perfis.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo} — {p.faz}
                  </option>
                ))}
              </select>
              {!podeTrocarPerfil ? (
                <span className={estilo.dica}>
                  O perfil desta pessoa é igual ou acima do seu — só alguém acima dela pode mudá-lo.
                </span>
              ) : null}
            </label>
          </div>

          <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
            Onde mora
          </p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              CEP
              <input className={estilo.campo} name="cep" inputMode="numeric" defaultValue={pessoa.cep ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Cidade
              <input className={estilo.campo} name="cidade" defaultValue={pessoa.cidade ?? ''} />
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Logradouro
              <input className={estilo.campo} name="logradouro" defaultValue={pessoa.logradouro ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Número
              <input className={estilo.campo} name="numero" defaultValue={pessoa.numero ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Complemento
              <input className={estilo.campo} name="complemento" defaultValue={pessoa.complemento ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              Bairro
              <input className={estilo.campo} name="bairro" defaultValue={pessoa.bairro ?? ''} />
            </label>
            <label className={estilo.rotulo}>
              UF
              <input className={estilo.campo} name="uf" maxLength={2} defaultValue={pessoa.uf ?? ''} />
            </label>
          </div>

          <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
            Senha
          </p>
          <div className={estilo.grade}>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Nova senha
              <input
                className={estilo.campo}
                name="senha"
                type="text"
                minLength={10}
                autoComplete="off"
                placeholder="deixe em branco para não mexer"
              />
              <span className={estilo.dica}>
                Preencher aqui <strong>derruba as sessões abertas</strong> desta pessoa e obriga a
                trocar de novo no próximo acesso. É o que se usa quando alguém perdeu a senha ou
                quando há suspeita de acesso indevido.
              </span>
            </label>
          </div>

          <div className={estilo.acoesForm} style={{ marginTop: 'var(--s5)' }}>
            <button type="submit" className={estilo.btn} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar ficha'}
            </button>
            <button type="button" className={estilo.btnSec} onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
            <span className={estilo.fraco}>
              Último acesso:{' '}
              {pessoa.ultimoLogin
                ? new Date(pessoa.ultimoLogin).toLocaleString('pt-BR')
                : 'nunca entrou'}
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
