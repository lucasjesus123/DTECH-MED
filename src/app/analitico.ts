/**
 * OS EVENTOS DE CONVERSÃO.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE, SE O GTM JÁ ESTÁ NO SITE
 * ---------------------------------------------------------------------------
 * O GTM sozinho mede VISITA. Visita não otimiza campanha: o Google Ads precisa
 * saber quais cliques viraram contato para aprender a quem mostrar o anúncio.
 * Sem evento de conversão, a campanha gasta às cegas e o relatório só diz
 * quanta gente passou.
 *
 * E tem um caso que NÃO dá para resolver dentro do GTM, por mais que se mexa lá:
 * o formulário de retirada é uma Server Action do React. Não existe o envio
 * clássico de formulário que o gatilho nativo "Form Submission" escuta — a
 * página nem recarrega. Sem o `dataLayer.push` daqui, a melhor conversão do
 * site é invisível para sempre.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE NÃO SE QUEBRA: NENHUM DADO PESSOAL
 * ---------------------------------------------------------------------------
 * O que sai daqui vai para o Google e não volta. Nome, telefone, e-mail e
 * documento NÃO entram — nem "só o primeiro nome", nem "só o DDD". O que se
 * manda é o FATO (aconteceu um contato) e o CONTEXTO não identificável (de qual
 * botão, de qual seção, qual assunto foi escolhido).
 *
 * Isso não é excesso de zelo: é a diferença entre medir campanha e mandar a
 * base de clientes para um terceiro. E a LGPD trata as duas coisas de forma
 * bem diferente.
 */

/** O que o site sabe dizer sobre uma conversão, sem identificar ninguém. */
export type DadosEvento = {
  /** De onde partiu: `dobra`, `servicos`, `rodape`, `flutuante`… */
  origem?: string
  /** O assunto escolhido na antessala do WhatsApp. */
  assunto?: string
  /** Por onde: `whatsapp`, `telefone`, `formulario`. */
  canal?: string
  /** Qual bloco da página foi visto: `servicos`, `onde-estamos`… */
  secao?: string
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

/**
 * Empurra um evento para o `dataLayer`.
 *
 * Silencioso por desenho. Se o GTM estiver desligado no painel, se o script
 * ainda não carregou, se o visitante usa um bloqueador — nada disso pode
 * derrubar o clique da pessoa. Medir é secundário; o contato é o que importa.
 */
export function evento(nome: string, dados: DadosEvento = {}): void {
  try {
    if (typeof window === 'undefined') return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event: nome, ...dados })
  } catch {
    /* Medição nunca atrapalha o site. */
  }
}

/**
 * Os nomes dos eventos.
 *
 * Ficam aqui, numa lista só, porque cada um destes vira uma conversão
 * configurada à mão dentro do GTM — e um nome que muda no código sem mudar lá
 * desliga a medição sem avisar. O `DEPLOY.md` repete esta lista para quem for
 * configurar do outro lado.
 */
export const EVENTOS = {
  /** Formulário de retirada enviado com sucesso. A conversão mais forte. */
  lead: 'lead_formulario',
  /** Clique em qualquer botão ou link que leva ao WhatsApp. */
  whatsapp: 'contato_whatsapp',
  /** Clique num número de telefone. */
  telefone: 'clique_telefone',

  /**
   * Até onde a pessoa desceu.
   *
   * O site é uma página só: para o Analytics isso é UMA página vista, e uma
   * página vista não distingue quem leu a chamada e foi embora de quem chegou
   * ao formulário. Estes cinco respondem a pergunta que decide investimento —
   * ONDE eles param.
   */
  viuServicos: 'viu_servicos',
  viuProntuario: 'viu_prontuario',
  viuEmpresa: 'viu_a_empresa',
  viuFormulario: 'viu_formulario',
  viuOndeEstamos: 'viu_onde_estamos',
} as const
