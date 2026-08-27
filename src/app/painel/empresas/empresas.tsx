'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarBloqueio, criarEmpresa, entrarNaEmpresa } from '@/server/acoes/plataforma'
import { formatarBRL } from '@/lib/dinheiro'
import FichaEmpresa from './ficha-empresa'
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
  online: number
  recebidoMes: number
  razaoSocial: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
}

/**
 * A visão da rede.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A LISTA DE USUÁRIOS SAIU DAQUI
 * ---------------------------------------------------------------------------
 * Ela era uma ABA desta tela, e isso confundia duas coisas: administrar uma
 * franquia e administrar a rede. Quem estava mexendo numa empresa via, ao lado,
 * gente de todas as outras.
 *
 * Equipe é assunto de DENTRO da empresa. O caminho certo para mexer no acesso
 * de alguém é ENTRAR na franquia pelo botão do cartão e administrar lá, com o
 * nome dela na faixa do topo e no crachá — sem coluna nenhuma para conferir,
 * porque não há como se enganar.
 *
 * A lista da rede inteira continua existindo, em "Pessoas da rede", para o que
 * ela serve de verdade: procurar uma pessoa quando não se sabe de qual franquia
 * ela é, e cadastrar alguém escolhendo a empresa. Lá ela tem coluna de empresa,
 * busca por franquia e um seletor no cadastro — porque lá o assunto É a rede.
 */
export default function Empresas({ empresas }: { empresas: Empresa[] }) {
  const [novaEmpresa, setNovaEmpresa] = useState(false)
  const [estadoEmpresa, acaoEmpresa, salvandoEmpresa] = useActionState(criarEmpresa, inicial)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [busca, setBusca] = useState('')
  /** A empresa cujo cadastro está aberto. `null` = nenhuma. */
  const [emEdicao, setEmEdicao] = useState<Empresa | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  /**
   * A busca da rede: nome, cidade, CNPJ ou identificador.
   *
   * Filtra no navegador, e não no servidor, de propósito. A lista de franquias
   * é a menor do sistema — são dezenas, não milhares — e ir ao banco a cada
   * tecla digitada custaria uma viagem de rede para responder o que já está na
   * memória. O dia em que forem centenas, isto vira consulta paginada; hoje
   * seria complexidade comprada adiantada.
   */
  const termo = busca.trim().toLowerCase()
  const visiveis = termo
    ? empresas.filter((e) =>
        [e.nome, e.cidade ?? '', e.uf ?? '', e.cnpj ?? '', e.slug]
          .join(' ')
          .toLowerCase()
          .includes(termo),
      )
    : empresas

  /** Entra na empresa e cai no painel do dia DELA. */
  function entrar(e: Empresa) {
    setMsg(null)
    iniciar(async () => {
      const r = await entrarNaEmpresa(e.id)
      if (!r.ok) {
        setMsg({ ok: false, texto: r.motivo })
        return
      }
      router.push('/painel')
      router.refresh()
    })
  }

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

      {msg ? <p className={msg.ok ? estilo.sucesso : estilo.erro} role={msg.ok ? 'status' : 'alert'}>{msg.texto}</p> : null}

          <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
            <button type="button" className={estilo.btn} onClick={() => setNovaEmpresa((v) => !v)}>
              {novaEmpresa ? 'Fechar' : 'Cadastrar empresa'}
            </button>
            <input
              className={estilo.campo}
              type="search"
              value={busca}
              onChange={(ev) => setBusca(ev.target.value)}
              placeholder="Buscar por nome, cidade, CNPJ ou identificador"
              aria-label="Buscar empresa"
              style={{ maxWidth: 380 }}
            />
            <span className={estilo.fraco}>
              {visiveis.length === empresas.length
                ? `${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'}`
                : `${visiveis.length} de ${empresas.length}`}
            </span>
          </div>

          {novaEmpresa ? (
            <form action={acaoEmpresa} className={`${estilo.bloco} ${estilo.form}`}>
              <p className={estilo.blocoTitulo}>Nova empresa</p>
              {!estadoEmpresa.ok && estadoEmpresa.motivo ? <p className={estilo.erro} role="alert">{estadoEmpresa.motivo}</p> : null}
              {estadoEmpresa.ok && estadoEmpresa.mensagem ? (
                <p className={estilo.sucesso} role="status">{estadoEmpresa.mensagem}</p>
              ) : null}

              <div className={estilo.grade}>
                <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                  Nome da empresa *
                  <input className={estilo.campo} name="nome" required minLength={3} />
                </label>
                <label className={estilo.rotulo}>
                  Identificador *
                  {/**
                   * O HÍFEN VAI ESCAPADO, E ISSO NÃO É PRECIOSISMO.
                   *
                   * O navegador compila o `pattern` com a flag `v` do
                   * JavaScript moderno. Sob ela, um `-` solto no fim de uma
                   * classe de caracteres é ERRO de sintaxe, e o padrão inteiro
                   * é descartado:
                   *
                   *   Invalid regular expression: /[a-z0-9-]{3,40}/v:
                   *   Invalid character class
                   *
                   * O efeito não é "a validação afrouxa" — é pior. A chamada
                   * interna de validação estoura, e o navegador RECUSA ENVIAR o
                   * formulário. Nenhuma mensagem aparece na tela: a pessoa
                   * preenche tudo, clica em criar, e não acontece nada.
                   *
                   * Ou seja: o dono da plataforma não conseguia cadastrar
                   * empresa nenhuma em navegador atual, e o erro só existia no
                   * console. Achado ao rodar o cadastro num navegador de
                   * verdade — nenhum teste de código pegaria isto, porque o
                   * `pattern` só é compilado pelo navegador.
                   */}
                  <input
                    className={estilo.campo}
                    name="slug"
                    required
                    pattern="[a-z0-9\-]{3,40}"
                    placeholder="dtechmed-lajeado"
                  />
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

          <div className={estilo.rede}>
            {visiveis.map((e) => {
              const vivo = !e.bloqueado && e.online > 0
              const estado = e.bloqueado ? 'Suspenso' : vivo ? 'Vivo' : 'Parado'
              return (
                <article key={e.id} className={`${estilo.cartaoEmpresa} ${estilo['cartao' + estado]}`}>
                  <div className={estilo.cartaoTopo}>
                    <div style={{ minWidth: 0 }}>
                      <strong className={estilo.cartaoNome}>{e.nome}</strong>
                      <span className={estilo.cartaoOnde}>
                        {e.cidade ?? 'sem cidade'}
                        {e.uf ? `/${e.uf}` : ''}
                        {e.cnpj ? ` · ${e.cnpj}` : ''}
                      </span>
                    </div>

                    {/* O sinal de vida traz a PALAVRA junto da cor. Verde e
                        vermelho pequenos lado a lado se confundem numa grade
                        cheia, e há quem não os distinga de jeito nenhum. */}
                    <span className={`${estilo.sinal} ${estilo['sinal' + estado]}`}>
                      <i className={estilo.bolinha} aria-hidden="true" />
                      {e.bloqueado ? 'suspensa' : vivo ? `${e.online} online` : 'ninguém'}
                    </span>
                  </div>

                  <div className={estilo.cartaoNumeros}>
                    <div className={estilo.cartaoNumero}>
                      <span className={estilo.cartaoNumeroValor}>{e.usuarios}</span>
                      <span className={estilo.cartaoNumeroRot}>pessoas</span>
                    </div>
                    <div className={estilo.cartaoNumero}>
                      <span className={estilo.cartaoNumeroValor}>{e.abertas}</span>
                      <span className={estilo.cartaoNumeroRot}>na esteira</span>
                    </div>
                    <div className={estilo.cartaoNumero}>
                      <span className={estilo.cartaoNumeroValor}>{formatarBRL(e.recebidoMes)}</span>
                      <span className={estilo.cartaoNumeroRot}>no mês</span>
                    </div>
                  </div>

                  <span
                    className={`${estilo.tag} ${e.whats === 'CONECTADA' ? estilo.tagOk : estilo.tagNeutra}`}
                  >
                    WhatsApp: {e.whats ? e.whats.toLowerCase() : 'sem instância'}
                  </span>

                  {e.motivoBloqueio ? <p className={estilo.cartaoMotivo}>{e.motivoBloqueio}</p> : null}

                  <div className={estilo.cartaoAcoes}>
                    {!e.bloqueado ? (
                      <button
                        type="button"
                        className={estilo.btn}
                        disabled={pendente}
                        onClick={() => entrar(e)}
                      >
                        Entrar
                      </button>
                    ) : null}
                    <button type="button" className={estilo.btnSec} onClick={() => setEmEdicao(e)}>
                      Editar
                    </button>
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
                  </div>
                </article>
              )
            })}

            {visiveis.length === 0 ? (
              <p className={estilo.vazio}>
                Nenhuma empresa com esse termo. Limpe a busca para ver a rede inteira.
              </p>
            ) : null}
          </div>

          {emEdicao ? (
            <FichaEmpresa empresa={emEdicao} aoFechar={() => setEmEdicao(null)} />
          ) : null}

          <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
            Suspender encerra na hora todas as sessões abertas da empresa. Sem
            isso, a suspensão só valeria para quem ainda não tinha entrado.
          </p>
    </>
  )
}
