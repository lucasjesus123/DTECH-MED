'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarUsuario, excluirUsuario, salvarUsuario } from '@/server/acoes/plataforma'
import Abas from './abas'
import Ficha, { type Pessoa } from './ficha'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }


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
  mostrarEmpresa = false,
  empresas = [],
}: {
  usuarios: Pessoa[]
  papelDeQuemOlha: string
  /** As franquias onde o dono da plataforma pode cadastrar alguém. */
  empresas?: { id: string; nome: string }[]
  /**
   * Acrescenta a coluna "Empresa".
   *
   * Vale só para o dono da plataforma fora de uma visita, que é quando a lista
   * mistura franquias. Para quem administra uma empresa, todo mundo é da mesma
   * casa — a coluna repetiria o mesmo nome em todas as linhas e roubaria
   * largura de quem já precisa rolar de lado no celular.
   */
  mostrarEmpresa?: boolean
}) {
  const [novo, setNovo] = useState(false)
  /** O perfil escolhido no formulário de criação. As abas dependem dele. */
  const [papelNovo, setPapelNovo] = useState<string>('')
  /** A pessoa cuja ficha está aberta. `null` = nenhuma. */
  const [aberta, setAberta] = useState<Pessoa | null>(null)
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
    ? usuarios.filter((u) =>
        // A empresa entra na busca: com a rede inteira numa lista só, "procurar
        // pela franquia" é o primeiro recorte que alguém faz.
        `${u.nome} ${u.email} ${u.papel} ${u.empresa ?? ''}`.toLowerCase().includes(termo),
      )
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
          placeholder={
            mostrarEmpresa ? 'Buscar por nome, empresa, e-mail ou perfil' : 'Buscar por nome, e-mail ou perfil'
          }
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
          {!estado.ok && estado.motivo ? <p className={estilo.erro} role="alert">{estado.motivo}</p> : null}
          {estado.ok && estado.mensagem ? <p className={estilo.sucesso} role="status">{estado.mensagem}</p> : null}

          <div className={estilo.grade}>
            {/* A EMPRESA, e por que ela é o primeiro campo.
                O servidor já exigia `tenantId` de quem cria pela plataforma — e
                recusava com "Escolha a empresa do usuário." Só que a tela não
                oferecia onde escolher: o dono da plataforma não conseguia
                cadastrar ninguém por aqui, e a mensagem de erro apontava para um
                campo que não existia.
                Vem primeiro porque é a decisão que muda todas as outras: o
                perfil, as abas e o e-mail passam a existir DENTRO dela. */}
            {mostrarEmpresa ? (
              <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                Empresa *
                <select className={estilo.selecao} name="tenantId" required style={{ width: '100%' }} defaultValue="">
                  <option value="" disabled>
                    Escolha a franquia
                  </option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
                <span className={estilo.dica}>
                  A pessoa nasce dentro desta empresa e só enxerga o que é dela. Isso não muda
                  depois — para mover alguém de franquia, cadastre na nova e desative na antiga.
                </span>
              </label>
            ) : null}
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
              <select
                className={estilo.selecao}
                name="papel"
                required
                style={{ width: '100%' }}
                value={papelNovo || perfisQuePosseCriar[0]?.valor || ''}
                onChange={(e) => setPapelNovo(e.target.value)}
              >
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

          {/* As abas já no cadastro: montar o acesso e depois lembrar de
              voltar para apertá-lo é o passo que ninguém dá. */}
          <Abas papel={papelNovo} marcadas={[]} />

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
              {mostrarEmpresa ? <th>Empresa</th> : null}
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
                  {mostrarEmpresa ? (
                    <td>
                      <span className={estilo.tag}>{u.empresa ?? 'plataforma'}</span>
                    </td>
                  ) : null}
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
                    {/* A ficha abre para QUALQUER pessoa da lista, inclusive
                        quem está acima — ler o cadastro de alguém não é mexer
                        nele, e o que não se pode mudar chega desabilitado. */}
                    <button
                      type="button"
                      className={estilo.btnSec}
                      onClick={() => setAberta(u)}
                      style={{ marginRight: 'var(--s2)' }}
                    >
                      Ficha
                    </button>
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
                    {/* Excluir só aparece para quem NUNCA entrou. Cadastro com
                        e-mail errado, criado há dez minutos, é lixo e some. Quem
                        já trabalhou tem nome na trilha, e apagar o cadastro
                        apagaria o nome de tudo o que a pessoa fez — o servidor
                        recusa, e este botão nem se oferece. */}
                    {!u.ultimoLogin && !acima ? (
                      <button
                        type="button"
                        className={estilo.btnPerigo}
                        disabled={pendente}
                        style={{ marginLeft: 'var(--s2)' }}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir o cadastro de ${u.nome}? Esta pessoa nunca entrou no sistema, então nada do histórico é afetado. Não dá para desfazer.`,
                            )
                          ) {
                            agir(() => excluirUsuario(u.id))
                          }
                        }}
                      >
                        Excluir
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {aberta ? (
        <Ficha
          pessoa={aberta}
          perfis={PERFIS}
          podeTrocarPerfil={ehDono || (NIVEL[aberta.papel] ?? 0) < meuNivel}
          aoFechar={() => setAberta(null)}
        />
      ) : null}

      <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
        Desativar corta o acesso na hora, inclusive as sessões já abertas — é o
        que serve para o dia em que alguém sai da empresa. Nada é apagado: o que
        a pessoa fez continua na trilha das ordens, com o nome dela.
        <br />
        Excluir só aparece para quem <strong>nunca entrou</strong> — o cadastro
        com e-mail errado, criado há dez minutos. Depois do primeiro acesso, o
        nome da pessoa está espalhado pelo histórico, e apagar o cadastro
        apagaria esse nome de tudo o que ela fez.
      </p>
    </>
  )
}
