'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { salvarUsuario } from '@/server/acoes/plataforma'
import Abas from './abas'
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
  telas: string[]
  telefone: string | null
  documento: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  /**
   * De qual empresa esta pessoa é.
   *
   * Nulo para quem administra a empresa e olha a própria equipe: ali todo mundo
   * é da mesma casa, e repetir o nome dela em cada linha é ruído. Preenchido
   * para o dono da plataforma, que vê a rede inteira numa lista só — e sem esta
   * coluna, um "Ana Prado · Atendente" não responde a pergunta que importa:
   * atendente de QUAL franquia.
   */
  empresa?: string | null
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
  podeEditar = true,
  souEu = false,
  aoFechar,
}: {
  pessoa: Pessoa
  perfis: ReadonlyArray<{ valor: string; rotulo: string; faz: string }>
  /**
   * Falso quando a pessoa é do mesmo nível de quem abriu — outro administrador,
   * ou ela mesma.
   *
   * ---------------------------------------------------------------------------
   * POR QUE A FICHA ABRE, EM VEZ DE NÃO ABRIR
   * ---------------------------------------------------------------------------
   * Consultar a ficha de alguém — o telefone, o CPF, quando entrou pela última
   * vez — não é mexer nela. Trancar a porta inteira responderia menos e
   * esconderia dados que quem administra a empresa tem toda razão de ver.
   *
   * O que não pode é o formulário ACEITAR: campos que se digitam e um botão que
   * salva levariam a pessoa a preencher tudo para colher um "você não pode" do
   * servidor no fim. Então os campos chegam desligados e o botão de salvar não
   * existe — o aviso vem antes do trabalho, e não depois dele.
   */
  podeEditar?: boolean
  /** Muda só o texto do aviso: "é você" e "é outro" são recusas diferentes. */
  souEu?: boolean
  aoFechar: () => void
}) {
  const [estado, acao, salvando] = useActionState(salvarUsuario, inicial)
  const router = useRouter()

  /**
   * O que um campo opcional VAZIO diz quando a ficha é de leitura.
   *
   * Editando, o campo em branco é um convite e não precisa de legenda. Lendo,
   * ele é um retângulo vazio embaixo de um rótulo — e retângulo vazio tanto
   * pode ser "esta pessoa não tem telefone" quanto "isto aqui não carregou".
   * Duas leituras muito diferentes para a mesma ausência.
   */
  const vazio = podeEditar ? undefined : 'não informado'

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

          {!podeEditar ? (
            <p className={estilo.avisoCaixa} role="note">
              {souEu ? (
                <>
                  <strong>Esta ficha é a sua.</strong> Ela abre para conferir o que está cadastrado.
                  Para trocar a própria senha, use <strong>Minha conta</strong> — lá o sistema pede a
                  senha atual, que é o que impede alguém de trocar a sua num computador que você
                  deixou aberto.
                </>
              ) : (
                <>
                  <strong>Esta pessoa tem o mesmo perfil que o seu.</strong> A ficha abre para ler.
                  Alterar dados, perfil ou senha de um igual é de quem está acima dos dois — o dono
                  da plataforma.
                </>
              )}
            </p>
          ) : null}

          {/* Desligar o conjunto inteiro de uma vez, e não campo a campo: um
              `disabled` esquecido num campo novo, daqui a seis meses, seria o
              buraco por onde a folha volta a aceitar o que o servidor recusa. */}
          <fieldset className={estilo.conjunto} disabled={!podeEditar}>
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
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                CPF
                <input
                  className={estilo.campo}
                  name="documento"
                  inputMode="numeric"
                  defaultValue={pessoa.documento ?? ''}
                  placeholder={vazio}
                />
                <span className={estilo.dica}>Vai no termo de entrega, ao lado do nome.</span>
              </label>
              <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                Perfil *
                {/* Sem `disabled` próprio: o conjunto lá em cima já desliga
                    este seletor junto com todo o resto. Ele tinha um, e tinha
                    também uma frase embaixo explicando o bloqueio — a mesma
                    coisa que o aviso do topo agora diz, uma vez só e antes de
                    qualquer campo. Dizer duas vezes não reforça; faz procurar
                    a diferença entre as duas. */}
                <select
                  className={estilo.selecao}
                  name="papel"
                  required
                  defaultValue={pessoa.papel}
                  style={{ width: '100%' }}
                >
                  {perfis.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo} — {p.faz}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Abas papel={pessoa.papel} marcadas={pessoa.telas} />

            <p className={estilo.blocoTitulo} style={{ marginTop: 'var(--s5)' }}>
              Onde mora
            </p>
            <div className={estilo.grade}>
              <label className={estilo.rotulo}>
                CEP
                <input className={estilo.campo} name="cep" inputMode="numeric" defaultValue={pessoa.cep ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                Cidade
                <input className={estilo.campo} name="cidade" defaultValue={pessoa.cidade ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                Logradouro
                <input className={estilo.campo} name="logradouro" defaultValue={pessoa.logradouro ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                Número
                <input className={estilo.campo} name="numero" defaultValue={pessoa.numero ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                Complemento
                <input className={estilo.campo} name="complemento" defaultValue={pessoa.complemento ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                Bairro
                <input className={estilo.campo} name="bairro" defaultValue={pessoa.bairro ?? ''}
                  placeholder={vazio}
                />
              </label>
              <label className={estilo.rotulo}>
                UF
                <input className={estilo.campo} name="uf" maxLength={2} defaultValue={pessoa.uf ?? ''}
                  placeholder={vazio}
                />
              </label>
            </div>

            {/* O bloco da senha some inteiro quando a ficha é de leitura. Os
                outros campos desligados ainda INFORMAM — mostram o telefone, o
                CPF, o endereço. Um campo de senha vazio e desligado não informa
                nada: é só um convite que não leva a lugar nenhum. */}
            {podeEditar ? (
              <>
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
                      Preencher aqui <strong>derruba as sessões abertas</strong> desta pessoa e obriga
                      a trocar de novo no próximo acesso. É o que se usa quando alguém perdeu a senha
                      ou quando há suspeita de acesso indevido.
                    </span>
                  </label>
                </div>
              </>
            ) : null}
          </fieldset>

          <div className={estilo.acoesForm} style={{ marginTop: 'var(--s5)' }}>
            {podeEditar ? (
              <>
                <button type="submit" className={estilo.btn} disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar ficha'}
                </button>
                <button type="button" className={estilo.btnSec} onClick={aoFechar} disabled={salvando}>
                  Cancelar
                </button>
              </>
            ) : (
              /* Sem "Salvar" não há por que ter "Cancelar": não existe nada
                 para cancelar. Fechar é o que a folha faz, e o botão de fechar
                 já está no topo dela. */
              <button type="button" className={estilo.btn} onClick={aoFechar}>
                Fechar
              </button>
            )}
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
