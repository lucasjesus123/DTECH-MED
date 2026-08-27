import type { Metadata } from 'next'
import Link from 'next/link'
import { lerConteudo } from '@/server/conteudo'
import { Credito } from '../credito'
import { Marca } from '../marca'
import estilo from '../site.module.css'

export const metadata: Metadata = {
  title: 'Privacidade e cookies',
  description:
    'Que dados a DTECH MED coleta neste site, para quê, por quanto tempo, e como pedir para apagar.',
  // Indexável de propósito: uma política que o Google não acha é uma política
  // que ninguém encontra no dia em que precisa dela.
  robots: { index: true, follow: true },
}

/**
 * POLÍTICA DE PRIVACIDADE E COOKIES.
 *
 * =============================================================================
 * POR QUE ESTA PÁGINA NASCEU AGORA
 * =============================================================================
 * Enquanto o site só servia texto, não havia tratamento de dado pessoal para
 * declarar — quem entrava, lia e ia embora. Isso mudou em dois pontos, e os
 * dois são recentes:
 *
 *   • O formulário de retirada, que recebe nome, telefone e endereço.
 *   • O Tag Manager, o Analytics e o Google Ads, que ligam comportamento de
 *     navegação a um identificador de navegador.
 *
 * A LGPD chama isso de tratamento de dado pessoal, e exige que a pessoa saiba
 * o que é coletado, para quê, com quem é compartilhado e como pedir para
 * apagar. Sem esta página, a faixa de cookies apontaria para o vazio — e um
 * aviso que não explica nada não é aviso, é enfeite.
 *
 * =============================================================================
 * O QUE ELA NÃO FAZ
 * =============================================================================
 * Não promete o que o sistema não cumpre. Não há "criptografia militar", não
 * há "seus dados nunca saem do Brasil" — o Google processa fora, e está escrito
 * ali embaixo. Política que promete demais é a que não se sustenta no dia em
 * que alguém pergunta.
 *
 * Os dados de contato saem do cadastro editável do site (`lerConteudo`), o
 * mesmo do rodapé. Assim, o dia em que o CNPJ for preenchido no painel, ele
 * aparece aqui também — sem ninguém precisar lembrar desta página.
 */
export default async function Privacidade() {
  const c = await lerConteudo()
  const e = c.endereco
  const atualizado = 'agosto de 2026'

  return (
    <>
      <header className={estilo.docTopo}>
        <div className={estilo.container}>
          <Link href="/" aria-label="Voltar para a página inicial">
            <Marca larguraPx={150} />
          </Link>
        </div>
      </header>

      <main className={estilo.doc}>
        <div className={estilo.container}>
          <p className={estilo.docGrav}>Documento</p>
          <h1 className={estilo.docTitulo}>Privacidade e cookies</h1>
          <p className={estilo.docNota}>
            Última atualização: {atualizado}. Escrito para ser lido — se alguma parte não estiver
            clara, fale conosco pelo WhatsApp e nós explicamos.
          </p>

          <section className={estilo.docBloco}>
            <h2>Quem trata seus dados</h2>
            <p>
              {c.identidade.razaoSocial}
              {c.identidade.cnpj ? `, CNPJ ${c.identidade.cnpj},` : ','} com sede em{' '}
              {e.logradouro}, {e.numero}
              {e.complemento ? ` — ${e.complemento}` : ''}, {e.bairro}, {e.cidade}/{e.uf}, CEP{' '}
              {e.cep}.
            </p>
            <p>
              Para qualquer assunto sobre seus dados — saber o que temos, corrigir, ou pedir para
              apagar — fale pelo WhatsApp {c.contato.telefoneExibicao}
              {c.contato.email ? ` ou pelo e-mail ${c.contato.email}` : ''}. Respondemos em até 15
              dias, que é o prazo que a LGPD dá.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>O que coletamos, e por quê</h2>

            <h3>Quando você preenche o formulário de retirada</h3>
            <p>
              Nome, telefone, e-mail (se você informar), cidade, o equipamento e a mensagem. É o
              que precisamos para retornar o contato e combinar a retirada — sem telefone não há
              como marcar, sem o equipamento não há como orçar.
            </p>
            <p>
              Base legal: execução de procedimentos preliminares a um contrato, a seu pedido
              (art. 7º, V da LGPD). Você pediu o orçamento; usamos o contato para respondê-lo.
            </p>

            <h3>Quando você só navega</h3>
            <p>
              Páginas vistas, seções que apareceram na sua tela, cliques nos botões de WhatsApp, e
              dados técnicos do acesso (tipo de aparelho, navegador, cidade aproximada). Serve para
              uma pergunta só: onde as pessoas param antes de pedir orçamento. Se metade chega em
              Serviços e uma em dez chega ao formulário, o problema está entre os dois.
            </p>
            <p>
              Base legal: seu <strong>consentimento</strong>, dado na faixa de cookies. Enquanto
              você não aceita, nenhum cookie de medição é gravado — as tags carregam com o
              armazenamento negado, e o Google recebe apenas um sinal sem identificador.
            </p>

            <h3>Se você é cliente e recebeu um link de acompanhamento</h3>
            <p>
              O link do portal (<code>/os/…</code>) mostra a ordem de serviço do seu equipamento. O
              endereço é a credencial: quem tem o link vê a ordem. Não colocamos nenhuma ferramenta
              de medição nessa página, justamente por isso — o Google não recebe esse endereço.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>Cookies</h2>
            <p>
              Cookie é um arquivinho que o site guarda no seu navegador. Aqui existem duas
              famílias, e elas não se misturam:
            </p>
            <ul className={estilo.docLista}>
              <li>
                <strong>Necessários.</strong> Fazem o site funcionar: sessão de quem entra no
                sistema, sua escolha de tema claro ou escuro, e a própria resposta que você deu à
                faixa de cookies. Não medem nada e não vão para lugar nenhum. Não dependem de
                consentimento porque, sem eles, não há site.
              </li>
              <li>
                <strong>De medição e anúncio.</strong> Google Analytics e Google Ads, entregues
                pelo Google Tag Manager. Contam visita, medem por onde as pessoas saem e devolvem a
                conversão para o anúncio que a gerou. <strong>Só existem se você aceitar.</strong>
              </li>
            </ul>
            <p>
              Mudou de ideia? Limpe os dados deste site no seu navegador — a faixa volta a
              perguntar, e sua nova resposta vale a partir dali.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>Com quem compartilhamos</h2>
            <p>
              Com o <strong>Google</strong> (Analytics, Ads e Tag Manager), e apenas se você tiver
              aceitado a medição. O Google processa esses dados também fora do Brasil, sob as
              cláusulas contratuais dele.
            </p>
            <p>
              Com quem opera o <strong>envio de WhatsApp</strong>, para que a mensagem sobre o seu
              orçamento chegue ao seu número.
            </p>
            <p>
              Não vendemos dado de ninguém, não passamos sua lista para parceiro, e não usamos seu
              contato para assunto que você não pediu.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>Por quanto tempo guardamos</h2>
            <ul className={estilo.docLista}>
              <li>
                <strong>Pedido de orçamento que não virou serviço:</strong> 2 anos, para o caso de
                você voltar e não ter de contar tudo de novo.
              </li>
              <li>
                <strong>Ordem de serviço executada:</strong> 5 anos. É registro de serviço prestado
                — nota, garantia e o histórico do equipamento dependem dele.
              </li>
              <li>
                <strong>Medição do site:</strong> o prazo configurado no Google Analytics, hoje 14
                meses.
              </li>
            </ul>
          </section>

          <section className={estilo.docBloco}>
            <h2>Seus direitos</h2>
            <p>
              A LGPD garante que você peça, a qualquer momento: confirmação de que tratamos seus
              dados, acesso a eles, correção do que estiver errado, anonimização ou eliminação do
              que for desnecessário, portabilidade, e a revogação do consentimento que você deu.
            </p>
            <p>
              Peça pelo WhatsApp {c.contato.telefoneExibicao}
              {c.contato.email ? ` ou por ${c.contato.email}` : ''}. Vamos confirmar sua identidade
              antes de responder — não podemos entregar seus dados para quem diz ser você.
            </p>
            <p>
              Há um limite honesto: o que a lei nos obriga a guardar (registro fiscal de serviço
              prestado, por exemplo) não pode ser apagado a pedido. Nesse caso dizemos qual dado é,
              e por qual obrigação.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>Segurança</h2>
            <p>
              O site e o sistema andam sobre HTTPS. As senhas ficam guardadas com Argon2id, que não
              tem volta — nem nós conseguimos ler a sua. Cada empresa que usa o sistema enxerga
              apenas os próprios dados, e essa separação é feita pelo banco, não por uma regra de
              tela que alguém pode esquecer de escrever.
            </p>
            <p>
              Nenhum sistema é infalível. Se um incidente puder trazer risco para você, avisamos
              você e a ANPD, como manda o art. 48 da LGPD.
            </p>
          </section>

          <section className={estilo.docBloco}>
            <h2>Mudanças nesta política</h2>
            <p>
              Se ela mudar, a data lá em cima muda junto. Mudança que amplie o que coletamos vem
              acompanhada de nova pergunta na faixa de cookies — consentimento antigo não vale para
              coleta nova.
            </p>
          </section>

          <p className={estilo.docVoltar}>
            <Link href="/">← Voltar para o site</Link>
          </p>
        </div>
      </main>

      <footer className={estilo.docPe}>
        <div className={estilo.container}>
          <span>
            © {new Date().getFullYear()} {c.identidade.razaoSocial}
          </span>
          <Credito />
        </div>
      </footer>
    </>
  )
}
