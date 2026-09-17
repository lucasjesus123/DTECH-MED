'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarUsuario, excluirUsuario, salvarUsuario } from '@/server/acoes/plataforma'
/* A MESMA tabela que o servidor usa, e não uma cópia dela. Havia duas, iguais,
   mantidas por lembrança — e foi preciso mudar as duas no dia em que a regra
   dos administradores mudou. Uma cópia esquecida não dá erro: dá tela
   oferecendo o que o servidor recusa. */
import { nivelDe, podeCriarPapel, podeMexerEm } from '@/server/auth/niveis'
import Dica from '../dica'
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
 * Some da lista, então, o que ela não pode escolher.
 *
 * ---------------------------------------------------------------------------
 * NOMEAR UM IGUAL SIM; MEXER NELE, NÃO
 * ---------------------------------------------------------------------------
 * O administrador da empresa nomeia OUTRO administrador — era o que faltava, e
 * é o motivo de "Administrador" agora aparecer no seletor de perfil. Uma
 * empresa com um administrador só fica sem ninguém que mexa na equipe no dia em
 * que essa pessoa some.
 *
 * O que ele não ganha é poder sobre o igual. A ficha de outro administrador
 * abre para LER e não para salvar, e o botão de desativar dá lugar a um cadeado:
 * entre dois iguais, desativar é o clique que tranca o outro para fora da
 * empresa, e ganharia quem clicasse primeiro. Quem resolve isso é o dono da
 * plataforma, que está acima dos dois.
 *
 * A exclusão é a única exceção, e ela é estreita de propósito: só vale para
 * quem nunca entrou. É o conserto do e-mail digitado errado há dez minutos — e
 * sem ela, errar o e-mail ao nomear um administrador deixaria um acesso de
 * nível máximo, inalcançável, com uma senha provisória viva.
 */
export default function Equipe({
  usuarios,
  papelDeQuemOlha,
  idDeQuemOlha,
  mostrarEmpresa = false,
  empresas = [],
}: {
  usuarios: Pessoa[]
  papelDeQuemOlha: string
  /**
   * Quem está olhando, para a lista saber reconhecê-lo na própria lista.
   *
   * Sem isto, a linha da própria pessoa é só "mais um do mesmo nível" — e ela
   * abriria a própria ficha para ler um aviso dizendo "outro administrador".
   */
  idDeQuemOlha: string
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

  const ehDono = papelDeQuemOlha === 'SUPER_ADMIN'
  /**
   * Até onde o seletor de perfil vai: o próprio nível, inclusive.
   *
   * O `<=` é o que faz "Administrador" caber na lista de quem é administrador.
   * Ele espelha o servidor, que recusa só o que está ACIMA — e a lista nunca
   * chega ao topo de verdade, porque `PERFIS` não tem `SUPER_ADMIN`: não existe
   * combinação de cliques nesta tela que crie um dono de plataforma.
   */
  const perfisQuePosseCriar = PERFIS.filter((p) => podeCriarPapel(papelDeQuemOlha, p.valor))

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

      {/* A BARRA: procurar à esquerda, cadastrar à direita.
          É o mesmo desenho do estoque, e de propósito. Quem administra usa as
          duas telas no mesmo dia; ter a busca num lugar numa e noutro na outra
          é o tipo de diferença que não se nota e se paga em segundos, toda
          vez. */}
      <div className={estilo.barraTela}>
        <div className={estilo.filtros}>
          <div className={estilo.busca}>
            <input
              className={estilo.campo}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                mostrarEmpresa
                  ? 'Buscar por nome, empresa, e-mail ou perfil'
                  : 'Buscar por nome, e-mail ou perfil'
              }
              aria-label="Buscar pessoa"
            />
          </div>
          <span className={estilo.fraco}>
            {visiveis.length === usuarios.length
              ? `${usuarios.length} ${usuarios.length === 1 ? 'pessoa' : 'pessoas'}`
              : `${visiveis.length} de ${usuarios.length}`}
          </span>
        </div>
        <button type="button" className={novo ? estilo.btnSec : estilo.btn} onClick={() => setNovo((v) => !v)}>
          {novo ? 'Fechar' : 'Cadastrar pessoa'}
        </button>
      </div>

      {novo ? (
        <form action={acao} className={`${estilo.bloco} ${estilo.form}`} style={{ marginBottom: 'var(--s5)' }}>
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
        <table className={`${estilo.tabela} ${estilo.tabelaEquipe}`}>
          <thead>
            <tr>
              <th>Pessoa</th>
              {mostrarEmpresa ? <th>Empresa</th> : null}
              <th>Perfil</th>
              <th>Situação</th>
              <th>
                <span className={estilo.soLeitor}>Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((u) => {
              /* TRÊS SITUAÇÕES, E NÃO UMA.
                 Era um `acima` só, com `>=`, e ele juntava coisas que agora
                 precisam de respostas diferentes: quem está ACIMA (intocável),
                 quem é IGUAL (nomeável, não mexível, apagável enquanto nunca
                 entrou) e a PRÓPRIA pessoa (que merece ouvir "é você" em vez de
                 "outro administrador"). */
              const souEu = u.id === idDeQuemOlha
              /* Desativar e reativar pedem estar ACIMA — a mesma pergunta que o
                 servidor faz antes de aceitar. */
              const naoMexo = !podeMexerEm(papelDeQuemOlha, u.papel)
              const acimaDeMim = nivelDe(u.papel) > nivelDe(papelDeQuemOlha)
              const parDeMim = naoMexo && !acimaDeMim && !souEu
              const perfil = PERFIS.find((p) => p.valor === u.papel)
              return (
                <tr key={u.id} className={u.ativo ? undefined : estilo.linhaArquivada}>
                  {/* ===================================================
                      NOME E E-MAIL NA MESMA CÉLULA, COM A INICIAL NA FRENTE
                      ===================================================
                      Eram duas colunas, e a segunda — o e-mail — é a mais
                      larga da tabela sem ser a que alguém procura. Juntas,
                      elas são UMA informação: quem é a pessoa e por onde ela
                      entra.

                      A inicial não é enfeite. Numa lista de vinte nomes em
                      preto sobre branco, o olho conta linhas; com um disco
                      colorido na frente, ele mira. É o mesmo disco do rodapé
                      da lateral, onde a pessoa já reconhece o próprio. */}
                  <td>
                    <span className={estilo.pessoaLinha}>
                      <span className={estilo.pessoaInicial} aria-hidden="true">
                        {iniciais(u.nome)}
                      </span>
                      <span className={estilo.pessoaTexto}>
                        {/* O NOME É A PORTA DA FICHA.
                            Em toda outra lista da casa o nome abre o
                            cadastro; aqui ele era texto morto e a porta era um
                            botão escrito "Ficha" na última coluna. Agora é
                            botão de verdade — e por isso o ícone de ficha não
                            existe: dois controles para a mesma ação na mesma
                            linha fazem quem usa leitor de tela ouvir a coisa
                            duas vezes. */}
                        <button type="button" className={estilo.pessoaNome} onClick={() => setAberta(u)}>
                          {u.nome}
                        </button>
                        <span className={estilo.pessoaEmail}>{u.email}</span>
                      </span>
                    </span>
                  </td>

                  {mostrarEmpresa ? (
                    <td>
                      <span className={estilo.tag}>{u.empresa ?? 'plataforma'}</span>
                    </td>
                  ) : null}

                  <td>
                    {/* O QUE O PERFIL FAZ FICA NA DICA, e não na linha.
                        Escrito embaixo do selo, ele ocupava três linhas —
                        "só o aplicativo de rota: retirada e entrega" — e a
                        tabela virava uma coluna de parágrafos de 100px de
                        altura, repetindo a mesma frase em todo técnico e em
                        todo motorista da lista.
                        A frase importa na hora de ESCOLHER o perfil, e lá ela
                        continua: escrita por extenso dentro do seletor do
                        cadastro e da ficha. Aqui ela responde a quem
                        perguntar. */}
                    {perfil ? (
                      <Dica texto={perfil.faz}>
                        <span className={`${estilo.tag} ${corDoPerfil(u.papel)}`}>{perfil.rotulo}</span>
                      </Dica>
                    ) : (
                      <span className={`${estilo.tag} ${corDoPerfil(u.papel)}`}>
                        {u.papel.toLowerCase()}
                      </span>
                    )}
                  </td>

                  <td>
                    {/* TRÊS FATOS NUMA COLUNA SÓ: pode entrar, quando entrou
                        pela última vez, e se a senha ainda é a provisória. Os
                        três respondem a mesma pergunta — "este acesso está de
                        pé?" — e separados em colunas obrigavam a varrer a
                        linha para montar a resposta. */}
                    <span className={`${estilo.tag} ${u.ativo ? estilo.tagOk : estilo.tagNeutra}`}>
                      {u.ativo ? 'ativo' : 'desativado'}
                    </span>
                    <div className={estilo.pessoaEstado}>
                      {u.ultimoLogin
                        ? `entrou em ${new Date(u.ultimoLogin).toLocaleDateString('pt-BR')}`
                        : 'nunca entrou'}
                      {u.trocarSenha ? ' · senha provisória' : ''}
                    </div>
                  </td>

                  <td>
                    <span className={estilo.acoesLinha}>
                      {naoMexo ? (
                        /* Quem está no mesmo nível ou acima não se mexe — e o
                           lugar do botão não fica vazio: um desenho apagado
                           diz que a ação existe e por que ela não está aqui.
                           Buraco na linha faria parecer coluna quebrada.

                           O motivo muda conforme quem é: "é você" e "outro
                           administrador" são recusas diferentes, e dizer as
                           duas com a mesma frase deixaria a pessoa procurando
                           um perfil acima do dela que não existe. */
                        <Dica
                          texto={
                            souEu
                              ? 'É você — desativar a si mesmo é trancar-se para fora'
                              : parDeMim
                                ? 'Mesmo perfil que o seu — quem corta o acesso é o dono da plataforma'
                                : 'Perfil acima do seu'
                          }
                        >
                          <span
                            className={`${estilo.btnIcone} ${estilo.btnIconeMudo}`}
                            role="img"
                            aria-label={
                              souEu
                                ? 'Você não pode desativar o próprio acesso'
                                : `Você não pode alterar o acesso de ${u.nome}`
                            }
                          >
                            <IconeCadeado />
                          </span>
                        </Dica>
                      ) : u.ativo ? (
                        <Dica texto="Desativar o acesso">
                          <button
                            type="button"
                            className={`${estilo.btnIcone} ${estilo.btnIconePerigo}`}
                            disabled={pendente}
                            aria-label={`Desativar o acesso de ${u.nome}`}
                            onClick={() => agir(() => alternarUsuario(u.id, false))}
                          >
                            <IconeDesligar />
                          </button>
                        </Dica>
                      ) : (
                        <Dica texto="Reativar o acesso">
                          <button
                            type="button"
                            className={estilo.btnIcone}
                            disabled={pendente}
                            aria-label={`Reativar o acesso de ${u.nome}`}
                            onClick={() => agir(() => alternarUsuario(u.id, true))}
                          >
                            <IconeLigar />
                          </button>
                        </Dica>
                      )}

                      {/* Excluir só aparece para quem NUNCA entrou. Cadastro
                          com e-mail errado, criado há dez minutos, é lixo e
                          some. Quem já trabalhou tem nome na trilha, e apagar
                          o cadastro apagaria o nome de tudo o que a pessoa
                          fez — o servidor recusa, e este botão nem se
                          oferece.

                          Ele aparece para um IGUAL — o cadeado da coluna ao
                          lado não vale aqui. É justamente o administrador que
                          acabou de ser nomeado com o e-mail errado: ninguém
                          entrou nele, nada carrega o nome dele, e deixá-lo
                          inapagável seria deixar de pé um acesso de nível
                          máximo que não dá para alcançar. */}
                      {!u.ultimoLogin && !acimaDeMim && !souEu ? (
                        <Dica texto="Excluir o cadastro">
                          <button
                            type="button"
                            className={`${estilo.btnIcone} ${estilo.btnIconePerigo}`}
                            disabled={pendente}
                            aria-label={`Excluir o cadastro de ${u.nome}`}
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
                            <IconeLixeira />
                          </button>
                        </Dica>
                      ) : null}
                    </span>
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
          /* A MESMA lista do cadastro, e não `PERFIS` inteiro: promover alguém
             a um perfil que o servidor vai recusar é o mesmo tapa, só que na
             edição. Com o `<=`, o perfil atual de qualquer pessoa editável
             cabe na lista — inclusive o de um administrador, cuja ficha abre
             só para ler. */
          perfis={perfisQuePosseCriar}
          podeEditar={podeMexerEm(papelDeQuemOlha, aberta.papel)}
          souEu={aberta.id === idDeQuemOlha}
          aoFechar={() => setAberta(null)}
        />
      ) : null}

      <div className={estilo.notaTela}>
        <p>
          <strong>Desativar</strong> corta o acesso na hora, inclusive as sessões já abertas — é o
          que serve para o dia em que alguém sai da empresa. Nada é apagado: o que a pessoa fez
          continua na trilha das ordens, com o nome dela.
        </p>
        <p>
          <strong>Excluir</strong> só aparece para quem nunca entrou — o cadastro com e-mail errado,
          criado há dez minutos. Depois do primeiro acesso, o nome da pessoa está espalhado pelo
          histórico, e apagar o cadastro apagaria esse nome de tudo o que ela fez.
        </p>
        {/* A REGRA DOS IGUAIS, ESCRITA ANTES DE ALGUÉM ESBARRAR NELA.
            Quem acabou de nomear o segundo administrador vai, mais cedo ou mais
            tarde, tentar abrir a ficha dele. Descobrir ali que não dá é
            descobrir tarde; aqui, é saber de antemão. */}
        {!ehDono ? (
          <p>
            <strong>Outro administrador</strong> pode ser nomeado por você — e é só isso. A ficha
            dele abre para ler, não para salvar: mexer na senha de alguém do seu nível seria tomar a
            conta dele, e desativá-lo seria trancá-lo para fora da empresa. Essas duas são do dono da
            plataforma. Enquanto ele nunca tiver entrado, o cadastro ainda pode ser excluído — é como
            se desfaz um e-mail digitado errado.
          </p>
        ) : null}
      </div>

    </>
  )
}

/**
 * AS DUAS PRIMEIRAS LETRAS DO NOME — a que o olho mira antes de ler.
 *
 * Primeiro nome e último, quando há os dois: "Lucas Jesus" vira LJ, e não LU.
 * Nome de uma palavra só devolve a primeira letra sozinha, porque "LUCAS" em
 * dois caracteres viraria LU — e LU e LJ lado a lado numa lista se confundem.
 */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.charAt(0).toUpperCase()
  return (partes[0]!.charAt(0) + partes[partes.length - 1]!.charAt(0)).toUpperCase()
}

/**
 * A COR DO PERFIL, e por que são três e não seis.
 *
 * Seis cores numa lista de vinte linhas é um arco-íris: o olho para em cada
 * uma para descobrir o que ela quer dizer, que é o oposto de mirar. Três
 * respondem a pergunta que alguém realmente faz olhando a coluna — de que LADO
 * da casa esta pessoa está:
 *
 *   QUEM MANDA    administrador e gestor      cobalto, a cor da marca
 *   O DINHEIRO    financeiro                  verde, a cor do caixa
 *   QUEM EXECUTA  atendente, técnico, motorista   neutra
 *
 * A cor é o agrupamento; o nome exato continua escrito dentro do selo, e o que
 * o perfil faz vem logo abaixo.
 */
function corDoPerfil(papel: string): string {
  if (papel === 'ADMIN_EMPRESA' || papel === 'GESTOR' || papel === 'SUPER_ADMIN') return ''
  if (papel === 'FINANCEIRO') return estilo.tagOk!
  return estilo.tagNeutra!
}

/* Três desenhos, pelo mesmo motivo de sempre: uma dependência inteira para
   três traços é peso que o navegador baixa sem precisar. */

const svg = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Desativar: o símbolo universal de desligar. */
function IconeDesligar() {
  return (
    <svg {...svg}>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  )
}

/** Reativar: o mesmo desligar, com a seta de volta. */
function IconeLigar() {
  return (
    <svg {...svg}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
    </svg>
  )
}

function IconeLixeira() {
  return (
    <svg {...svg}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

/** O acesso que não se mexe: perfil igual ou acima do de quem está olhando. */
function IconeCadeado() {
  return (
    <svg {...svg}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
