import type { Metadata } from 'next'
import { existsSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import {
  instagramUsuarioDe,
  linkMapsDe,
  linkWhatsappDe,
  mapaUrlDe,
} from '@/lib/conteudo'
import { lerConteudo } from '@/server/conteudo'
import Consentimento from './consentimento'
import { Credito } from './credito'
import { DadosEstruturados } from './dados-estruturados'
import { FOTOS, Foto, acharFoto, type NomeFoto } from './foto'
import { FormularioRetirada } from './formulario-retirada'
import { FundoOsciloscopio } from './fundo-osciloscopio'
import { FundoVideo } from './fundo-video'
import { GoogleGtag, GoogleTagManager, GoogleTagManagerNoScript } from './gtm'
import { MedirCliques } from './medir-cliques'
import MedirSecoes from './medir-secoes'
import { InstagramFeed } from './instagram-feed'
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
import { PontePrevia } from './previa'
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
 * O título e a descrição que o Google mostra saem do conteúdo editável.
 *
 * Estavam no layout, fixos no código. Ficar lá significaria o dono poder mudar
 * todo o texto da página e não conseguir mudar a única frase que aparece na
 * busca — que é, para quem procura, a primeira coisa que ele lê da empresa.
 */
export async function generateMetadata(): Promise<Metadata> {
  const c = await lerConteudo()
  const codigo = c.seo.verificacaoGoogle.trim()
  return {
    title: c.seo.titulo,
    description: c.seo.descricao,
    alternates: { canonical: '/' },
    openGraph: { title: c.seo.titulo, description: c.seo.descricao, url: '/' },
    twitter: { title: c.seo.titulo, description: c.seo.descricao },
    // A etiqueta só existe quando há código. Escrever uma etiqueta de
    // verificação vazia é pior que não escrever: o Google lê, não confere, e a
    // propriedade fica pendente sem dizer por quê.
    ...(codigo ? { verification: { google: codigo } } : {}),
  }
}

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
/**
 * Função, e não constante.
 *
 * Como constante isto era avaliado UMA VEZ, quando o módulo carrega — ou seja,
 * na partida do processo. Com as fotos entrando pelo painel, isso significaria
 * que a foto enviada só apareceria depois de reiniciar o contêiner: o dono
 * envia, recarrega, não vê nada, e conclui que não funcionou.
 *
 * A página é montada a cada pedido, então a conta sai barata e a resposta é
 * sempre a de agora.
 */
function temFotoNaDobra() {
  return acharFoto('oficina') !== null
}

/**
 * As fotos da faixa do perfil do Google, na ordem em que fazem sentido para
 * quem está decidindo se manda o aparelho: primeiro a oficina, depois a mão
 * trabalhando, depois os tipos de equipamento.
 *
 * A lista é filtrada a cada pedido: só sobra o que existe, seja foto enviada
 * pelo painel ou foto de fábrica. Se nada existir, a faixa inteira some, e a
 * seção continua de pé com as avaliações — que é o essencial dela.
 */
/**
 * O nome da foto vem do conteúdo editável, ou seja, de um campo de texto que o
 * dono digita. Ele pode escrever qualquer coisa — inclusive o nome de um
 * arquivo que não existe, ou um caminho com `..` tentando sair da pasta.
 *
 * Esta função é a porteira: só devolve o nome se ele for um dos slots
 * conhecidos E o arquivo existir. Qualquer outra coisa vira `null`, e quem
 * chama mostra a alternativa.
 */
function fotoValida(nome: string): NomeFoto | null {
  if (!nome) return null
  if (!(nome in FOTOS)) return null
  const n = nome as NomeFoto
  return acharFoto(n) ? n : null
}

const CANDIDATAS_DO_PERFIL = [
  ['oficina', 'A assistência, com vários equipamentos estéticos em atendimento'],
  ['bancada', 'Técnico com luva segurando a ponteira aberta'],
  ['estetica', 'Aparelho de ozonioterapia sendo configurado'],
  ['medico', 'Placa de circuito aberta na bancada'],
  ['hospitalar', 'Equipamento de grande porte aberto, com a eletrônica à mostra'],
  ['detalhe', 'Trabalho de precisão na bancada'],
] as const

function fotosDoPerfil() {
  return CANDIDATAS_DO_PERFIL.filter(([nome]) => acharFoto(nome) !== null).map(
    ([nome, alt]) => ({ nome, alt }),
  )
}

/**
 * As fotos que rodam no carrossel dos bastidores.
 *
 * Os mesmos lugares das outras, filtrados a cada pedido: só entra o que existe.
 * Se não existir nenhuma E não houver feed do Instagram configurado, a seção
 * inteira não é renderizada.
 */
const CANDIDATAS_BASTIDORES = [
  ['bancada', 'Técnico com luva segurando a ponteira aberta, painel de ferramentas ao fundo'],
  ['oficina', 'A assistência, com vários equipamentos estéticos em atendimento'],
  ['medico', 'Placa de circuito aberta na bancada, ao lado da pasta térmica'],
  ['estetica', 'Aparelho de ozonioterapia sendo configurado no painel'],
  ['bancada2', 'Técnico com o módulo retirado de dentro da ponteira'],
  ['hospitalar', 'Equipamento de grande porte aberto, com a eletrônica à mostra'],
  ['detalhe', 'Aplicação de composto na bancada, em trabalho de precisão'],
] as const

function fotosDosBastidores() {
  return CANDIDATAS_BASTIDORES.filter(([nome]) => acharFoto(nome) !== null).map(
    ([nome, alt]) => ({ nome, alt }),
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  /* `?previa=1` só é usado pela tela de edição, dentro da moldura. Para o
     visitante comum nada muda: a ponte simplesmente não é montada. */
  const ehPrevia = (await searchParams).previa === '1'

  /* Quais fotos existem AGORA. Calculado uma vez por requisição, e não na
     partida do processo: é o que faz a foto enviada pelo painel aparecer no
     recarregar seguinte, em vez de só depois de reiniciar o contêiner. */
  const fotosPerfil = fotosDoPerfil()
  const fotosBastidores = fotosDosBastidores()

  /**
   * O conteúdo do site, vindo do banco.
   *
   * Uma consulta só, deduplicada pelo `cache` do React — os metadados, os
   * dados estruturados e esta página pedem a mesma coisa e o banco é
   * consultado uma vez. Se o banco não responder, ou se ainda não houver nada
   * gravado, volta o texto de fábrica e o site fica de pé do mesmo jeito.
   */
  const c = await lerConteudo()
  const anoAtual = new Date().getFullYear()

  /* Depende do conteúdo, então mora aqui e não no topo do arquivo. */
  const temBastidores =
    Boolean(c.redes.instagram) &&
    (fotosBastidores.length > 0 || Boolean(c.redes.instagramFeed))

  return (
    <>
      {/* O Google Tag Manager, no começo do corpo da página e SÓ aqui.
          O painel, os aplicativos de campo e o link do cliente ficam de fora
          de propósito — o motivo está escrito em `./gtm`, e o principal é que
          a URL do portal É a credencial do cliente. */}
      <GoogleTagManagerNoScript id={c.seo.gtmId} />
      <GoogleTagManager id={c.seo.gtmId} />
      {/* Analytics e Google Ads, para quem mede sem passar pelo Tag Manager.
          Os dois campos vazios não escrevem nada na página. */}
      <GoogleGtag ga4Id={c.seo.ga4Id} adsId={c.seo.googleAdsId} />
      {/* Um ouvinte só, que mede todo clique de WhatsApp e telefone da página —
          inclusive os que ainda não existem. Ver `./medir-cliques`. */}
      <MedirCliques />
      {/* E até onde a pessoa desceu. Num site de uma página só, é isto que
          separa quem leu a chamada de quem chegou ao formulário. */}
      <MedirSecoes />

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
          ) : temFotoNaDobra() ? (
            <div className={estilo.dobraFoto}>
              <Foto
                nome="oficina"
                alt="Bancada da assistência, com um equipamento aberto em manutenção"
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
            <h1 className={estilo.tese} data-c="dobra.chamada">{c.dobra.chamada}</h1>
            <p className={estilo.sub} data-c="dobra.subChamada">{c.dobra.subChamada}</p>

            <div className={estilo.acoes}>
              {/* A origem vai marcada à mão porque este botão vive na primeira
                  dobra, que não tem `id` de seção — sem a marca o evento diria
                  só "conteudo", que não responde nada. Este é o CTA mais caro
                  do site: é onde cai quem clicou no anúncio. */}
              <a
                href={linkWhatsappDe(c, 'Olá! Preciso de manutenção em um equipamento.')}
                className={estilo.btn}
                data-medir-origem="primeira-dobra"
              >
                <IconeWhatsapp className={estilo.btnIcone} />
                {c.dobra.botaoWhatsapp}
                <IconeSeta className={estilo.btnSeta} />
              </a>
              <a href="#solicitar" className={`${estilo.btn} ${estilo.btnLinha}`}>
                {c.dobra.botaoFormulario}
                <IconeSeta className={estilo.btnSeta} />
              </a>
            </div>

            {/* Números concretos na primeira dobra, e não enterrados no meio
                da página. É a primeira coisa que responde "posso confiar?" —
                e cada um deles é verificável. */}
            <dl className={estilo.provas}>
              {c.dobra.provas.map((p, i) => (
                <div key={`${p.rotulo}-${i}`}>
                  <dt data-c={`dobra.provas.${i}.rotulo`}>{p.rotulo}</dt>
                  <dd>
                    {p.valor}
                    {p.sufixo ? <small>{p.sufixo}</small> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* As marcas na primeira dobra, não escondidas lá embaixo: a primeira
              pergunta de quem chega é se mexemos no aparelho DELE. */}
          <div className={estilo.marcasFaixa}>
            <div className={estilo.container}>
              <h2 className={estilo.marcasTitulo}>
                {c.marcas.titulo}
              </h2>
              {/* A faixa anda. Movimento aqui se justifica porque o conteúdo
                  é uma lista que se repete — e ela PARA no hover e no foco,
                  para quem quiser procurar a própria marca conseguir ler.
                  A segunda cópia existe só para o laço não ter emenda visível;
                  o leitor de tela a ignora e anuncia as nove uma vez só. */}
              <div className={estilo.marcasPista}>
                <ul className={estilo.marcasLista}>
                  {c.marcas.lista.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <ul className={estilo.marcasLista} aria-hidden="true">
                  {c.marcas.lista.map((m) => (
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
            <h2 className={estilo.h2} data-c="servicos.titulo">{c.servicos.titulo}</h2>
            <p className={estilo.lead} data-c="servicos.lead">{c.servicos.lead}</p>

            {/* Lista, não grade de cards do mesmo tamanho: o ícone anda ao lado
                do título, no fluxo, sem ladrilho arredondado em volta. */}
            <ul className={estilo.servicos}>
              {c.servicos.lista.map((s, i) => {
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
              <h3 className={estilo.h3} data-c="especialidades.titulo">{c.especialidades.titulo}</h3>
              <p className={estilo.lead} data-c="especialidades.lead">{c.especialidades.lead}</p>
              {/* Quatro superfícies com peso, não quatro parágrafos soltos
                  numa grade de três com um órfão embaixo. Cada uma tem o
                  símbolo da marca em marca d'água, que dá profundidade sem
                  precisar de foto — e sai na hora em que a foto chegar. */}
              <ul className={estilo.espLista}>
                {c.especialidades.lista.map((e, i) => (
                  <li
                    key={e.nome}
                    className={estilo.esp}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {/* Quando a foto existe ela assume o fundo do card; quando
                        não, fica a marca d'água. Nunca as duas, e nunca uma
                        caixa de imagem quebrada. */}
                    {fotoValida(e.foto) ? (
                      <span className={estilo.espFoto} aria-hidden="true">
                        <Foto
                          nome={fotoValida(e.foto)!}
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
                <span data-c="prontuario.titulo">{c.prontuario.titulo}</span>{' '}
                <em data-c="prontuario.destaque">{c.prontuario.destaque}</em>
              </h2>
              <p className={estilo.lead} data-c="prontuario.lead">{c.prontuario.lead}</p>
              <ul className={estilo.prontLista}>
                {c.prontuario.itens.map((item, i) => (
                  <li key={`${i}-${item.slice(0, 12)}`}>{item}</li>
                ))}
              </ul>
            </div>

            {/* A linha do tempo se desenhando é o único momento de movimento
                autoral da página. Ele explica o produto: a passagem do tempo
                dentro de uma ordem de serviço. */}
            <div className={estilo.console}>
              <div className={estilo.csBarra}>
                <span className={estilo.csTit}>Acompanhamento da ordem</span>
                <span className={estilo.csOs}>{c.prontuario.ordemExemplo.numero}</span>
              </div>
              <div className={estilo.csCab}>
                <p className={estilo.csEq}>{c.prontuario.ordemExemplo.equipamento}</p>
                <p className={estilo.csNs}>{c.prontuario.ordemExemplo.detalhe}</p>
              </div>
              <ol className={estilo.lt}>
                {c.prontuario.etapas.map((etapa, i) => (
                  <li
                    key={`${i}-${etapa.titulo.slice(0, 12)}`}
                    className={
                      i === c.prontuario.etapas.length - 1 ? estilo.etAgora : estilo.etFeita
                    }
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <span className={estilo.etPonto} aria-hidden="true" />
                    <span className={estilo.etTxt}>
                      <strong>{etapa.titulo}</strong>
                      <span>{etapa.quem}</span>
                    </span>
                    <time className={estilo.etHora}>{etapa.quando}</time>
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
                <h2 className={estilo.h2}>{c.sobre.titulo}</h2>
                {c.sobre.paragrafos.map((p) => (
                  <p key={p.slice(0, 24)} className={estilo.sobreP}>
                    {p}
                  </p>
                ))}
                <a
                  href={linkWhatsappDe(c, 'Olá! Preciso de manutenção em um equipamento.')}
                  className={estilo.btn}
                >
                  <IconeWhatsapp className={estilo.btnIcone} />
                  {c.sobre.botao}
                </a>
              </div>

              <div className={estilo.numeros}>
                <p className={estilo.numeroGrande}>{c.sobre.clientesNumero}</p>
                <p className={estilo.numeroTexto}>
                  {c.sobre.clientesTexto}
                </p>
              </div>
            </div>

            <div className={estilo.principios}>
              <div>
                <h3>Missão</h3>
                <p>{c.sobre.missao}</p>
              </div>
              <div>
                <h3>Visão</h3>
                <p>{c.sobre.visao}</p>
              </div>
              <div>
                <h3>Valores</h3>
                <p>{c.sobre.valores}</p>
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
                  <strong className={estilo.gmnNome}>{c.identidade.nome}</strong>
                  <span className={estilo.gmnCategoria}>
                    Assistência técnica · {c.endereco.cidade}, {c.endereco.uf}
                  </span>
                </div>
              </div>

              <div className={estilo.gmnNota}>
                <p className={estilo.notaValor}>
                  {c.google.nota.toFixed(1).replace('.', ',')}
                </p>
                <div>
                  <p className={estilo.notaEstrelas} aria-hidden="true">
                    {Array.from({ length: c.google.nota }, (_, i) => (
                      <IconeEstrela key={i} />
                    ))}
                  </p>
                  <h2 id="tit-google" className={estilo.notaTexto}>
                    {c.google.nota} de 5 no Google, em{' '}
                    {c.google.quantidade} avaliações
                  </h2>
                </div>
              </div>

              <ul className={estilo.avaliacoes}>
                {c.google.avaliacoes.map((a) => (
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
              {fotosPerfil.length > 0 ? (
                <div className={estilo.gmnFotos}>
                  <p className={estilo.gmnFotosTit}>{c.google.tituloFotos}</p>
                  <ul className={estilo.gmnTira}>
                    {fotosPerfil.map(({ nome, alt }) => (
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

              {c.redes.googleMeuNegocio ? (
                <p className={estilo.gmnAcao}>
                  <a
                    href={c.redes.googleMeuNegocio}
                    className={`${estilo.btn} ${estilo.btnLinha}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconeGoogle className={estilo.btnIcone} />
                    {c.google.botao}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ================= BASTIDORES =================
            Texto à esquerda, carrossel à direita.

            A seção INTEIRA some quando não há o que mostrar. Antes ela ficava
            no ar com só um título e um botão no meio de um bloco branco vazio,
            e seção vazia num site não parece minimalista: parece quebrada.

            Só aparece quando existir foto em `public/fotos/` ou um feed do
            Instagram configurado. */}
        {temBastidores ? (
          <section className={`${estilo.secao} claro`} aria-labelledby="tit-insta">
            <div className={estilo.container}>
              <div className={estilo.bastGrid}>
                <div>
                  <IconeInstagram className={estilo.instaIcone} />
                  <h2 id="tit-insta" className={estilo.h2} data-c="bastidores.titulo">
                    {c.bastidores.titulo}
                  </h2>
                  <p className={estilo.lead} data-c="bastidores.lead">{c.bastidores.lead}</p>
                  <a
                    href={`https://instagram.com/${instagramUsuarioDe(c)}`}
                    className={estilo.btn}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconeInstagram className={estilo.btnIcone} />
                    {c.bastidores.botao} {c.redes.instagram}
                  </a>
                </div>

                {c.redes.instagramFeed ? (
                  <InstagramFeed className={estilo.instaGrade} />
                ) : (
                  /* O carrossel. Duas cópias da mesma lista, uma atrás da
                     outra: quando a primeira termina de passar, a segunda está
                     exatamente onde a primeira começou, e o laço não tem
                     emenda. A cópia é escondida de leitores de tela para a
                     mesma foto não ser anunciada duas vezes. */
                  <div className={estilo.bastFaixa}>
                    <div className={estilo.bastPista}>
                      {[false, true].map((copia) => (
                        <ul
                          key={String(copia)}
                          className={estilo.bastLista}
                          aria-hidden={copia || undefined}
                        >
                          {fotosBastidores.map(({ nome, alt }) => (
                            <li key={nome}>
                              <Foto
                                nome={nome}
                                alt={copia ? '' : alt}
                                larguras="(max-width: 860px) 60vw, 300px"
                                className={estilo.bastImg}
                              />
                            </li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
            <h2 className={estilo.h2} data-c="formulario.titulo">{c.formulario.titulo}</h2>
            <p className={estilo.lead} data-c="formulario.lead">{c.formulario.lead}</p>
            <FormularioRetirada
              whatsapp={c.contato.whatsapp}
              rotuloBotao={c.formulario.botao}
              nota={c.formulario.nota}
            />
            <p className={estilo.contatoDireto}>
              {c.formulario.contatoDireto}{' '}
              <a
                href={linkWhatsappDe(c, 'Olá! Preciso de manutenção em um equipamento.')}
                className={estilo.linkZap}
              >
                {c.contato.telefoneExibicao}
              </a>
            </p>
          </div>
        </section>

        {/* ================= ONDE ESTAMOS =================
            Endereço à esquerda, mapa à direita. Não é preferência estética: a
            pessoa que chega nesta seção já decidiu falar com a DTECH e está
            respondendo "dá para eu ir até lá?". Endereço sem mapa obriga ela a
            abrir outro aplicativo, e é ali que a visita termina. */}
        <section id="onde-estamos" className={`${estilo.secao} claro`}>
          <div className={estilo.container}>
            <h2 className={estilo.h2} data-c="onde.titulo">{c.onde.titulo}</h2>
            <p className={estilo.lead} data-c="onde.lead">{c.onde.lead}</p>

            <div className={estilo.ondeGrid}>
              <div className={estilo.ondeCartao}>
                <p className={estilo.endereco}>
                  <IconeLocal className={estilo.enderecoIcone} />
                  <span>
                    <strong>{c.endereco.logradouro}, {c.endereco.numero}</strong>
                    {c.endereco.complemento ? <>{' · '}{c.endereco.complemento}</> : null}
                    <br />
                    {c.endereco.bairro} · {c.endereco.cidade}/{c.endereco.uf}
                    <br />
                    CEP {c.endereco.cep}
                  </span>
                </p>

                <dl className={estilo.ondeDados}>
                  <div>
                    <dt>Telefone e WhatsApp</dt>
                    <dd>
                      <a href={linkWhatsappDe(c)}>{c.contato.telefoneExibicao}</a>
                    </dd>
                  </div>
                  {c.contato.horarioAtendimento ? (
                    <div>
                      <dt>Atendimento</dt>
                      <dd>{c.contato.horarioAtendimento}</dd>
                    </div>
                  ) : null}
                  {c.contato.email ? (
                    <div>
                      <dt>E-mail</dt>
                      <dd>
                        <a href={`mailto:${c.contato.email}`}>{c.contato.email}</a>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className={estilo.ondeAcoes}>
                  <a
                    href={linkMapsDe(c)}
                    className={estilo.btn}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <IconeLocal className={estilo.btnIcone} />
                    {c.onde.botaoRota}
                  </a>
                  {c.redes.googleMeuNegocio ? (
                    <a
                      href={c.redes.googleMeuNegocio}
                      className={`${estilo.btn} ${estilo.btnLinha}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <IconeGoogle className={estilo.btnIcone} />
                      {c.onde.botaoGoogle}
                    </a>
                  ) : null}
                </div>
              </div>

              {/* `loading="lazy"` importa mais aqui do que numa imagem: o mapa
                  do Google carrega scripts e várias imagens, e é o elemento
                  mais pesado da página. Sem isso, ele disputa banda com a
                  primeira dobra numa seção que a maioria nunca alcança. */}
              <div className={estilo.mapa}>
                <iframe
                  src={mapaUrlDe(c)}
                  title={`Mapa até a ${c.identidade.nome}, em ${c.endereco.cidade}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={estilo.rodape}>
        <div className={`${estilo.container} ${estilo.rodGrid}`}>
          <div>
            <Marca larguraPx={164} />
            <p className={estilo.rodTexto}>
              {c.identidade.razaoSocial}. {c.identidade.descricaoSite}, de qualquer marca.
              {c.identidade.cnpj ? ` CNPJ ${c.identidade.cnpj}.` : ''}
            </p>
          </div>
          <div>
            <h3>Contato</h3>
            <ul>
              <li>
                <a href={linkWhatsappDe(c)} data-medir-origem="rodape">
                  {c.contato.telefoneExibicao}
                </a>
              </li>
              {/* Campo vazio some da tela. Melhor faltar um horário do que
                  publicar um que não é o verdadeiro. */}
              {c.contato.horarioAtendimento ? <li>{c.contato.horarioAtendimento}</li> : null}
              {c.contato.email ? (
                <li>
                  <a href={`mailto:${c.contato.email}`}>{c.contato.email}</a>
                </li>
              ) : null}
            </ul>

            {/* Os perfis, com o ícone de cada um. Ícone e não só texto porque
                no rodapé ninguém lê: reconhece a forma. Cada um só aparece se
                o endereço existir de verdade — link vazio vira 404, e 404 no
                rodapé some do radar por meses. */}
            {c.redes.instagram || c.redes.googleMeuNegocio ? (
              <p className={estilo.rodRedes}>
                {c.redes.instagram ? (
                  <a
                    href={`https://instagram.com/${instagramUsuarioDe(c)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label={`Instagram da ${c.identidade.nome}, ${c.redes.instagram}`}
                  >
                    <IconeInstagram />
                    <span>{c.redes.instagram}</span>
                  </a>
                ) : null}
                {c.redes.googleMeuNegocio ? (
                  <a
                    href={c.redes.googleMeuNegocio}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label={`Perfil da ${c.identidade.nome} no Google, com as avaliações`}
                  >
                    <IconeGoogle />
                    <span>Avaliar no Google</span>
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
          <div>
            <h3>Endereço</h3>
            <ul>
              <li>
                {c.endereco.logradouro}, {c.endereco.numero}
              </li>
              <li>{c.endereco.bairro}</li>
              <li>
                {c.endereco.cidade} · {c.endereco.uf}
              </li>
              <li>CEP {c.endereco.cep}</li>
            </ul>
          </div>
        </div>
        <div className={`${estilo.container} ${estilo.rodFim}`}>
          <span>
            © {anoAtual} {c.identidade.razaoSocial}
          </span>
          <Credito className={estilo.credito} />
          <Link href="/privacidade">Privacidade e cookies</Link>
          <Link href="/entrar">Acesso ao sistema</Link>
        </div>
      </footer>

      {/* Fica fora do <main> de propósito: é atendimento, não conteúdo da
          página. Assim quem navega por leitor de tela não tromba com ele no
          meio da leitura — encontra no fim, onde se procura contato. */}
      <BotaoWhatsapp />

      {/* A faixa de cookies. Fica ao lado do botão de WhatsApp e não dentro do
          <main> pelo mesmo motivo: não é conteúdo da página, é um aviso sobre
          ela. Só aparece para quem ainda não respondeu — e enquanto ninguém
          responde, nenhum cookie de medição é gravado. */}
      <Consentimento />

      {/* O bloco que o Google lê. Fica no fim porque não é conteúdo visível e
          não deve atrasar a pintura do que a pessoa veio ver. */}
      <DadosEstruturados />

      {ehPrevia ? <PontePrevia /> : null}
    </>
  )
}
