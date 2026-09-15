'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirCorDoTimbre, removerLogoDaEmpresa, salvarLogoDaEmpresa } from '@/server/acoes/marca'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/**
 * O PAPEL TIMBRADO DA EMPRESA — e a prévia do que vai sair impresso.
 *
 * =============================================================================
 * POR QUE ELE MORA AQUI, E NÃO NO CADASTRO DA EMPRESA
 * =============================================================================
 * Porque é aqui que a pergunta aparece. Quem abre esta tela está pensando no
 * papel que vai para a mão do cliente; pedir que vá a outra tela, num menu que
 * só o dono da plataforma enxerga, para depois voltar e conferir, é o caminho
 * que ninguém percorre.
 *
 * E o cadastro da empresa é tela de SUPER_ADMIN. A logo é decisão do
 * franqueado sobre a marca dele — obrigá-lo a pedir ao franqueador para trocar
 * o próprio timbre seria transformar identidade visual em chamado de suporte.
 *
 * =============================================================================
 * A PRÉVIA É DESENHADA COM OS MESMOS DADOS DO PDF
 * =============================================================================
 * Nome, razão social, CNPJ, endereço e telefone vêm do cadastro, exatamente
 * como o gerador os lê — e a régua embaixo usa a `corPrimaria` da empresa,
 * como a do papel. Não é maquete: é o cabeçalho, em HTML.
 *
 * O que ela NÃO promete: os dados que estiverem em branco no cadastro saem em
 * branco no papel. Por isso o aviso, quando falta CNPJ ou endereço — é o tipo
 * de buraco que só se descobre com o contrato impresso na mão do cliente.
 */
export default function PapelTimbrado({
  empresa,
  temLogo,
  versaoLogo,
  podeMexer,
}: {
  empresa: {
    nome: string
    razaoSocial: string | null
    cnpj: string | null
    endereco: string | null
    telefone: string | null
    cor: string
  }
  temLogo: boolean
  /**
   * O CARIMBO QUE FURA O CACHE, e ele vem do SERVIDOR.
   *
   * O endereço da rota da logo é fixo — `/api/marca/logo` —, então trocar a
   * imagem não muda a URL e o navegador continuaria entregando a marca antiga.
   *
   * O número podia ser um contador nesta tela, e foi, até o lint recusar: um
   * `setState` dentro de efeito dispara uma segunda renderização por nada. E
   * a recusa estava certa por um motivo melhor que o desempenho — o contador
   * era uma segunda fonte de verdade sobre qual logo está no ar.
   *
   * Aqui o carimbo é o HASH DO CONTEÚDO, que já está no nome do arquivo
   * gravado. Ele muda quando, e só quando, a imagem muda de fato.
   */
  versaoLogo: string
  podeMexer: boolean
}) {
  const [estado, acao, enviando] = useActionState(salvarLogoDaEmpresa, inicial)
  const [estadoCor, acaoCor, salvandoCor] = useActionState(definirCorDoTimbre, inicial)
  /**
   * A cor DA TELA, para a prévia responder enquanto a pessoa arrasta o seletor.
   *
   * Repare que o estado guarda `null` até alguém escolher, e a cor exibida é
   * `escolhida ?? empresa.cor`. Não é rebuscado — é o que evita um defeito
   * conhecido: iniciar o estado com `useState(empresa.cor)` congela o valor do
   * PRIMEIRO desenho. Depois de salvar, o servidor manda a cor nova, o estado
   * continua com a velha, e a tela volta sozinha para a cor anterior — dando a
   * impressão de que a gravação falhou quando ela deu certo.
   *
   * Ressincronizar isso dentro de um efeito seria `setState` em efeito: uma
   * segunda renderização por nada, e o lint da casa recusa. Derivando, não há
   * o que ressincronizar.
   */
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const corNaTela = escolhida ?? empresa.cor
  const [pendente, iniciar] = useTransition()
  const [erroRemocao, setErroRemocao] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  // O efeito faz UMA coisa: recarregar quando o envio deu certo. Copiar o erro
  // para estado aqui dentro seria `setState` dentro de efeito — segunda
  // renderização por nada, e o lint recusa com razão. O erro do envio já vive
  // em `estado`; basta lê-lo.
  useEffect(() => {
    if (estado.ok) router.refresh()
  }, [estado, router])

  const erro = erroRemocao ?? (!estado.ok && estado.motivo ? estado.motivo : null)
  const faltando = [!empresa.cnpj && 'CNPJ', !empresa.endereco && 'endereço', !empresa.telefone && 'telefone'].filter(
    Boolean,
  ) as string[]

  return (
    <section className={estilo.bloco} style={{ marginBottom: 'var(--s6)' }}>
      <p className={estilo.blocoTitulo}>
        <span>Papel timbrado</span>
        <span className={estilo.fraco}>o alto de todo documento que você emite</span>
      </p>

      <div className={estilo.timbreGrade}>
        {/* ---------------- A PRÉVIA ---------------- */}
        <div>
          <div className={estilo.timbrePrevia}>
            <div className={estilo.timbreTopo}>
              {temLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a rota
                   entrega o PNG já no tamanho certo e exige sessão; passar por
                   `next/image` acrescentaria um salto pelo otimizador para
                   reencodar uma imagem autenticada de 150px. */
                <img
                  className={estilo.timbreLogo}
                  src={`/api/marca/logo?v=${versaoLogo}`}
                  alt={`Logo de ${empresa.nome}`}
                />
              ) : null}
              <div className={estilo.timbreTexto}>
                <strong style={{ color: corNaTela }}>{empresa.nome}</strong>
                <span>
                  {[
                    empresa.razaoSocial,
                    empresa.cnpj && `CNPJ ${empresa.cnpj}`,
                    empresa.endereco,
                    empresa.telefone,
                  ]
                    .filter(Boolean)
                    .join('  ·  ') || 'Complete o cadastro da empresa para o timbre ficar cheio.'}
                </span>
              </div>
            </div>
            <div className={estilo.timbreRegua} style={{ background: corNaTela }} />
            <div className={estilo.timbreCorpo}>
              <strong>ORDEM DE SERVIÇO</strong>
              <span>Nº 00042 · emitido em 15/09/2026 · etapa: pronto para entrega</span>
            </div>
          </div>
          <p className={estilo.dica} style={{ marginTop: 'var(--s2)' }}>
            É este o alto da folha do contrato, da promissória e da O.S. — desenhado com os mesmos
            dados que o gerador lê.
          </p>
        </div>

        {/* ---------------- O ENVIO ---------------- */}
        <div className={estilo.timbreLado}>
          {erro ? (
            <p className={estilo.erro} role="alert">
              {erro}
            </p>
          ) : null}
          {estado.ok && estado.mensagem ? (
            <p className={estilo.sucesso} role="status">
              {estado.mensagem}
            </p>
          ) : null}
          {!estadoCor.ok && estadoCor.motivo ? (
            <p className={estilo.erro} role="alert">
              {estadoCor.motivo}
            </p>
          ) : null}
          {estadoCor.ok && estadoCor.mensagem ? (
            <p className={estilo.sucesso} role="status">
              {estadoCor.mensagem}
            </p>
          ) : null}

          {faltando.length > 0 ? (
            <p className={estilo.avisoCaixaForte} role="status">
              O cadastro da empresa está sem <strong>{faltando.join(', ')}</strong>. O que falta lá
              sai em branco aqui — e num contrato isso é o tipo de buraco que só se descobre com o
              papel na mão do cliente.
            </p>
          ) : null}

          {podeMexer ? (
            <form action={acao} ref={formRef} className={estilo.timbreAcoes}>
              <label className={estilo.btnSec}>
                {enviando ? 'Enviando…' : temLogo ? 'Trocar a logo' : 'Enviar a logo'}
                {/* O `input` fica escondido atrás do rótulo porque o controle
                    nativo de arquivo não é estilizável e escreve "Nenhum
                    arquivo selecionado" ao lado. O rótulo é clicável de
                    verdade e continua alcançável pelo Tab. */}
                <input
                  className={estilo.soLeitor}
                  type="file"
                  name="arquivo"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={enviando}
                  onChange={(e) => {
                    setErroRemocao(null)
                    if (e.target.files?.length) formRef.current?.requestSubmit()
                  }}
                />
              </label>

              {temLogo ? (
                <button
                  type="button"
                  className={estilo.acaoRara}
                  disabled={pendente || enviando}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await removerLogoDaEmpresa()
                      if (!r.ok) setErroRemocao(r.motivo)
                      else router.refresh()
                    })
                  }
                >
                  tirar a logo
                </button>
              ) : null}
            </form>
          ) : (
            <p className={estilo.dica}>Seu perfil vê o timbre, mas não troca a marca da empresa.</p>
          )}

          {/* A COR É UM FORMULÁRIO À PARTE, e não um campo do envio da logo.
              Trocar a cor é um clique e não carrega arquivo nenhum; num
              formulário só, corrigir um tom obrigaria a reenviar a imagem. */}
          {podeMexer ? (
            <form action={acaoCor} className={estilo.timbreCor}>
              <label className={estilo.rotulo}>
                Cor do timbre
                <span className={estilo.timbreCorLinha}>
                  <input
                    type="color"
                    name="cor"
                    className={estilo.timbreCorPoco}
                    value={corNaTela}
                    onChange={(e) => setEscolhida(e.target.value)}
                    aria-label="Cor da régua e dos rótulos do documento"
                  />
                  <code className={estilo.timbreCorHex}>{corNaTela}</code>
                  <button type="submit" className={estilo.btnSec} disabled={salvandoCor}>
                    {salvandoCor ? 'Salvando…' : 'Salvar a cor'}
                  </button>
                </span>
              </label>
              <span className={estilo.dica}>
                É a régua sob o cabeçalho e o título de cada bloco — CLIENTE, EQUIPAMENTO,
                VALORES. A prévia ao lado já responde enquanto você escolhe.
              </span>
            </form>
          ) : null}

          <p className={estilo.dica}>
            <strong>PNG com fundo transparente</strong> é o que fica melhor no papel — sobre o
            branco da folha, sem retângulo em volta. JPG e WebP também entram. Até 3 MB.
          </p>
          <p className={estilo.dica}>
            Trocar a marca <strong>não mexe no que já saiu</strong>. Cada PDF é gravado com o hash
            do próprio conteúdo no instante em que nasceu — é ele que prova que o contrato assinado
            mês passado não foi trocado depois.
          </p>
        </div>
      </div>
    </section>
  )
}
