import { existsSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { EMPRESA, enderecoEmUmaLinha, instagramUsuario, linkWhatsapp } from '@/lib/empresa'
import { Credito } from './credito'
import { DadosEstruturados } from './dados-estruturados'
import { Foto, acharFoto } from './foto'
import { FormularioRetirada } from './formulario-retirada'
import { FundoOsciloscopio } from './fundo-osciloscopio'
import { FundoVideo } from './fundo-video'
import {
  ICONES,
  IconeEstrela,
  IconeGoogle,
  IconeInstagram,
  IconeLocal,
  IconeSeta,
  IconeWhatsapp,
} from './icones'
import { Marca } from './marca'
import estilo from './site.module.css'
import { BotaoWhatsapp } from './whatsapp'

/**
 * Home institucional.
 *
 * ---------------------------------------------------------------------------
 * A DIREÇÃO (o contrato que sobrevive à construção)
 * ---------------------------------------------------------------------------
 * TESE. O site em produção vende autoridade: 300 clientes, nove marcas, cinco
 * estrelas. Isso funciona e fica. O que ele não conta é o que a DTECH faz de
 * diferente depois que o aparelho entra na van — e é aí que mora o motivo de
 * escolher esta oficina em vez da que cobra R$ 200 a menos. Então a página
 * mantém a autoridade na frente e coloca o PRONTUÁRIO como a virada: você
 * acompanha cada etapa, com nome de quem fez e hora.
 *
 * MUNDO VISUAL. O azul-petróleo profundo e o laranja da marca deles, que já
 * estão no mercado e nos cartões — trocar a paleta seria jogar fora
 * reconhecimento construído. Superfícies escuras onde o assunto é o
 * equipamento parado (a urgência), claras onde o assunto é o processo (a
 * calma). A tipografia de display é serifada romana, não itálica: autoridade
 * técnica, não editorial de revista.
 *
 * MOVIMENTO. Um momento autoral só: a linha do prontuário se desenhando de
 * cima para baixo conforme entra na tela, com as etapas acendendo em sequência.
 * É movimento que EXPLICA o produto — a passagem do tempo numa ordem de
 * serviço — e não um fade-up genérico repetido em toda seção. O resto do
 * movimento é entrada discreta, guiada por scroll, e some inteiro para quem
 * pede menos movimento.
 *
 * PRIMEIRA DOBRA. Vídeo da oficina ao fundo, a promessa em uma frase, a
 * garantia visível, e as marcas logo abaixo — porque a primeira pergunta de
 * quem chega é "vocês mexem no MEU aparelho?".
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA PÁGINA NÃO É PRÉ-RENDERIZADA
 * ---------------------------------------------------------------------------
 * Ela era `force-static`, e isso a quebrava em produção de um jeito silencioso.
 *
 * A Content-Security-Policy do sistema usa um nonce novo a cada requisição, e é
 * ele que autoriza os scripts do Next a rodar. Página pré-renderizada é
 * congelada no build: o HTML sai com um nonce que não existe mais na hora de
 * servir, o navegador recusa TODOS os pedaços de JavaScript, e o React nunca
 * hidrata.
 *
 * O sintoma era cruel de achar porque a página continuava bonita: o HTML e o
 * CSS chegam inteiros. O que morria era só o que depende de JavaScript — e o
 * que depende de JavaScript aqui é justamente o formulário "Conta pra gente o
 * que houve". Ou seja: a página de captação de clientes ficava linda e não
 * enviava nada, sem um erro na tela para denunciar.
 *
 * Renderizar por requisição custa microssegundos: é um componente de servidor
 * sem consulta a banco nenhuma. Não é preço, é a única opção que preserva as
 * duas coisas — a política com nonce e um formulário que funciona.
 *
 * E precisa ser `force-dynamic`, não a simples remoção do `force-static`: sem
 * nenhuma API dinâmica na página, o Next a pré-renderiza por conta própria e o
 * problema volta calado.
 */
export const dynamic = 'force-dynamic'

/**
 * O vídeo é opcional, e a checagem acontece no build.
 *
 * Sem isto, um `<video>` apontando para um arquivo inexistente ficaria no HTML
 * de todo visitante pedindo dois arquivos que dão 404. Com isto, ou o vídeo
 * existe e entra, ou o bloco simplesmente não é renderizado e o fundo pintado
 * pelo CSS assume — que é a mesma cor, então ninguém percebe falta.
 */
const TEM_VIDEO = ['oficina.mp4', 'oficina.webm'].some((f) =>
  existsSync(path.join(process.cwd(), 'public', 'video', f)),
)
const TEM_POSTER = existsSync(path.join(process.cwd(), 'public', 'video', 'oficina.jpg'))

/**
 * A ordem de preferência da primeira dobra: filmagem real > foto real >
 * osciloscópio. O desenho é o piso, não o objetivo — ele existe para a página
 * nunca ficar com um retângulo vazio, e sai de cena assim que houver material
 * de verdade.
 */
const TEM_FOTO_DOBRA = acharFoto('oficina') !== null

/**
 * As fotos da faixa do perfil do Google, na ordem em que fazem sentido para
 * quem está decidindo se manda o aparelho: primeiro a oficina, depois a mão
 * trabalhando, depois os tipos de equipamento.
 *
 * A lista é filtrada no build: só sobra o que existe em `public/fotos/`. Se
 * nada existir, a faixa inteira some, e a seção continua de pé com as
 * avaliações — que é o essencial dela.
 */
const FOTOS_DO_PERFIL = (
  [
    ['oficina', 'A oficina, com equipamentos em atendimento'],
    ['bancada', 'Técnico trabalhando na placa de um equipamento aberto'],
    ['estetica', 'Equipamento estético em manutenção'],
    ['medico', 'Equipamento médico em manutenção'],
    ['odontologico', 'Equipamento odontológico em manutenção'],
    ['hospitalar', 'Equipamento hospitalar em manutenção'],
  ] as const
)
  .filter(([nome]) => acharFoto(nome) !== null)
  .map(([nome, alt]) => ({ nome, alt }))

/** As etapas do prontuário. Uma ordem real, do jeito que ela aparece no painel. */
const ETAPAS = [
  ['Retirada assinada pelo cliente', 'Motorista · Adriano M.', '08/08 · 14:22'],
  ['Recebido na oficina · 8 fotos', 'Técnico · Rafael S.', '08/08 · 17:05'],
  ['Laudo e orçamento enviados', 'Gestora · Camila R.', '09/08 · 10:40'],
  ['Orçamento aprovado e assinado', 'Cliente · portal, CNPJ conferido', '09/08 · 16:18'],
  ['Em manutenção · troca da fonte', 'Técnico · Rafael S.', '12/08 · 09:12'],
] as const

const ESPECIALIDADES = [
  {
    nome: 'Estética',
    texto:
      'Laser, luz intensa pulsada, criolipólise, radiofrequência e ultrassom micro e macrofocado.',
    foto: 'estetica',
  },
  {
    nome: 'Médico',
    texto: 'Monitor multiparâmetro, bisturi eletrônico, foco cirúrgico e bomba de infusão.',
    foto: 'medico',
  },
  {
    nome: 'Odontológico',
    texto: 'Cadeira, refletor, autoclave, compressor, fotopolimerizador e ultrassom.',
    foto: 'odontologico',
  },
  {
    nome: 'Hospitalar',
    texto: 'Autoclave de grande porte, mesa cirúrgica, aspirador, seladora e estufa.',
    foto: 'hospitalar',
  },
] as const

export default function Home() {
  const anoAtual = new Date().getFullYear()

  return (
    <>
      <header className={estilo.topo}>
        <div className={`${estilo.container} ${estilo.topoIn}`}>
          <Link href="/" className={estilo.marca} aria-label="DTECH MED, página inicial">
            <Marca larguraPx={152} />
          </Link>
          <nav className={estilo.nav} aria-label="Principal">
            <a href="#servicos">Serviços</a>
            <a href="#prontuario">Como acompanhamos</a>
            <a href="#a-empresa">A empresa</a>
            <a href="#onde-estamos">Onde estamos</a>
            <Link href="/entrar" className={estilo.navEntrar}>
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* ================= PRIMEIRA DOBRA ================= */}
        <section className={estilo.dobra}>
          {/* Filmagem real ganha do desenho quando ela existe. Enquanto não
              existe, o osciloscópio — que não é enfeite: grade de medição e
              traço de sinal são o instrumento do ofício de quem calibra. */}
          {TEM_VIDEO ? (
            <FundoVideo pôster={TEM_POSTER ? '/video/oficina.jpg' : ''} />
          ) : TEM_FOTO_DOBRA ? (
            <div className={estilo.dobraFoto}>
              <Foto
                nome="oficina"
                alt="Bancada da oficina, com um equipamento aberto em manutenção"
                prioridade
                larguras="100vw"
                className={estilo.dobraFotoImg}
              />
            </div>
          ) : (
            <FundoOsciloscopio />
          )}
          <div className={estilo.dobraVeu} aria-hidden="true" />

          <div className={`${estilo.container} ${estilo.dobraIn}`}>
            <h1 className={estilo.tese}>{EMPRESA.chamada}</h1>
            <p className={estilo.sub}>
              {EMPRESA.subChamada} E você acompanha cada etapa pelo celular, com
              o nome de quem mexeu e a hora.
            </p>

            <div className={estilo.acoes}>
              <a
                href={linkWhatsapp('Olá! Preciso de manutenção em um equipamento.')}
                className={estilo.btn}
              >
                <IconeWhatsapp className={estilo.btnIcone} />
                Peça orçamento no WhatsApp
                <IconeSeta className={estilo.btnSeta} />
              </a>
              <a href="#solicitar" className={`${estilo.btn} ${estilo.btnLinha}`}>
                Solicitar retirada pelo site
                <IconeSeta className={estilo.btnSeta} />
              </a>
            </div>

            {/* Números concretos na primeira dobra, e não enterrados no meio
                da página. É a primeira coisa que responde "posso confiar?" —
                e cada um deles é verificável. */}
            <dl className={estilo.provas}>
              <div>
                <dt>Clientes atendidos</dt>
                <dd><span data-conta="300">300</span>+</dd>
              </div>
              <div>
                <dt>No Google</dt>
                <dd>{EMPRESA.google.nota.toFixed(1).replace('.', ',')}</dd>
              </div>
              <div>
                <dt>Marcas atendidas</dt>
                <dd><span data-conta="9">9</span></dd>
              </div>
              <div>
                <dt>De garantia</dt>
                <dd>{EMPRESA.garantia.replace(' dias', '')}<small>dias</small></dd>
              </div>
            </dl>
          </div>

          {/* As marcas na primeira dobra, não escondidas lá embaixo: a primeira
              pergunta de quem chega é se mexemos no aparelho DELE. */}
          <div className={estilo.marcasFaixa}>
            <div className={estilo.container}>
              <h2 className={estilo.marcasTitulo}>
                Atendemos as marcas do mercado
              </h2>
              {/* A faixa anda. Movimento aqui se justifica porque o conteúdo
                  é uma lista que se repete — e ela PARA no hover e no foco,
                  para quem quiser procurar a própria marca conseguir ler.
                  A segunda cópia existe só para o laço não ter emenda visível;
                  o leitor de tela a ignora e anuncia as nove uma vez só. */}
              <div className={estilo.marcasPista}>
                <ul className={estilo.marcasLista}>
                  {EMPRESA.marcas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <ul className={estilo.marcasLista} aria-hidden="true">
                  {EMPRESA.marcas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className={`${estilo.secao} claro`}>
          <div className={estilo.container}>
            <h2 className={estilo.h2}>O que a gente resolve</h2>
            <p className={estilo.lead}>
              Do conserto ao laudo, com peça original e prazo dito na hora de
              fechar. Seu aparelho volta a trabalhar.
            </p>

            {/* Lista, não grade de cards do mesmo tamanho: o ícone anda ao lado
                do título, no fluxo, sem ladrilho arredondado em volta. */}
            <ul className={estilo.servicos}>
              {EMPRESA.servicos.map((s, i) => {
                const Icone = ICONES[s.icone]
                return (
                  <li
                    key={s.titulo}
                    className={estilo.servico}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <Icone className={estilo.servicoIcone} />
                    <div>
                      <h3>{s.titulo}</h3>
                      <p>{s.texto}</p>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className={estilo.especialidades}>
              <h3 className={estilo.h3}>Inclusive a marca que ninguém quer pegar</h3>
              <p className={estilo.lead}>
                Se a peça saiu de linha, procuramos equivalente e contamos antes,
                não depois. Você decide se vale.
              </p>
              {/* Quatro superfícies com peso, não quatro parágrafos soltos
                  numa grade de três com um órfão embaixo. Cada uma tem o
                  símbolo da marca em marca d'água, que dá profundidade sem
                  precisar de foto — e sai na hora em que a foto chegar. */}
              <ul className={estilo.espLista}>
                {ESPECIALIDADES.map((e, i) => (
                  <li
                    key={e.nome}
                    className={estilo.esp}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {/* Quando a foto existe ela assume o fundo do card; quando
                        não, fica a marca d'água. Nunca as duas, e nunca uma
                        caixa de imagem quebrada. */}
                    {acharFoto(e.foto) ? (
                      <span className={estilo.espFoto} aria-hidden="true">
                        <Foto
                          nome={e.foto}
                          alt=""
                          larguras="(max-width: 720px) 100vw, 50vw"
                          className={estilo.espFotoImg}
                        />
                      </span>
                    ) : (
                      <span className={estilo.espMarca} aria-hidden="true" />
                    )}
                    <h4>{e.nome}</h4>
                    <p>{e.texto}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ================= O PRONTUÁRIO — o momento autoral ================= */}
        <section id="prontuario" className={estilo.secao}>
          <div className={`${estilo.container} ${estilo.prontGrid}`}>
            <div className={estilo.prontTexto}>
              <h2 className={estilo.h2}>
                Seu equipamento tem <em>prontuário</em>
              </h2>
              <p className={estilo.lead}>
                Toda oficina promete avisar. A diferença aqui é que o aviso não
                depende de alguém lembrar: a mensagem sai sozinha quando a etapa
                vira, e fica registrada.
              </p>
              <ul className={estilo.prontLista}>
                <li>Assinatura na tela, ali na retirada, com data e horário.</li>
                <li>Pelo menos seis fotos de como o aparelho chegou.</li>
                <li>Orçamento item a item, aprovado por link, com CPF ou CNPJ conferido.</li>
                <li>Ninguém abre nada antes de você aprovar.</li>
                <li>Histórico que não dá para alterar depois. Nem nós conseguimos.</li>
              </ul>
            </div>

            {/* A linha do tempo se desenhando é o único momento de movimento
                autoral da página. Ele explica o produto: a passagem do tempo
                dentro de uma ordem de serviço. */}
            <div className={estilo.console}>
              <div className={estilo.csBarra}>
                <span className={estilo.csTit}>Acompanhamento da ordem</span>
                <span className={estilo.csOs}>#DT-2419</span>
              </div>
              <div className={estilo.csCab}>
                <p className={estilo.csEq}>Laser Lavieen · Duo</p>
                <p className={estilo.csNs}>NS 8842-LV-2021 · 220V · Clínica Bella Pelle</p>
              </div>
              <ol className={estilo.lt}>
                {ETAPAS.map(([nome, quem, hora], i) => (
                  <li
                    key={nome}
                    className={i === ETAPAS.length - 1 ? estilo.etAgora : estilo.etFeita}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <span className={estilo.etPonto} aria-hidden="true" />
                    <span className={estilo.etTxt}>
                      <strong>{nome}</strong>
                      <span>{quem}</span>
                    </span>
                    <time className={estilo.etHora}>{hora}</time>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ================= A EMPRESA ================= */}
        <section id="a-empresa" className={`${estilo.secao} claro`}>
          <div className={estilo.container}>
            <div className={estilo.sobreGrid}>
              <div>
                <h2 className={estilo.h2}>{EMPRESA.sobreTitulo}</h2>
                {EMPRESA.sobre.map((p) => (
                  <p key={p.slice(0, 24)} className={estilo.sobreP}>
                    {p}
                  </p>
                ))}
                <a
                  href={linkWhatsapp('Olá! Preciso de manutenção em um equipamento.')}
                  className={estilo.btn}
                >
                  <IconeWhatsapp className={estilo.btnIcone} />
                  Peça orçamento no WhatsApp
                </a>
              </div>

              <div className={estilo.numeros}>
                <p className={estilo.numeroGrande}>{EMPRESA.clientesAtendidos}</p>
                <p className={estilo.numeroTexto}>
                  clientes atendidos. Somos referência na manutenção de equipamentos
                  médico-estéticos, odontológicos e hospitalares.
                </p>
              </div>
            </div>

            <div className={estilo.principios}>
              <div>
                <h3>Missão</h3>
                <p>{EMPRESA.missao}</p>
              </div>
              <div>
                <h3>Visão</h3>
                <p>{EMPRESA.visao}</p>
              </div>
              <div>
                <h3>Valores</h3>
                <p>{EMPRESA.valores}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= AVALIAÇÕES DO GOOGLE =================
            Montado como o painel do Google Meu Negócio: o "G" à vista, o nome
            e a categoria do jeito que o Google mostra, a nota, as avaliações
            com a bolinha de inicial, e a faixa de fotos embaixo.

            A forma emprestada não é enfeite: nota de cinco estrelas escrita
            num site qualquer não vale nada, e a mesma nota com a cara da fonte
            de onde ela veio vale. Nenhum número aqui é inventado — todos saem
            do perfil real, transcritos em `src/lib/empresa.ts`. */}
        <section className={`${estilo.secao} ${estilo.vivo}`} aria-labelledby="tit-google">
          <div className={estilo.container}>
            <div className={estilo.gmn}>
              <div className={estilo.gmnTopo}>
                <IconeGoogle className={estilo.gmnG} />
                <div>
                  <strong className={estilo.gmnNome}>{EMPRESA.nome}</strong>
                  <span className={estilo.gmnCategoria}>
                    Assistência técnica · {EMPRESA.endereco.cidade}, {EMPRESA.endereco.uf}
                  </span>
                </div>
              </div>

              <div className={estilo.gmnNota}>
                <p className={estilo.notaValor}>
                  {EMPRESA.google.nota.toFixed(1).replace('.', ',')}
                </p>
                <div>
                  <p className={estilo.notaEstrelas} aria-hidden="true">
                    {Array.from({ length: EMPRESA.google.nota }, (_, i) => (
                      <IconeEstrela key={i} />
                    ))}
                  </p>
                  <h2 id="tit-google" className={estilo.notaTexto}>
                    {EMPRESA.google.nota} de 5 no Google, em{' '}
                    {EMPRESA.google.quantidade} avaliações
                  </h2>
                </div>
              </div>

              <ul className={estilo.avaliacoes}>
                {EMPRESA.google.avaliacoes.map((a) => (
                  <li key={a.autor} className={estilo.avaliacao}>
                    <div className={estilo.avCabeca}>
                      {/* A bolinha com a inicial é o que o Google mostra quando
                          a pessoa não tem foto de perfil. Puxar a foto de
                          verdade exigiria a API do Google e o consentimento
                          dela; a inicial dá o mesmo reconhecimento sem isso. */}
                      <span className={estilo.avInicial} aria-hidden="true">
                        {a.autor.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className={estilo.avAutor}>
                        <strong>{a.autor}</strong>
                        <span>{a.quando}</span>
                      </span>
                    </div>
                    <p className={estilo.avEstrelas} aria-label={`${a.nota} de 5 estrelas`}>
                      {Array.from({ length: a.nota }, (_, i) => (
                        <IconeEstrela key={i} />
                      ))}
                    </p>
                    {/* Avaliação sem texto escrito é comum, e inventar uma frase
                        no lugar seria falsificar depoimento de cliente real. */}
                    {a.texto ? (
                      <blockquote className={estilo.avTexto}>{a.texto}</blockquote>
                    ) : (
                      <p className={estilo.avSemTexto}>Avaliou com {a.nota} estrelas.</p>
                    )}
                  </li>
                ))}
              </ul>

              {/* A faixa de fotos, como a aba "Fotos" do perfil. Só entra se
                  houver foto: uma faixa vazia com título "Fotos" é pior que
                  faixa nenhuma. */}
              {FOTOS_DO_PERFIL.length > 0 ? (
                <div className={estilo.gmnFotos}>
                  <p className={estilo.gmnFotosTit}>Fotos da oficina</p>
                  <ul className={estilo.gmnTira}>
                    {FOTOS_DO_PERFIL.map(({ nome, alt }) => (
                      <li key={nome} className={estilo.gmnTiraItem}>
                        <Foto
                          nome={nome}
                          alt={alt}
                          larguras="(max-width: 720px) 45vw, 220px"
                          className={estilo.gmnTiraImg}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {EMPRESA.googleMeuNegocio ? (
                <p className={estilo.gmnAcao}>
                  <a
                    href={EMPRESA.googleMeuNegocio}
                    className={`${estilo.btn} ${estilo.btnLinha}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconeGoogle className={estilo.btnIcone} />
                    Ver todas as avaliações no Google
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ================= INSTAGRAM ================= */}
        {EMPRESA.instagram ? (
          <section className={`${estilo.secao} claro`} aria-labelledby="tit-insta">
            <div className={`${estilo.container} ${estilo.instaBloco}`}>
              <IconeInstagram className={estilo.instaIcone} />
              <h2 id="tit-insta" className={estilo.h2}>
                Bastidores da oficina
              </h2>
              <p className={estilo.lead}>
                Equipamento aberto, peça trocada, teste final. O que acontece antes
                de o aparelho voltar funcionando.
              </p>
              <a
                href={`https://instagram.com/${instagramUsuario()}`}
                className={estilo.btn}
                rel="noopener noreferrer"
                target="_blank"
              >
                Seguir {EMPRESA.instagram}
              </a>
            </div>
          </section>
        ) : null}

        {/* ================= SOLICITAR ================= */}
        {/* `vivo` põe o fundo animado atrás desta seção. Ela é a seção que
            decide o negócio — é onde a pessoa escreve o que houve com o
            aparelho — e estava sendo a mais apagada da página: preto liso,
            campos pretos, nada acontecendo. */}
        <section id="solicitar" className={`${estilo.secao} ${estilo.vivo}`}>
          <div className={`${estilo.container} ${estilo.estreito}`}>
            <h2 className={estilo.h2}>Conta pra gente o que houve</h2>
            <p className={estilo.lead}>
              Respondemos em até 24 horas úteis, já com a data da retirada.
            </p>
            <FormularioRetirada whatsapp={EMPRESA.whatsapp} />
            <p className={estilo.contatoDireto}>
              Prefere falar agora?{' '}
              <a
                href={linkWhatsapp('Olá! Preciso de manutenção em um equipamento.')}
                className={estilo.linkZap}
              >
                {EMPRESA.telefoneExibicao}
              </a>
            </p>
          </div>
        </section>

        {/* ================= ONDE ESTAMOS ================= */}
        <section id="onde-estamos" className={`${estilo.secao} claro`}>
          <div className={estilo.container}>
            <h2 className={estilo.h2}>Onde estamos</h2>
            <p className={estilo.endereco}>
              <IconeLocal className={estilo.enderecoIcone} />
              <span>{enderecoEmUmaLinha()}</span>
            </p>
            {EMPRESA.mapaEmbed ? (
              <div className={estilo.mapa}>
                <iframe
                  src={EMPRESA.mapaEmbed}
                  title={`Mapa até a ${EMPRESA.nome}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <footer className={estilo.rodape}>
        <div className={`${estilo.container} ${estilo.rodGrid}`}>
          <div>
            <Marca larguraPx={164} />
            <p className={estilo.rodTexto}>
              {EMPRESA.razaoSocial}. {EMPRESA.descricaoSite}, de qualquer marca.
              {EMPRESA.cnpj ? ` CNPJ ${EMPRESA.cnpj}.` : ''}
            </p>
          </div>
          <div>
            <h3>Contato</h3>
            <ul>
              <li>
                <a href={linkWhatsapp()}>{EMPRESA.telefoneExibicao}</a>
              </li>
              {/* Campo vazio some da tela. Melhor faltar um horário do que
                  publicar um que não é o verdadeiro. */}
              {EMPRESA.horarioAtendimento ? <li>{EMPRESA.horarioAtendimento}</li> : null}
              {EMPRESA.email ? (
                <li>
                  <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
                </li>
              ) : null}
              {EMPRESA.instagram ? (
                <li>
                  <a
                    href={`https://instagram.com/${instagramUsuario()}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {EMPRESA.instagram}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div>
            <h3>Endereço</h3>
            <ul>
              <li>
                {EMPRESA.endereco.logradouro}, {EMPRESA.endereco.numero}
              </li>
              <li>{EMPRESA.endereco.bairro}</li>
              <li>
                {EMPRESA.endereco.cidade} · {EMPRESA.endereco.uf}
              </li>
              <li>CEP {EMPRESA.endereco.cep}</li>
            </ul>
          </div>
        </div>
        <div className={`${estilo.container} ${estilo.rodFim}`}>
          <span>
            © {anoAtual} {EMPRESA.razaoSocial}
          </span>
          <Credito className={estilo.credito} />
          <Link href="/entrar">Acesso ao sistema</Link>
        </div>
      </footer>

      {/* Fica fora do <main> de propósito: é atendimento, não conteúdo da
          página. Assim quem navega por leitor de tela não tromba com ele no
          meio da leitura — encontra no fim, onde se procura contato. */}
      <BotaoWhatsapp />

      {/* O bloco que o Google lê. Fica no fim porque não é conteúdo visível e
          não deve atrasar a pintura do que a pessoa veio ver. */}
      <DadosEstruturados />
    </>
  )
}
