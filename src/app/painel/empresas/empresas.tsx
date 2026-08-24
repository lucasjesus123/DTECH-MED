'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarBloqueio, alternarUsuario, criarEmpresa, salvarUsuario } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Empresa = {
  id: string
  nome: string
  slug: string
  cnpj: string | null
  cidade: string | null
  uf: string | null
  plano: string
  bloqueado: boolean
  motivoBloqueio: string | null
  usuarios: number
  ordens: number
  abertas: number
  whats: string | null
  criadoEm: string
}

type Usuario = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  empresa: string
  ultimoLogin: string | null
  trocarSenha: boolean
}

export default function Empresas({ empresas, usuarios }: { empresas: Empresa[]; usuarios: Usuario[] }) {
  const [aba, setAba] = useState<'empresas' | 'usuarios'>('empresas')
  const [novaEmpresa, setNovaEmpresa] = useState(false)
  const [novoUsuario, setNovoUsuario] = useState(false)
  const [estadoEmpresa, acaoEmpresa, salvandoEmpresa] = useActionState(criarEmpresa, inicial)
  const [estadoUsuario, acaoUsuario, salvandoUsuario] = useActionState(salvarUsuario, inicial)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function agir(fn: () => Promise<Resposta>) {
    setMsg(null)
    iniciar(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, texto: r.ok ? (r.mensagem ?? 'Feito.') : r.motivo })
      if (r.ok) router.refresh()
    })
  }

  return (
    <>
      <nav className={estilo.abas}>
        <button
          type="button"
          className={`${estilo.aba} ${aba === 'empresas' ? estilo.abaAtiva : ''}`}
          onClick={() => setAba('empresas')}
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
        >
          Empresas
        </button>
        <button
          type="button"
          className={`${estilo.aba} ${aba === 'usuarios' ? estilo.abaAtiva : ''}`}
          onClick={() => setAba('usuarios')}
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
        >
          Usuários
        </button>
      </nav>

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro}>{msg.texto}</p> : null}

      {aba === 'empresas' ? (
        <>
          <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
            <button type="button" className={estilo.btn} onClick={() => setNovaEmpresa((v) => !v)}>
              {novaEmpresa ? 'Fechar' : 'Cadastrar empresa'}
            </button>
          </div>

          {novaEmpresa ? (
            <form action={acaoEmpresa} className={`${estilo.bloco} ${estilo.form}`}>
              <p className={estilo.blocoTitulo}>Nova empresa</p>
              {!estadoEmpresa.ok && estadoEmpresa.motivo ? <p className={estilo.erro}>{estadoEmpresa.motivo}</p> : null}
              {estadoEmpresa.ok && estadoEmpresa.mensagem ? (
                <p className={estilo.sucesso}>{estadoEmpresa.mensagem}</p>
              ) : null}

              <div className={estilo.grade}>
                <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                  Nome da empresa *
                  <input className={estilo.campo} name="nome" required minLength={3} />
                </label>
                <label className={estilo.rotulo}>
                  Identificador *
                  <input className={estilo.campo} name="slug" required pattern="[a-z0-9-]{3,40}" placeholder="dtechmed-lajeado" />
                  <span className={estilo.dica}>Minúsculas, números e hífen. Não muda depois.</span>
                </label>
                <label className={estilo.rotulo}>
                  CNPJ
                  <input className={estilo.campo} name="cnpj" inputMode="numeric" />
                </label>
                <label className={estilo.rotulo}>
                  Cidade
                  <input className={estilo.campo} name="cidade" />
                </label>
                <label className={estilo.rotulo}>
                  UF
                  <input className={estilo.campo} name="uf" maxLength={2} />
                </label>
                <label className={estilo.rotulo}>
                  Telefone
                  <input className={estilo.campo} name="telefone" inputMode="tel" />
                </label>
                <label className={estilo.rotulo}>
                  WhatsApp
                  <input className={estilo.campo} name="whatsapp" inputMode="tel" />
                </label>
              </div>

              <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s4)' }}>
                O responsável pela empresa
              </p>
              <p className={estilo.dica} style={{ marginTop: '-8px' }}>
                A empresa nasce com um administrador. Sem ele, ninguém consegue
                usá-la — e o passo esquecido vira chamado no dia seguinte.
              </p>

              <div className={estilo.grade}>
                <label className={estilo.rotulo}>
                  Nome *
                  <input className={estilo.campo} name="adminNome" required minLength={3} />
                </label>
                <label className={estilo.rotulo}>
                  E-mail *
                  <input className={estilo.campo} name="adminEmail" type="email" required autoComplete="off" />
                </label>
                <label className={estilo.rotulo}>
                  Senha provisória *
                  <input className={estilo.campo} name="adminSenha" type="text" required minLength={10} autoComplete="off" />
                  <span className={estilo.dica}>
                    Mínimo 10 caracteres. Ele troca no primeiro acesso, obrigatoriamente.
                  </span>
                </label>
              </div>

              <div className={estilo.acoesForm}>
                <button type="submit" className={estilo.btn} disabled={salvandoEmpresa}>
                  {salvandoEmpresa ? 'Criando…' : 'Criar empresa e administrador'}
                </button>
              </div>
            </form>
          ) : null}

          <div className={`${estilo.quadro} ${estilo.rolaX}`}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Identificador</th>
                  <th>Cidade</th>
                  <th className={estilo.dir}>Usuários</th>
                  <th className={estilo.dir}>Ordens</th>
                  <th>WhatsApp</th>
                  <th>Situação</th>
                  {/* A coluna dos botões. O título fica só para o leitor de
                      tela: um `<th>` vazio faz a tabela inteira perder o
                      cabeçalho para quem navega por ela. */}
                  <th>
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className={estilo.forte}>{e.nome}</span>
                      {e.cnpj ? <div className={estilo.fraco}>{e.cnpj}</div> : null}
                    </td>
                    <td className={estilo.num}>{e.slug}</td>
                    <td>
                      {e.cidade ?? '—'}
                      {e.uf ? `/${e.uf}` : ''}
                    </td>
                    <td className={`${estilo.num} ${estilo.dir}`}>{e.usuarios}</td>
                    <td className={`${estilo.num} ${estilo.dir}`}>
                      {e.abertas}
                      <div className={estilo.fraco}>de {e.ordens}</div>
                    </td>
                    <td>
                      <span className={`${estilo.tag} ${e.whats === 'CONECTADA' ? estilo.tagOk : estilo.tagNeutra}`}>
                        {e.whats ? e.whats.toLowerCase() : 'sem instância'}
                      </span>
                    </td>
                    <td>
                      <span className={`${estilo.tag} ${e.bloqueado ? estilo.tagAlerta : estilo.tagOk}`}>
                        {e.bloqueado ? 'suspensa' : 'ativa'}
                      </span>
                      {e.motivoBloqueio ? <div className={estilo.fraco}>{e.motivoBloqueio}</div> : null}
                    </td>
                    <td className={estilo.dir}>
                      {e.bloqueado ? (
                        <button
                          type="button"
                          className={estilo.btnSec}
                          disabled={pendente}
                          onClick={() => agir(() => alternarBloqueio(e.id, false))}
                        >
                          Reativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={estilo.btnPerigo}
                          disabled={pendente}
                          onClick={() => {
                            const motivo = window.prompt(
                              'Por que esta empresa está sendo suspensa? O texto aparece para quem tentar entrar.',
                            )
                            if (motivo) agir(() => alternarBloqueio(e.id, true, motivo))
                          }}
                        >
                          Suspender
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
            Suspender encerra na hora todas as sessões abertas da empresa. Sem
            isso, a suspensão só valeria para quem ainda não tinha entrado.
          </p>
        </>
      ) : (
        <>
          <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
            <button type="button" className={estilo.btn} onClick={() => setNovoUsuario((v) => !v)}>
              {novoUsuario ? 'Fechar' : 'Criar usuário'}
            </button>
          </div>

          {novoUsuario ? (
            <form action={acaoUsuario} className={`${estilo.bloco} ${estilo.form}`}>
              <p className={estilo.blocoTitulo}>Novo usuário</p>
              {!estadoUsuario.ok && estadoUsuario.motivo ? <p className={estilo.erro}>{estadoUsuario.motivo}</p> : null}
              {estadoUsuario.ok && estadoUsuario.mensagem ? (
                <p className={estilo.sucesso}>{estadoUsuario.mensagem}</p>
              ) : null}

              <div className={estilo.grade}>
                <label className={estilo.rotulo}>
                  Empresa *
                  <select className={estilo.selecao} name="tenantId" required style={{ width: '100%' }}>
                    <option value="">Escolha…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={estilo.rotulo}>
                  Nome *
                  <input className={estilo.campo} name="nome" required minLength={3} />
                </label>
                <label className={estilo.rotulo}>
                  E-mail *
                  <input className={estilo.campo} name="email" type="email" required autoComplete="off" />
                </label>
                <label className={estilo.rotulo}>
                  Telefone
                  <input className={estilo.campo} name="telefone" inputMode="tel" />
                </label>
                <label className={estilo.rotulo}>
                  Perfil *
                  <select className={estilo.selecao} name="papel" required style={{ width: '100%' }}>
                    <option value="ADMIN_EMPRESA">Administrador da empresa</option>
                    <option value="GESTOR">Gestor</option>
                    <option value="FINANCEIRO">Financeiro</option>
                    <option value="ATENDENTE">Atendente</option>
                    <option value="TECNICO">Técnico</option>
                    <option value="MOTORISTA">Motorista</option>
                  </select>
                </label>
                <label className={estilo.rotulo}>
                  Senha provisória *
                  <input className={estilo.campo} name="senha" type="text" required minLength={10} autoComplete="off" />
                </label>
              </div>

              <div className={estilo.acoesForm}>
                <button type="submit" className={estilo.btn} disabled={salvandoUsuario}>
                  {salvandoUsuario ? 'Criando…' : 'Criar usuário'}
                </button>
              </div>
            </form>
          ) : null}

          <div className={`${estilo.quadro} ${estilo.rolaX}`}>
            <table className={estilo.tabela}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Empresa</th>
                  <th>Perfil</th>
                  <th>Último acesso</th>
                  <th>Situação</th>
                  {/* A coluna dos botões. O título fica só para o leitor de
                      tela: um `<th>` vazio faz a tabela inteira perder o
                      cabeçalho para quem navega por ela. */}
                  <th>
                    <span className={estilo.soLeitor}>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className={estilo.forte}>{u.nome}</td>
                    <td className={estilo.num}>{u.email}</td>
                    <td>{u.empresa}</td>
                    <td>
                      <span className={estilo.tag}>{u.papel.toLowerCase().replace('_', ' ')}</span>
                    </td>
                    <td className={estilo.num}>
                      {u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleDateString('pt-BR') : <span className={estilo.fraco}>nunca</span>}
                    </td>
                    <td>
                      <span className={`${estilo.tag} ${u.ativo ? estilo.tagOk : estilo.tagNeutra}`}>
                        {u.ativo ? 'ativo' : 'desativado'}
                      </span>
                      {u.trocarSenha ? <div className={estilo.fraco}>troca a senha no acesso</div> : null}
                    </td>
                    <td className={estilo.dir}>
                      <button
                        type="button"
                        className={u.ativo ? estilo.btnPerigo : estilo.btnSec}
                        disabled={pendente}
                        onClick={() => agir(() => alternarUsuario(u.id, !u.ativo))}
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
