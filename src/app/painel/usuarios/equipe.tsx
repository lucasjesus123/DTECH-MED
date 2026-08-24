'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarUsuario, salvarUsuario } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Pessoa = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  ultimoLogin: string | null
  trocarSenha: boolean
}

/**
 * Os perfis, do mais alto para o mais baixo, com o que cada um faz escrito ao
 * lado.
 *
 * O nome do papel não ensina nada a quem está contratando: "Gestor" e
 * "Atendente" são palavras que cada empresa usa de um jeito. O que resolve a
 * dúvida na hora de escolher é a frase do lado, e por isso ela fica no próprio
 * seletor, e não num texto de ajuda que ninguém abre.
 */
const PERFIS = [
  { valor: 'ADMIN_EMPRESA', rotulo: 'Administrador', faz: 'organiza a equipe e enxerga tudo da empresa' },
  { valor: 'GESTOR', rotulo: 'Gestor', faz: 'libera orçamento ao cliente e conduz a esteira' },
  { valor: 'FINANCEIRO', rotulo: 'Financeiro', faz: 'fatura, recebe e dá baixa no caixa' },
  { valor: 'ATENDENTE', rotulo: 'Atendente', faz: 'abre ordem, agenda retirada e monta orçamento' },
  { valor: 'TECNICO', rotulo: 'Técnico', faz: 'bancada: entrada, laudo, manutenção e testes' },
  { valor: 'MOTORISTA', rotulo: 'Motorista', faz: 'só o aplicativo de rota: retirada e entrega' },
] as const

const NIVEL: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN_EMPRESA: 80,
  GESTOR: 60,
  FINANCEIRO: 40,
  ATENDENTE: 30,
  TECNICO: 20,
  MOTORISTA: 10,
}

/**
 * A equipe, do lado de quem administra a empresa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS PERFIS ACIMA DO SEU NEM APARECEM NA LISTA
 * ---------------------------------------------------------------------------
 * O servidor recusa de qualquer jeito — é lá que a regra vale. Mas oferecer na
 * tela uma opção que vai ser recusada é ensinar a pessoa a apanhar do sistema:
 * ela preenche o formulário inteiro, clica em criar, e leva um "você não pode".
 *
 * Some da lista, então, o que ela não pode escolher. Some também o botão de
 * desativar de quem está no mesmo nível ou acima — inclusive o dela própria,
 * que é o clique que tranca a pessoa para fora da própria empresa.
 */
export default function Equipe({
  usuarios,
  papelDeQuemOlha,
}: {
  usuarios: Pessoa[]
  papelDeQuemOlha: string
}) {
  const [novo, setNovo] = useState(false)
  const [estado, acao, salvando] = useActionState(salvarUsuario, inicial)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const meuNivel = NIVEL[papelDeQuemOlha] ?? 0
  const ehDono = papelDeQuemOlha === 'SUPER_ADMIN'
  const perfisQuePosseCriar = PERFIS.filter((p) => ehDono || NIVEL[p.valor]! < meuNivel)

  const termo = busca.trim().toLowerCase()
  const visiveis = termo
    ? usuarios.filter((u) => `${u.nome} ${u.email} ${u.papel}`.toLowerCase().includes(termo))
    : usuarios

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
      {msg ? (
        <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>
          {msg.texto}
        </p>
      ) : null}

      <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
        <button type="button" className={estilo.btn} onClick={() => setNovo((v) => !v)}>
          {novo ? 'Fechar' : 'Cadastrar pessoa'}
        </button>
        <input
          className={estilo.campo}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou perfil"
          aria-label="Buscar pessoa"
          style={{ maxWidth: 340 }}
        />
        <span className={estilo.fraco}>
          {visiveis.length === usuarios.length
            ? `${usuarios.length} ${usuarios.length === 1 ? 'pessoa' : 'pessoas'}`
            : `${visiveis.length} de ${usuarios.length}`}
        </span>
      </div>

      {novo ? (
        <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
          <p className={estilo.blocoTitulo}>Nova pessoa na equipe</p>
          {!estado.ok && estado.motivo ? <p className={estilo.erro}>{estado.motivo}</p> : null}
          {estado.ok && estado.mensagem ? <p className={estilo.sucesso}>{estado.mensagem}</p> : null}

          <div className={estilo.grade}>
            <label className={estilo.rotulo}>
              Nome completo *
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
                {perfisQuePosseCriar.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo} — {p.faz}
                  </option>
                ))}
              </select>
            </label>
            <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
              Senha provisória *
              <input
                className={estilo.campo}
                name="senha"
                type="text"
                required
                minLength={10}
                autoComplete="off"
              />
              <span className={estilo.dica}>
                Ao menos 10 caracteres. Ela serve para o primeiro acesso e o sistema exige a troca
                ali mesmo — combine por WhatsApp e esqueça.
              </span>
            </label>
          </div>

          <div className={estilo.acoesForm}>
            <button type="submit" className={estilo.btn} disabled={salvando}>
              {salvando ? 'Criando…' : 'Criar acesso'}
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
              <th>Perfil</th>
              <th>Último acesso</th>
              <th>Situação</th>
              <th>
                <span className={estilo.soLeitor}>Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((u) => {
              const acima = !ehDono && (NIVEL[u.papel] ?? 0) >= meuNivel
              const perfil = PERFIS.find((p) => p.valor === u.papel)
              return (
                <tr key={u.id}>
                  <td className={estilo.forte}>{u.nome}</td>
                  <td className={estilo.num}>{u.email}</td>
                  <td>
                    <span className={estilo.tag}>{perfil?.rotulo ?? u.papel.toLowerCase()}</span>
                  </td>
                  <td className={estilo.num}>
                    {u.ultimoLogin ? (
                      new Date(u.ultimoLogin).toLocaleDateString('pt-BR')
                    ) : (
                      <span className={estilo.fraco}>nunca</span>
                    )}
                  </td>
                  <td>
                    <span className={`${estilo.tag} ${u.ativo ? estilo.tagOk : estilo.tagNeutra}`}>
                      {u.ativo ? 'ativo' : 'desativado'}
                    </span>
                    {u.trocarSenha ? (
                      <div className={estilo.fraco}>troca a senha no acesso</div>
                    ) : null}
                  </td>
                  <td className={estilo.dir}>
                    {acima ? (
                      <span className={estilo.fraco}>—</span>
                    ) : u.ativo ? (
                      <button
                        type="button"
                        className={estilo.btnSec}
                        disabled={pendente}
                        onClick={() => agir(() => alternarUsuario(u.id, false))}
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={estilo.btnSec}
                        disabled={pendente}
                        onClick={() => agir(() => alternarUsuario(u.id, true))}
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
        Desativar corta o acesso na hora, inclusive as sessões já abertas — é o
        que serve para o dia em que alguém sai da empresa. Nada é apagado: o que
        a pessoa fez continua na trilha das ordens, com o nome dela.
      </p>
    </>
  )
}
